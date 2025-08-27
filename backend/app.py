import json
from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict, Optional
from pathlib import Path

app = FastAPI()

DATA_FILE = Path(__file__).parent / "mocks_data.json"

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Или адреса ваших фронтендов
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MockRequestCondition(BaseModel):
    method: str
    path: str  # полный путь + query string
    headers: Optional[Dict[str, str]] = None
    body_contains: Optional[str] = None  # часть тела запроса для проверки, если нужно

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

@app.on_event("startup")
def startup_event():
    load_mocks()

@app.post("/api/mocks")
def create_or_update_mock(entry: MockEntry):
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
    # Проверяем метод и путь (с query)
    qp = str(req.query_params)
    full_path = req.url.path + (f"?{req.url.query}" if qp else "")
    if req.method.upper() != condition.method.upper():
        return False
    if full_path != condition.path:
        return False
    # Проверяем заголовки (если заданы)
    if condition.headers:
        for hk, hv in condition.headers.items():
            if req.headers.get(hk) != hv:
                return False
    # Проверяем тело (если задано)
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
