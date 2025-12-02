import os
import json
import asyncio
import base64
import logging
import random
import time
from datetime import datetime, timedelta
from uuid import uuid4
from urllib.parse import urlparse, quote
from urllib.parse import quote as url_quote


import httpx
import yaml
from fastapi import FastAPI, HTTPException, Request, Query, Body, Path, Depends, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response, PlainTextResponse
from pydantic import BaseModel, Field, ValidationError
from typing import Dict, Optional, List, Any, Tuple
from sqlalchemy import (
    create_engine, Column, String, Integer, Boolean, JSON as SAJSON, ForeignKey, text
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST



# Читаем параметры подключения из окружения
DB_HOST = os.getenv("DB_HOST")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME")
DB_USER = os.getenv("DB_USER")
DB_PASS = os.getenv("DB_PASS")
if not all([DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASS]):
    raise RuntimeError("DB_HOST, DB_PORT, DB_NAME, DB_USER и DB_PASS обязательны")


DATABASE_URL = (
    f"postgresql://{DB_USER}:{DB_PASS}"
    f"@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)


# Параметры кэша и rate limiting из окружения
DEFAULT_CACHE_TTL_SECONDS = int(os.getenv("MOCKL_DEFAULT_CACHE_TTL", "0"))
RATE_LIMIT_REQUESTS = int(os.getenv("MOCKL_RATE_LIMIT_REQUESTS", "0"))  # 0 = выключено
RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("MOCKL_RATE_LIMIT_WINDOW_SECONDS", "60"))
MAX_REQUEST_BODY_BYTES = int(os.getenv("MOCKL_MAX_REQUEST_BODY_BYTES", "0"))  # 0 = нет ограничения
RULES_DIR = os.getenv("MOCKL_RULES_DIR")
OPENAPI_SPECS_DIR = os.getenv("MOCKL_OPENAPI_SPECS_DIR")
OPENAPI_SPECS_URLS = os.getenv("MOCKL_OPENAPI_SPECS_URLS", "")
ALLOWED_PROXY_HOSTS = {
    h.strip().lower()
    for h in os.getenv("MOCKL_ALLOWED_PROXY_HOSTS", "").split(",")
    if h.strip()
}


# Глобальные структуры
OPENAPI_SPECS: Dict[str, Dict[str, Any]] = {}
RESPONSE_CACHE: Dict[str, Tuple[float, Dict[str, Any]]] = {}
RATE_LIMIT_STATE: Dict[str, Dict[str, Any]] = {}


# Логирование в структурированном (JSON) виде
class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "timestamp": datetime.utcfromtimestamp(record.created).isoformat() + "Z",
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exc_info"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


logging.basicConfig(level=os.getenv("MOCKL_LOG_LEVEL", "INFO"))
for h in logging.getLogger().handlers:
    h.setFormatter(JsonFormatter())

logger = logging.getLogger("mockl")


# Метрики Prometheus
REQUESTS_TOTAL = Counter(
    "mockl_requests_total",
    "Total HTTP requests",
    ["method", "path", "folder", "outcome"],
)
MOCK_HITS = Counter(
    "mockl_mock_hits_total",
    "Total matched mocks",
    ["folder"],
)
PROXY_REQUESTS = Counter(
    "mockl_proxy_requests_total",
    "Total proxied requests",
    ["folder"],
)
ERRORS_SIMULATED = Counter(
    "mockl_errors_simulated_total",
    "Total simulated errors",
    ["folder"],
)
RATE_LIMITED = Counter(
    "mockl_rate_limited_total",
    "Total rate limited requests",
)
CACHE_HITS = Counter(
    "mockl_cache_hits_total",
    "Total cache hits",
    ["folder"],
)
RESPONSE_TIME = Histogram(
    "mockl_response_time_seconds",
    "Response time for mock handler",
    ["folder"],
)


# Создаём движок с SSL
engine = create_engine(
    DATABASE_URL,
    echo=False,
    future=True,
    connect_args={"sslmode": "require"}
)


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)
Base = declarative_base()



class Folder(Base):
    __tablename__ = "folders"
    name = Column(String, primary_key=True)
    mocks = relationship("Mock", back_populates="folder_obj", cascade="all, delete")
    # Настройки прокси для папки
    proxy_enabled = Column(Boolean, default=False)
    proxy_base_url = Column(String, nullable=True)



class Mock(Base):
    __tablename__ = "mocks"
    id = Column(String, primary_key=True, index=True)
    folder_name = Column(String, ForeignKey("folders.name"), nullable=False, index=True)
    # Человекочитаемое имя мока для навигации
    name = Column(String, nullable=True)


    # Условия запроса
    method = Column(String, nullable=False)
    path = Column(String, nullable=False)
    headers = Column(SAJSON, default={})
    body_contains = Column(String, nullable=True)


    # Конфиг ответа
    status_code = Column(Integer, nullable=False)
    response_headers = Column(SAJSON, default={})
    response_body = Column(SAJSON, nullable=False)
    active = Column(Boolean, default=True)
    # Задержка ответа в миллисекундах
    delay_ms = Column(Integer, default=0)


    folder_obj = relationship("Folder", back_populates="mocks")



# Создаём таблицы
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="MocK — гибкий mock-сервер",
    description=(
        "Сервис для создания и управления HTTP моками.\n\n"
        "Позволяет:\n"
        "- группировать моки по папкам (\"страницам\");\n"
        "- настраивать условия срабатывания по методу, пути, заголовкам и фрагменту тела запроса;\n"
        "- задавать произвольный HTTP‑код, заголовки и JSON‑тело ответа;\n"
        "- импортировать моки из Postman Collection v2.1."
    ),
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


@app.get("/healthz", include_in_schema=False)
async def health_check():
    """Health check endpoint - не показывается в документации."""
    return {"status": "ok"}


@app.get("/readyz", include_in_schema=False)
async def readiness_check():
    """Readiness‑проверка: проверяем подключение к БД."""
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return {"status": "ready"}
    except Exception as e:
        raise HTTPException(status_code=503, detail=f"Not ready: {str(e)}")



@app.get("/info", summary="Информация о сервере и подключении к БД")
async def server_info(request: Request):
  """
  Возвращает базовую информацию о работающем сервере и параметры подключения к БД.


  Пароль в URL БД умышленно замаскирован.
  """
  base_url = str(request.base_url).rstrip("/")
  masked_db_url = (
      f"postgresql://{DB_USER}:***@{DB_HOST}:{DB_PORT}/{DB_NAME}"
      if all([DB_HOST, DB_PORT, DB_NAME, DB_USER])
      else None
  )
  return {
      "server": {
          "base_url": base_url,
          "title": app.title,
          "version": app.version,
      },
      "database": {
          "host": DB_HOST,
          "port": DB_PORT,
          "name": DB_NAME,
          "user": DB_USER,
          "url": masked_db_url,
      },
  }



class MockRequestCondition(BaseModel):
    """Условия, при которых мок должен сработать."""


    method: str = Field(..., description="HTTP‑метод запроса (GET, POST, PUT, DELETE, PATCH и т.д.)")
    path: str = Field(..., description="Путь запроса, например `/api/users` или `/status?code=200`")
    headers: Optional[Dict[str, str]] = Field(
        default=None,
        description="Набор заголовков, которые должны совпадать (полнейшее совпадение по ключу и значению)",
    )
    body_contains: Optional[str] = Field(
        default=None,
        description="Произвольный фрагмент текста, который должен содержаться в теле запроса",
    )



class MockResponseConfig(BaseModel):
    """Описание того, какой ответ вернёт мок."""


    status_code: int = Field(..., description="HTTP‑код ответа (например 200, 400, 404)")
    headers: Optional[Dict[str, str]] = Field(
        default=None,
        description="Дополнительные заголовки ответа, которые вернёт мок",
    )
    body: Any = Field(..., description="Тело ответа. Обычно JSON, но может быть спец‑структура файла.")



