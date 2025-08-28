import os
import json
from uuid import uuid4

from fastapi import FastAPI, HTTPException, Request, Query, Body, Path, Depends, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Optional, List
from sqlalchemy import (
    create_engine, Column, String, Integer, Boolean, JSON as SAJSON, ForeignKey
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
    sequence_next_id = Column(String, nullable=True)
    active = Column(Boolean, default=True)

    folder_obj = relationship("Folder", back_populates="mocks")


# Создаём таблицы
Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


class MockRequestCondition(BaseModel):
    method: str
    path: str
    headers: Optional[Dict[str, str]] = None
    body_contains: Optional[str] = None


class MockResponseConfig(BaseModel):
    status_code: int
    headers: Optional[Dict[str, str]] = None
    body: Dict


class MockEntry(BaseModel):
    id: str
    folder: Optional[str] = "default"
    request_condition: MockRequestCondition
    response_config: MockResponseConfig
    sequence_next_id: Optional[str] = None
    active: Optional[bool] = True


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@app.on_event("startup")
def ensure_default_folder():
    db = SessionLocal()
    if not db.query(Folder).filter_by(name="default").first():
        db.add(Folder(name="default"))
        db.commit()
    db.close()


@app.post("/api/folders")
def create_folder(name: str = Body(..., embed=True), db: Session = Depends(get_db)):
    name = name.strip()
    if not name or db.query(Folder).filter_by(name=name).first():
        raise HTTPException(400, "Некорректное или уже существующее имя папки")
    db.add(Folder(name=name))
    db.commit()
    return {"message": "Папка добавлена"}


@app.delete("/api/folders")
def delete_folder(name: str = Query(...), db: Session = Depends(get_db)):
    if name == "default":
        raise HTTPException(400, "Нельзя удалить стандартную папку")
    folder = db.query(Folder).filter_by(name=name).first()
    if not folder:
        raise HTTPException(404, "Папка не найдена")
    db.delete(folder)
    db.commit()
    return {"message": f"Папка '{name}' и все её моки удалены"}


@app.get("/api/mocks/folders", response_model=List[str])
def list_folders(db: Session = Depends(get_db)):
    names = [f.name for f in db.query(Folder).all()]
    if "default" in names:
        names.remove("default")
        names.insert(0, "default")
    return names


@app.post("/api/mocks")
def create_or_update_mock(entry: MockEntry, db: Session = Depends(get_db)):
    folder = db.query(Folder).filter_by(name=entry.folder).first()
    if not folder:
        folder = Folder(name=entry.folder)
        db.add(folder)
    mock = db.query(Mock).filter_by(id=entry.id).first()
    if not mock:
        mock = Mock(id=entry.id)
        db.add(mock)
    mock.folder_name = entry.folder
    mock.method = entry.request_condition.method
    mock.path = entry.request_condition.path
    mock.headers = entry.request_condition.headers or {}
    mock.body_contains = entry.request_condition.body_contains
    mock.status_code = entry.response_config.status_code
    mock.response_headers = entry.response_config.headers or {}
    mock.response_body = entry.response_config.body
    mock.sequence_next_id = entry.sequence_next_id
    mock.active = entry.active if entry.active is not None else True
    db.commit()
    return {"message": "mock saved", "mock": entry}


@app.get("/api/mocks", response_model=List[MockEntry])
def list_mocks(folder: Optional[str] = None, db: Session = Depends(get_db)):
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
                    headers=m.headers,
                    body_contains=m.body_contains,
                ),
                response_config=MockResponseConfig(
                    status_code=m.status_code,
                    headers=m.response_headers,
                    body=m.response_body,
                ),
                sequence_next_id=m.sequence_next_id,
                active=m.active,
            )
        )
    return results


@app.delete("/api/mocks")
def delete_mock(id_: str = Query(...), db: Session = Depends(get_db)):
    mock = db.query(Mock).filter_by(id=id_).first()
    if not mock:
        raise HTTPException(404, f"Mock with id {id_} not found")
    db.delete(mock)
    db.commit()
    return {"message": "mock deleted"}


