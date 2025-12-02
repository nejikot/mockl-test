import os
import json
import asyncio
import base64
from uuid import uuid4
from urllib.parse import urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request, Query, Body, Path, Depends, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field
from typing import Dict, Optional, List, Any
from sqlalchemy import (
    create_engine, Column, String, Integer, Boolean, JSON as SAJSON, ForeignKey, text
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship


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

        # ШАГ 1: Сначала обновляем саму папку
        folder.name = new
        db.flush()  # Записываем изменение в папке, но не коммитим
        
        # ШАГ 2: Затем обновляем все моки в этой папке
        db.query(Mock).filter_by(folder_name=old).update(
            {"folder_name": new},
            synchronize_session=False
        )
        
        # ШАГ 3: Коммитим всё разом
        db.commit()
        return {"message": "Папка переименована", "old": old, "new": new}
    
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Ошибка при переименовании папки: {str(e)}")


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
        "- Если `id` существует — запись будет перезаписана новыми значениями."
    ),
)
def create_or_update_mock(
    entry: MockEntry = Body(
        ...,
        description="Полное описание мока и условий его срабатывания",
    ),
    db: Session = Depends(get_db),
):
    # Если id не передан — создаём новый мок с внутренним UUID
    if not entry.id:
        entry.id = str(uuid4())

    folder = db.query(Folder).filter_by(name=entry.folder).first()
    if not folder:
        folder = Folder(name=entry.folder)
        db.add(folder)
        db.flush()

    # Ищем существующий мок или создаём новый
    mock = db.query(Mock).filter_by(id=entry.id).first()
    if not mock:
        mock = Mock(id=entry.id)
        db.add(mock)

    mock.folder_name = entry.folder
    mock.method = entry.request_condition.method.upper()
    mock.path = entry.request_condition.path
    mock.headers = entry.request_condition.headers or {}
    mock.body_contains = entry.request_condition.body_contains
    mock.status_code = entry.response_config.status_code
    mock.response_headers = entry.response_config.headers or {}
    mock.response_body = entry.response_config.body
    mock.active = entry.active if entry.active is not None else True
    mock.delay_ms = entry.delay_ms or 0
    
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

        for it in items:
            req = it.get("request", {})
            res_list = it.get("response", [])
            if not req or not res_list:
                continue

            res = res_list[0]
            url = req.get("url", {})
            
            # Улучшенная обработка URL
            if isinstance(url, dict):
                raw = url.get("raw", "")
                path_segments = url.get("path", [])
                if path_segments:
                    path = "/" + "/".join(str(segment) for segment in path_segments)
                else:
                    # Если path пустой, извлекаем из raw
                    if raw:
                        # Убираем протокол и хост, оставляем только путь
                        if "://" in raw:
                            raw = raw.split("://", 1)[1]
                        if "/" in raw:
                            path = "/" + raw.split("/", 1)[1]
                        else:
                            path = "/"
                    else:
                        path = "/"
            elif isinstance(url, str):
                raw = url
                if "://" in raw:
                    raw = raw.split("://", 1)[1]
                if "/" in raw:
                    path = "/" + raw.split("/", 1)[1]
                else:
                    path = "/"
            else:
                path = "/"

            # Обработка заголовков запроса
            request_headers = {}
            for h in req.get("header", []):
                if isinstance(h, dict) and "key" in h:
                    request_headers[h["key"]] = h.get("value", "")

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
                request_condition=MockRequestCondition(
                    method=req.get("method", "GET"),
                    path=path,
                    headers=request_headers if request_headers else None
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
            mock.method = entry.request_condition.method.upper()
            mock.path = entry.request_condition.path
            mock.headers = entry.request_condition.headers or {}
            mock.body_contains = entry.request_condition.body_contains
            mock.status_code = entry.response_config.status_code
            mock.response_headers = entry.response_config.headers or {}
            mock.response_body = entry.response_config.body
            mock.active = entry.active

            imported.append(mock.id)

        db.commit()
        return JSONResponse({
            "message": f"Imported {len(imported)} mocks into folder '{folder_name}'",
            "imported_ids": imported
        }, status_code=200)
        
    except Exception as e:
        return JSONResponse({
            "detail": f"Error processing file: {str(e)}"
        }, status_code=500)


def extract_path_from_url(url) -> str:
    """Извлекает путь из URL, обрабатывая различные форматы Postman."""
    if isinstance(url, dict):
        # Предпочитаем field path[] если он есть
        path_segments = url.get("path", [])
        if path_segments:
            return "/" + "/".join(str(segment) for segment in path_segments)
        
        # Если есть query параметры, добавляем их
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
        
        # Пробуем raw URL
        raw = url.get("raw", "")
        if raw:
            return extract_path_from_raw_url(raw) + query_str
        
        return "/" + query_str if query_str else "/"
    
    elif isinstance(url, str):
        return extract_path_from_raw_url(url)
    
    return "/"


def extract_path_from_raw_url(raw: str) -> str:
    """Извлекает путь из raw URL строки."""
    if not raw:
        return "/"
    
    try:
        parsed = urlparse(raw)
        path = parsed.path or "/"
        return path
    except Exception:
        # Fallback: простой парсинг
        if "://" in raw:
            raw = raw.split("://", 1)[1]
        
        if "/" in raw:
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
    
    # Проверка пути (с query параметрами)
    if full_path != m.path:
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


# Catch-all маршрут для обработки моков
@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"])
async def mock_handler(request: Request, full_path: str, db: Session = Depends(get_db)):
    """Обработчик всех запросов, не совпадающих с API маршрутами."""
    
    # Исключаем API пути из обработки моков
    if full_path.startswith("api/"):
        raise HTTPException(404, "No matching mock found")
    
    # Определяем папку по URL префиксу
    path = request.url.path  # например "/auth/api/login"
    segments = [seg for seg in path.split("/") if seg]

    folder_name = "default"
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

    # Ищем подходящий мок только в выбранной папке
    for m in db.query(Mock).filter_by(active=True, folder_name=folder_name).all():
        if await match_condition(request, m, full_inner):
            # Задержка ответа при необходимости
            if m.delay_ms and m.delay_ms > 0:
                await asyncio.sleep(m.delay_ms / 1000.0)

            body = m.response_body

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
                    resp.headers["Content-Disposition"] = f'attachment; filename="{filename}"'
            else:
                resp = JSONResponse(
                    content=body,
                    status_code=m.status_code
                )

            for k, v in (m.response_headers or {}).items():
                resp.headers[k] = v
            return resp

    # Если мок не найден, пробуем прокси для папки
    if folder and getattr(folder, "proxy_enabled", False) and getattr(folder, "proxy_base_url", None):
        target_url = f'{folder.proxy_base_url.rstrip("/")}{full_inner}'
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
        # Копируем заголовки, исключая hop-by-hop
        for k, v in proxied.headers.items():
            if k.lower() not in {"content-length", "transfer-encoding", "connection"}:
                resp.headers[k] = v
        return resp
    
    raise HTTPException(404, "No matching mock found")