class MockEntry(BaseModel):
    """Полное описание мока."""


    id: Optional[str] = Field(
        default=None,
        description=(
            "Уникальный идентификатор мока (UUID). "
            "Если не передан, будет сгенерирован автоматически."
        ),
    )
    folder: Optional[str] = Field(
        default="default",
        description='Имя папки (\"страницы\"), в которой хранится мок. По умолчанию — `default`.',
    )
    name: Optional[str] = Field(
        default=None,
        description="Произвольное человекочитаемое имя мока для удобной навигации.",
    )
    request_condition: MockRequestCondition = Field(
        ..., description="Условия запроса, при которых будет отработан данный мок."
    )
    response_config: MockResponseConfig = Field(
        ..., description="Конфигурация HTTP‑ответа, который вернёт мок."
    )
    active: Optional[bool] = Field(
        default=True,
        description="Признак активности мока. Неактивные моки игнорируются при обработке запросов.",
    )
    delay_ms: Optional[int] = Field(
        default=0,
        description="Искусственная задержка ответа в миллисекундах (например 500 = 0.5 секунды).",
    )


    class Config:
        schema_extra = {
            "example": {
                "id": "d7f9f6b4-6c86-4d3b-a8d2-0b8c2e1e1234",
                "folder": "auth",
                "request_condition": {
                    "method": "POST",
                    "path": "/api/login",
                    "headers": {"Content-Type": "application/json"},
                    "body_contains": "\"email\":\"user@example.com\"",
                },
                "response_config": {
                    "status_code": 200,
                    "headers": {"X-Mocked": "true"},
                    "body": {"token": "mocked-jwt-token"},
                },
                "active": True,
            }
        }



class FolderRenamePayload(BaseModel):
    """Модель запроса для переименования папки."""


    old_name: str = Field(..., description="Текущее имя папки")
    new_name: str = Field(..., description="Новое имя папки")



class FolderDuplicatePayload(BaseModel):
    """Модель запроса для дублирования папки."""


    old_name: str = Field(..., description="Имя папки, которую нужно продублировать")
    new_name: str = Field(..., description="Имя новой папки‑копии")



class FolderSettings(BaseModel):
    """Настройки папки (прокси и пр.)."""


    proxy_enabled: bool = Field(default=False, description="Включен ли прокси‑режим для папки")
    proxy_base_url: Optional[str] = Field(
        default=None,
        description="Базовый URL реального backend, куда проксировать запросы без мока",
    )



class FolderSettingsOut(FolderSettings):
    name: str





def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



def ensure_migrations():
    """Примитивные миграции: добавляем недостающие столбцы, если их ещё нет.


    Render уже создал таблицы по старой схеме, create_all не добавляет новые столбцы,
    поэтому выполняем ALTER TABLE IF NOT EXISTS вручную.
    """
    with engine.connect() as conn:
        # Новые поля в folders
        conn.execute(
            text(
                "ALTER TABLE folders "
                "ADD COLUMN IF NOT EXISTS proxy_enabled BOOLEAN DEFAULT FALSE"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE folders "
                "ADD COLUMN IF NOT EXISTS proxy_base_url VARCHAR NULL"
            )
        )
        # Новые поля в mocks
        conn.execute(
            text(
                "ALTER TABLE mocks "
                "ADD COLUMN IF NOT EXISTS delay_ms INTEGER DEFAULT 0"
            )
        )
        conn.execute(
            text(
                "ALTER TABLE mocks "
                "ADD COLUMN IF NOT EXISTS name VARCHAR NULL"
            )
        )
        conn.commit()



@app.on_event("startup")
def ensure_default_folder():
    # Сначала убеждаемся, что схема обновлена
    ensure_migrations()

    db = SessionLocal()
    try:
        if not db.query(Folder).filter_by(name="default").first():
            db.add(Folder(name="default"))
            db.commit()
    finally:
        db.close()

    # Загружаем правила и OpenAPI‑спеки при старте (если настроено)
    try:
        load_rules_from_directory()
    except Exception as e:
        logger.error(f"Failed to load rules from directory: {e}")

    try:
        load_openapi_specs_from_env()
    except Exception as e:
        logger.error(f"Failed to load OpenAPI specs: {e}")


@app.on_event("shutdown")
def on_shutdown():
    """Хук корректного завершения (graceful shutdown)."""
    logger.info("Shutting down mockl service")



@app.post(
    "/api/folders",
    summary="Создать папку (страницу) для моков",
    description=(
        "Создаёт новую папку (логическую группу моков).\n\n"
        "Имя папки должно быть уникальным. Папка `default` создаётся автоматически при старте сервиса."
    ),
)
def create_folder(
    name: str = Body(
        ...,
        embed=True,
        description="Имя новой папки. Пример: `auth`, `users`, `payments`.",
        examples=["auth"],
    ),
    db: Session = Depends(get_db),
):
    name = name.strip()
    if not name or db.query(Folder).filter_by(name=name).first():
        raise HTTPException(400, "Некорректное или уже существующее имя папки")
    db.add(Folder(name=name))
    db.commit()
    return {"message": "Папка добавлена"}



@app.delete(
    "/api/folders",
    summary="Удалить папку и все её моки",
    description=(
        "Удаляет указанную папку и все связанные с ней моки.\n\n"
        "Папку `default` удалить нельзя."
    ),
)
def delete_folder(
    name: str = Query(..., description="Имя папки, которую нужно удалить"),
    db: Session = Depends(get_db),
):
    if name == "default":
        raise HTTPException(400, "Нельзя удалить стандартную папку")
    folder = db.query(Folder).filter_by(name=name).first()
    if not folder:
        raise HTTPException(404, "Папка не найдена")
    db.delete(folder)
    db.commit()
    return {"message": f"Папка '{name}' и все её моки удалены"}



@app.patch(
    "/api/folders/rename",
    summary="Переименовать папку",
    description="Переименовывает существующую папку. Папку `default` переименовать нельзя.",
)
def rename_folder(payload: FolderRenamePayload, db: Session = Depends(get_db)):
    """Переименовывает папку и обновляет все связанные моки."""
    try:
        old = payload.old_name.strip()
        new = payload.new_name.strip()
        
        if not new or old == new:
            raise HTTPException(400, "Некорректное новое имя папки")
        if old == "default":
            raise HTTPException(400, "Нельзя переименовать стандартную папку")
        
        folder = db.query(Folder).filter_by(name=old).first()
        if not folder:
            raise HTTPException(404, "Папка не найдена")
        
        if db.query(Folder).filter_by(name=new).first():
            raise HTTPException(400, "Папка с таким именем уже существует")


        # Из‑за ограничений FK безопаснее всего:
        # 1) создать новую папку с новым именем,
        # 2) перевесить все моки на неё,
        # 3) удалить старую папку.


        # 1. Создаём новую запись папки
        new_folder = Folder(name=new)
        db.add(new_folder)
        db.flush()


        # 2. Обновляем все связанные моки
        db.query(Mock).filter_by(folder_name=old).update(
            {"folder_name": new},
            synchronize_session=False
        )


        # 3. Удаляем старую папку
        db.delete(folder)


        # 4. Коммитим всё разом
        db.commit()
        return {"message": "Папка переименована", "old": old, "new": new}
    
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Ошибка при переименовании папки: {str(e)}")



@app.post(
    "/api/folders/duplicate",
    summary="Продублировать папку и все её моки",
    description=(
        "Создаёт новую папку с указанным именем и копирует в неё все моки и настройки из исходной папки.\n\n"
        "Имена и содержимое моков копируются, для каждой копии генерируется новый UUID."
    ),
)
def duplicate_folder(payload: FolderDuplicatePayload, db: Session = Depends(get_db)):
    """Дублирует папку: создаёт новую и копирует в неё все моки и настройки."""
    try:
        src = payload.old_name.strip()
        dst = payload.new_name.strip()

        if not src or not dst:
            raise HTTPException(400, "Имя папки не может быть пустым")
        if src == dst:
            raise HTTPException(400, "Имя новой папки должно отличаться от исходного")

        src_folder = db.query(Folder).filter_by(name=src).first()
        if not src_folder:
            raise HTTPException(404, "Исходная папка не найдена")

        if db.query(Folder).filter_by(name=dst).first():
            raise HTTPException(400, "Папка с таким именем уже существует")

        # Создаём новую папку, копируя настройки прокси
        new_folder = Folder(
            name=dst,
            proxy_enabled=src_folder.proxy_enabled or False,
            proxy_base_url=src_folder.proxy_base_url,
        )
        db.add(new_folder)
        db.flush()

        # Копируем все моки
        src_mocks = db.query(Mock).filter_by(folder_name=src).all()
        copied_ids = []
        for m in src_mocks:
            new_id = str(uuid4())
            copied = Mock(
                id=new_id,
                folder_name=dst,
                name=m.name,
                method=m.method,
                path=m.path,
                headers=m.headers if m.headers else {},
                body_contains=m.body_contains,
                status_code=m.status_code,
                response_headers=m.response_headers if m.response_headers else {},
                response_body=m.response_body,
                active=m.active,
                delay_ms=m.delay_ms or 0,
            )
            db.add(copied)
            copied_ids.append(new_id)

        db.commit()
        return {
            "message": f"Папка '{src}' продублирована в '{dst}'",
            "source": src,
            "target": dst,
            "copied_mocks": len(copied_ids),
            "mock_ids": copied_ids,
        }
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Ошибка при дублировании папки: {str(e)}")