@app.patch("/api/mocks/{mock_id}/toggle")
def toggle_mock(
    mock_id: str = Path(...),
    active: bool = Body(..., embed=True),
    db: Session = Depends(get_db)
):
    mock = db.query(Mock).filter_by(id=mock_id).first()
    if not mock:
        raise HTTPException(404, "Mock not found")
    mock.active = active
    db.commit()
    return {"id": mock_id, "active": active}


@app.patch("/api/mocks/deactivate-all")
def deactivate_all(folder: str = Query(...), db: Session = Depends(get_db)):
    mocks_in_folder = db.query(Mock).filter_by(folder_name=folder, active=True).all()
    if not mocks_in_folder:
        raise HTTPException(404, "No matching mock found")
    for m in mocks_in_folder:
        m.active = False
    db.commit()
    return {"message": f"All mocks in folder '{folder}' deactivated"}


async def match_condition(req: Request, m: Mock) -> bool:
    if req.method.upper() != m.method.upper():
        return False
    path = req.url.path
    full = f"{path}{f'?{req.url.query}' if req.url.query else ''}"
    if full != m.path:
        return False
    if m.headers:
        for hk, hv in m.headers.items():
            if req.headers.get(hk) != hv:
                return False
    if m.body_contains:
        body = (await req.body()).decode("utf-8")
        if m.body_contains not in body:
            return False
    return True


@app.api_route("/{full_path:path}", methods=["GET","POST","PUT","DELETE","PATCH"])
async def mock_handler(request: Request, full_path: str, db: Session = Depends(get_db)):
    for m in db.query(Mock).filter_by(active=True).all():
        if await match_condition(request, m):
            resp = JSONResponse(
                content=m.response_body,
                status_code=m.status_code
            )
            for k, v in (m.response_headers or {}).items():
                resp.headers[k] = v
            if m.sequence_next_id:
                resp.headers["X-Next-Mock-Id"] = m.sequence_next_id
            return resp
    raise HTTPException(404, "No matching mock found")


@app.post("/api/mocks/import")
async def import_postman_collection(
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """
    Импорт из Postman Collection v2.1 JSON.
    Создаёт папку с именем collection.info.name и сохраняет все запросы как моки в ней.
    """
    content = await file.read()
    try:
        coll = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid JSON file")

    folder_name = coll.get("info", {}).get("name", "postman")
    folder_name = folder_name.strip() or "postman"
    if not db.query(Folder).filter_by(name=folder_name).first():
        db.add(Folder(name=folder_name))
        db.commit()

    items = coll.get("item", [])
    imported = []

    for it in items:
        req = it.get("request", {})
        res_list = it.get("response", [])
        if not req or not res_list:
            continue

        res = res_list[0]
        url = req.get("url", {})
        raw = url.get("raw") if isinstance(url, dict) else (url if isinstance(url, str) else "")
        path = raw.split("://")[-1]
        path = "/" + path.split("/", 1)[1] if "/" in path else "/"

        mock_id = str(uuid4())

        entry = MockEntry(
            id=mock_id,
            folder=folder_name,
            request_condition=MockRequestCondition(
                method=req.get("method", "GET"),
                path=path,
                headers={h["key"]: h.get("value", "") for h in req.get("header", [])}
            ),
            response_config=MockResponseConfig(
                status_code=res.get("status", 200),
                headers={h["key"]: h.get("value", "") for h in res.get("header", [])},
                body=(json.loads(res.get("body", "{}")) if isinstance(res.get("body"), str) else res.get("body", {}))
            ),
            sequence_next_id=None,
            active=True
        )

        mock = Mock(id=entry.id)
        db.add(mock)
        mock.folder_name = entry.folder
        mock.method = entry.request_condition.method
        mock.path = entry.request_condition.path
        mock.headers = entry.request_condition.headers or {}
        mock.body_contains = entry.request_condition.body_contains
        mock.status_code = entry.response_config.status_code
        mock.response_headers = entry.response_config.headers or {}
        mock.response_body = entry.response_config.body
        mock.sequence_next_id = entry.sequence_next_id
        mock.active = entry.active

        imported.append(entry.id)

    db.commit()
    return {
        "message": f"Imported {len(imported)} mocks into folder '{folder_name}'",
        "imported_ids": imported
    }
