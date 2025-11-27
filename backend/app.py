# app.py
import json
import os
from uuid import uuid4
from typing import Dict, Optional, List, Set
from fastapi import FastAPI, HTTPException, Request, Query, Body, Path, File, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from pathlib import Path as PathlibPath
import threading


# ============================================================================
# В-ПАМЯТИ ХРАНИЛИЩЕ ДАННЫХ
# ============================================================================

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


class InMemoryDataStore:
    """
    В-памяти хранилище для папок и моков с опциональным персистентным хранением в JSON
    """
    def __init__(self, persistence_file: Optional[str] = None):
        self.folders: Dict[str, Set[str]] = {}  # {folder_name: {mock_ids}}
        self.mocks: Dict[str, dict] = {}  # {mock_id: mock_data}
        self.persistence_file = persistence_file
        self.lock = threading.RLock()
        
        # Создаём стандартную папку
        self.folders["default"] = set()
        
        # Загружаем данные из файла если существует
        if self.persistence_file and PathlibPath(self.persistence_file).exists():
            self._load_from_file()
    
    def _load_from_file(self):
        """Загружает данные из JSON файла"""
        try:
            with open(self.persistence_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                self.mocks = data.get("mocks", {})
                self.folders = {k: set(v) for k, v in data.get("folders", {}).items()}
                if "default" not in self.folders:
                    self.folders["default"] = set()
                print(f"✓ Данные загружены из {self.persistence_file}")
        except Exception as e:
            print(f"⚠ Ошибка при загрузке файла: {e}")
    
    def _save_to_file(self):
        """Сохраняет данные в JSON файл"""
        if not self.persistence_file:
            return
        try:
            with self.lock:
                data = {
                    "mocks": self.mocks,
                    "folders": {k: list(v) for k, v in self.folders.items()}
                }
                os.makedirs(os.path.dirname(self.persistence_file) or ".", exist_ok=True)
                with open(self.persistence_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f, indent=2, ensure_ascii=False)
        except Exception as e:
            print(f"⚠ Ошибка при сохранении файла: {e}")
    
    # === ПАПКИ ===
    def create_folder(self, name: str) -> bool:
        """Создаёт папку. Возвращает True если успешно, False если уже существует"""
        with self.lock:
            name = name.strip()
            if not name or name in self.folders:
                return False
            self.folders[name] = set()
            self._save_to_file()
            return True
    
    def delete_folder(self, name: str) -> bool:
        """Удаляет папку и все её моки. Возвращает False если папка не найдена"""
        with self.lock:
            if name == "default":
                return False
            if name not in self.folders:
                return False
            # Удаляем все моки в этой папке
            mock_ids = self.folders[name].copy()
            for mock_id in mock_ids:
                if mock_id in self.mocks:
                    del self.mocks[mock_id]
            del self.folders[name]
            self._save_to_file()
            return True
    
    def list_folders(self) -> List[str]:
        """Возвращает список папок с 'default' в начале"""
        with self.lock:
            names = list(self.folders.keys())
            if "default" in names:
                names.remove("default")
                names.insert(0, "default")
            return names
    
    def folder_exists(self, name: str) -> bool:
        """Проверяет существование папки"""
        with self.lock:
            return name in self.folders
    
    # === МОКИ ===
    def create_or_update_mock(self, entry: MockEntry) -> None:
        """Создаёт или обновляет мок"""
        with self.lock:
            # Создаём папку если не существует
            if entry.folder not in self.folders:
                self.folders[entry.folder] = set()
            
            mock_data = {
                "id": entry.id,
                "folder": entry.folder,
                "method": entry.request_condition.method,
                "path": entry.request_condition.path,
                "headers": entry.request_condition.headers or {},
                "body_contains": entry.request_condition.body_contains,
                "status_code": entry.response_config.status_code,
                "response_headers": entry.response_config.headers or {},
                "response_body": entry.response_config.body,
                "sequence_next_id": entry.sequence_next_id,
                "active": entry.active if entry.active is not None else True
            }
            
            self.mocks[entry.id] = mock_data
            self.folders[entry.folder].add(entry.id)
            self._save_to_file()
    
    def get_mock(self, mock_id: str) -> Optional[dict]:
        """Получает мок по ID"""
        with self.lock:
            return self.mocks.get(mock_id)
    
    def list_mocks(self, folder: Optional[str] = None) -> List[MockEntry]:
        """Получает список моков, опционально отфильтрованных по папке"""
        with self.lock:
            results = []
            for mock_id, mock_data in self.mocks.items():
                if folder and mock_data["folder"] != folder:
                    continue
                results.append(self._mock_data_to_entry(mock_data))
            return results
    
    def delete_mock(self, mock_id: str) -> bool:
        """Удаляет мок. Возвращает False если не найден"""
        with self.lock:
            if mock_id not in self.mocks:
                return False
            mock_data = self.mocks[mock_id]
            folder = mock_data["folder"]
            if folder in self.folders:
                self.folders[folder].discard(mock_id)
            del self.mocks[mock_id]
            self._save_to_file()
            return True
    
    def toggle_mock(self, mock_id: str, active: bool) -> bool:
        """Переключает статус мока. Возвращает False если не найден"""
        with self.lock:
            if mock_id not in self.mocks:
                return False
            self.mocks[mock_id]["active"] = active
            self._save_to_file()
            return True
    
    def deactivate_all(self, folder: Optional[str] = None) -> int:
        """Деактивирует все моки в папке. Возвращает количество деактивированных"""
        with self.lock:
            count = 0
            for mock_id, mock_data in self.mocks.items():
                if mock_data["active"]:
                    if folder is None or mock_data["folder"] == folder:
                        mock_data["active"] = False
                        count += 1
            if count > 0:
                self._save_to_file()
            return count
    
    def get_active_mocks(self) -> List[dict]:
        """Получает все активные моки"""
        with self.lock:
            return [m for m in self.mocks.values() if m["active"]]
    
    @staticmethod
    def _mock_data_to_entry(mock_data: dict) -> MockEntry:
        """Конвертирует данные мока в MockEntry"""
        return MockEntry(
            id=mock_data["id"],
            folder=mock_data["folder"],
            request_condition=MockRequestCondition(
                method=mock_data["method"],
                path=mock_data["path"],
                headers=mock_data["headers"] or None,
                body_contains=mock_data["body_contains"]
            ),
            response_config=MockResponseConfig(
                status_code=mock_data["status_code"],
                headers=mock_data["response_headers"] or None,
                body=mock_data["response_body"]
            ),
            sequence_next_id=mock_data["sequence_next_id"],
            active=mock_data["active"]
        )


# ============================================================================
# ИНИЦИАЛИЗАЦИЯ
# ============================================================================

# Опциональное сохранение в файл (раскомментируйте если нужна персистентность)
DATA_FILE = os.getenv("DATA_FILE", "mocks_data.json")
db_store = InMemoryDataStore(persistence_file=DATA_FILE)

app = FastAPI(title="Mock Server", version="2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ============================================================================
# ЭНДПОИНТЫ - ПАПКИ
# ============================================================================

@app.post("/api/folders")
def create_folder(name: str = Body(..., embed=True)):
    """Создаёт новую папку для моков"""
    if not db_store.create_folder(name):
        raise HTTPException(400, "Некорректное или уже существующее имя папки")
    return {"message": "Папка добавлена"}


@app.delete("/api/folders")
def delete_folder(name: str = Query(...)):
    """Удаляет папку и все её моки"""
    if not db_store.delete_folder(name):
        if name == "default":
            raise HTTPException(400, "Нельзя удалить стандартную папку")
        raise HTTPException(404, "Папка не найдена")
    return {"message": f"Папка '{name}' и все её моки удалены"}


@app.get("/api/mocks/folders", response_model=List[str])
def list_folders():
    """Получает список всех папок"""
    return db_store.list_folders()


# ============================================================================
# ЭНДПОИНТЫ - МОКИ
# ============================================================================

@app.post("/api/mocks")
def create_or_update_mock(entry: MockEntry):
    """Создаёт или обновляет мок"""
    if not db_store.folder_exists(entry.folder):
        db_store.create_folder(entry.folder)
    db_store.create_or_update_mock(entry)
    return {"message": "mock saved", "mock": entry}


@app.get("/api/mocks", response_model=List[MockEntry])
def list_mocks(folder: Optional[str] = None):
    """Получает список моков, опционально отфильтрованных по папке"""
    return db_store.list_mocks(folder)


@app.delete("/api/mocks")
def delete_mock(id_: str = Query(...)):
    """Удаляет мок по ID"""
    if not db_store.delete_mock(id_):
        raise HTTPException(404, f"Mock with id {id_} not found")
    return {"message": "mock deleted"}


@app.patch("/api/mocks/{mock_id}/toggle")
def toggle_mock(
    mock_id: str = Path(...),
    active: bool = Body(..., embed=True)
):
    """Переключает активность мока"""
    if not db_store.toggle_mock(mock_id, active):
        raise HTTPException(404, "Mock not found")
    return {"id": mock_id, "active": active}


@app.patch("/api/mocks/deactivate-all")
def deactivate_all(folder: Optional[str] = Query(None)):
    """Деактивирует все моки (опционально в папке)"""
    count = db_store.deactivate_all(folder)
    if count == 0:
        raise HTTPException(404, "No matching mock found")
    return {"message": f"Деактивировано {count} моков{f' в папке {folder}' if folder else ''}"}


# ============================================================================
# ЭНДПОИНТ - ИМПОРТ POSTMAN
# ============================================================================

@app.post("/api/mocks/import")
async def import_postman_collection(file: UploadFile = File(...)):
    """
    Импортирует коллекцию из Postman Collection v2.1 JSON.
    Создаёт папку с именем collection.info.name и сохраняет все запросы как моки.
    """
    try:
        content = await file.read()
        try:
            coll = json.loads(content)
        except json.JSONDecodeError:
            return JSONResponse({"detail": "Invalid JSON file"}, status_code=400)

        folder_name = coll.get("info", {}).get("name", "postman")
        folder_name = folder_name.strip() or "postman"
        
        if not db_store.folder_exists(folder_name):
            db_store.create_folder(folder_name)

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
                    if raw:
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

            mock_id = str(uuid4())

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
                    response_body = json.loads(response_body)
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
                id=mock_id,
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
                sequence_next_id=None,
                active=True
            )

            db_store.create_or_update_mock(entry)
            imported.append(entry.id)

        return JSONResponse({
            "message": f"Imported {len(imported)} mocks into folder '{folder_name}'",
            "imported_ids": imported
        }, status_code=200)
        
    except Exception as e:
        return JSONResponse({
            "detail": f"Error processing file: {str(e)}"
        }, status_code=500)


# ============================================================================
# MOCK HANDLER - ПЕРЕХВАТ ВСЕХ ОСТАЛЬНЫХ ЗАПРОСОВ
# ============================================================================

async def match_condition(req: Request, mock_data: dict) -> bool:
    """Проверяет соответствие запроса условиям мока"""
    if req.method.upper() != mock_data["method"].upper():
        return False
    
    path = req.url.path
    full = f"{path}{f'?{req.url.query}' if req.url.query else ''}"
    if full != mock_data["path"]:
        return False
    
    if mock_data["headers"]:
        for hk, hv in mock_data["headers"].items():
            if req.headers.get(hk) != hv:
                return False
    
    if mock_data["body_contains"]:
        body = (await req.body()).decode("utf-8")
        if mock_data["body_contains"] not in body:
            return False
    
    return True


@app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH"])
async def mock_handler(request: Request, full_path: str):
    """
    Перехватывает все запросы и ищет соответствующий мок.
    Исключает API пути.
    """
    # Исключаем API пути из обработки моков
    if full_path.startswith("api/"):
        raise HTTPException(404, "No matching mock found")
    
    # Ищем подходящий активный мок
    for mock_data in db_store.get_active_mocks():
        if await match_condition(request, mock_data):
            resp = JSONResponse(
                content=mock_data["response_body"],
                status_code=mock_data["status_code"]
            )
            for k, v in (mock_data["response_headers"] or {}).items():
                resp.headers[k] = v
            if mock_data["sequence_next_id"]:
                resp.headers["X-Next-Mock-Id"] = mock_data["sequence_next_id"]
            return resp
    
    raise HTTPException(404, "No matching mock found")


# ============================================================================
# ЗАПУСК
# ============================================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