def _normalize_path_for_storage(path: str) -> str:
    """Нормализует путь для хранения в БД: убирает лишние слэши, но сохраняет query параметры."""
    if not path:
        return "/"
    # Разделяем путь и query параметры
    if "?" in path:
        base_path, query = path.split("?", 1)
        base_path = base_path.rstrip("/") or "/"
        return f"{base_path}?{query}"
    return path.rstrip("/") or "/"


def _save_mock_entry(entry: MockEntry, db: Session) -> None:
    """Внутренний помощник: создаёт или обновляет мок в БД по MockEntry."""
    if not entry.id:
        entry.id = str(uuid4())

    folder = db.query(Folder).filter_by(name=entry.folder).first()
    if not folder:
        folder = Folder(name=entry.folder)
        db.add(folder)
        db.flush()

    mock = db.query(Mock).filter_by(id=entry.id).first()
    if not mock:
        mock = Mock(id=entry.id)
        db.add(mock)

    mock.folder_name = entry.folder
    mock.name = entry.name
    mock.method = entry.request_condition.method.upper()
    mock.path = _normalize_path_for_storage(entry.request_condition.path)
    mock.headers = entry.request_condition.headers or {}
    mock.body_contains = entry.request_condition.body_contains
    mock.status_code = entry.response_config.status_code
    mock.response_headers = entry.response_config.headers or {}
    mock.response_body = entry.response_config.body
    mock.active = entry.active if entry.active is not None else True
    mock.delay_ms = entry.delay_ms or 0



def load_rules_from_directory():
    """Загрузка правил (моков) из директории при старте.

    Ожидается, что в MOCKL_RULES_DIR лежат .json файлы
    со структурой MockEntry или массивом таких объектов.
    """
    if not RULES_DIR:
        return
    if not os.path.isdir(RULES_DIR):
        logger.warning(f"Rules directory {RULES_DIR} does not exist")
        return

    db = SessionLocal()
    created = 0
    try:
        for fname in os.listdir(RULES_DIR):
            if not fname.lower().endswith(".json"):
                continue
            full_path = os.path.join(RULES_DIR, fname)
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except Exception as e:
                logger.error(f"Failed to read rules file {full_path}: {e}")
                continue

            entries = data if isinstance(data, list) else [data]
            for raw in entries:
                try:
                    entry = MockEntry(**raw)
                    _save_mock_entry(entry, db)
                    created += 1
                except Exception as e:
                    logger.error(f"Failed to load mock from {full_path}: {e}")
        db.commit()
        logger.info(f"Loaded {created} mocks from rules directory {RULES_DIR}")
    finally:
        db.close()


def _slugify_folder_name(raw: str) -> str:
    """Простейший slug для имени папки из OpenAPI‑спеки."""
    if not raw:
        return "openapi"
    name = raw.strip()
    # Заменяем пробелы на дефисы, убираем лишние слэши
    name = name.replace("/", "-").replace("\\", "-")
    name = "-".join(part for part in name.split() if part)
    return name or "openapi"


def _ensure_folder(folder_name: str, db: Optional[Session] = None) -> str:
    """Создаёт (если нужно) папку с заданным именем и возвращает её имя."""
    folder_name = (folder_name or "openapi").strip() or "openapi"
    own = False
    if db is None:
        db = SessionLocal()
        own = True
    try:
        existing = db.query(Folder).filter_by(name=folder_name).first()
        if not existing:
            db.add(Folder(name=folder_name))
            db.commit()
        return folder_name
    finally:
        if own:
            db.close()


def _ensure_folder_for_spec(spec_name: str, db: Optional[Session] = None) -> str:
    """Создаёт (если нужно) папку для OpenAPI‑спеки и возвращает её имя."""
    folder_name = _slugify_folder_name(spec_name)
    return _ensure_folder(folder_name, db=db)


def generate_mocks_for_openapi(spec: Dict[str, Any], folder_name: str, db: Session) -> int:
    """
    Генерирует простые моки по OpenAPI‑спецификации в указанную папку.
    Для каждого пути/метода создаётся мок с кодом 200 и простым JSON‑ответом.
    Повторно существующие сочетания (folder, method, path) не создаются.
    """
    paths = spec.get("paths") or {}
    if not isinstance(paths, dict):
        return 0

    allowed_methods = {"get", "post", "put", "delete", "patch", "options", "head"}
    created = 0

    for path, path_item in paths.items():
        if not isinstance(path_item, dict):
            continue

        for method_name, operation in path_item.items():
            if method_name.lower() not in allowed_methods:
                continue

            method_upper = method_name.upper()

            # Проверяем, нет ли уже такого мока
            existing = db.query(Mock).filter_by(
                folder_name=folder_name,
                method=method_upper,
                path=path,
            ).first()

            if existing:
                continue

            op = operation or {}
            mock_name = (
                op.get("operationId")
                or op.get("summary")
                or f"{method_upper} {path}"
            )

            # Извлекаем примеры запроса
            request_body_contains = None
            request_headers = {}
            req_body = op.get("requestBody", {})
            if req_body and isinstance(req_body, dict):
                content = req_body.get("content", {})
                # Ищем первый доступный media type (обычно application/json)
                for media_type, media_spec in content.items():
                    if isinstance(media_spec, dict):
                        # Проверяем example
                        example = media_spec.get("example")
                        if example is not None:
                            if isinstance(example, (dict, list)):
                                request_body_contains = json.dumps(example)
                            else:
                                request_body_contains = str(example)
                            request_headers["Content-Type"] = media_type
                            break
                        # Проверяем examples (множественное число)
                        examples = media_spec.get("examples", {})
                        if examples and isinstance(examples, dict):
                            # Берем первый пример
                            first_example = next(iter(examples.values()))
                            if isinstance(first_example, dict):
                                example_value = first_example.get("value")
                                if example_value is not None:
                                    if isinstance(example_value, (dict, list)):
                                        request_body_contains = json.dumps(example_value)
                                    else:
                                        request_body_contains = str(example_value)
                                    request_headers["Content-Type"] = media_type
                                    break

            # Извлекаем примеры ответа
            response_status = 200
            response_body = {"message": "mock from OpenAPI"}
            response_headers = {}
            responses = op.get("responses", {})
            
            # Ищем успешный ответ (2xx) или первый доступный
            for status_str, response_spec in responses.items():
                if isinstance(response_spec, dict):
                    try:
                        status_int = int(status_str)
                        # Предпочитаем 200, 201, но берем любой 2xx
                        if 200 <= status_int < 300:
                            response_status = status_int
                            content = response_spec.get("content", {})
                            # Ищем пример в content
                            for media_type, media_spec in content.items():
                                if isinstance(media_spec, dict):
                                    # Проверяем example
                                    example = media_spec.get("example")
                                    if example is not None:
                                        response_body = example if isinstance(example, (dict, list)) else {"value": example}
                                        response_headers["Content-Type"] = media_type
                                        break
                                    # Проверяем examples
                                    examples = media_spec.get("examples", {})
                                    if examples and isinstance(examples, dict):
                                        first_example = next(iter(examples.values()))
                                        if isinstance(first_example, dict):
                                            example_value = first_example.get("value")
                                            if example_value is not None:
                                                response_body = example_value if isinstance(example_value, (dict, list)) else {"value": example_value}
                                                response_headers["Content-Type"] = media_type
                                                break
                                    # Проверяем schema и генерируем пример
                                    schema = media_spec.get("schema", {})
                                    if schema and not example and not examples:
                                        # Простая генерация примера из schema (базовая)
                                        if schema.get("type") == "object":
                                            response_body = {}
                                        elif schema.get("type") == "array":
                                            response_body = []
                                        response_headers["Content-Type"] = media_type
                            break
                    except (ValueError, TypeError):
                        continue
            
            # Если не нашли пример, используем первый доступный ответ
            if response_status == 200 and not any(k.startswith("2") for k in responses.keys() if isinstance(k, str)):
                for status_str, response_spec in responses.items():
                    if isinstance(response_spec, dict):
                        try:
                            response_status = int(status_str)
                            content = response_spec.get("content", {})
                            for media_type, media_spec in content.items():
                                if isinstance(media_spec, dict):
                                    example = media_spec.get("example")
                                    if example is not None:
                                        response_body = example if isinstance(example, (dict, list)) else {"value": example}
                                        response_headers["Content-Type"] = media_type
                                        break
                            break
                        except (ValueError, TypeError):
                            continue

            entry = MockEntry(
                folder=folder_name,
                name=mock_name,
                request_condition=MockRequestCondition(
                    method=method_upper,
                    path=path,
                    headers=request_headers if request_headers else None,
                    body_contains=request_body_contains
                ),
                response_config=MockResponseConfig(
                    status_code=response_status,
                    headers=response_headers if response_headers else None,
                    body=response_body,
                ),
                active=True,
                delay_ms=0,
            )

            _save_mock_entry(entry, db)
            created += 1

    db.commit()
    logger.info(f"Generated {created} mocks for OpenAPI in folder '{folder_name}'")

    return created


