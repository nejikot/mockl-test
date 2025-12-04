# Пример проверки кеширования

## Как работает кеширование

Кеширование включается, когда в теле ответа мока есть поле `__cache_ttl__` с положительным значением (в секундах).

## Пример настройки мока с кешированием

### 1. Создайте мок с кешированием

В теле ответа добавьте поле `__cache_ttl__`:

```json
{
  "data": {
    "message": "Hello, World!",
    "timestamp": "2024-01-01T00:00:00Z"
  },
  "__cache_ttl__": 60
}
```

Это означает, что ответ будет кешироваться на 60 секунд.

### 2. Проверка кеширования

#### Шаг 1: Сделайте первый запрос к моку

```bash
curl -X GET https://your-mock-server.com/test/path
```

В логах вы должны увидеть:
```
Cache DISABLED for mock ...: ttl=0
```
или
```
Cache SAVED for mock ...: cache_key=..., ttl=60s, expires_at=...
```

#### Шаг 2: Проверьте статус кеша

```bash
curl -X GET https://your-mock-server.com/api/cache/status
```

Ответ будет содержать:
```json
{
  "total": 1,
  "active": 1,
  "expired": 0,
  "items": [
    {
      "key": "mock-id:GET:/test/path",
      "expires_at": 1704067200.0,
      "ttl_remaining": 45.5,
      "expired": false,
      "status_code": 200
    }
  ]
}
```

#### Шаг 3: Сделайте второй запрос (в течение TTL)

```bash
curl -X GET https://your-mock-server.com/test/path
```

В логах вы должны увидеть:
```
Cache HIT for mock ...: expires_at=..., current_time=..., ttl_remaining=...s
```

#### Шаг 4: Проверьте метрики

```bash
curl -X GET https://your-mock-server.com/metrics
```

Найдите метрику `mockl_cache_hits_total` - она должна увеличиться.

### 3. Проверка через API

#### Получить статус кеша:
```bash
GET /api/cache/status
```

#### Очистить весь кеш:
```bash
DELETE /api/cache
```

#### Очистить кеш для конкретной папки:
```bash
DELETE /api/cache?folder=my-folder
```

#### Очистить кеш для конкретного пути:
```bash
DELETE /api/cache?path_prefix=/test
```

## Отладка кеширования

### Проверьте логи

В логах вы должны видеть сообщения:
- `Cache TTL found in body: 60 seconds` - TTL найден в теле ответа
- `Cache SAVED for mock ...` - ответ сохранен в кеш
- `Cache HIT for mock ...` - ответ взят из кеша
- `Cache MISS for mock ...` - ответ не найден в кеше
- `Cache EXPIRED for mock ...` - кеш истек

### Частые проблемы

1. **Кеш не работает** - проверьте, что в теле ответа есть `__cache_ttl__` с положительным значением
2. **Кеш не сохраняется** - проверьте логи на наличие сообщения `Cache SAVED`
3. **Кеш не используется** - проверьте, что запросы идентичны (метод, путь, заголовки)

## Пример полного теста

```bash
# 1. Создайте мок с кешированием (через UI или API)
# Тело ответа должно содержать: {"data": "test", "__cache_ttl__": 30}

# 2. Первый запрос - должен сохранить в кеш
curl -X GET https://your-server.com/test

# 3. Проверьте статус кеша
curl -X GET https://your-server.com/api/cache/status

# 4. Второй запрос - должен взять из кеша
curl -X GET https://your-server.com/test

# 5. Проверьте метрики
curl -X GET https://your-server.com/metrics | grep cache_hits

# 6. Подождите 30+ секунд и сделайте третий запрос - должен снова сохранить в кеш
sleep 35
curl -X GET https://your-server.com/test
```

