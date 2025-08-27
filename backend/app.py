import os
from fastapi import FastAPI, HTTPException, Request, Query, Body, Path, Depends
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

# Создаем движок с обязательным SSL
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
    method = Column(String, nullable=False)
    path = Column(String, nullable=False)
    headers = Column(SAJSON, default={})
    body_contains = Column(String, nullable=True)
    status_code = Column(Integer, nullable=False)
    response_headers = Column(SAJSON, default={})
    response_body = Column(SAJSON, nullable=False)
    sequence_next_id = Column(String, nullable=True)
    active = Column(Boolean, default=True)
    folder_obj = relationship("Folder", back_populates="mocks")

# Создаем таблицы в БД
Base.metadata.create_all(bind=engine)

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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

@app.get("/api/mocks/folders")
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

@app.get("/api/mocks")
def list_mocks(folder: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Mock)
    if folder:
        q = q.filter_by(folder_name=folder)
    return q.all()

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

async def match_condition(req: Request, condition: MockRequestCondition):
    path = req.url.path.lstrip("/")
    full = f"{path}{f'?{req.url.query}' if req.url.query else ''}"
    if req.method.upper() != condition.method.upper():
        return False
    if full != condition.path.lstrip("/"):
        return False
    if condition.headers:
        for hk, hv in condition.headers.items():
            if req.headers.get(hk) != hv:
                return False
    if condition.body_contains:
        body = (await req.body()).decode("utf-8")
        if condition.body_contains not in body:
            return False
    return True

@app.api_route("/{full_path:path}", methods=["GET","POST","PUT","DELETE","PATCH"])
async def mock_handler(request: Request, full_path: str, db: Session = Depends(get_db)):
    for m in db.query(Mock).all():
        if m.active and await match_condition(request, m.request_condition):
            resp = JSONResponse(
                content=m.response_config.body,
                status_code=m.response_config.status_code
            )
            for k, v in m.response_config.headers.items():
                resp.headers[k] = v
            if m.sequence_next_id:
                resp.headers["X-Next-Mock-Id"] = m.sequence_next_id
            return resp
    raise HTTPException(404, "No matching mock found")