def load_openapi_specs_from_env():
    """Загрузка OpenAPI спецификаций из директории и/или по URL при старте."""
    
    # Локальные файлы
    if OPENAPI_SPECS_DIR and os.path.isdir(OPENAPI_SPECS_DIR):
        db = SessionLocal()
        try:
            for fname in os.listdir(OPENAPI_SPECS_DIR):
                if not (fname.lower().endswith(".json") or fname.lower().endswith((".yaml", ".yml"))):
                    continue

                full_path = os.path.join(OPENAPI_SPECS_DIR, fname)

                try:
                    with open(full_path, "r", encoding="utf-8") as f:
                        if fname.lower().endswith(".json"):
                            spec = json.load(f)
                        else:
                            spec = yaml.safe_load(f)

                    name = spec.get("info", {}).get("title") or os.path.splitext(fname)[0]
                    OPENAPI_SPECS[name] = spec

                    folder_name = _ensure_folder_for_spec(name, db=db)
                    mocks_created = generate_mocks_for_openapi(spec, folder_name, db)
                    
                    db.commit()
                    logger.info(f"Loaded OpenAPI spec from {fname}: created {mocks_created} mocks in folder '{folder_name}'")

                except Exception as e:
                    db.rollback()
                    logger.error(f"Failed to load OpenAPI spec from {full_path}: {e}")

        finally:
            db.close()

    # Загрузка по URL
    for url in [u.strip() for u in OPENAPI_SPECS_URLS.split(",") if u.strip()]:
        try:
            resp = httpx.get(url, timeout=10.0)
            resp.raise_for_status()
            text_body = resp.text

            try:
                spec = json.loads(text_body)
            except json.JSONDecodeError:
                spec = yaml.safe_load(text_body)

            name = spec.get("info", {}).get("title") or url
            OPENAPI_SPECS[name] = spec

            db = SessionLocal()
            try:
                folder_name = _ensure_folder_for_spec(name, db=db)
                mocks_created = generate_mocks_for_openapi(spec, folder_name, db)
                
                db.commit()
                logger.info(f"Loaded OpenAPI spec from URL {url}: created {mocks_created} mocks")

            except Exception as e:
                db.rollback()
                logger.error(f"Failed to process OpenAPI spec from URL {url}: {e}")
            finally:
                db.close()

        except Exception as e:
            logger.error(f"Failed to load OpenAPI spec from URL {url}: {e}")



@app.get(
    "/api/folders/{name}",
    response_model=FolderSettingsOut,
    summary="Получить настройки папки",
)
def get_folder_settings(
    name: str = Path(..., description="Имя папки"),
    db: Session = Depends(get_db),
):
    folder = db.query(Folder).filter_by(name=name).first()
    if not folder:
        raise HTTPException(404, "Папка не найдена")
    return FolderSettingsOut(
        name=folder.name,
        proxy_enabled=folder.proxy_enabled or False,
        proxy_base_url=folder.proxy_base_url,
    )



@app.patch(
    "/api/folders/{name}/settings",
    summary="Обновить настройки папки (прокси и пр.)",
)
def update_folder_settings(
    name: str = Path(..., description="Имя папки"),
    payload: FolderSettings = Body(...),
    db: Session = Depends(get_db),
):
    folder = db.query(Folder).filter_by(name=name).first()
    if not folder:
        raise HTTPException(404, "Папка не найдена")


    folder.proxy_enabled = payload.proxy_enabled
    folder.proxy_base_url = (payload.proxy_base_url or "").strip() or None


    db.commit()
    return {"message": "Настройки папки обновлены"}


@app.get(
    "/api/mocks/folders",
    response_model=List[str],
    summary="Получить список папок",
    description="Возвращает список всех существующих папок. Папка `default` всегда первая.",
)
def list_folders(db: Session = Depends(get_db)):
    names = [f.name for f in db.query(Folder).all()]
    if "default" in names:
        names.remove("default")
        names.insert(0, "default")
    return names



