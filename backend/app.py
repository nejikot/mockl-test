import json
from fastapi import FastAPI, HTTPException, Request, Query, Body
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Optional, List
from pathlib import Path

app = FastAPI()

DATA_FILE = Path(__file__).parent / "mocks_data.json"
FOLDER_FILE = Path(__file__).parent / "folders_data.json"

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

mocks: Dict[str, MockEntry] = {}
folders: List[str] = []

def load_mocks():
    global mocks
    if DATA_FILE.exists():
        with open(DATA_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
            mocks = {m["id"]: MockEntry(**m) for m in data}
    else:
        mocks = {}

def save_mocks():
    with open(DATA_FILE, "w", encoding="utf-8") as f:
        json.dump([m.dict() for m in mocks.values()], f, ensure_ascii=False, indent=2)

def load_folders():
    global folders
    if FOLDER_FILE.exists():
        with open(FOLDER_FILE, "r", encoding="utf-8") as f:
            folders = json.load(f)
    else:
        folders = ["default"] # always have at least default

def save_folders():
    with open(FOLDER_FILE, "w", encoding="utf-8") as f:
        json.dump(folders, f, ensure_ascii=False, indent=2)

@app.on_event("startup")
def startup_event():
    load_mocks()
    load_folders()

@app.post("/api/folders")
def create_folder(name: str = Body(..., embed=True)):
    global folders
    name = name.strip()
    if not name or name in folders:
        raise HTTPException(400, "Некорректное или уже существующее имя папки")
    folders.append(name)
    save_folders()
    return {"message": "Папка добавлена", "folders": folders}

@app.delete("/api/folders")
def delete_folder(name: str = Query(...)):
    global folders, mocks
    if name == "default":
        raise HTTPException(400, "Нельзя удалить стандартную папку")
    if name not in folders:
        raise HTTPException(404, "Папка не найдена")
    # Удаляем все моки из этой папки:
    mocks = {k: v for k, v in mocks.items() if v.folder != name}
    folders = [f for f in folders if f != name]
    save_folders()
    save_mocks()
    return {"message": f"Папка '{name}' и все её моки удалены", "folders": folders}

@app.get("/api/mocks/folders")
def list_folders():
    # Совмещаем явно созданные папки и те, что были только с моками (устаревшее)
    used_folders = list(set([m.folder for m in mocks.values()] + folders))
    used_folders = sorted(set(used_folders))
    return used_folders

@app.post("/api/mocks")
def create_or_update_mock(entry: MockEntry):
    global folders
    if entry.folder not in folders:
        folders.append(entry.folder)
        save_folders()
    mocks[entry.id] = entry
    save_mocks()
    return {"message": "mock saved", "mock": entry}

@app.get("/api/mocks")
def list_mocks(folder: Optional[str] = None):
    if folder:
        return [m for m in mocks.values() if m.folder == folder]
    return list(mocks.values())

@app.delete("/api/mocks")
def delete_mock(id_: str = Query(...)):
    if id_ in mocks:
        del mocks[id_]
        save_mocks()
        return {"message": "mock deleted"}
    else:
        raise HTTPException(404, f"Mock with id {id_} not found")

async def match_condition(req: Request, condition: MockRequestCondition):
    qp = str(req.query_params)
    full_path = req.url.path + (f"?{req.url.query}" if qp else "")
    if req.method.upper() != condition.method.upper():
        return False
    if full_path != condition.path:
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

@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def mock_handler(request: Request, full_path: str):
    for mock in mocks.values():
        if await match_condition(request, mock.request_condition):
            resp = JSONResponse(content=mock.response_config.body, status_code=mock.response_config.status_code)
            if mock.response_config.headers:
                for k, v in mock.response_config.headers.items():
                    resp.headers[k] = v
            return resp
    raise HTTPException(404, "No matching mock found")
