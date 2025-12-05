import os
import json
import re
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
from pydantic import BaseModel, Field, ValidationError, field_validator
from typing import Dict, Optional, List, Any, Tuple
from sqlalchemy import (
    create_engine, Column, String, Integer, Boolean, JSON as SAJSON, ForeignKey, text
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST, CollectorRegistry, REGISTRY



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
# Детальные метрики по методам и путям
REQUEST_DETAILED = Counter(
    "mockl_requests_detailed_total",
    "Detailed request metrics by method, path, folder, outcome, and status",
    ["method", "path", "folder", "outcome", "status_code"],
)
RESPONSE_TIME_DETAILED = Histogram(
    "mockl_response_time_detailed_seconds",
    "Detailed response time by method, path, folder, and outcome",
    ["method", "path", "folder", "outcome"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
)
PROXY_RESPONSE_TIME = Histogram(
    "mockl_proxy_response_time_seconds",
    "Response time for proxied requests by method, path, and folder",
    ["method", "path", "folder"],
    buckets=[0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5, 5.0, 10.0],
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
    mocks = relationship("Mock", back_populates="folder_obj", cascade="all, delete", order_by="Mock.order")
    # Настройки прокси для папки
    proxy_enabled = Column(Boolean, default=False)
    proxy_base_url = Column(String, nullable=True)
    # Порядок отображения папки
    order = Column(Integer, default=0, index=True)
    # Родительская папка для поддержки вложенных папок
    parent_folder = Column(String, ForeignKey("folders.name"), nullable=True, index=True)
    # Вложенные папки
    subfolders = relationship("Folder", backref="parent", remote_side=[name], cascade="all, delete")



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
    # Диапазон задержки (для случайной задержки)
    delay_range_min_ms = Column(Integer, nullable=True)
    delay_range_max_ms = Column(Integer, nullable=True)
    # Порядок отображения мока в папке
    order = Column(Integer, default=0, index=True)
    # Настройки кэширования
    cache_enabled = Column(Boolean, default=False)
    cache_ttl_seconds = Column(Integer, nullable=True)
    # Настройки имитации ошибок
    error_simulation_enabled = Column(Boolean, default=False)
    error_simulation_probability = Column(SAJSON, nullable=True)  # Float храним как JSON для точности
    error_simulation_status_code = Column(Integer, nullable=True)
    error_simulation_body = Column(SAJSON, nullable=True)
    error_simulation_delay_ms = Column(Integer, nullable=True)

    folder_obj = relationship("Folder", back_populates="mocks")


class RequestLog(Base):
    """Модель для хранения истории каждого вызова метода."""
    __tablename__ = "request_logs"
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    timestamp = Column(String, nullable=False, index=True)  # ISO format timestamp
    folder_name = Column(String, ForeignKey("folders.name"), nullable=False, index=True)
    method = Column(String, nullable=False, index=True)
    path = Column(String, nullable=False, index=True)
    is_proxied = Column(Boolean, default=False, index=True)
    response_time_ms = Column(Integer, nullable=False)  # Время ответа в миллисекундах
    status_code = Column(Integer, nullable=False, index=True)
    cache_ttl_seconds = Column(Integer, nullable=True)  # TTL кэша, если был использован
    cache_key = Column(String, nullable=True)  # Ключ кэша для возможности сброса



# Создаём таблицы
Base.metadata.create_all(bind=engine)


app = FastAPI(
    title="MocK — гибкий mock-сервер",
    description=(
        "MocK — это гибкий mock-сервер для создания и управления моками API.\n\n"
        "Основные возможности:\n"
        "- Создание и управление моками с настраиваемыми условиями запросов и ответов\n"
        "- Импорт моков из Postman Collection и OpenAPI/Swagger спецификаций\n"
        "- Поддержка проксирования запросов к реальным сервисам\n"
        "- Кэширование ответов с настраиваемым TTL\n"
        "- Подстановки в ответах и заголовках\n"
        "- Задержки и имитация ошибок\n"
        "- Детальная метрика по каждому вызову\n"
        "- Иерархическая организация моков в папках"
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



@app.get(
    "/info",
    summary="Информация о сервере и подключении к БД",
    description="Возвращает базовую информацию о работающем сервере и параметры подключения к базе данных."
)
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
    headers: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Набор заголовков, которые должны совпадать. Может быть Dict[str, str] для обязательных заголовков или Dict[str, {'value': str, 'optional': bool}] для необязательных.",
    )
    body_contains: Optional[str] = Field(
        default=None,
        description="Произвольный фрагмент текста, который должен содержаться в теле запроса",
    )
    
    @field_validator('headers', mode='before')
    @classmethod
    def validate_headers(cls, v):
        """Валидатор для заголовков - принимает как строки, так и объекты с optional."""
        if v is None:
            return None
        if not isinstance(v, dict):
            raise ValueError("headers must be a dictionary")
        # Возвращаем как есть - валидация формата будет в логике обработки
        return v



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
    delay_range_min_ms: Optional[int] = Field(
        default=None,
        description="Минимальная задержка в миллисекундах для случайной задержки из диапазона.",
    )
    delay_range_max_ms: Optional[int] = Field(
        default=None,
        description="Максимальная задержка в миллисекундах для случайной задержки из диапазона.",
    )
    cache_enabled: Optional[bool] = Field(
        default=False,
        description="Включено ли кэширование ответа для этого мока.",
    )
    cache_ttl_seconds: Optional[int] = Field(
        default=None,
        description="TTL кэша в секундах. Используется только если cache_enabled=True.",
    )
    error_simulation_enabled: Optional[bool] = Field(
        default=False,
        description="Включена ли имитация ошибок для этого мока.",
    )
    error_simulation_probability: Optional[float] = Field(
        default=None,
        description="Вероятность имитации ошибки (от 0.0 до 1.0). Используется только если error_simulation_enabled=True.",
    )
    error_simulation_status_code: Optional[int] = Field(
        default=None,
        description="HTTP статус код для имитации ошибки.",
    )
    error_simulation_body: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Тело ответа при имитации ошибки.",
    )
    error_simulation_delay_ms: Optional[int] = Field(
        default=None,
        description="Задержка в миллисекундах перед возвратом ошибки.",
    )
    order: Optional[int] = Field(
        default=None,
        description="Порядок отображения мока в папке. Если не указан, мок будет добавлен в конец.",
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
    try:
        with engine.begin() as conn:
            # Проверяем существование колонок одним запросом для оптимизации
            existing_columns = conn.execute(
                text("""
                    SELECT table_name, column_name 
                    FROM information_schema.columns 
                    WHERE table_name IN ('folders', 'mocks')
                    AND column_name IN ('proxy_enabled', 'proxy_base_url', 'order', 'delay_ms', 'name', 
                                        'delay_range_min_ms', 'delay_range_max_ms', 'cache_enabled', 
                                        'cache_ttl_seconds', 'error_simulation_enabled', 'error_simulation_probability',
                                        'error_simulation_status_code', 'error_simulation_body', 'error_simulation_delay_ms')
                """)
            ).fetchall()
            
            existing_set = {(row[0], row[1]) for row in existing_columns}
            
        # Новые поля в folders
            if ('folders', 'proxy_enabled') not in existing_set:
                try:
                    conn.execute(text("ALTER TABLE folders ADD COLUMN proxy_enabled BOOLEAN DEFAULT FALSE"))
                    logger.info("Added column folders.proxy_enabled")
                except Exception as e:
                    logger.warning(f"Error adding folders.proxy_enabled: {e}")
            
            if ('folders', 'proxy_base_url') not in existing_set:
                try:
                    conn.execute(text("ALTER TABLE folders ADD COLUMN proxy_base_url VARCHAR NULL"))
                    logger.info("Added column folders.proxy_base_url")
                except Exception as e:
                    logger.warning(f"Error adding folders.proxy_base_url: {e}")
            
            # Добавляем колонку order в folders (order - зарезервированное слово в PostgreSQL)
            if ('folders', 'order') not in existing_set:
                try:
                    conn.execute(text('ALTER TABLE folders ADD COLUMN "order" INTEGER DEFAULT 0'))
                    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_folders_order ON folders ("order")'))
                    logger.info("Added column folders.order")
                except Exception as e:
                    logger.warning(f"Error adding folders.order: {e}")
            
            # Добавляем колонку parent_folder для вложенных папок
            if ('folders', 'parent_folder') not in existing_set:
                try:
                    conn.execute(text("ALTER TABLE folders ADD COLUMN parent_folder VARCHAR NULL"))
                    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_folders_parent_folder ON folders (parent_folder)"))
                    logger.info("Added column folders.parent_folder")
                except Exception as e:
                    logger.warning(f"Error adding folders.parent_folder: {e}")
            
        # Новые поля в mocks
            if ('mocks', 'delay_ms') not in existing_set:
                try:
                    conn.execute(text("ALTER TABLE mocks ADD COLUMN delay_ms INTEGER DEFAULT 0"))
                    logger.info("Added column mocks.delay_ms")
                except Exception as e:
                    logger.warning(f"Error adding mocks.delay_ms: {e}")
            
            if ('mocks', 'name') not in existing_set:
                try:
                    conn.execute(text("ALTER TABLE mocks ADD COLUMN name VARCHAR NULL"))
                    logger.info("Added column mocks.name")
                except Exception as e:
                    logger.warning(f"Error adding mocks.name: {e}")
            
            # Добавляем колонку order в mocks
            if ('mocks', 'order') not in existing_set:
                try:
                    conn.execute(text('ALTER TABLE mocks ADD COLUMN "order" INTEGER DEFAULT 0'))
                    conn.execute(text('CREATE INDEX IF NOT EXISTS ix_mocks_order ON mocks ("order")'))
                    logger.info("Added column mocks.order")
                except Exception as e:
                    logger.warning(f"Error adding mocks.order: {e}")
            
            # Добавляем поля для кэширования, задержки и имитации ошибок
            new_mock_columns = [
                ('delay_range_min_ms', 'INTEGER NULL'),
                ('delay_range_max_ms', 'INTEGER NULL'),
                ('cache_enabled', 'BOOLEAN DEFAULT FALSE'),
                ('cache_ttl_seconds', 'INTEGER NULL'),
                ('error_simulation_enabled', 'BOOLEAN DEFAULT FALSE'),
                ('error_simulation_probability', 'JSON NULL'),
                ('error_simulation_status_code', 'INTEGER NULL'),
                ('error_simulation_body', 'JSON NULL'),
                ('error_simulation_delay_ms', 'INTEGER NULL'),
            ]
            
            for col_name, col_def in new_mock_columns:
                if ('mocks', col_name) not in existing_set:
                    try:
                        conn.execute(text(f'ALTER TABLE mocks ADD COLUMN {col_name} {col_def}'))
                        logger.info(f"Added column mocks.{col_name}")
                    except Exception as e:
                        logger.warning(f"Error adding mocks.{col_name}: {e}")
    except Exception as e:
        logger.error(f"Error during migrations: {e}", exc_info=True)



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



class FolderCreatePayload(BaseModel):
    """Модель запроса для создания папки."""
    name: str = Field(..., description="Имя новой папки. Пример: `auth`, `users`, `payments`.")
    parent_folder: Optional[str] = Field(
        default=None,
        description="Имя родительской папки для создания вложенной папки. Если не указано, создаётся корневая папка."
    )


@app.post(
    "/api/folders",
    summary="Создать папку (страницу) для моков",
    description=(
        "Создаёт новую папку (логическую группу моков).\n\n"
        "Имя папки должно быть уникальным. Папка `default` создаётся автоматически при старте сервиса.\n"
        "Можно создать вложенную папку, указав parent_folder."
    ),
)
def create_folder(
    payload: FolderCreatePayload = Body(...),
    db: Session = Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Некорректное имя папки")
    
    logger.debug(f"create_folder: name='{name}', parent_folder='{payload.parent_folder}'")
    
    # Проверяем родительскую папку, если указана
    parent_folder = None
    if payload.parent_folder:
        parent_folder_obj = db.query(Folder).filter_by(name=payload.parent_folder).first()
        if not parent_folder_obj:
            logger.warning(f"create_folder: parent folder '{payload.parent_folder}' not found")
            raise HTTPException(404, f"Родительская папка '{payload.parent_folder}' не найдена")
        parent_folder = payload.parent_folder
        # Для подпапок разрешаем дубликаты имен (даже если есть корневая папка с таким же именем)
        # Проверяем только, что в этой родительской папке нет подпапки с таким же именем
        existing_subfolder = db.query(Folder).filter_by(name=name, parent_folder=parent_folder).first()
        if existing_subfolder:
            logger.warning(f"create_folder: subfolder '{name}' already exists in parent '{parent_folder}'")
            raise HTTPException(400, f"Подпапка '{name}' уже существует в папке '{parent_folder}'")
        logger.debug(f"create_folder: creating subfolder '{name}' in parent '{parent_folder}'")
    else:
        # Для корневых папок проверяем уникальность имени (не должно быть корневой папки с таким именем)
        existing_folder = db.query(Folder).filter_by(name=name, parent_folder=None).first()
        if existing_folder:
            logger.warning(f"create_folder: root folder '{name}' already exists")
            raise HTTPException(400, f"Корневая папка '{name}' уже существует")
        logger.debug(f"create_folder: creating root folder '{name}'")
    
    db.add(Folder(name=name, parent_folder=parent_folder))
    db.commit()
    logger.info(f"create_folder: successfully created folder '{name}' with parent '{parent_folder}'")
    return {"message": "Папка добавлена", "name": name, "parent_folder": parent_folder}



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
        
        # Проверяем уникальность имени с учетом родительской папки
        # Для корневых папок проверяем, что нет другой корневой папки с таким именем
        # Для подпапок проверяем, что в той же родительской папке нет подпапки с таким именем
        # ВАЖНО: исключаем текущую папку из проверки (она может иметь такое же имя, если переименовываем в то же имя)
        parent_folder = folder.parent_folder
        if parent_folder is None:
            # Это корневая папка - проверяем, что нет другой корневой папки с таким именем
            existing_root = db.query(Folder).filter(
                Folder.name == new,
                Folder.parent_folder.is_(None),
                Folder.name != old  # Исключаем текущую папку
            ).first()
            if existing_root:
                raise HTTPException(400, f"Корневая папка '{new}' уже существует")
        else:
            # Это подпапка - проверяем, что в той же родительской папке нет подпапки с таким именем
            # ВАЖНО: подпапка может иметь имя, совпадающее с корневой папкой - это разрешено
            existing_subfolder = db.query(Folder).filter(
                Folder.name == new,
                Folder.parent_folder == parent_folder,
                Folder.name != old  # Исключаем текущую папку
            ).first()
            if existing_subfolder:
                raise HTTPException(400, f"Подпапка '{new}' уже существует в папке '{parent_folder}'")

        # Из‑за ограничений FK безопаснее всего:
        # 1) создать новую папку с новым именем,
        # 2) перевесить все моки на неё,
        # 3) перевесить все подпапки на неё,
        # 4) удалить старую папку.

        # 1. Создаём новую запись папки с сохранением parent_folder
        new_folder = Folder(name=new, parent_folder=parent_folder)
        db.add(new_folder)
        db.flush()


        # 2. Обновляем все связанные моки
        db.query(Mock).filter_by(folder_name=old).update(
            {"folder_name": new},
            synchronize_session=False
        )

        # 3. Обновляем все подпапки (если переименовывается корневая папка)
        # Если переименовывается подпапка, подпапки у неё остаются с тем же parent_folder (новым именем)
        db.query(Folder).filter_by(parent_folder=old).update(
            {"parent_folder": new},
            synchronize_session=False
        )

        # 4. Удаляем старую папку
        db.delete(folder)

        # 5. Коммитим всё разом
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



def parse_curl_command(curl_str: str) -> Dict[str, Any]:
    """
    Парсит curl команду и извлекает метод, URL, заголовки и тело запроса.
    
    Поддерживает различные форматы curl:
    - curl -X POST https://example.com/api -H "Header: value" -d '{"key":"value"}'
    - curl --request POST --url https://example.com/api --header "Header: value" --data '{"key":"value"}'
    - curl --location --request GET 'https://example.com/api' --header 'Header: value' --data '{"key":"value"}'
    - curl https://example.com/api?param=value
    """
    import re
    import shlex
    
    result = {
        "method": "GET",
        "url": "",
        "headers": {},
        "body": None
    }
    
    # Убираем начальный "curl" если есть
    curl_str = re.sub(r'^\s*curl\s+', '', curl_str.strip(), flags=re.IGNORECASE)
    
    # Обрабатываем многострочные команды с обратными слэшами
    # Объединяем строки, которые заканчиваются на обратный слэш
    lines = curl_str.split('\n')
    normalized_lines = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()  # Убираем пробелы справа, но не слева
        # Если строка заканчивается на обратный слэш, объединяем со следующей
        if line.endswith('\\'):
            line = line[:-1].rstrip()  # Убираем обратный слэш и пробелы
            # Объединяем со следующей строкой
            if i + 1 < len(lines):
                next_line = lines[i + 1].strip()
                line += ' ' + next_line
                i += 2
            else:
                i += 1
        else:
            i += 1
        if line.strip():  # Добавляем только непустые строки
            normalized_lines.append(line.strip())
    
    # Объединяем все строки в одну
    curl_str = ' '.join(normalized_lines)
    
    # Парсим аргументы с помощью shlex для правильной обработки кавычек
    try:
        parts = shlex.split(curl_str)
    except ValueError:
        # Если shlex не справился, пробуем более простой подход
        # Извлекаем данные между кавычками вручную
        parts = []
        i = 0
        while i < len(curl_str):
            if curl_str[i] in ['"', "'"]:
                quote_char = curl_str[i]
                end = i + 1
                while end < len(curl_str):
                    if curl_str[end] == quote_char and curl_str[end-1] != '\\':
                        break
                    end += 1
                parts.append(curl_str[i+1:end])
                i = end + 1
            elif curl_str[i].isspace():
                i += 1
            else:
                start = i
                while i < len(curl_str) and not curl_str[i].isspace() and curl_str[i] not in ['"', "'"]:
                    i += 1
                parts.append(curl_str[start:i])
    
    i = 0
    while i < len(parts):
        arg = parts[i]
        arg_lower = arg.lower()
        
        # Пропускаем служебные флаги
        if arg_lower in ['--location', '-l', '--location-trusted']:
            i += 1
            continue
        
        # Метод запроса
        if arg_lower in ['-x', '--request']:
            if i + 1 < len(parts):
                result["method"] = parts[i + 1].upper()
                i += 2
                continue
        elif arg_lower.startswith('-x') and len(arg_lower) > 2:
            # -XPOST формат
            method = arg_lower[2:].upper()
            result["method"] = method
            i += 1
            continue
        
        # URL
        elif arg_lower in ['--url']:
            if i + 1 < len(parts):
                result["url"] = parts[i + 1]
                i += 2
                continue
        elif arg.startswith('http://') or arg.startswith('https://'):
            result["url"] = arg
            i += 1
            continue
        
        # Заголовки
        elif arg_lower in ['-h', '--header']:
            if i + 1 < len(parts):
                header_str = parts[i + 1]
                if ':' in header_str:
                    key, value = header_str.split(':', 1)
                    result["headers"][key.strip()] = value.strip()
                i += 2
                continue
        elif arg_lower.startswith('-h') and len(arg) > 2:
            # -H"Header: value" формат
            header_str = arg[2:]
            if header_str.startswith('"') or header_str.startswith("'"):
                header_str = header_str[1:-1] if len(header_str) > 2 else header_str[1:]
            if ':' in header_str:
                key, value = header_str.split(':', 1)
                result["headers"][key.strip()] = value.strip()
            i += 1
            continue
        
        # Тело запроса
        elif arg_lower in ['-d', '--data', '--data-raw']:
            if i + 1 < len(parts):
                result["body"] = parts[i + 1]
                i += 2
                continue
        elif arg_lower.startswith('-d') and len(arg) > 2:
            # -d'{"key":"value"}' формат
            body_str = arg[2:]
            if body_str.startswith('"') or body_str.startswith("'"):
                body_str = body_str[1:-1] if len(body_str) > 2 else body_str[1:]
            result["body"] = body_str
            i += 1
            continue
        elif arg_lower in ['--data-urlencode']:
            if i + 1 < len(parts):
                result["body"] = parts[i + 1]
                i += 2
                continue
        
        i += 1
    
    # Извлекаем путь из URL
    if result["url"]:
        try:
            parsed_url = urlparse(result["url"])
            path = parsed_url.path
            if parsed_url.query:
                path += "?" + parsed_url.query
            result["path"] = path
        except Exception:
            result["path"] = result["url"]
    else:
        result["path"] = "/"
    
    return result


def _normalize_json_string(json_str: str) -> str:
    """Нормализует JSON строку: убирает лишние пробелы, переносы строк и форматирование.
    
    Пытается распарсить строку как JSON и вернуть компактную версию.
    Если парсинг не удается, возвращает исходную строку.
    """
    if not json_str or not isinstance(json_str, str):
        return json_str
    
    try:
        # Пытаемся распарсить как JSON
        parsed = json.loads(json_str)
        # Возвращаем компактную версию без пробелов
        return json.dumps(parsed, ensure_ascii=False, separators=(',', ':'))
    except (json.JSONDecodeError, TypeError):
        # Если не JSON, возвращаем как есть
        return json_str


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
        # Автоматически создаем папку, если её нет
        # Это нужно для обратной совместимости
        folder = Folder(name=entry.folder)
        db.add(folder)
        db.flush()

    mock = db.query(Mock).filter_by(id=entry.id).first()
    is_new = not mock
    if is_new:
        mock = Mock(id=entry.id)
        db.add(mock)
        # Для нового мока устанавливаем порядок в конец списка
        max_order_result = db.query(Mock).filter_by(folder_name=entry.folder).with_entities(Mock.order).order_by(Mock.order.desc()).first()
        mock.order = (max_order_result[0] if max_order_result and max_order_result[0] is not None else -1) + 1
    # При обновлении существующего мока не меняем порядок, если он не указан явно
    elif hasattr(entry, 'order') and entry.order is not None:
        mock.order = entry.order

    mock.folder_name = entry.folder
    mock.name = entry.name
    mock.method = entry.request_condition.method.upper()
    normalized_path = _normalize_path_for_storage(entry.request_condition.path)
    mock.path = normalized_path
    logger.debug(f"_save_mock_entry: normalizing path '{entry.request_condition.path}' -> '{normalized_path}'")
    
    # Сохраняем заголовки: None или пустой dict {} означает не проверять заголовки
    # В SQLAlchemy JSON колонка не может хранить None, поэтому используем {}
    headers_to_save = entry.request_condition.headers
    if headers_to_save is None or (isinstance(headers_to_save, dict) and len(headers_to_save) == 0):
        # Пустой словарь означает, что заголовки не важны
        mock.headers = {}
        logger.debug(f"_save_mock_entry: no headers to check (headers={headers_to_save})")
    else:
        mock.headers = headers_to_save
        logger.debug(f"_save_mock_entry: saving headers: {headers_to_save}")
    # Нормализуем body_contains при сохранении (убираем лишние пробелы из JSON)
    mock.body_contains = _normalize_json_string(entry.request_condition.body_contains) if entry.request_condition.body_contains else None
    mock.status_code = entry.response_config.status_code
    mock.response_headers = entry.response_config.headers or {}
    # Очищаем служебные поля из тела ответа перед сохранением
    response_body = entry.response_config.body
    if isinstance(response_body, dict):
        # Создаем копию, чтобы не изменять исходный объект
        response_body = response_body.copy()
        # Удаляем служебные поля
        response_body.pop("__cache_ttl__", None)
        response_body.pop("__delay_range_ms__", None)
        response_body.pop("__error_simulation__", None)
    mock.response_body = response_body
    mock.active = entry.active if entry.active is not None else True
    mock.delay_ms = entry.delay_ms or 0
    mock.delay_range_min_ms = entry.delay_range_min_ms
    mock.delay_range_max_ms = entry.delay_range_max_ms
    mock.cache_enabled = entry.cache_enabled if entry.cache_enabled is not None else False
    mock.cache_ttl_seconds = entry.cache_ttl_seconds
    mock.error_simulation_enabled = entry.error_simulation_enabled if entry.error_simulation_enabled is not None else False
    # Сохраняем вероятность как JSON (float)
    mock.error_simulation_probability = entry.error_simulation_probability
    mock.error_simulation_status_code = entry.error_simulation_status_code
    mock.error_simulation_body = entry.error_simulation_body
    mock.error_simulation_delay_ms = entry.error_simulation_delay_ms



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


def _generate_example_from_schema(schema: Dict[str, Any], definitions: Optional[Dict[str, Any]] = None, components: Optional[Dict[str, Any]] = None, visited_refs: Optional[set] = None) -> Any:
    """
    Генерирует пример данных из OpenAPI/Swagger схемы.
    Поддерживает Swagger 2.0 (definitions) и OpenAPI 3.x (components/schemas).
    Защищена от бесконечной рекурсии при циклических ссылках.
    """
    if not isinstance(schema, dict):
        return None
    
    # Инициализируем множество посещенных ссылок для защиты от рекурсии
    if visited_refs is None:
        visited_refs = set()
    
    # Проверяем $ref ссылки (может быть только $ref или вместе с другими полями)
    ref = schema.get("$ref")
    if ref:
        # Проверяем, не посещали ли мы уже эту ссылку (защита от циклических ссылок)
        if ref in visited_refs:
            logger.warning(f"Circular reference detected: {ref}, returning None")
            return None
        
        # Добавляем ссылку в посещенные
        visited_refs.add(ref)
        
        try:
            # Swagger 2.0: #/definitions/Pet
            # OpenAPI 3.x: #/components/schemas/Pet
            if ref.startswith("#/definitions/"):
                def_name = ref.split("/")[-1]
                if definitions and def_name in definitions:
                    return _generate_example_from_schema(definitions[def_name], definitions, components, visited_refs)
            elif ref.startswith("#/components/schemas/"):
                def_name = ref.split("/")[-1]
                schemas = components.get("schemas", {}) if components else {}
                if def_name in schemas:
                    return _generate_example_from_schema(schemas[def_name], definitions, components, visited_refs)
        finally:
            # Удаляем ссылку после обработки (для поддержки повторного использования в разных контекстах)
            visited_refs.discard(ref)
        
        # Если $ref не разрешился, возвращаем None
        return None
    
    # Если есть example, используем его
    if "example" in schema:
        return schema["example"]
    
    schema_type = schema.get("type")
    
    if schema_type == "object":
        result = {}
        properties = schema.get("properties", {})
        required = schema.get("required", [])
        
        for prop_name, prop_schema in properties.items():
            if isinstance(prop_schema, dict):
                example_value = _generate_example_from_schema(prop_schema, definitions, components, visited_refs)
                if example_value is not None:
                    result[prop_name] = example_value
                elif prop_name in required:
                    # Для обязательных полей генерируем базовые значения
                    prop_type = prop_schema.get("type")
                    if prop_type == "string":
                        result[prop_name] = prop_schema.get("example", f"example_{prop_name}")
                    elif prop_type == "integer":
                        result[prop_name] = prop_schema.get("example", 0)
                    elif prop_type == "number":
                        result[prop_name] = prop_schema.get("example", 0.0)
                    elif prop_type == "boolean":
                        result[prop_name] = prop_schema.get("example", False)
                    elif prop_type == "array":
                        result[prop_name] = []
                    elif prop_type == "object":
                        result[prop_name] = {}
        
        return result if result else {}
    
    elif schema_type == "array":
        items = schema.get("items", {})
        if isinstance(items, dict):
            item_example = _generate_example_from_schema(items, definitions, components, visited_refs)
            if item_example is not None:
                return [item_example]
        return []
    
    elif schema_type == "string":
        return schema.get("example", "string")
    elif schema_type == "integer":
        return schema.get("example", 0)
    elif schema_type == "number":
        return schema.get("example", 0.0)
    elif schema_type == "boolean":
        return schema.get("example", False)
    
    return None


def generate_mocks_for_openapi(spec: Dict[str, Any], folder_name: str, db: Session) -> int:
    """
    Генерирует моки по OpenAPI/Swagger спецификации в указанную папку.
    Поддерживает OpenAPI 3.x и Swagger 2.0 форматы.
    Для каждого пути/метода создаётся мок с примерами запроса и ответа из спецификации.
    Оптимизирован для быстрой работы с большими спецификациями.
    """
    # Определяем формат спецификации
    is_swagger_2 = spec.get("swagger") == "2.0"
    is_openapi_3 = spec.get("openapi", "").startswith("3.")
    
    # Получаем схемы (definitions для Swagger 2.0, components/schemas для OpenAPI 3.x)
    definitions = spec.get("definitions", {}) if is_swagger_2 else {}
    components = spec.get("components", {}) if is_openapi_3 else {}
    
    paths = spec.get("paths") or {}
    if not isinstance(paths, dict):
        return 0

    allowed_methods = {"get", "post", "put", "delete", "patch", "options", "head"}
    
    # ОПТИМИЗАЦИЯ: Загружаем все существующие моки для папки одним запросом
    existing_mocks = db.query(Mock).filter_by(folder_name=folder_name).all()
    # Используем нормализованные пути для сравнения
    existing_keys = {(m.method, m.path) for m in existing_mocks}
    
    # ОПТИМИЗАЦИЯ: Получаем максимальный order один раз
    max_order_result = db.query(Mock).filter_by(folder_name=folder_name).with_entities(Mock.order).order_by(Mock.order.desc()).first()
    next_order = (max_order_result[0] if max_order_result and max_order_result[0] is not None else -1) + 1
    
    # ОПТИМИЗАЦИЯ: Собираем все новые моки в список для bulk insert
    # Ограничиваем количество моков за один импорт для предотвращения перегрузки
    MAX_MOCKS_PER_IMPORT = 10000
    new_mocks = []
    created = 0

    try:
        for path, path_item in paths.items():
            if not isinstance(path_item, dict):
                continue

        for method_name, operation in path_item.items():
            if method_name.lower() not in allowed_methods:
                continue

            method_upper = method_name.upper()

            # Нормализуем путь для проверки существования
            normalized_path = _normalize_path_for_storage(path)
            
            # Проверяем, нет ли уже такого мока (быстрая проверка в памяти)
            if (method_upper, normalized_path) in existing_keys:
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
            
            # OpenAPI 3.x: requestBody
            req_body = op.get("requestBody", {})
            if req_body and isinstance(req_body, dict):
                content = req_body.get("content", {})
                # Ищем первый доступный media type (обычно application/json)
                for media_type, media_spec in content.items():
                    if isinstance(media_spec, dict):
                        # ПРИОРИТЕТ 1: Проверяем example (единственное число)
                        example = media_spec.get("example")
                        if example is not None:
                            if isinstance(example, (dict, list)):
                                request_body_contains = _normalize_json_string(json.dumps(example, ensure_ascii=False))
                            else:
                                request_body_contains = str(example)
                            request_headers["Content-Type"] = media_type
                            break
                        
                        # ПРИОРИТЕТ 2: Проверяем examples (множественное число)
                        examples = media_spec.get("examples", {})
                        if examples and isinstance(examples, dict):
                            # Берем первый пример
                            for example_name, example_obj in examples.items():
                                if isinstance(example_obj, dict):
                                    example_value = example_obj.get("value")
                                    if example_value is not None:
                                        if isinstance(example_value, (dict, list)):
                                            request_body_contains = _normalize_json_string(json.dumps(example_value, ensure_ascii=False))
                                        else:
                                            request_body_contains = str(example_value)
                                        request_headers["Content-Type"] = media_type
                                        break
                            if request_body_contains:
                                break
                        
                        # ПРИОРИТЕТ 3: Генерируем из schema
                        if not request_body_contains:
                            schema = media_spec.get("schema", {})
                            if schema and isinstance(schema, dict):
                                # Сначала проверяем schema.example
                                schema_example = schema.get("example")
                                if schema_example is not None:
                                    if isinstance(schema_example, (dict, list)):
                                        request_body_contains = _normalize_json_string(json.dumps(schema_example, ensure_ascii=False))
                                    else:
                                        request_body_contains = str(schema_example)
                                    request_headers["Content-Type"] = media_type
                                else:
                                    # Генерируем пример из схемы
                                    generated = _generate_example_from_schema(schema, definitions, components, None)
                                    if generated is not None:
                                        request_body_contains = _normalize_json_string(json.dumps(generated, ensure_ascii=False))
                                        request_headers["Content-Type"] = media_type
                                if request_body_contains:
                                    break
            
            # Swagger 2.0: parameters с in="body"
            if not request_body_contains and is_swagger_2:
                parameters = op.get("parameters", [])
                for param in parameters:
                    if isinstance(param, dict) and param.get("in") == "body":
                        schema = param.get("schema", {})
                        if schema and isinstance(schema, dict):
                            # Проверяем example в схеме
                            schema_example = schema.get("example")
                            if schema_example is not None:
                                if isinstance(schema_example, (dict, list)):
                                    request_body_contains = _normalize_json_string(json.dumps(schema_example, ensure_ascii=False))
                                else:
                                    request_body_contains = str(schema_example)
                                request_headers["Content-Type"] = "application/json"
                            else:
                                # Генерируем пример из схемы
                                generated = _generate_example_from_schema(schema, definitions, components, None)
                                if generated is not None:
                                    request_body_contains = _normalize_json_string(json.dumps(generated, ensure_ascii=False))
                                    request_headers["Content-Type"] = "application/json"
                            break

            # Извлекаем примеры ответа
            response_status = 200
            response_body = {"message": "mock from OpenAPI"}
            response_headers = {}
            responses = op.get("responses", {})
            found_example = False
            
            # ПРИОРИТЕТ 1: Ищем успешный ответ (2xx) с примером
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
                                    # ПРИОРИТЕТ 1.1: Проверяем example (единственное число)
                                    example = media_spec.get("example")
                                    if example is not None:
                                        response_body = example if isinstance(example, (dict, list)) else {"value": example}
                                        response_headers["Content-Type"] = media_type
                                        found_example = True
                                        break
                                    
                                    # ПРИОРИТЕТ 1.2: Проверяем examples (множественное число)
                                    if not found_example:
                                        examples = media_spec.get("examples", {})
                                        if examples and isinstance(examples, dict):
                                            for example_name, example_obj in examples.items():
                                                if isinstance(example_obj, dict):
                                                    example_value = example_obj.get("value")
                                                    if example_value is not None:
                                                        response_body = example_value if isinstance(example_value, (dict, list)) else {"value": example_value}
                                                        response_headers["Content-Type"] = media_type
                                                        found_example = True
                                                        break
                                    
                                    # ПРИОРИТЕТ 1.3: Проверяем schema.example (для старых версий)
                                    if not found_example:
                                        schema = media_spec.get("schema", {})
                                        if schema and isinstance(schema, dict):
                                            schema_example = schema.get("example")
                                            if schema_example is not None:
                                                response_body = schema_example if isinstance(schema_example, (dict, list)) else {"value": schema_example}
                                                response_headers["Content-Type"] = media_type
                                                found_example = True
                                                break
                                    
                                    # ПРИОРИТЕТ 1.4: Если пример не найден, генерируем из schema
                                    if not found_example:
                                        schema = media_spec.get("schema", {})
                                        if schema and isinstance(schema, dict):
                                            generated = _generate_example_from_schema(schema, definitions, components, None)
                                            if generated is not None:
                                                response_body = generated
                                                response_headers["Content-Type"] = media_type
                                                found_example = True
                                
                                if found_example:
                                    break
                            
                            if found_example:
                                break
                    except (ValueError, TypeError):
                        continue
            
            # ПРИОРИТЕТ 2: Если не нашли пример в 2xx, ищем в любом ответе (OpenAPI 3.x)
            if not found_example:
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
                                        found_example = True
                                        break
                                    
                                    if not found_example:
                                        examples = media_spec.get("examples", {})
                                        if examples and isinstance(examples, dict):
                                            for example_name, example_obj in examples.items():
                                                if isinstance(example_obj, dict):
                                                    example_value = example_obj.get("value")
                                                    if example_value is not None:
                                                        response_body = example_value if isinstance(example_value, (dict, list)) else {"value": example_value}
                                                        response_headers["Content-Type"] = media_type
                                                        found_example = True
                                                        break
                                    
                                    if not found_example:
                                        schema = media_spec.get("schema", {})
                                        if schema and isinstance(schema, dict):
                                            schema_example = schema.get("example")
                                            if schema_example is not None:
                                                response_body = schema_example if isinstance(schema_example, (dict, list)) else {"value": schema_example}
                                                response_headers["Content-Type"] = media_type
                                                found_example = True
                                            else:
                                                # Генерируем из схемы
                                                generated = _generate_example_from_schema(schema, definitions, components, None)
                                                if generated is not None:
                                                    response_body = generated
                                                    response_headers["Content-Type"] = media_type
                                                    found_example = True
                                            if found_example:
                                                break
                            
                            if found_example:
                                break
                        except (ValueError, TypeError):
                            continue
            
            # ПРИОРИТЕТ 3: Swagger 2.0 - schema напрямую в responses
            if not found_example and is_swagger_2:
                for status_str, response_spec in responses.items():
                    if isinstance(response_spec, dict):
                        try:
                            status_int = int(status_str) if status_str.isdigit() else 200
                            # Предпочитаем 2xx
                            if 200 <= status_int < 300:
                                response_status = status_int
                            schema = response_spec.get("schema", {})
                            if schema and isinstance(schema, dict):
                                # Проверяем example в схеме
                                schema_example = schema.get("example")
                                if schema_example is not None:
                                    response_body = schema_example if isinstance(schema_example, (dict, list)) else {"value": schema_example}
                                    response_headers["Content-Type"] = "application/json"
                                    found_example = True
                                else:
                                    # Генерируем из схемы
                                    generated = _generate_example_from_schema(schema, definitions, components, None)
                                    if generated is not None:
                                        response_body = generated
                                        response_headers["Content-Type"] = "application/json"
                                        found_example = True
                                if found_example:
                                    break
                        except (ValueError, TypeError):
                            continue

            # Создаём объект Mock напрямую для bulk insert (normalized_path уже вычислен выше)
            mock = Mock(
                id=str(uuid4()),
                folder_name=folder_name,
                name=mock_name,
                    method=method_upper,
                path=normalized_path,
                headers=request_headers if request_headers else {},
                body_contains=_normalize_json_string(request_body_contains) if request_body_contains else None,
                status_code=response_status,
                response_headers=response_headers if response_headers else {},
                response_body=response_body,
                active=True,
                delay_ms=0,
                order=next_order + created,
            )

            new_mocks.append(mock)
            created += 1

            # Ограничение на количество моков для предотвращения перегрузки
            if created >= MAX_MOCKS_PER_IMPORT:
                    logger.warning(f"Reached maximum mocks limit ({MAX_MOCKS_PER_IMPORT}), stopping import")
                    break
        
            # ОПТИМИЗАЦИЯ: Bulk insert всех новых моков батчами для предотвращения перегрузки памяти
            BATCH_SIZE = 500
            if new_mocks:
                for i in range(0, len(new_mocks), BATCH_SIZE):
                    batch = new_mocks[i:i + BATCH_SIZE]
                    try:
                        db.bulk_save_objects(batch)
                        db.flush()
                    except Exception as e:
                        logger.error(f"Error saving batch {i//BATCH_SIZE + 1}: {e}", exc_info=True)
                        db.rollback()
                        raise
    
    except Exception as e:
        logger.error(f"Error in generate_mocks_for_openapi: {e}", exc_info=True)
        db.rollback()
        raise
    
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
            resp = httpx.get(url, timeout=300.0, follow_redirects=True)
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


class FolderInfo(BaseModel):
    """Информация о папке."""
    name: str
    parent_folder: Optional[str] = None
    order: int = 0


@app.get(
    "/api/mocks/folders",
    response_model=List[FolderInfo],
    summary="Получить список папок",
    description="Возвращает список всех существующих папок с информацией о вложенности. Папка `default` всегда первая.",
)
def list_folders(db: Session = Depends(get_db)):
    folders = db.query(Folder).order_by(Folder.order).all()
    result = []
    default_folder = None
    
    for f in folders:
        if f.name == "default":
            default_folder = f
        else:
            result.append(FolderInfo(
                name=f.name,
                parent_folder=f.parent_folder,
                order=f.order or 0
            ))
    
    # Добавляем default в начало
    if default_folder:
        result.insert(0, FolderInfo(
            name="default",
            parent_folder=None,
            order=0
        ))
    
    return result



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
    # Логируем запрос для отладки
    logger.debug(f"list_mocks called with folder='{folder}'")
    q = db.query(Mock)
    if folder:
        # Декодируем имя папки на случай URL-кодирования
        folder = folder.strip()
        logger.debug(f"Filtering mocks by folder_name='{folder}'")
        q = q.filter_by(folder_name=folder)
    
    # Сортируем по order, затем по id для стабильности
    q = q.order_by(Mock.order.asc(), Mock.id.asc())
    
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
                    body=_clean_response_body(m.response_body),
                ),
                active=m.active,
                delay_ms=m.delay_ms or 0,
                delay_range_min_ms=m.delay_range_min_ms,
                delay_range_max_ms=m.delay_range_max_ms,
                cache_enabled=m.cache_enabled if m.cache_enabled is not None else False,
                cache_ttl_seconds=m.cache_ttl_seconds,
                error_simulation_enabled=m.error_simulation_enabled if m.error_simulation_enabled is not None else False,
                error_simulation_probability=m.error_simulation_probability,
                error_simulation_status_code=m.error_simulation_status_code,
                error_simulation_body=m.error_simulation_body,
                error_simulation_delay_ms=m.error_simulation_delay_ms,
                order=m.order if m.order is not None else 0,
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



@app.post(
    "/api/mocks/deactivate-all",
    summary="Отключить все активные моки",
    description="Массово отключает все моки, опционально только в указанной папке (включая вложенные папки).",
)
def deactivate_all(
    folder: Optional[str] = Query(
        None,
        description="Имя папки. Если не указано — будут отключены все активные моки во всех папках.",
    ),
    db: Session = Depends(get_db),
):
    if folder:
        # Отключаем моки в указанной папке и всех её вложенных папках
        # Сначала получаем все вложенные папки рекурсивно
        def get_all_subfolders(parent_name: str, visited: set = None) -> List[str]:
            if visited is None:
                visited = set()
            if parent_name in visited:
                return []
            visited.add(parent_name)
            result = [parent_name]
            subfolders = db.query(Folder).filter_by(parent_folder=parent_name).all()
            for subfolder in subfolders:
                result.extend(get_all_subfolders(subfolder.name, visited))
            return result
        
        all_folders = get_all_subfolders(folder)
        mocks_in_folders = db.query(Mock).filter(Mock.folder_name.in_(all_folders), Mock.active == True).all()
        if not mocks_in_folders:
            raise HTTPException(404, "No matching mock found")
    
        count = len(mocks_in_folders)
        for mock in mocks_in_folders:
            mock.active = False
    else:
        # Отключаем все моки во всех папках
        mocks_in_folders = db.query(Mock).filter_by(active=True).all()
        if not mocks_in_folders:
            raise HTTPException(404, "No matching mock found")
        
        count = len(mocks_in_folders)
        for mock in mocks_in_folders:
            mock.active = False
    
    db.commit()
    return {"message": f"All mocks{' in folder '+folder if folder else ''} deactivated", "count": count}


@app.patch(
    "/api/mocks/reorder",
    summary="Изменить порядок моков",
    description="Изменяет порядок моков в папке. Принимает список ID моков в новом порядке.",
)
def reorder_mocks(
    folder: str = Query(..., description="Имя папки"),
    mock_ids: List[str] = Body(..., description="Список ID моков в новом порядке"),
    db: Session = Depends(get_db),
):
    """Изменяет порядок моков в указанной папке."""
    # Проверяем, что все моки принадлежат указанной папке
    mocks = db.query(Mock).filter(
        Mock.id.in_(mock_ids),
        Mock.folder_name == folder
    ).all()
    
    if len(mocks) != len(mock_ids):
        raise HTTPException(400, "Некоторые моки не найдены или принадлежат другой папке")
    
    # Создаем словарь для быстрого доступа
    mock_dict = {m.id: m for m in mocks}
    
    # Обновляем порядок согласно новому списку
    for order, mock_id in enumerate(mock_ids):
        if mock_id in mock_dict:
            mock_dict[mock_id].order = order
    
    db.commit()
    return {"message": "Порядок моков обновлен"}


@app.post(
    "/api/mocks/parse-curl",
    summary="Распарсить curl команду",
    description="Парсит curl команду и возвращает структуру запроса (метод, URL, заголовки, тело).",
)
def parse_curl_endpoint(
    curl_command: str = Body(..., embed=True, description="curl команда для парсинга"),
):
    """Парсит curl команду и возвращает структуру запроса."""
    try:
        parsed = parse_curl_command(curl_command)
        return parsed
    except Exception as e:
        raise HTTPException(400, f"Ошибка парсинга curl команды: {str(e)}")


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

        def process_item(item):
            """Рекурсивно обрабатывает элементы Postman коллекции (запросы и папки)."""
            if not isinstance(item, dict):
                return
            
            # Если это папка (folder) с вложенными элементами
            if "item" in item and isinstance(item.get("item"), list):
                # Обрабатываем вложенные элементы рекурсивно
                for sub_item in item.get("item", []):
                    process_item(sub_item)
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
            # Системные заголовки, которые не должны использоваться для сопоставления моков
            # (они могут различаться между клиентами)
            SYSTEM_HEADERS_TO_IGNORE = {
                "accept-encoding",  # Может быть gzip, br, deflate и т.д.
                "connection",       # Может быть keep-alive, close и т.д.
                "user-agent",       # Различается между клиентами
                "host",             # Всегда разный для разных серверов
                "content-length",   # Вычисляется автоматически
                "transfer-encoding", # Может различаться
                "upgrade",          # Может быть в запросах
                "via",             # Прокси-заголовки
                "x-forwarded-for", # Прокси-заголовки
                "x-forwarded-proto", # Прокси-заголовки
                "x-real-ip",       # Прокси-заголовки
            }
            
            request_headers = {}
            for h in req.get("header", []):
                if isinstance(h, dict) and "key" in h:
                    key = h.get("key", "").strip()
                    # Игнорируем пустые ключи и системные заголовки
                    if key and key.lower() not in SYSTEM_HEADERS_TO_IGNORE:
                        request_headers[key] = h.get("value", "")
            
            # Если заголовков нет, используем None вместо пустого словаря
            if not request_headers:
                request_headers = None
            else:
                logger.debug(f"Filtered headers for import: kept {len(request_headers)} headers, ignored system headers")

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
                                body_contains = _normalize_json_string(body_data)
                            else:
                                body_contains = _normalize_json_string(json.dumps(body_data)) if body_data else None
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
                                body_contains = _normalize_json_string(body_data)
                            else:
                                body_contains = _normalize_json_string(json.dumps(body_data)) if body_data else None
                elif isinstance(req_body, str):
                    body_contains = _normalize_json_string(req_body)

            # Обработка заголовков ответа
            response_headers = {}
            # Системные заголовки, которые не нужно сохранять (вычисляются автоматически)
            system_response_headers = {
                "content-length", "connection", "date", "server", 
                "transfer-encoding", "content-encoding",
                "strict-transport-security", "x-xss-protection", 
                "x-frame-options", "x-content-type-options", 
                "referrer-policy", "content-security-policy"
            }
            for h in res.get("header", []):
                if isinstance(h, dict) and "key" in h:
                    key = h.get("key", "").strip()
                    if key and key.lower() not in system_response_headers:
                        response_headers[key] = h.get("value", "")

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

            # Логируем информацию о создаваемом моке для отладки
            logger.debug(f"Importing mock: folder={folder_name}, method={req.get('method', 'GET')}, path={path}, headers={request_headers}, body_contains={'yes' if body_contains else 'no'}")

            entry = MockEntry(
                folder=folder_name,
                name=item.get("name"),
                request_condition=MockRequestCondition(
                    method=req.get("method", "GET"),
                    path=path,
                    headers=request_headers,
                    body_contains=body_contains
                ),
                response_config=MockResponseConfig(
                    status_code=status_code,
                    headers=response_headers if response_headers else None,
                    body=response_body
                ),
                active=True
            )

            # Используем _save_mock_entry для единообразного сохранения
            _save_mock_entry(entry, db)
            # Логируем сохраненный мок для отладки
            saved_mock = db.query(Mock).filter_by(id=entry.id).first()
            if saved_mock:
                logger.info(f"Saved mock from Postman: id={saved_mock.id}, folder={saved_mock.folder_name}, method={saved_mock.method}, path='{saved_mock.path}', headers={saved_mock.headers}, active={saved_mock.active}")
            imported.append(entry.id)

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
        # Увеличиваем таймаут для больших спецификаций
        resp = httpx.get(payload.url, timeout=300.0, follow_redirects=True)
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
        except Exception as e:
            db.rollback()
            logger.error(f"Error generating mocks from OpenAPI spec: {e}", exc_info=True)
            raise HTTPException(500, f"Ошибка при генерации моков из OpenAPI спецификации: {str(e)}")
        finally:
            db.close()

        return {
            "message": "spec loaded",
            "name": name,
            "folder_name": folder_name,
            "mocks_created": mocks_created,
        }
    except httpx.HTTPError as e:
        logger.error(f"HTTP error loading OpenAPI spec from URL: {e}")
        raise HTTPException(400, f"Не удалось загрузить спецификацию по URL: {str(e)}")
    except (json.JSONDecodeError, yaml.YAMLError) as e:
        logger.error(f"Parse error loading OpenAPI spec: {e}")
        raise HTTPException(400, f"Ошибка парсинга спецификации (JSON/YAML): {str(e)}")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error loading OpenAPI spec: {e}", exc_info=True)
        raise HTTPException(500, f"Неожиданная ошибка при загрузке спецификации: {str(e)}")
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


@app.get(
    "/api/cache/status",
    summary="Получить статус кэша",
    description="Возвращает информацию о текущем состоянии кэша: количество записей, примеры ключей.",
)
async def get_cache_status():
    """Возвращает статус кэша."""
    cache_items = []
    current_time = time.time()
    expired_count = 0
    active_count = 0
    
    for key, (expires_at, payload) in RESPONSE_CACHE.items():
        is_expired = expires_at <= current_time
        if is_expired:
            expired_count += 1
        else:
            active_count += 1
        
        cache_items.append({
            "key": key,
            "expires_at": expires_at,
            "ttl_remaining": max(0, expires_at - current_time),
            "expired": is_expired,
            "status_code": payload.get("status_code"),
        })
    
    # Сортируем по времени истечения
    cache_items.sort(key=lambda x: x["expires_at"])
    
    return {
        "total": len(RESPONSE_CACHE),
        "active": active_count,
        "expired": expired_count,
        "items": cache_items[:20]  # Возвращаем первые 20 для примера
    }


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
async def metrics(folder: Optional[str] = Query(None, description="Фильтр метрик по папке")):
    """Экспорт метрик в формате Prometheus. Можно фильтровать по папке."""
    if folder:
        # Генерируем все метрики
        all_metrics = generate_latest()
        # Фильтруем метрики по label "folder"
        filtered_lines = []
        current_metric = []
        in_metric = False
        
        for line in all_metrics.decode('utf-8').split('\n'):
            # Пропускаем комментарии и пустые строки
            if not line.strip() or line.startswith('#'):
                if line.strip():
                    filtered_lines.append(line)
                continue
            
            # Проверяем, является ли строка метрикой
            if '{' in line and 'folder=' in line:
                # Проверяем, соответствует ли folder нашему фильтру
                if f'folder="{folder}"' in line or f"folder='{folder}'" in line:
                    # Добавляем метрику
                    if current_metric:
                        filtered_lines.extend(current_metric)
                    current_metric = [line]
                    in_metric = True
                else:
                    # Не соответствует фильтру, пропускаем
                    current_metric = []
                    in_metric = False
            elif in_metric:
                # Продолжение текущей метрики (например, для histogram buckets)
                current_metric.append(line)
            elif not '{' in line and 'folder=' not in line:
                # Метрика без labels (например, RATE_LIMITED без folder)
                # Пропускаем такие метрики при фильтрации
                pass
        
        # Добавляем последнюю метрику, если она есть
        if current_metric:
            filtered_lines.extend(current_metric)
        
        data = '\n'.join(filtered_lines).encode('utf-8')
    else:
        data = generate_latest()
    
    return Response(content=data, media_type=CONTENT_TYPE_LATEST)


# Pydantic модели для структурированных метрик
class MethodPathStats(BaseModel):
    method: str
    path: str
    total_requests: int = 0
    mock_hits: int = 0
    proxied: int = 0
    errors: int = 0
    not_found: int = 0
    avg_response_time_ms: float = 0.0
    min_response_time_ms: float = 0.0
    max_response_time_ms: float = 0.0
    status_codes: Dict[str, int] = {}
    proxy_avg_time_ms: Optional[float] = None
    proxy_count: int = 0


class FolderMetricsResponse(BaseModel):
    folder: str
    total_requests: int = 0
    total_methods_paths: int = 0
    avg_response_time_ms: float = 0.0
    mock_hits_total: int = 0
    proxied_total: int = 0
    errors_total: int = 0
    methods_paths: List[MethodPathStats] = []


class GlobalMetricsResponse(BaseModel):
    total_requests: int = 0
    total_methods_paths: int = 0
    avg_response_time_ms: float = 0.0
    folders: Dict[str, FolderMetricsResponse] = {}


def _parse_prometheus_metrics(text: str, folder_filter: Optional[str] = None) -> Dict[str, Any]:
    """Парсит Prometheus метрики и возвращает структурированные данные."""
    detailed_stats = {}  # {folder:method:path -> stats}
    folder_totals = {}  # {folder -> totals}
    total_requests = 0
    total_response_time = 0.0
    response_time_count = 0
    
    lines = text.split('\n')
    
    for line in lines:
        if not line.strip() or line.startswith('#'):
            continue
        
        # Парсим mockl_requests_detailed_total
        detailed_match = re.match(r'^mockl_requests_detailed_total\{([^}]+)\}\s+([0-9.eE+-]+)$', line)
        if detailed_match:
            labels_str = detailed_match.group(1)
            count = float(detailed_match.group(2))
            
            method_match = re.search(r'method="([^"]+)"', labels_str)
            path_match = re.search(r'path="([^"]+)"', labels_str)
            folder_match = re.search(r'folder="([^"]+)"', labels_str)
            outcome_match = re.search(r'outcome="([^"]+)"', labels_str)
            status_match = re.search(r'status_code="([^"]+)"', labels_str)
            
            if method_match and path_match and folder_match and outcome_match:
                method = method_match.group(1)
                path = path_match.group(1)
                folder = folder_match.group(1)
                outcome = outcome_match.group(1)
                status_code = status_match.group(1) if status_match else 'unknown'
                
                # Фильтруем по папке, если указано
                if folder_filter and folder != folder_filter:
                    continue
                
                key = f"{folder}:{method}:{path}"
                
                if key not in detailed_stats:
                    detailed_stats[key] = {
                        'folder': folder,
                        'method': method,
                        'path': path,
                        'mock_hits': 0,
                        'proxied': 0,
                        'errors': 0,
                        'not_found': 0,
                        'status_codes': {},
                        'response_times': [],
                        'proxy_avg_time': None,
                        'proxy_count': 0
                    }
                
                if folder not in folder_totals:
                    folder_totals[folder] = {
                        'total_requests': 0,
                        'mock_hits': 0,
                        'proxied': 0,
                        'errors': 0
                    }
                
                total_requests += count
                folder_totals[folder]['total_requests'] += count
                detailed_stats[key]['total_requests'] = detailed_stats[key].get('total_requests', 0) + count
                
                if outcome == 'mock_hit':
                    detailed_stats[key]['mock_hits'] += count
                    folder_totals[folder]['mock_hits'] += count
                elif outcome == 'proxied':
                    detailed_stats[key]['proxied'] += count
                    folder_totals[folder]['proxied'] += count
                elif outcome == 'not_found':
                    detailed_stats[key]['not_found'] += count
                    detailed_stats[key]['errors'] += count
                    folder_totals[folder]['errors'] += count
                else:
                    detailed_stats[key]['errors'] += count
                    folder_totals[folder]['errors'] += count
                
                if status_code not in detailed_stats[key]['status_codes']:
                    detailed_stats[key]['status_codes'][status_code] = 0
                detailed_stats[key]['status_codes'][status_code] += count
        
        # Парсим mockl_response_time_detailed_seconds_sum и count
        response_time_sum_match = re.match(r'^mockl_response_time_detailed_seconds_sum\{([^}]+)\}\s+([0-9.eE+-]+)$', line)
        if response_time_sum_match:
            labels_str = response_time_sum_match.group(1)
            sum_val = float(response_time_sum_match.group(2))
            
            method_match = re.search(r'method="([^"]+)"', labels_str)
            path_match = re.search(r'path="([^"]+)"', labels_str)
            folder_match = re.search(r'folder="([^"]+)"', labels_str)
            outcome_match = re.search(r'outcome="([^"]+)"', labels_str)
            
            if method_match and path_match and folder_match and outcome_match:
                method = method_match.group(1)
                path = path_match.group(1)
                folder = folder_match.group(1)
                outcome = outcome_match.group(1)
                
                if folder_filter and folder != folder_filter:
                    continue
                
                key = f"{folder}:{method}:{path}"
                
                # Ищем соответствующую count метрику
                count_pattern = re.compile(
                    rf'mockl_response_time_detailed_seconds_count\{{[^}}]*method="{re.escape(method)}"[^}}]*path="{re.escape(path)}"[^}}]*folder="{re.escape(folder)}"[^}}]*outcome="{re.escape(outcome)}"[^}}]*\}}\s+([0-9.eE+-]+)',
                    re.MULTILINE
                )
                count_match = count_pattern.search(text)
                if count_match and key in detailed_stats:
                    count = float(count_match.group(1))
                    avg = sum_val / count if count > 0 else 0
                    detailed_stats[key]['response_times'].append({
                        'outcome': outcome,
                        'avg': avg,
                        'count': count,
                        'sum': sum_val
                    })
        
        # Парсим mockl_proxy_response_time_seconds
        proxy_time_sum_match = re.match(r'^mockl_proxy_response_time_seconds_sum\{([^}]+)\}\s+([0-9.eE+-]+)$', line)
        if proxy_time_sum_match:
            labels_str = proxy_time_sum_match.group(1)
            sum_val = float(proxy_time_sum_match.group(2))
            
            method_match = re.search(r'method="([^"]+)"', labels_str)
            path_match = re.search(r'path="([^"]+)"', labels_str)
            folder_match = re.search(r'folder="([^"]+)"', labels_str)
            
            if method_match and path_match and folder_match:
                method = method_match.group(1)
                path = path_match.group(1)
                folder = folder_match.group(1)
                
                if folder_filter and folder != folder_filter:
                    continue
                
                key = f"{folder}:{method}:{path}"
                
                count_pattern = re.compile(
                    rf'mockl_proxy_response_time_seconds_count\{{[^}}]*method="{re.escape(method)}"[^}}]*path="{re.escape(path)}"[^}}]*folder="{re.escape(folder)}"[^}}]*\}}\s+([0-9.eE+-]+)',
                    re.MULTILINE
                )
                count_match = count_pattern.search(text)
                if count_match and key in detailed_stats:
                    count = float(count_match.group(1))
                    avg = sum_val / count if count > 0 else 0
                    detailed_stats[key]['proxy_avg_time'] = avg
                    detailed_stats[key]['proxy_count'] = count
        
        # Старые метрики для обратной совместимости
        response_time_sum_old = re.match(r'^mockl_response_time_seconds_sum\{[^}]*\}\s+([0-9.eE+-]+)$', line)
        if response_time_sum_old:
            total_response_time += float(response_time_sum_old.group(1))
        
        response_time_count_old = re.match(r'^mockl_response_time_seconds_count\{[^}]*\}\s+([0-9.eE+-]+)$', line)
        if response_time_count_old:
            response_time_count += float(response_time_count_old.group(1))
    
    # Вычисляем средние времена для каждого метода/пути
    methods_paths = []
    for key, stat in detailed_stats.items():
        # Собираем все времена ответов из разных источников
        all_times = []
        
        # Добавляем времена из response_times (детальные метрики)
        for rt in stat['response_times']:
            if rt.get('count', 0) > 0:
                # Если есть несколько запросов, используем среднее
                all_times.append(rt['avg'])
            else:
                # Если count = 0, но есть avg, все равно используем
                if rt.get('avg', 0) > 0:
                    all_times.append(rt['avg'])
        
        # Если есть proxy время, добавляем его
        if stat.get('proxy_avg_time') and stat.get('proxy_avg_time', 0) > 0:
            # Для проксированных запросов добавляем среднее время
            proxy_count = stat.get('proxy_count', 0)
            if proxy_count > 0:
                all_times.append(stat['proxy_avg_time'])
        
        # Вычисляем статистику
        if all_times:
            avg_time = sum(all_times) / len(all_times)
            min_time = min(all_times)
            max_time = max(all_times)
        elif stat.get('proxy_avg_time') and stat.get('proxy_avg_time', 0) > 0:
            # Если есть только proxy время
            avg_time = stat['proxy_avg_time']
            min_time = stat['proxy_avg_time']
            max_time = stat['proxy_avg_time']
        else:
            # Если нет данных о времени, но есть запросы, используем 0
            avg_time = 0.0
            min_time = 0.0
            max_time = 0.0
        
        methods_paths.append({
            'folder': stat['folder'],
            'method': stat['method'],
            'path': stat['path'],
            'total_requests': stat.get('total_requests', stat['mock_hits'] + stat['proxied'] + stat['errors']),
            'mock_hits': stat['mock_hits'],
            'proxied': stat['proxied'],
            'errors': stat['errors'],
            'not_found': stat['not_found'],
            'avg_response_time_ms': avg_time * 1000,
            'min_response_time_ms': min_time * 1000,
            'max_response_time_ms': max_time * 1000,
            'status_codes': stat['status_codes'],
            'proxy_avg_time_ms': stat['proxy_avg_time'] * 1000 if stat['proxy_avg_time'] else None,
            'proxy_count': stat['proxy_count']
        })
    
    methods_paths.sort(key=lambda x: x['total_requests'], reverse=True)
    
    return {
        'total_requests': total_requests,
        'avg_response_time_ms': (total_response_time / response_time_count * 1000) if response_time_count > 0 else 0.0,
        'folder_totals': folder_totals,
        'methods_paths': methods_paths
    }


@app.get("/api/metrics/folder/{folder}", response_model=FolderMetricsResponse)
async def get_folder_metrics(folder: str = Path(..., description="Имя папки")):
    """Получить структурированные метрики для конкретной папки."""
    try:
        all_metrics = generate_latest().decode('utf-8')
        parsed = _parse_prometheus_metrics(all_metrics, folder_filter=folder)
        
        folder_total = parsed['folder_totals'].get(folder, {
            'total_requests': 0,
            'mock_hits': 0,
            'proxied': 0,
            'errors': 0
        })
        
        return FolderMetricsResponse(
            folder=folder,
            total_requests=parsed['total_requests'],
            total_methods_paths=len(parsed['methods_paths']),
            avg_response_time_ms=parsed['avg_response_time_ms'],
            mock_hits_total=folder_total['mock_hits'],
            proxied_total=folder_total['proxied'],
            errors_total=folder_total['errors'],
            methods_paths=[MethodPathStats(**{k: v for k, v in mp.items() if k != 'folder'}) for mp in parsed['methods_paths']]
        )
    except Exception as e:
        logger.error(f"Error getting folder metrics: {e}", exc_info=True)
        raise HTTPException(500, f"Ошибка получения метрик: {str(e)}")


@app.get("/api/metrics/global", response_model=GlobalMetricsResponse)
async def get_global_metrics():
    """Получить структурированные метрики для всего сервиса (всех папок)."""
    try:
        all_metrics = generate_latest().decode('utf-8')
        parsed = _parse_prometheus_metrics(all_metrics, folder_filter=None)
        
        # Группируем методы/пути по папкам
        folders_dict = {}
        for mp in parsed['methods_paths']:
            folder = mp['folder']
            if folder not in folders_dict:
                folders_dict[folder] = {
                    'methods_paths': [],
                    'total_requests': 0,
                    'mock_hits': 0,
                    'proxied': 0,
                    'errors': 0
                }
            
            # Создаем MethodPathStats без поля folder (оно не в модели)
            mp_stat = {k: v for k, v in mp.items() if k != 'folder'}
            folders_dict[folder]['methods_paths'].append(MethodPathStats(**mp_stat))
            folders_dict[folder]['total_requests'] += mp['total_requests']
            folders_dict[folder]['mock_hits'] += mp['mock_hits']
            folders_dict[folder]['proxied'] += mp['proxied']
            folders_dict[folder]['errors'] += mp['errors']
        
        folders_response = {}
        for folder_name, folder_data in folders_dict.items():
            folders_response[folder_name] = FolderMetricsResponse(
                folder=folder_name,
                total_requests=folder_data['total_requests'],
                total_methods_paths=len(folder_data['methods_paths']),
                avg_response_time_ms=parsed['avg_response_time_ms'],  # Общее среднее
                mock_hits_total=folder_data['mock_hits'],
                proxied_total=folder_data['proxied'],
                errors_total=folder_data['errors'],
                methods_paths=folder_data['methods_paths']
            )
        
        return GlobalMetricsResponse(
            total_requests=parsed['total_requests'],
            total_methods_paths=len(parsed['methods_paths']),
            avg_response_time_ms=parsed['avg_response_time_ms'],
            folders=folders_response
        )
    except Exception as e:
        logger.error(f"Error getting global metrics: {e}", exc_info=True)
        raise HTTPException(500, f"Ошибка получения метрик: {str(e)}")


@app.get(
    "/api/request-logs",
    summary="Получить историю вызовов",
    description="Возвращает детальную историю всех вызовов методов с информацией о методе, пути, времени ответа, статусе, проксировании и кэше.",
)
def get_request_logs(
    folder: Optional[str] = Query(None, description="Имя папки для фильтрации. Если не указано, возвращаются все вызовы."),
    limit: int = Query(1000, description="Максимальное количество записей для возврата", ge=1, le=10000),
    offset: int = Query(0, description="Смещение для пагинации", ge=0),
    db: Session = Depends(get_db),
):
    """Возвращает историю вызовов с возможностью фильтрации по папке."""
    query = db.query(RequestLog)
    if folder:
        query = query.filter_by(folder_name=folder)
    
    total = query.count()
    logs = query.order_by(RequestLog.timestamp.desc()).limit(limit).offset(offset).all()
    
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "logs": [
            {
                "id": log.id,
                "timestamp": log.timestamp,
                "folder_name": log.folder_name,
                "method": log.method,
                "path": log.path,
                "is_proxied": log.is_proxied,
                "response_time_ms": log.response_time_ms,
                "status_code": log.status_code,
                "cache_ttl_seconds": log.cache_ttl_seconds,
                "cache_key": log.cache_key
            }
            for log in logs
        ]
    }


@app.delete(
    "/api/request-logs",
    summary="Очистить историю вызовов",
    description="Удаляет все записи истории вызовов, опционально только для указанной папки.",
)
def clear_request_logs(
    folder: Optional[str] = Query(None, description="Имя папки. Если не указано, удаляются все записи."),
    db: Session = Depends(get_db),
):
    """Очищает историю вызовов."""
    query = db.query(RequestLog)
    if folder:
        query = query.filter_by(folder_name=folder)
    
    count = query.count()
    query.delete()
    db.commit()
    
    return {"message": f"Удалено {count} записей", "deleted_count": count}


@app.delete(
    "/api/cache/clear",
    summary="Очистить кэш",
    description="Очищает кэш ответов, опционально по ключу или папке.",
)
def clear_cache(
    cache_key: Optional[str] = Query(None, description="Ключ кэша для удаления конкретной записи"),
    folder: Optional[str] = Query(None, description="Имя папки для удаления всех записей этой папки"),
):
    """Очищает кэш ответов."""
    if cache_key:
        if cache_key in RESPONSE_CACHE:
            del RESPONSE_CACHE[cache_key]
            return {"message": f"Кэш с ключом '{cache_key}' удалён", "deleted_count": 1}
        else:
            raise HTTPException(404, "Ключ кэша не найден")
    elif folder:
        # Удаляем все записи кэша для указанной папки
        keys_to_delete = [k for k in RESPONSE_CACHE.keys() if f"folder={folder}" in k]
        for key in keys_to_delete:
            del RESPONSE_CACHE[key]
        return {"message": f"Удалено {len(keys_to_delete)} записей кэша для папки '{folder}'", "deleted_count": len(keys_to_delete)}
    else:
        # Удаляем весь кэш
        count = len(RESPONSE_CACHE)
        RESPONSE_CACHE.clear()
        return {"message": f"Весь кэш очищен ({count} записей)", "deleted_count": count}



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
            # Фильтруем пустые сегменты и нормализуем путь
            filtered_segments = [str(seg) for seg in path_segments if seg]
            if filtered_segments:
                path = "/" + "/".join(filtered_segments)
            else:
                path = "/"
            # Нормализуем путь (убираем завершающий слэш, если он есть)
            path = path.rstrip("/") or "/"
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



async def match_condition(req: Request, m: Mock, full_path: str, body_bytes: Optional[bytes] = None) -> bool:
    """Проверяет, подходит ли запрос к условиям мока.


    full_path — это путь запроса с query‑строкой, уже нормализованный
    (например, без префикса папки).
    """
    # Проверка метода
    if req.method.upper() != m.method.upper():
        logger.debug(f"Method mismatch for mock {m.id}: {req.method.upper()} != {m.method.upper()}")
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
    
    logger.debug(f"Path comparison for mock {m.id}: mock_path='{m.path}' -> base='{mock_path_base}' query='{mock_query}', request_path='{full_path}' -> base='{request_path_base}' query='{request_query}'")
    
    # Сравниваем базовые пути
    if mock_path_base != request_path_base:
        logger.info(f"Path mismatch for mock {m.id}: '{mock_path_base}' != '{request_path_base}'")
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
    # Если в моке указаны заголовки (непустой словарь), проверяем их
    # Пустой словарь {} означает, что заголовки не важны для этого мока
    if m.headers and isinstance(m.headers, dict) and len(m.headers) > 0:
        # Системные заголовки, которые не должны использоваться для сопоставления
        # (они могут различаться между клиентами и не должны блокировать моки)
        SYSTEM_HEADERS_TO_IGNORE = {
            "accept-encoding",  # Может быть gzip, br, deflate и т.д.
            "connection",       # Может быть keep-alive, close и т.д.
            "user-agent",       # Различается между клиентами
            "host",             # Всегда разный для разных серверов
            "content-length",   # Вычисляется автоматически
            "transfer-encoding", # Может различаться
            "upgrade",          # Может быть в запросах
            "via",             # Прокси-заголовки
            "x-forwarded-for", # Прокси-заголовки
            "x-forwarded-proto", # Прокси-заголовки
            "x-real-ip",       # Прокси-заголовки
        }
        
        logger.debug(f"Checking headers for mock {m.id}: required_headers={m.headers}")
        for hk, hv in m.headers.items():
            # Пропускаем системные заголовки - они не должны блокировать сопоставление
            if hk.lower() in SYSTEM_HEADERS_TO_IGNORE:
                logger.debug(f"Skipping system header '{hk}' for mock {m.id}")
                continue
            
            # Поддержка нового формата с необязательными заголовками
            # Формат 1 (старый, для обратной совместимости): {"header_name": "value"}
            # Формат 2 (новый): {"header_name": {"value": "expected_value", "optional": false}}
            # Формат 3 (необязательный): {"header_name": {"value": null, "optional": true}}
            is_optional = False
            expected_value = None
            
            if isinstance(hv, dict):
                # Новый формат с объектом
                is_optional = hv.get("optional", False)
                expected_value = hv.get("value")
            else:
                # Старый формат - просто строка, обязательный заголовок
                expected_value = hv
                is_optional = False
            
            # Заголовки в HTTP нечувствительны к регистру ключей
            req_header_value = None
            for req_key, req_val in req.headers.items():
                if req_key.lower() == hk.lower():
                    req_header_value = req_val
                    break
            
            if req_header_value is None:
                if is_optional:
                    # Необязательный заголовок отсутствует - это нормально
                    logger.debug(f"Optional header '{hk}' missing for mock {m.id}, skipping")
                    continue
                else:
                    # Обязательный заголовок отсутствует
                    logger.info(f"Header missing for mock {m.id}: header '{hk}' not found in request. Request headers: {dict(req.headers)}")
                return False
            
            # Если заголовок необязательный, проверяем только наличие (значение не важно)
            if is_optional:
                logger.debug(f"Optional header '{hk}' present for mock {m.id}, value check skipped")
                continue
            
            # Для обязательных заголовков проверяем точное совпадение значения
            if expected_value is not None and req_header_value != expected_value:
                logger.info(f"Header mismatch for mock {m.id}: header '{hk}' expected='{expected_value}' got='{req_header_value}'")
                return False
        logger.debug(f"All headers matched for mock {m.id}")
    else:
        logger.debug(f"No headers to check for mock {m.id} (headers={m.headers})")
    
    # Проверка содержимого тела
    if m.body_contains:
        try:
            # Для GET/HEAD/OPTIONS запросов тело обычно пустое
            # Если в моке указано body_contains для GET запроса, это условие игнорируется
            # (так как GET запросы по стандарту не должны иметь тела)
            # Используем переданное тело запроса, если оно есть, иначе читаем заново
            if body_bytes is None:
                body_bytes = await req.body()
            
            if req.method.upper() in ("GET", "HEAD", "OPTIONS"):
                # Для GET/HEAD/OPTIONS проверяем тело только если оно действительно есть в запросе
                # Если тело пустое, условие body_contains игнорируется (мок может сработать)
                if body_bytes:
                    # Если тело есть (нестандартно для GET, но возможно), проверяем его
                    body = body_bytes.decode("utf-8")
                    # Нормализуем оба значения для сравнения
                    normalized_body = _normalize_json_string(body)
                    normalized_contains = _normalize_json_string(m.body_contains)
                    if normalized_contains not in normalized_body:
                        logger.info(f"Body mismatch for mock {m.id} (GET with body): body_contains='{normalized_contains[:100]}...' not in request body. Request body: '{body[:200]}...'")
                        return False
                else:
                    # Если тело пустое, игнорируем условие body_contains для GET запросов
                    logger.debug(f"Ignoring body_contains for mock {m.id} (GET request with empty body)")
            else:
                # Для POST, PUT, PATCH, DELETE проверяем тело
                if not body_bytes:
                    logger.info(f"Body required for mock {m.id} but request body is empty")
                    return False
                body = body_bytes.decode("utf-8")
                # Нормализуем оба значения для сравнения
                normalized_body = _normalize_json_string(body)
                normalized_contains = _normalize_json_string(m.body_contains)
                if normalized_contains not in normalized_body:
                    logger.info(f"Body mismatch for mock {m.id}: body_contains='{normalized_contains[:100]}...' not in request body. Request body: '{body[:200]}...', normalized_contains='{normalized_contains[:100]}...', normalized_body='{normalized_body[:200]}...'")
                    return False
        except Exception as e:
            logger.debug(f"Error checking body for mock {m.id}: {e}")
            return False
    
    return True



def _cache_key_for_mock(m: Mock, method: str, full_inner: str) -> str:
    """Формирует ключ кэша для мока и запроса."""
    return f"{m.id}:{method.upper()}:{full_inner}"


def _get_cache_ttl(m: Mock) -> int:
    """Извлекает TTL кэша (секунды) из настроек мока."""
    if m.cache_enabled and m.cache_ttl_seconds and m.cache_ttl_seconds > 0:
        logger.debug(f"Cache TTL from mock settings: {m.cache_ttl_seconds} seconds")
        return int(m.cache_ttl_seconds)
    logger.debug(f"Cache disabled or no TTL set, using default: {DEFAULT_CACHE_TTL_SECONDS}")
    return DEFAULT_CACHE_TTL_SECONDS


def _get_delay_ms(m: Mock) -> int:
    """Возвращает задержку в мс — фиксированную или случайную из диапазона."""
    base = m.delay_ms or 0
    # Если задан диапазон, используем случайное значение из диапазона
    if m.delay_range_min_ms is not None and m.delay_range_max_ms is not None:
        try:
            mn = max(0, int(m.delay_range_min_ms))
            mx = max(mn, int(m.delay_range_max_ms))
            if mn != mx:
                return random.randint(mn, mx)
            return mn
        except Exception:
            return base
    return base


def _maybe_simulate_error(m: Mock, folder_name: str) -> Optional[Dict[str, Any]]:
    """Пытается сэмулировать ошибку согласно настройкам мока."""
    if not m.error_simulation_enabled:
        return None
    # Вероятность может быть числом (float) или строкой
    prob = m.error_simulation_probability
    if isinstance(prob, str):
        try:
            prob = float(prob)
        except (ValueError, TypeError):
            return None
    elif not isinstance(prob, (int, float)):
        return None
    
    prob = float(prob)
    if prob <= 0 or prob > 1:
        return None
    
    if random.random() > prob:
        return None
    
    ERRORS_SIMULATED.labels(folder=folder_name).inc()
    status_code = m.error_simulation_status_code or 500
    delay_ms = m.error_simulation_delay_ms or 0
    err_body = m.error_simulation_body or {"error": "simulated error"}
    return {
        "status_code": status_code,
        "delay_ms": delay_ms,
        "body": err_body,
    }


def _clean_response_body(body: Any) -> Any:
    """Очищает тело ответа от служебных полей."""
    if isinstance(body, dict):
        body = body.copy()
        body.pop("__cache_ttl__", None)
        body.pop("__delay_range_ms__", None)
        body.pop("__error_simulation__", None)
    return body


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

    # Создаём безопасный словарь, который возвращает пустую строку для отсутствующих ключей
    class SafeDict(dict):
        def __missing__(self, key):
            return ""

    safe_context = SafeDict(context)

    def _fmt(s: str) -> str:
        try:
            return s.format_map(safe_context)
        except Exception:
            # Если форматирование не удалось, возвращаем исходную строку
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
    
    # Читаем тело запроса один раз для всех проверок
    body_bytes = await request.body()
    
    # Ограничение размера тела
    if MAX_REQUEST_BODY_BYTES > 0:
        if len(body_bytes) > MAX_REQUEST_BODY_BYTES:
            REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="too_large").inc()
            raise HTTPException(status_code=413, detail="Request entity too large")

    # Определяем папку по URL префиксу
    # Поддерживаем пути вида /parent/sub/... для подпапок
    path = request.url.path  # например "/nikita/cnsgate-t/api/login" или "/auth/api/login"
    segments = [seg for seg in path.split("/") if seg]

    inner_path = path
    folder_name = "default"
    folder = db.query(Folder).filter_by(name="default").first()

    if segments:
        # Проверяем первый сегмент - это может быть корневая папка или начало пути к подпапке
        first_segment = segments[0]
        root_folder = db.query(Folder).filter_by(name=first_segment, parent_folder=None).first()
        
        if root_folder:
            # Нашли корневую папку
            if len(segments) > 1:
                # Проверяем, может быть второй сегмент - это подпапка?
                second_segment = segments[1]
                subfolder = db.query(Folder).filter_by(name=second_segment, parent_folder=first_segment).first()
                
                if subfolder:
                    # Нашли подпапку: /parent/sub/...
                    folder_name = second_segment
                    folder = subfolder
                    inner_path = "/" + "/".join(segments[2:]) if len(segments) > 2 else "/"
                else:
                    # Второй сегмент не подпапка, используем корневую папку
                    folder_name = first_segment
                    folder = root_folder
                    inner_path = "/" + "/".join(segments[1:]) if len(segments) > 1 else "/"
            else:
                # Только один сегмент - это корневая папка
                folder_name = first_segment
                folder = root_folder
                inner_path = "/"
        else:
            # Первый сегмент не корневая папка - используем default
            folder = db.query(Folder).filter_by(name="default").first()
    else:
        # Пустой путь - используем default
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
    mocks = db.query(Mock).filter_by(active=True, folder_name=folder_name).all()
    logger.info(f"Searching for mock: folder={folder_name}, path={full_inner}, method={request.method}, found {len(mocks)} active mocks")
    
    # Логируем все заголовки запроса для отладки
    request_headers_dict = {k: v for k, v in request.headers.items()}
    logger.debug(f"Request headers: {request_headers_dict}")
    
    for m in mocks:
        matched = await match_condition(request, m, full_inner, body_bytes)
        logger.info(f"Mock {m.id} ({m.method} {m.path}): matched={matched}, mock_headers={m.headers}, mock_body_contains={'yes' if m.body_contains else 'no'}, request_path={full_inner}")
        if matched:
            body = _clean_response_body(m.response_body)

            # Попытка отдать из кэша
            ttl = _get_cache_ttl(m)
            cache_key = None
            if ttl > 0:
                cache_key = _cache_key_for_mock(m, request.method, full_inner)
                logger.info(f"Cache check for mock {m.id}: ttl={ttl}, cache_key={cache_key}")
                cached = RESPONSE_CACHE.get(cache_key)
                if cached:
                    expires_at, cached_payload = cached
                    current_time = time.time()
                    if expires_at > current_time:
                        logger.info(f"Cache HIT for mock {m.id}: expires_at={expires_at}, current_time={current_time}, ttl_remaining={expires_at - current_time:.2f}s")
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
                    else:
                        logger.info(f"Cache EXPIRED for mock {m.id}: expires_at={expires_at}, current_time={current_time}")
                        # Удаляем истекший кеш
                        RESPONSE_CACHE.pop(cache_key, None)
                else:
                    logger.info(f"Cache MISS for mock {m.id}: key not found in cache")

            # Задержка ответа при необходимости
            # (фиксированная или диапазон)
            delay_ms = _get_delay_ms(m)

            # Имитация ошибок
            err_cfg = _maybe_simulate_error(m, folder_name)
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
            # Игнорируем системные заголовки, которые вычисляются автоматически
            system_headers = {
                "content-length", "connection", "date", "server", 
                "transfer-encoding", "content-encoding"
            }
            for k, v in (m.response_headers or {}).items():
                if k.lower() in system_headers:
                    continue  # Пропускаем системные заголовки
                if isinstance(v, str):
                    v = _apply_templates(v, request, full_inner)
                resp.headers[k] = v

            # Сохраняем в кэш, если включено
            if cache_key and ttl > 0:
                expires_at = time.time() + ttl
                RESPONSE_CACHE[cache_key] = (
                    expires_at,
                    {
                        "status_code": resp.status_code,
                        "content": resp.body,
                        "media_type": resp.media_type,
                        "headers": dict(resp.headers),
                    },
                )
                logger.info(f"Cache SAVED for mock {m.id}: cache_key={cache_key}, ttl={ttl}s, expires_at={expires_at}")
            elif ttl == 0:
                logger.debug(f"Cache DISABLED for mock {m.id}: ttl=0")
            elif not cache_key:
                logger.debug(f"Cache SKIPPED for mock {m.id}: cache_key not generated")

            response_time = time.time() - start_time
            status_code = resp.status_code

            MOCK_HITS.labels(folder=folder_name).inc()
            RESPONSE_TIME.labels(folder=folder_name).observe(response_time)
            REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="mock_hit").inc()
            
            # Детальные метрики для успешных моков
            REQUEST_DETAILED.labels(
                method=request.method,
                path=full_inner.split('?')[0],
                folder=folder_name,
                outcome="mock_hit",
                status_code=str(status_code)
            ).inc()
            RESPONSE_TIME_DETAILED.labels(
                method=request.method,
                path=full_inner.split('?')[0],
                folder=folder_name,
                outcome="mock_hit"
            ).observe(response_time)
            
            # Логируем вызов в БД
            try:
                request_log = RequestLog(
                    timestamp=datetime.utcnow().isoformat() + "Z",
                    folder_name=folder_name,
                    method=request.method,
                    path=full_inner.split('?')[0],
                    is_proxied=False,
                    response_time_ms=int(response_time * 1000),
                    status_code=status_code,
                    cache_ttl_seconds=ttl if ttl > 0 else None,
                    cache_key=cache_key
                )
                db.add(request_log)
                db.commit()
            except Exception as e:
                logger.error(f"Error logging request: {e}", exc_info=True)
                db.rollback()
            
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

        response_time = time.time() - start_time
        status_code = proxied.status_code

        PROXY_REQUESTS.labels(folder=folder_name).inc()
        RESPONSE_TIME.labels(folder=folder_name).observe(response_time)
        REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="proxied").inc()
        
        # Детальные метрики для проксированных запросов
        REQUEST_DETAILED.labels(
            method=request.method,
            path=full_inner.split('?')[0],
            folder=folder_name,
            outcome="proxied",
            status_code=str(status_code)
        ).inc()
        RESPONSE_TIME_DETAILED.labels(
            method=request.method,
            path=full_inner.split('?')[0],
            folder=folder_name,
            outcome="proxied"
        ).observe(response_time)
        PROXY_RESPONSE_TIME.labels(
            method=request.method,
            path=full_inner.split('?')[0],
            folder=folder_name
        ).observe(response_time)
        
        # Логируем проксированный вызов в БД
        try:
            request_log = RequestLog(
                timestamp=datetime.utcnow().isoformat() + "Z",
                folder_name=folder_name,
                method=request.method,
                path=full_inner.split('?')[0],
                is_proxied=True,
                response_time_ms=int(response_time * 1000),
                status_code=status_code,
                cache_ttl_seconds=None,
                cache_key=None
            )
            db.add(request_log)
            db.commit()
        except Exception as e:
            logger.error(f"Error logging proxied request: {e}", exc_info=True)
            db.rollback()
        
        return resp

    response_time = time.time() - start_time
    
    RESPONSE_TIME.labels(folder=folder_name).observe(response_time)
    REQUESTS_TOTAL.labels(method=request.method, path=request.url.path, folder=folder_name, outcome="not_found").inc()
    
    # Детальные метрики для не найденных запросов
    REQUEST_DETAILED.labels(
        method=request.method,
        path=full_inner.split('?')[0],
        folder=folder_name,
        outcome="not_found",
        status_code="404"
    ).inc()
    RESPONSE_TIME_DETAILED.labels(
        method=request.method,
        path=full_inner.split('?')[0],
        folder=folder_name,
        outcome="not_found"
    ).observe(response_time)
    
    # Логируем не найденный запрос в БД
    try:
        request_log = RequestLog(
            timestamp=datetime.utcnow().isoformat() + "Z",
            folder_name=folder_name,
            method=request.method,
            path=full_inner.split('?')[0],
            is_proxied=False,
            response_time_ms=int(response_time * 1000),
            status_code=404,
            cache_ttl_seconds=None,
            cache_key=None
        )
        db.add(request_log)
        db.commit()
    except Exception as e:
        logger.error(f"Error logging not found request: {e}", exc_info=True)
        db.rollback()
    
    raise HTTPException(404, "No matching mock found")