@app.post(
    "/api/mocks",
    summary="Создать или обновить мок",
    description=(
        "Создаёт новый мок или обновляет существующий по полю `id`.\n\n"
        "- Если `id` не передан — будет создан новый мок с автоматически сгенерированным UUID.\n"
        "- Если `id` существует — запись будет перезаписана новыми значениями.\n\n"
        "Поддерживаются два формата тела запроса:\n"
        "- application/json — как раньше, полностью JSON‑описание `MockEntry`;\n"
        "- multipart/form-data — поле `entry` с JSON `MockEntry` и отдельное поле `file` с бинарным файлом ответа.\n"
        "Во втором случае файл хранится в моках, а JSON не содержит base64‑данных файла."
    ),
)
async def create_or_update_mock(
    request: Request,
    db: Session = Depends(get_db),
):
    """
    Обновлённый обработчик создания/обновления мока.

    Поддерживает как чистый JSON, так и multipart/form-data с отдельным файлом.
    """
    content_type = request.headers.get("content-type", "")

    raw_data: dict
    upload_file: Optional[UploadFile] = None
    file_was_in_form = False  # Флаг для отслеживания наличия файла в форме
    possible_file = None  # Сохраняем для последующей проверки

    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        entry_str = form.get("entry")
        if not entry_str:
            raise HTTPException(400, "Поле 'entry' с JSON описанием мока обязательно для multipart/form-data")
        try:
            raw_data = json.loads(entry_str)
        except json.JSONDecodeError:
            raise HTTPException(400, "Некорректный JSON в поле 'entry'")

        # Получаем файл из формы
        # В FastAPI файлы в multipart/form-data возвращаются как UploadFile
        # Но также может быть список или другой тип, поэтому проверяем все варианты
        possible_file = form.get("file")
        file_was_in_form = possible_file is not None  # Сохраняем флаг для последующей проверки
        if possible_file:
            logger.debug(f"File field found, type: {type(possible_file)}, isinstance UploadFile: {isinstance(possible_file, UploadFile)}")
            # Проверяем, что это UploadFile объект
            if isinstance(possible_file, UploadFile):
                upload_file = possible_file
                logger.debug(f"File accepted as UploadFile, filename: {getattr(possible_file, 'filename', 'N/A')}")
            # Если это список (может быть несколько файлов с одним именем), берем первый
            elif isinstance(possible_file, list) and len(possible_file) > 0:
                if isinstance(possible_file[0], UploadFile):
                    upload_file = possible_file[0]
                    logger.debug(f"File accepted from list, filename: {getattr(upload_file, 'filename', 'N/A')}")
            # Если это не UploadFile, но есть метод read, пробуем использовать
            elif hasattr(possible_file, 'read') and callable(getattr(possible_file, 'read', None)):
                upload_file = possible_file
                logger.debug(f"File accepted as file-like object")
            else:
                logger.warning(f"File field is not a valid file object, type: {type(possible_file)}, value: {possible_file}")
                # Если файл не распознан, но в body есть структура __file__, это ошибка
                # Проверяем это после парсинга entry
    else:
        try:
            raw_data = await request.json()
        except Exception:
            raise HTTPException(400, "Некорректное JSON‑тело запроса")

    try:
        entry = MockEntry(**raw_data)
    except ValidationError as e:
        # Преобразуем ошибку в HTTP 422, чтобы фронтенд увидел причину
        raise HTTPException(422, str(e))

    # Если вместе с описанием пришёл файл — преобразуем его в файловое тело ответа,
    # не требуя, чтобы base64 хранился в JSON, который приходит от фронтенда.
    if upload_file is not None:
        try:
            # Сбрасываем позицию файла на начало (на случай если он уже был прочитан)
            if hasattr(upload_file, 'seek'):
                await upload_file.seek(0)
            content = await upload_file.read()
            if not content or len(content) == 0:
                logger.warning(f"Uploaded file is empty, filename: {getattr(upload_file, 'filename', 'unknown')}")
                raise HTTPException(400, "Загруженный файл пуст")
            data_b64 = base64.b64encode(content).decode("ascii")
            
            # Получаем filename и mime_type
            filename = getattr(upload_file, 'filename', None) or "file"
            mime_type = getattr(upload_file, 'content_type', None) or "application/octet-stream"
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error reading uploaded file: {str(e)}, type: {type(upload_file)}")
            raise HTTPException(400, f"Не удалось прочитать файл: {str(e)}")

        entry.response_config.body = {
            "__file__": True,
            "filename": filename,
            "mime_type": mime_type,
            "data_base64": data_b64,
        }
    # Если файл не пришёл, но в body уже есть структура __file__ с data_base64,
    # значит это редактирование существующего мока с файлом - оставляем как есть
    elif isinstance(entry.response_config.body, dict) and entry.response_config.body.get("__file__") is True:
        # Проверяем, что есть data_base64, иначе это некорректная структура
        # Но только если это не multipart/form-data запрос (в котором файл должен был прийти отдельно)
        if content_type.startswith("multipart/form-data"):
            # Если это multipart запрос, но файл не был определен, значит файл не был отправлен или не распознан
            logger.warning(f"Multipart request with __file__ structure but no file detected. Body keys: {list(entry.response_config.body.keys())}")
            # Используем сохраненный флаг file_was_in_form
            if file_was_in_form:
                logger.warning(f"File was in form but not recognized. Type: {type(possible_file)}, value: {possible_file}")
                raise HTTPException(400, f"Файл был отправлен, но не может быть прочитан. Тип: {type(possible_file)}. Убедитесь, что файл отправляется корректно в поле 'file'.")
            else:
                raise HTTPException(400, "Для файлового ответа требуется загрузить файл в поле 'file' при multipart/form-data запросе")
        elif "data_base64" not in entry.response_config.body or not entry.response_config.body.get("data_base64"):
            raise HTTPException(400, "Для файлового ответа требуется либо загрузить новый файл, либо сохранить существующий с data_base64")

    _save_mock_entry(entry, db)
    db.commit()
    return {"message": "mock saved", "mock": entry}



@app.get(
    "/api/mocks",
    response_model=List[MockEntry],
    summary="Получить список моков",
    description=(
        "Возвращает список всех моков.\n\n"
        "Можно ограничить выборку конкретной папкой, передав параметр `folder`."
    ),
)
def list_mocks(
    folder: Optional[str] = Query(
        default=None,
        description="Имя папки (страницы), для которой нужно вернуть моки. Если не указано — возвращаются все моки.",
    ),
    db: Session = Depends(get_db),
):
    q = db.query(Mock)
    if folder:
        q = q.filter_by(folder_name=folder)
    
    results = []
    for m in q.all():
        results.append(
            MockEntry(
                id=m.id,
                folder=m.folder_name,
                name=m.name,
                request_condition=MockRequestCondition(
                    method=m.method,
                    path=m.path,
                    headers=m.headers if m.headers else None,
                    body_contains=m.body_contains,
                ),
                response_config=MockResponseConfig(
                    status_code=m.status_code,
                    headers=m.response_headers if m.response_headers else None,
                    body=m.response_body,
                ),
                active=m.active,
                delay_ms=m.delay_ms or 0,
            )
        )
    return results



@app.delete(
    "/api/mocks",
    summary="Удалить мок по ID",
    description="Удаляет мок по его уникальному идентификатору (UUID).",
)
def delete_mock(
    id_: str = Query(..., description="UUID мока, который нужно удалить"),
    db: Session = Depends(get_db),
):
    mock = db.query(Mock).filter_by(id=id_).first()
    if not mock:
        raise HTTPException(404, f"Mock with id {id_} not found")
    db.delete(mock)
    db.commit()
    return {"message": "mock deleted"}



@app.patch(
    "/api/mocks/{mock_id}/toggle",
    summary="Включить или выключить мок",
    description="Меняет флаг активности мока (`active`). Неактивные моки игнорируются при обработке запросов.",
)
def toggle_mock(
    mock_id: str = Path(..., description="UUID мока"),
    active: bool = Body(..., embed=True, description="Новое значение флага активности"),
    db: Session = Depends(get_db)
):
    mock = db.query(Mock).filter_by(id=mock_id).first()
    if not mock:
        raise HTTPException(404, "Mock not found")
    mock.active = active
    db.commit()
    return {"id": mock_id, "active": active}



@app.patch(
    "/api/mocks/deactivate-all",
    summary="Отключить все активные моки",
    description="Массово отключает все моки, опционально только в указанной папке.",
)
def deactivate_all(
    folder: Optional[str] = Query(
        None,
        description="Имя папки. Если не указано — будут отключены все активные моки во всех папках.",
    ),
    db: Session = Depends(get_db),
):
    q = db.query(Mock).filter_by(active=True)
    if folder:
        q = q.filter_by(folder_name=folder)
    
    mocks_in_folder = q.all()
    if not mocks_in_folder:
        raise HTTPException(404, "No matching mock found")
    
    for m in mocks_in_folder:
        m.active = False
    db.commit()
    return {"message": f"All mocks{' in folder '+folder if folder else ''} deactivated"}


def encode_filename_rfc5987(filename: str) -> str:
    """
    Кодирует имя файла в соответствии с RFC 5987 для использования в заголовке Content-Disposition.
    
    Поддерживает кириллицу и другие не-ASCII символы.
    Формат: filename*=UTF-8''<URL-encoded-filename>
    """
    try:
        # Кодируем в UTF-8 и затем URL-кодируем
        encoded = quote(filename, safe='')
        return f"UTF-8''{encoded}"
    except Exception:
        # Fallback: просто возвращаем как есть, если что-то пошло не так
        return filename


