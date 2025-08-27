from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Dict

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class MockResponse(BaseModel):
    path: str         # Сохраняем ПОЛНЫЙ путь + query string!
    method: str
    status_code: int
    response: dict

mocks: Dict[str, MockResponse] = {}

def key(method: str, path: str) -> str:
    return f"{method.upper()}:{path}"

@app.post("/api/mocks")
async def create_or_update_mock(mock: MockResponse):
    k = key(mock.method, mock.path)
    mocks[k] = mock
    return {"message": "mock saved", "mock": mock}

@app.get("/api/mocks")
async def list_mocks():
    # Для UI — покажем все сохранённые моки
    return list(mocks.values())

@app.delete("/api/mocks")
async def delete_mock(path: str = Query(...), method: str = Query(...)):
    k = key(method, path)
    if k in mocks:
        del mocks[k]
        return {"message": "mock deleted"}
    else:
        raise HTTPException(404, "mock not found")

@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def mock_handler(request: Request, full_path: str):
    method = request.method.upper()
    qp = str(request.query_params)
    # Собираем полный path+query для поиска мока:
    if qp and qp != "{}":
        full_path_with_query = f"{full_path}?{request.url.query}"
    else:
        full_path_with_query = full_path
    k = key(method, full_path_with_query)
    if k not in mocks:
        # Fallback: если не нашли с query, попробуем без query
        k_simple = key(method, full_path)
        if k_simple in mocks:
            return JSONResponse(status_code=mocks[k_simple].status_code, content=mocks[k_simple].response)
        raise HTTPException(404, f"mock for {method} {full_path_with_query} not found")
    mock = mocks[k]
    return JSONResponse(status_code=mock.status_code, content=mock.response)