@app.post(
    "/api/mocks/import",
    summary="Импортировать моки из Postman Collection v2.1",
    description=(
        "Принимает JSON‑файл Postman Collection v2.1 и создаёт моки по содержимому коллекции.\n\n"
        "Для коллекции создаётся отдельная папка с именем `collection.info.name`."
    ),
)
async def import_postman_collection(
    file: UploadFile = File(
        ...,
        description="Файл Postman Collection v2.1 в формате JSON",
        examples=["postman_collection.json"],
    ),
    db: Session = Depends(get_db)
):
    """
    Импорт из Postman Collection v2.1 JSON.
    Создаёт папку с именем collection.info.name и сохраняет все запросы как моки в ней.
    """
    try:
        content = await file.read()

        try:
            coll = json.loads(content)
        except json.JSONDecodeError:
            return JSONResponse({"detail": "Invalid JSON file"}, status_code=400)

        folder_name = coll.get("info", {}).get("name", "postman")
        folder_name = folder_name.strip() or "postman"

        if not db.query(Folder).filter_by(name=folder_name).first():
            db.add(Folder(name=folder_name))
            db.flush()

        items = coll.get("item", [])
        imported = []

        def process_item(item, folder_name_prefix=""):
            """Рекурсивно обрабатывает элементы Postman коллекции (запросы и папки)."""
            if not isinstance(item, dict):
                return
            
            # Если это папка (folder) с вложенными элементами
            if "item" in item and isinstance(item.get("item"), list):
                folder_name = item.get("name", "")
                if folder_name:
                    # Обрабатываем вложенные элементы
                    for sub_item in item.get("item", []):
                        process_item(sub_item, folder_name_prefix)
                return
            
            # Если это запрос
            req = item.get("request", {})
            res_list = item.get("response", [])

            if not req or not res_list:
                return

            res = res_list[0]
            url = req.get("url", {})

            # Используем функцию extract_path_from_url для правильной обработки путей с query параметрами
            path = extract_path_from_url(url)

            # Обработка заголовков запроса
            request_headers = {}
            for h in req.get("header", []):
                if isinstance(h, dict) and "key" in h:
                    request_headers[h["key"]] = h.get("value", "")

            # Обработка тела запроса
            body_contains = None
            req_body = req.get("body", {})
            if req_body:
                if isinstance(req_body, dict):
                    mode = req_body.get("mode", "")
                    
                    if mode == "raw":
                        # Для raw берем содержимое из поля "raw"
                        body_data = req_body.get("raw", "")
                        if body_data:
                            if isinstance(body_data, str):
                                body_contains = body_data
                            else:
                                body_contains = json.dumps(body_data) if body_data else None
                    elif mode == "urlencoded" and isinstance(req_body.get("urlencoded"), list):
                        # Для urlencoded формируем строку key=value&key2=value2
                        params = []
                        for param in req_body.get("urlencoded", []):
                            if isinstance(param, dict):
                                key = param.get("key", "")
                                value = param.get("value", "")
                                if key:
                                    # URL-кодируем значения
                                    from urllib.parse import quote_plus
                                    encoded_key = quote_plus(str(key))
                                    encoded_value = quote_plus(str(value)) if value else ""
                                    params.append(f"{encoded_key}={encoded_value}")
                        if params:
                            body_contains = "&".join(params)
                    elif mode == "formdata" and isinstance(req_body.get("formdata"), list):
                        # Для formdata тоже формируем строку (упрощенно)
                        params = []
                        for param in req_body.get("formdata", []):
                            if isinstance(param, dict):
                                key = param.get("key", "")
                                value = param.get("value", "")
                                if key:
                                    from urllib.parse import quote_plus
                                    encoded_key = quote_plus(str(key))
                                    encoded_value = quote_plus(str(value)) if value else ""
                                    params.append(f"{encoded_key}={encoded_value}")
                        if params:
                            body_contains = "&".join(params)
                    elif mode == "file" and req_body.get("file"):
                        # Для файла берем путь или содержимое
                        file_info = req_body.get("file", {})
                        if isinstance(file_info, dict):
                            file_src = file_info.get("src", "")
                            if file_src:
                                body_contains = file_src
                        elif isinstance(file_info, str):
                            body_contains = file_info
                    else:
                        # Fallback: пробуем найти raw или любое другое поле
                        body_data = req_body.get("raw") or req_body.get(mode) or ""
                        if body_data:
                            if isinstance(body_data, str):
                                body_contains = body_data
                            else:
                                body_contains = json.dumps(body_data) if body_data else None
                elif isinstance(req_body, str):
                    body_contains = req_body

            # Обработка заголовков ответа
            response_headers = {}
            for h in res.get("header", []):
                if isinstance(h, dict) and "key" in h:
                    response_headers[h["key"]] = h.get("value", "")

            # Обработка тела ответа
            response_body = res.get("body", "{}")

            if isinstance(response_body, str):
                try:
                    response_body = json.loads(response_body) if response_body else {}
                except json.JSONDecodeError:
                    response_body = {"text": response_body}
            elif response_body is None:
                response_body = {}

            # Обработка статус кода
            status_code = res.get("code", 200)
            if isinstance(status_code, str):
                try:
                    status_code = int(status_code)
                except (ValueError, TypeError):
                    status_code = 200

            entry = MockEntry(
                folder=folder_name,
                name=item.get("name"),
                request_condition=MockRequestCondition(
                    method=req.get("method", "GET"),
                    path=path,
                    headers=request_headers if request_headers else None,
                    body_contains=body_contains
                ),
                response_config=MockResponseConfig(
                    status_code=status_code,
                    headers=response_headers if response_headers else None,
                    body=response_body
                ),
                active=True
            )

            mock = Mock(id=entry.id or str(uuid4()))
            db.add(mock)
            mock.folder_name = entry.folder
            mock.name = entry.name
            mock.method = entry.request_condition.method.upper()
            mock.path = _normalize_path_for_storage(entry.request_condition.path)
            mock.headers = entry.request_condition.headers or {}
            mock.body_contains = entry.request_condition.body_contains
            mock.status_code = entry.response_config.status_code
            mock.response_headers = entry.response_config.headers or {}
            mock.response_body = entry.response_config.body
            mock.active = entry.active

            imported.append(mock.id)

        # Обрабатываем все элементы коллекции
        for it in items:
            process_item(it)

        db.commit()
        logger.info(f"Imported {len(imported)} mocks from Postman collection into folder '{folder_name}'")

        return JSONResponse({
            "message": f"Imported {len(imported)} mocks into folder '{folder_name}'",
            "imported_ids": imported,
            "folder_name": folder_name,
            "mocks_count": len(imported)
        }, status_code=200)

    except Exception as e:
        logger.error(f"Error importing Postman collection: {str(e)}")
        return JSONResponse({
            "detail": f"Error processing file: {str(e)}"
        }, status_code=500)


@app.get(
    "/api/openapi/specs",
    summary="Список загруженных OpenAPI спецификаций",
)
async def list_openapi_specs():
    return [
        {
            "name": name,
            "title": spec.get("info", {}).get("title"),
            "version": spec.get("info", {}).get("version"),
        }
        for name, spec in OPENAPI_SPECS.items()
    ]


@app.get(
    "/api/openapi/specs/{name}",
    summary="Получить OpenAPI спецификацию по имени",
)
async def get_openapi_spec(name: str = Path(..., description="Имя спецификации")):
    spec = OPENAPI_SPECS.get(name)
    if not spec:
        raise HTTPException(404, "Spec not found")
    return spec


class OpenApiFromUrlPayload(BaseModel):
    url: str = Field(..., description="URL до JSON/YAML OpenAPI спецификации")
    name: Optional[str] = Field(None, description="Явное имя спецификации (если не указано, возьмется info.title)")
    folder_name: Optional[str] = Field(
        None,
        description="Имя папки (страницы), в которую будут импортированы эндпоинты OpenAPI",
    )


@app.post(
    "/api/openapi/specs/from-url",
    summary="Загрузить OpenAPI спецификацию по URL",
)
async def load_openapi_from_url(payload: OpenApiFromUrlPayload):
    try:
        resp = httpx.get(payload.url, timeout=10.0)
        resp.raise_for_status()
        text_body = resp.text
        try:
            spec = json.loads(text_body)
        except json.JSONDecodeError:
            spec = yaml.safe_load(text_body)

        name = payload.name or spec.get("info", {}).get("title") or payload.url
        OPENAPI_SPECS[name] = spec

        raw_folder = payload.folder_name or name
        folder_slug = _slugify_folder_name(raw_folder)

        db = SessionLocal()
        try:
            folder_name = _ensure_folder(folder_slug, db=db)
            mocks_created = generate_mocks_for_openapi(spec, folder_name, db)
            db.commit()
        finally:
            db.close()

        return {
            "message": "spec loaded",
            "name": name,
            "folder_name": folder_name,
            "mocks_created": mocks_created,
        }
    except Exception as e:
        raise HTTPException(400, f"Failed to load spec: {str(e)}")


@app.post(
    "/api/openapi/specs/upload",
    summary="Загрузить одну или несколько OpenAPI спецификаций файлами",
)
async def upload_openapi_specs(files: List[UploadFile] = File(...)):
    loaded = []
    for file in files:
        try:
            content = await file.read()
            text_body = content.decode("utf-8")
            try:
                spec = json.loads(text_body)
            except json.JSONDecodeError:
                spec = yaml.safe_load(text_body)
            name = spec.get("info", {}).get("title") or file.filename
            OPENAPI_SPECS[name] = spec
            folder_name = _ensure_folder_for_spec(name)
            loaded.append({"name": name, "folder_name": folder_name})
        except Exception as e:
            logger.error(f"Failed to load OpenAPI spec from upload {file.filename}: {e}")
    return {"message": f"Loaded {len(loaded)} specs", "items": loaded}


@app.delete(
    "/api/cache",
    summary="Очистить кэш ответов",
    description="Очищает кэш ответов полностью или по фильтрам папки и префикса пути.",
)
async def clear_cache(
    folder: Optional[str] = Query(None, description="Имя папки для очистки кэша"),
    path_prefix: Optional[str] = Query(None, description="Префикс пути внутри папки"),
):
    removed = 0
    if not RESPONSE_CACHE:
        return {"message": "cache empty", "removed": 0}
    keys = list(RESPONSE_CACHE.keys())
    for key in keys:
        # Ключ формата mockId:METHOD:/inner/path?query
        try:
            _, method, inner = key.split(":", 2)
        except ValueError:
            continue
        if path_prefix and not inner.startswith(path_prefix):
            continue
        # Папка в ключ не входит, поэтому фильтрация по папке только приблизительная:
        # мы просто очищаем все, если указан folder (поведение задокументировано).
        if folder is not None:
            RESPONSE_CACHE.pop(key, None)
            removed += 1
        elif path_prefix:
            RESPONSE_CACHE.pop(key, None)
            removed += 1
    if folder is None and path_prefix is None:
        removed = len(RESPONSE_CACHE)
        RESPONSE_CACHE.clear()
    return {"message": "cache cleared", "removed": removed}


@app.get("/metrics")
async def metrics():
    """Экспорт метрик в формате Prometheus."""
    data = generate_latest()
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)



def extract_path_from_url(url) -> str:
    """Извлекает путь из URL, обрабатывая различные форматы Postman."""
    if isinstance(url, dict):
        # Обрабатываем query параметры (если есть)
        query = url.get("query", [])
        query_str = ""
        if query:
            query_params = []
            for q in query:
                if isinstance(q, dict) and "key" in q:
                    key = q.get("key", "")
                    val = q.get("value", "")
                    query_params.append(f"{key}={val}")
            if query_params:
                query_str = "?" + "&".join(query_params)
        
        # Предпочитаем field path[] если он есть
        path_segments = url.get("path", [])
        if path_segments:
            path = "/" + "/".join(str(segment) for segment in path_segments)
            return path + query_str
        
        # Пробуем raw URL
        raw = url.get("raw", "")
        if raw:
            # extract_path_from_raw_url уже включает query из raw, но если есть отдельные query параметры, используем их
            extracted = extract_path_from_raw_url(raw)
            # Если в extracted уже есть query, не добавляем дубликат
            if "?" in extracted:
                return extracted
            return extracted + query_str
        
        return "/" + query_str if query_str else "/"
    
    elif isinstance(url, str):
        return extract_path_from_raw_url(url)
    
    return "/"



def extract_path_from_raw_url(raw: str) -> str:
    """Извлекает путь из raw URL строки, включая query параметры."""
    if not raw:
        return "/"
    
    try:
        parsed = urlparse(raw)
        path = parsed.path or "/"
        # Добавляем query параметры, если они есть
        if parsed.query:
            path = f"{path}?{parsed.query}"
        return path
    except Exception:
        # Fallback: простой парсинг
        if "://" in raw:
            raw = raw.split("://", 1)[1]
        
        # Сохраняем query параметры, если они есть
        if "?" in raw:
            path_part, query_part = raw.split("?", 1)
            if "/" in path_part:
                path = "/" + path_part.split("/", 1)[1]
            else:
                path = "/"
            path = f"{path}?{query_part}"
        elif "/" in raw:
            path = "/" + raw.split("/", 1)[1]
        else:
            path = "/"
        
        return path



async def match_condition(req: Request, m: Mock, full_path: str) -> bool:
    """Проверяет, подходит ли запрос к условиям мока.


    full_path — это путь запроса с query‑строкой, уже нормализованный
    (например, без префикса папки).
    """
    # Проверка метода
    if req.method.upper() != m.method.upper():
        return False
    
    # Нормализуем пути для сравнения
    def normalize_path(p: str) -> Tuple[str, str]:
        """Разделяет путь на базовый путь и query строку."""
        if "?" in p:
            base_path, query = p.split("?", 1)
            return base_path.rstrip("/") or "/", query
        return p.rstrip("/") or "/", ""
    
    mock_path_base, mock_query = normalize_path(m.path)
    request_path_base, request_query = normalize_path(full_path)
    
    # Сравниваем базовые пути
    if mock_path_base != request_path_base:
        return False
    
    # Если в моке есть query параметры, они должны полностью совпадать
    # Если в моке нет query параметров, то запрос может быть с любыми query параметрами или без них
    if mock_query:
        # Нормализуем query параметры для сравнения (сортируем по ключам)
        def normalize_query(q: str) -> str:
            if not q:
                return ""
            params = sorted([p.split("=", 1) for p in q.split("&") if p])
            return "&".join(f"{k}={v}" for k, v in params)
        
        if normalize_query(mock_query) != normalize_query(request_query):
            return False
    
    # Проверка заголовков
    if m.headers:
        for hk, hv in m.headers.items():
            if req.headers.get(hk) != hv:
                return False
    
    # Проверка содержимого тела
    if m.body_contains:
        try:
            body = (await req.body()).decode("utf-8")
            if m.body_contains not in body:
                return False
        except Exception:
            return False
    
    return True



def _cache_key_for_mock(m: Mock, method: str, full_inner: str) -> str:
    """Формирует ключ кэша для мока и запроса."""
    return f"{m.id}:{method.upper()}:{full_inner}"


def _get_cache_ttl_from_body(body: Any) -> int:
    """Извлекает TTL кэша (секунды) из спец‑поля в ответе или из дефолта."""
    if isinstance(body, dict):
        ttl = body.get("__cache_ttl__")
        if isinstance(ttl, (int, float)) and ttl > 0:
            return int(ttl)
    return DEFAULT_CACHE_TTL_SECONDS


def _get_delay_ms(m: Mock, body: Any) -> int:
    """Возвращает задержку в мс — фиксированную или случайную из диапазона."""
    base = m.delay_ms or 0
    if isinstance(body, dict):
        rng = body.get("__delay_range_ms__")
        if isinstance(rng, dict):
            try:
                mn = int(rng.get("min", base))
                mx = int(rng.get("max", base))
                if mn < 0:
                    mn = 0
                if mx < mn:
                    mx = mn
                if mn != mx:
                    return random.randint(mn, mx)
                return mn
            except Exception:
                return base
    return base


def _maybe_simulate_error(folder_name: str, body: Any) -> Optional[Dict[str, Any]]:
    """Пытается сэмулировать ошибку согласно конфигу в теле."""
    if not isinstance(body, dict):
        return None
    cfg = body.get("__error_simulation__")
    if not isinstance(cfg, dict):
        return None
    prob = float(cfg.get("probability", 0))
    if prob <= 0:
        return None
    if random.random() > prob:
        return None
    ERRORS_SIMULATED.labels(folder=folder_name).inc()
    status_code = int(cfg.get("status_code", 500))
    delay_ms = int(cfg.get("delay_ms", 0))
    err_body = cfg.get("body") or {"error": "simulated error"}
    return {
        "status_code": status_code,
        "delay_ms": delay_ms,
        "body": err_body,
    }


def _apply_templates(value: Any, req: Request, full_inner: str) -> Any:
    """Подстановка простых плейсхолдеров в строках ({method}, {path}, {query} и т.п.)."""
    context = {
        "method": req.method,
        "path": req.url.path,
        "full_path": full_inner,
        "query": req.url.query,
    }
    # Заголовки: header_Authorization, header_X_Custom
    for k, v in req.headers.items():
        context[f"header_{k.replace('-', '_')}"] = v
    # Query‑параметры: query_param_name
    for k, v in req.query_params.items():
        context[f"query_{k}"] = v

    def _fmt(s: str) -> str:
        try:
            return s.format(**context)
        except Exception:
            return s

    if isinstance(value, str):
        return _fmt(value)
    if isinstance(value, dict):
        return {k: _apply_templates(v, req, full_inner) for k, v in value.items()}
    if isinstance(value, list):
        return [_apply_templates(v, req, full_inner) for v in value]
    return value


def _rate_limit_exceeded(client_ip: str) -> bool:
    """Простое rate limiting по IP и окну времени."""
    if RATE_LIMIT_REQUESTS <= 0:
        return False
    now = time.time()
    state = RATE_LIMIT_STATE.get(client_ip) or {"start": now, "count": 0}
    window_start = state["start"]
    if now - window_start > RATE_LIMIT_WINDOW_SECONDS:
        # новое окно
        state = {"start": now, "count": 0}
    state["count"] += 1
    RATE_LIMIT_STATE[client_ip] = state
    return state["count"] > RATE_LIMIT_REQUESTS


# Catch-all маршрут для обработки моков
@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def mock_handler(request: Request, full_path: str, db: Session = Depends(get_db)):
    """Обработчик всех запросов, не совпадающих с API маршрутами."""
    folder_name = "default"
    start_time = time.time()

    # Rate limiting
    client_ip = request.client.host if request.client else "unknown"
    if _rate_limit_exceeded(client_ip):
        RATE_LIMITED.inc()
        REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="rate_limited").inc()
        raise HTTPException(status_code=429, detail="Too Many Requests")

    # Исключаем API пути из обработки моков
    if full_path.startswith("api/"):
        raise HTTPException(404, "No matching mock found")
    
    # Ограничение размера тела
    if MAX_REQUEST_BODY_BYTES > 0:
        body_bytes = await request.body()
        if len(body_bytes) > MAX_REQUEST_BODY_BYTES:
            REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="too_large").inc()
            raise HTTPException(status_code=413, detail="Request entity too large")
    else:
        body_bytes = None

    # Определяем папку по URL префиксу
    path = request.url.path  # например "/auth/api/login"
    segments = [seg for seg in path.split("/") if seg]


    inner_path = path


    if segments:
        candidate = segments[0]
        folder = db.query(Folder).filter_by(name=candidate).first()
        if folder:
            folder_name = candidate
            inner_path = "/" + "/".join(segments[1:]) if len(segments) > 1 else "/"
        else:
            folder = db.query(Folder).filter_by(name="default").first()
    else:
        folder = db.query(Folder).filter_by(name="default").first()


    query_suffix = f"?{request.url.query}" if request.url.query else ""
    full_inner = f"{inner_path}{query_suffix}"
    # Нормализуем путь для сравнения (убираем лишние слэши в конце, но сохраняем query)
    if "?" in full_inner:
        base, query = full_inner.split("?", 1)
        full_inner = f"{base.rstrip('/') or '/'}?{query}"
    else:
        full_inner = full_inner.rstrip("/") or "/"


    # Ищем подходящий мок только в выбранной папке
    for m in db.query(Mock).filter_by(active=True, folder_name=folder_name).all():
        if await match_condition(request, m, full_inner):
            body = m.response_body

            # Попытка отдать из кэша
            ttl = _get_cache_ttl_from_body(body)
            cache_key = None
            if ttl > 0:
                cache_key = _cache_key_for_mock(m, request.method, full_inner)
                cached = RESPONSE_CACHE.get(cache_key)
                if cached:
                    expires_at, cached_payload = cached
                    if expires_at > time.time():
                        CACHE_HITS.labels(folder=folder_name).inc()
                        REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="cache_hit").inc()
                        # Восстанавливаем Response из кэша
                        resp = Response(
                            content=cached_payload["content"],
                            status_code=cached_payload["status_code"],
                            media_type=cached_payload["media_type"],
                        )
                        for k, v in cached_payload.get("headers", {}).items():
                            resp.headers[k] = v
                        RESPONSE_TIME.labels(folder=folder_name).observe(time.time() - start_time)
                        return resp

            # Задержка ответа при необходимости
            # (фиксированная или диапазон)
            delay_ms = _get_delay_ms(m, body)

            # Имитация ошибок
            err_cfg = _maybe_simulate_error(folder_name, body)
            if err_cfg:
                if err_cfg["delay_ms"] > 0:
                    await asyncio.sleep(err_cfg["delay_ms"] / 1000.0)
                resp_body = _apply_templates(err_cfg["body"], request, full_inner)
                resp = JSONResponse(content=resp_body, status_code=err_cfg["status_code"])
                RESPONSE_TIME.labels(folder=folder_name).observe(time.time() - start_time)
                REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="error_simulated").inc()
                MOCK_HITS.labels(folder=folder_name).inc()
                return resp

            if delay_ms and delay_ms > 0:
                await asyncio.sleep(delay_ms / 1000.0)

            body = _apply_templates(body, request, full_inner)


            # Поддержка файловых ответов через спец‑структуру
            is_file = isinstance(body, dict) and body.get("__file__") is True and "data_base64" in body
            if is_file:
                try:
                    raw = base64.b64decode(body.get("data_base64") or "")
                except Exception:
                    raw = b""


                resp = Response(
                    content=raw,
                    status_code=m.status_code,
                    media_type=body.get("mime_type") or "application/octet-stream",
                )
                filename = body.get("filename")
                if filename:
                    # Используем RFC 5987 для поддержки кириллицы и других не-ASCII символов
                    try:
                        # Сначала пробуем стандартное кодирование для ASCII имён
                        filename.encode('ascii')
                        resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
                    except UnicodeEncodeError:
                        # Если есть не-ASCII символы, используем RFC 5987
                        encoded_filename = encode_filename_rfc5987(filename)
                        resp.headers["Content-Disposition"] = f"attachment; filename*={encoded_filename}"
            else:
                # Если по ошибке в БД лежит строка, а не JSON, просто вернём текст
                if isinstance(body, str):
                    resp = Response(
                        content=body,
                        status_code=m.status_code,
                        media_type="text/plain; charset=utf-8",
                    )
                else:
                    resp = JSONResponse(
                        content=body,
                        status_code=m.status_code
                    )


            # Заголовки ответа с подстановками
            for k, v in (m.response_headers or {}).items():
                if isinstance(v, str):
                    v = _apply_templates(v, request, full_inner)
                resp.headers[k] = v

            # Сохраняем в кэш, если включено
            if cache_key and ttl > 0:
                RESPONSE_CACHE[cache_key] = (
                    time.time() + ttl,
                    {
                        "status_code": resp.status_code,
                        "content": resp.body,
                        "media_type": resp.media_type,
                        "headers": dict(resp.headers),
                    },
                )

            MOCK_HITS.labels(folder=folder_name).inc()
            RESPONSE_TIME.labels(folder=folder_name).observe(time.time() - start_time)
            REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="mock_hit").inc()
            return resp


    # Если мок не найден, пробуем прокси для папки
    if folder and getattr(folder, "proxy_enabled", False) and getattr(folder, "proxy_base_url", None):
        target_url = f'{folder.proxy_base_url.rstrip("/")}{full_inner}'

        # Ограничение на список разрешённых хостов для прокси (если настроено)
        if ALLOWED_PROXY_HOSTS:
            try:
                parsed = urlparse(folder.proxy_base_url)
                host = (parsed.hostname or "").lower()
            except Exception:
                host = ""
            if host not in ALLOWED_PROXY_HOSTS:
                raise HTTPException(403, "Proxy target host is not allowed")

        try:
            async with httpx.AsyncClient() as client:
                proxied = await client.request(
                    method=request.method,
                    url=target_url,
                    headers={k: v for k, v in request.headers.items() if k.lower() != "host"},
                    content=await request.body()
                )
        except Exception as e:
            raise HTTPException(502, f"Proxy error: {str(e)}")


        resp = Response(content=proxied.content, status_code=proxied.status_code)
        # Копируем заголовки, исключая hop-by-hop;
        # При редиректах переписываем Location на текущий хост (умная обработка редиректов).
        for k, v in proxied.headers.items():
            kl = k.lower()
            if kl in {"content-length", "transfer-encoding", "connection"}:
                continue
            if kl == "location":
                try:
                    loc = urlparse(v)
                    if loc.scheme and loc.netloc:
                        # Переписываем только хост/схему, путь и query оставляем
                        current = request.base_url
                        new_loc = f"{current.scheme}://{current.netloc}{loc.path or ''}"
                        if loc.query:
                            new_loc += f"?{loc.query}"
                        v = new_loc
                except Exception:
                    pass
            resp.headers[k] = v

        PROXY_REQUESTS.labels(folder=folder_name).inc()
        RESPONSE_TIME.labels(folder=folder_name).observe(time.time() - start_time)
        REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="proxied").inc()
        return resp

    RESPONSE_TIME.labels(folder=folder_name).observe(time.time() - start_time)
    REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="not_found").inc()
    raise HTTPException(404, "No matching mock found")
