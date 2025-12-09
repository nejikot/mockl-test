import React, { useState, useEffect, useRef } from "react";
import {
  Table, Button, Form, Input, Select, Modal, Layout, message,
  ConfigProvider, Typography, Grid, Tooltip, Switch, Checkbox, Row, Col, Divider, Collapse
} from "antd";
import { theme as antdTheme } from "antd";
import {
  PlusOutlined, MinusCircleOutlined, DeleteOutlined,
  ExclamationCircleOutlined, CopyOutlined,
  MenuOutlined, PoweroffOutlined, UploadOutlined, EditOutlined,
  SnippetsOutlined, BgColorsOutlined, DownloadOutlined,
  DownOutlined, RightOutlined, SearchOutlined,
  BarChartOutlined, ReloadOutlined
} from "@ant-design/icons";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const { Header, Content, Sider } = Layout;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

// Коды ошибок для имитации с примерами JSON-тел
const ERROR_STATUS_CODES = [
  { value: 400, label: "400 - Bad Request", body: { error: "Bad Request", message: "Invalid request parameters", code: "INVALID_REQUEST" } },
  { value: 401, label: "401 - Unauthorized", body: { error: "Unauthorized", message: "Authentication required", code: "AUTH_REQUIRED" } },
  { value: 403, label: "403 - Forbidden", body: { error: "Forbidden", message: "Access denied", code: "ACCESS_DENIED" } },
  { value: 404, label: "404 - Not Found", body: { error: "Not Found", message: "Resource not found", code: "NOT_FOUND" } },
  { value: 409, label: "409 - Conflict", body: { error: "Conflict", message: "Resource conflict occurred", code: "CONFLICT" } },
  { value: 422, label: "422 - Unprocessable Entity", body: { error: "Unprocessable Entity", message: "Validation failed", code: "VALIDATION_ERROR", errors: [] } },
  { value: 429, label: "429 - Too Many Requests", body: { error: "Too Many Requests", message: "Rate limit exceeded", code: "RATE_LIMIT", retry_after: 60 } },
  { value: 500, label: "500 - Internal Server Error", body: { error: "Internal Server Error", message: "Something went wrong", code: "INTERNAL_ERROR" } },
  { value: 502, label: "502 - Bad Gateway", body: { error: "Bad Gateway", message: "Gateway error occurred", code: "BAD_GATEWAY" } },
  { value: 503, label: "503 - Service Unavailable", body: { error: "Service Unavailable", message: "Service temporarily unavailable", code: "SERVICE_UNAVAILABLE", retry_after: 30 } },
  { value: 504, label: "504 - Gateway Timeout", body: { error: "Gateway Timeout", message: "Request timeout", code: "GATEWAY_TIMEOUT" } }
];

// Полный список HTTP статусов из RFC
const HTTP_STATUSES = [
  // 1xx: Informational
  { value: 100, label: "100 - Continue", example: { message: "continue" } },
  { value: 101, label: "101 - Switching Protocols", example: { message: "switching protocols" } },
  { value: 102, label: "102 - Processing", example: { message: "processing" } },
  { value: 103, label: "103 - Early Hints", example: { message: "early hints" } },

  // 2xx: Success
  { value: 200, label: "200 - OK", example: { message: "success", data: {} } },
  { value: 201, label: "201 - Created", example: { message: "created", id: "123" } },
  { value: 202, label: "202 - Accepted", example: { message: "accepted", task_id: "456" } },
  { value: 203, label: "203 - Non-Authoritative Information", example: { message: "non-authoritative" } },
  { value: 204, label: "204 - No Content", example: {} },
  { value: 205, label: "205 - Reset Content", example: {} },
  { value: 206, label: "206 - Partial Content", example: { data: "partial" } },
  { value: 207, label: "207 - Multi-Status", example: { status: "multi-status" } },
  { value: 208, label: "208 - Already Reported", example: { message: "already reported" } },
  { value: 226, label: "226 - IM Used", example: { message: "IM used" } },

  // 3xx: Redirection
  { value: 300, label: "300 - Multiple Choices", example: { choices: [] } },
  { value: 301, label: "301 - Moved Permanently", example: { redirect: "url" } },
  { value: 302, label: "302 - Found", example: { redirect: "url" } },
  { value: 303, label: "303 - See Other", example: { redirect: "url" } },
  { value: 304, label: "304 - Not Modified", example: {} },
  { value: 305, label: "305 - Use Proxy", example: { proxy: "url" } },
  { value: 307, label: "307 - Temporary Redirect", example: { redirect: "url" } },
  { value: 308, label: "308 - Permanent Redirect", example: { redirect: "url" } },

  // 4xx: Client Error
  { value: 400, label: "400 - Bad Request", example: { error: "bad request", message: "Invalid input" } },
  { value: 401, label: "401 - Unauthorized", example: { error: "unauthorized", message: "Authentication required" } },
  { value: 402, label: "402 - Payment Required", example: { error: "payment required" } },
  { value: 403, label: "403 - Forbidden", example: { error: "forbidden", message: "Access denied" } },
  { value: 404, label: "404 - Not Found", example: { error: "not found", message: "Resource not found" } },
  { value: 405, label: "405 - Method Not Allowed", example: { error: "method not allowed" } },
  { value: 406, label: "406 - Not Acceptable", example: { error: "not acceptable" } },
  { value: 407, label: "407 - Proxy Authentication Required", example: { error: "proxy authentication required" } },
  { value: 408, label: "408 - Request Timeout", example: { error: "request timeout" } },
  { value: 409, label: "409 - Conflict", example: { error: "conflict", message: "Resource conflict" } },
  { value: 410, label: "410 - Gone", example: { error: "gone", message: "Resource deleted" } },
  { value: 411, label: "411 - Length Required", example: { error: "length required" } },
  { value: 412, label: "412 - Precondition Failed", example: { error: "precondition failed" } },
  { value: 413, label: "413 - Payload Too Large", example: { error: "payload too large" } },
  { value: 414, label: "414 - URI Too Long", example: { error: "uri too long" } },
  { value: 415, label: "415 - Unsupported Media Type", example: { error: "unsupported media type" } },
  { value: 416, label: "416 - Range Not Satisfiable", example: { error: "range not satisfiable" } },
  { value: 417, label: "417 - Expectation Failed", example: { error: "expectation failed" } },
  { value: 418, label: "418 - I'm a teapot", example: { error: "i'm a teapot" } },
  { value: 419, label: "419 - Authentication Timeout", example: { error: "authentication timeout" } },
  { value: 421, label: "421 - Misdirected Request", example: { error: "misdirected request" } },
  { value: 422, label: "422 - Unprocessable Entity", example: { error: "validation failed", details: [] } },
  { value: 423, label: "423 - Locked", example: { error: "locked" } },
  { value: 424, label: "424 - Failed Dependency", example: { error: "failed dependency" } },
  { value: 425, label: "425 - Too Early", example: { error: "too early" } },
  { value: 426, label: "426 - Upgrade Required", example: { error: "upgrade required" } },
  { value: 428, label: "428 - Precondition Required", example: { error: "precondition required" } },
  { value: 429, label: "429 - Too Many Requests", example: { error: "too many requests" } },
  { value: 431, label: "431 - Request Header Fields Too Large", example: { error: "headers too large" } },
  { value: 449, label: "449 - Retry With", example: { error: "retry with" } },
  { value: 451, label: "451 - Unavailable For Legal Reasons", example: { error: "unavailable for legal reasons" } },
  { value: 499, label: "499 - Client Closed Request", example: { error: "client closed request" } },

  // 5xx: Server Error
  { value: 500, label: "500 - Internal Server Error", example: { error: "internal server error", message: "Something went wrong" } },
  { value: 501, label: "501 - Not Implemented", example: { error: "not implemented" } },
  { value: 502, label: "502 - Bad Gateway", example: { error: "bad gateway", message: "Upstream server error" } },
  { value: 503, label: "503 - Service Unavailable", example: { error: "service unavailable", message: "Service temporarily unavailable" } },
  { value: 504, label: "504 - Gateway Timeout", example: { error: "gateway timeout" } },
  { value: 505, label: "505 - HTTP Version Not Supported", example: { error: "http version not supported" } },
  { value: 506, label: "506 - Variant Also Negotiates", example: { error: "variant also negotiates" } },
  { value: 507, label: "507 - Insufficient Storage", example: { error: "insufficient storage" } },
  { value: 508, label: "508 - Loop Detected", example: { error: "loop detected" } },
  { value: 509, label: "509 - Bandwidth Limit Exceeded", example: { error: "bandwidth limit exceeded" } },
  { value: 510, label: "510 - Not Extended", example: { error: "not extended" } },
  { value: 511, label: "511 - Network Authentication Required", example: { error: "network authentication required" } },
  { value: 520, label: "520 - Unknown Error", example: { error: "unknown error" } },
  { value: 521, label: "521 - Web Server Is Down", example: { error: "web server is down" } },
  { value: 522, label: "522 - Connection Timed Out", example: { error: "connection timed out" } },
  { value: 523, label: "523 - Origin Is Unreachable", example: { error: "origin is unreachable" } },
  { value: 524, label: "524 - A Timeout Occurred", example: { error: "timeout occurred" } },
  { value: 525, label: "525 - SSL Handshake Failed", example: { error: "ssl handshake failed" } },
  { value: 526, label: "526 - Invalid SSL Certificate", example: { error: "invalid ssl certificate" } }
];

// Режимы тела запроса
const REQUEST_BODY_MODES = [
  { value: "none", label: "none" },
  { value: "raw", label: "raw (JSON)" },
  { value: "form-data", label: "form-data" },
  { value: "urlencoded", label: "x-www-form-urlencoded" },
  { value: "file", label: "file (файл)" }
];

function getBackendUrl() {
  return import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
}

function buildFolderHost(baseHost, folder, parentFolder = null) {
  if (!baseHost || !folder || folder === "default") return baseHost;
  try {
    const url = new URL(baseHost);
    const basePath = url.pathname.replace(/\/+$/, "");
    // Если есть родительская папка, формируем путь /parent/sub
    if (parentFolder) {
      url.pathname = `${basePath}/${parentFolder}/${folder}`;
    } else {
    url.pathname = `${basePath}/${folder}`;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return baseHost;
  }
}

// Вспомогательная функция для извлечения значения заголовка из нового формата
const getHeaderValue = (headerValue) => {
  if (typeof headerValue === 'object' && headerValue !== null && ('value' in headerValue || 'optional' in headerValue)) {
    return headerValue.value || "";
  }
  return headerValue || "";
};

const headersToFormList = headersObj => {
  if (!headersObj || typeof headersObj !== 'object') {
    return [{ key: "", value: "", optional: false }];
  }
  const list = Object.entries(headersObj).map(([k, v]) => {
    // Поддержка нового формата с необязательными заголовками
    // Формат 1 (старый): {"header_name": "value"}
    // Формат 2 (новый): {"header_name": {"value": "expected_value", "optional": false}}
    // Формат 3 (необязательный): {"header_name": {"value": null, "optional": true}}
    
    // Проверяем, является ли значение объектом с полями optional или value
    if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
      // Проверяем наличие полей optional или value
      if ('optional' in v || 'value' in v) {
        const isOptional = v.optional === true; // Явная проверка на true
        const headerValue = v.value !== null && v.value !== undefined ? v.value : "";
        console.log(`Header ${k}: optional=${isOptional}, value=${headerValue}`, v);
        return { 
          key: k, 
          value: headerValue, 
          optional: isOptional
        };
      }
    }
    
    // Если это строка или число - старый формат
    if (typeof v === 'string' || typeof v === 'number') {
      return { key: k, value: String(v || ""), optional: false };
    }
    
    // Неизвестный формат - используем значение по умолчанию
    console.warn(`Unknown header format for ${k}:`, v);
    return { key: k, value: "", optional: false };
  });
  return list.length ? list : [{ key: "", value: "", optional: false }];
};

// Компонент для строки заголовка с поддержкой необязательных заголовков
const HeaderRow = ({ field, remove, fieldsLength, form }) => {
  const [isOptional, setIsOptional] = React.useState(false);
  
  // Отслеживаем изменения значения optional через useEffect
  React.useEffect(() => {
    const updateOptionalState = () => {
      try {
        const headers = form.getFieldValue('requestHeaders') || [];
        const headerValue = headers[field.name];
        const optionalValue = headerValue?.optional === true;
        setIsOptional(optionalValue);
      } catch (e) {
        // Игнорируем ошибки
      }
    };
    
    // Проверяем сразу
    updateOptionalState();
    
    // Подписываемся на изменения через интервал (временное решение)
    const interval = setInterval(updateOptionalState, 200);
    
    return () => clearInterval(interval);
  }, [field.name, form]);
  
  // Обработчик изменения переключателя
  const handleOptionalChange = (checked) => {
    // Устанавливаем значение в форму
    form.setFieldValue(['requestHeaders', field.name, 'optional'], checked);
    // Обновляем локальное состояние
    setIsOptional(checked);
  };
  
  // Получаем текущее значение переключателя из формы
  const optionalValue = Form.useWatch(['requestHeaders', field.name, 'optional'], form) || false;
  
  // Синхронизируем локальное состояние с формой
  React.useEffect(() => {
    setIsOptional(optionalValue === true);
  }, [optionalValue]);
  
  return (
    <Form.Item key={field.key} style={{ marginTop: 8 }}>
      <Input.Group compact style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <Form.Item {...field} name={[field.name, 'key']} noStyle>
          <Input placeholder="Ключ" style={{ width: isOptional ? '40%' : '30%' }} />
        </Form.Item>
        {!isOptional && (
          <Form.Item {...field} name={[field.name, 'value']} noStyle>
            <Input placeholder="Значение" style={{ flex: 1 }} />
          </Form.Item>
        )}
        {isOptional && (
          <div style={{ flex: 1, padding: '4px 11px', background: '#f0f0f0', borderRadius: 4, color: '#666', fontSize: 12, display: 'flex', alignItems: 'center' }}>
            Заполняется автоматически
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Form.Item {...field} name={[field.name, 'optional']} noStyle valuePropName="checked">
            <Tooltip title={isOptional ? "Включено: значение не учитывается, проверяется только наличие заголовка" : "Выключено: значение обязательно, проверяется и наличие заголовка, и точное значение"}>
              <Switch checked={isOptional} onChange={handleOptionalChange} />
            </Tooltip>
          </Form.Item>
          <span style={{ fontSize: 12, color: '#666' }}>Авто</span>
        </div>
        {fieldsLength > 1 && (
          <MinusCircleOutlined
            onClick={() => remove(field.name)}
            style={{ color: 'red', fontSize: 20, cursor: 'pointer' }}
          />
        )}
      </Input.Group>
    </Form.Item>
  );
};

const DraggableMockRow = (props) => {
  const { children, ...restProps } = props;
  const mockId = restProps['data-row-key'];
  const index = restProps.index !== undefined ? restProps.index : -1;
  const moveMock = restProps.moveMock;
  
  const [{ isDragging }, drag] = useDrag({
    type: 'mock',
    item: { index, mockId },
    collect: monitor => ({ isDragging: monitor.isDragging() })
  });
  const [, drop] = useDrop({
    accept: 'mock',
    hover: (item) => {
      if (item.index !== index && item.index !== -1 && index !== -1 && moveMock) {
        moveMock(item.index, index);
        item.index = index;
      }
    }
  });
  
  return (
    <tr
      {...restProps}
      ref={node => drag(drop(node))}
      style={{
        ...restProps.style,
        opacity: isDragging ? 0.5 : 1,
        cursor: 'move'
      }}
    >
      {children}
    </tr>
  );
};

// Компонент для папки с подпапками
const FolderWithSubfolders = ({ rootFolder, subFolders, rootIndex, moveFolder, selectedFolder, setSelectedFolder, deleteFolder, theme, foldersData, getFolderKey }) => {
  // Восстанавливаем состояние раскрытия из localStorage
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem(`mockl-folder-expanded-${rootFolder.name}`);
    return saved === "true";
  });
  
  // Сохраняем состояние раскрытия в localStorage при изменении
  useEffect(() => {
    localStorage.setItem(`mockl-folder-expanded-${rootFolder.name}`, String(isExpanded));
  }, [isExpanded, rootFolder.name]);
  
  return (
    <div style={{ marginBottom: 8, width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
        }}
      >
        <div
          onClick={() => setIsExpanded(!isExpanded)}
          style={{
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            padding: "4px",
          }}
        >
          {isExpanded ? <DownOutlined /> : <RightOutlined />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <DraggableFolder
            folder={rootFolder.name}
            index={rootIndex}
            moveFolder={moveFolder}
            selectedFolder={selectedFolder}
            setSelectedFolder={setSelectedFolder}
            deleteFolder={deleteFolder}
            theme={theme}
            isSubfolder={false}
            parentFolder={null}
            showExpandIcon={false}
            getFolderKey={getFolderKey}
          />
        </div>
      </div>
      {isExpanded && (
        <div style={{ marginLeft: 24, marginTop: 4, width: "calc(100% - 24px)" }}>
          {subFolders.map((subFolder, subIndex) => (
            <DraggableFolder
              key={`${subFolder.name}|${subFolder.parent_folder}`}
              folder={subFolder.name}
              index={rootIndex + 1 + subIndex}
              moveFolder={moveFolder}
              selectedFolder={selectedFolder}
              setSelectedFolder={setSelectedFolder}
              deleteFolder={deleteFolder}
              theme={theme}
              isSubfolder={true}
              parentFolder={subFolder.parent_folder}
              getFolderKey={getFolderKey}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const DraggableFolder = ({ folder, index, moveFolder, selectedFolder, setSelectedFolder, deleteFolder, theme, isSubfolder = false, parentFolder = null, showExpandIcon = true, getFolderKey }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'folder',
    item: { index, folder, parentFolder },
    collect: monitor => ({ isDragging: monitor.isDragging() }),
    canDrag: () => folder !== "default" // Нельзя перетаскивать default
  });
  const [, drop] = useDrop({
    accept: 'folder',
    hover: (item, monitor) => {
      if (!monitor.isOver({ shallow: true })) return;
      if (item.index !== index && item.folder !== "default") {
        moveFolder(item.index, index);
        item.index = index;
      }
    },
    canDrop: () => folder !== "default" // Нельзя бросать на default
  });
  
  const folderKey = getFolderKey ? getFolderKey(folder, parentFolder) : folder;
  const isActive = folderKey === selectedFolder;
  const bgColor = isActive 
    ? (theme === "dark" ? "#1890ff" : "#e6f7ff")
    : (theme === "dark" ? "#262626" : "#fafafa");
  const textColor = isActive
    ? (theme === "dark" ? "#fff" : "#000")
    : (theme === "dark" ? "#e8e8e8" : "#000");
  const hoverBgColor = theme === "dark" ? "#1890ff" : "#e6f7ff";
  
  return (
    <div
      ref={node => drag(drop(node))}
      style={{
        opacity: isDragging ? 0.5 : 1,
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        cursor: "pointer",
        background: bgColor,
        color: textColor,
        fontWeight: isActive ? 600 : 400,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        transition: "all 0.3s",
        marginLeft: 0,
        borderLeft: isSubfolder ? `3px solid ${theme === "dark" ? "#1890ff" : "#1890ff"}` : "none",
        paddingLeft: isSubfolder ? 16 : 12,
        width: "100%",
        minWidth: 0,
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = hoverBgColor;
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = bgColor;
      }}
      onClick={() => setSelectedFolder(getFolderKey ? getFolderKey(folder, parentFolder) : folder)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MenuOutlined style={{ color: theme === "dark" ? "#999" : "#999", cursor: 'grab' }} />
        <Typography.Text style={{ color: textColor }}>
          {folder === "default" ? "Главная" : folder}
          {isSubfolder && parentFolder && (
            <Typography.Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
              ({parentFolder})
            </Typography.Text>
          )}
        </Typography.Text>
      </div>
      {folder !== "default" && (
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <DeleteOutlined
            onClick={e => { e.stopPropagation(); deleteFolder(folder, parentFolder); }}
            style={{ color: '#ff4d4f', fontSize: 16, cursor: "pointer" }}
          />
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [form] = Form.useForm();
  const [folderForm] = Form.useForm();
  const [folders, setFolders] = useState(["default"]);
  const [foldersData, setFoldersData] = useState([{ name: "default", parent_folder: null, order: 0 }]);
  // Восстанавливаем выбранную папку из localStorage
  // Используем составной ключ для идентификации папок: "name|parent_folder"
  // Для корневых папок parent_folder = '', для подпапок - имя родительской папки
  const [selectedFolder, setSelectedFolder] = useState(() => {
    const saved = localStorage.getItem("mockl-selected-folder");
    return saved || "default|";
  });
  
  // Сохраняем выбранную папку в localStorage при изменении
  useEffect(() => {
    if (selectedFolder) {
      localStorage.setItem("mockl-selected-folder", selectedFolder);
    }
  }, [selectedFolder]);
  
  // Вспомогательные функции для работы с составным ключом
  const getFolderKey = (name, parentFolder = null) => {
    const parent = parentFolder || '';
    return `${name}|${parent}`;
  };
  
  const parseFolderKey = (key) => {
    if (!key || key === "default") return { name: "default", parent_folder: null };
    const parts = key.split('|');
    return {
      name: parts[0] || "default",
      parent_folder: parts[1] && parts[1] !== '' ? parts[1] : null
    };
  };
  const [folderSearchQuery, setFolderSearchQuery] = useState("");
  const [mockSearchQuery, setMockSearchQuery] = useState("");
  const [mocks, setMocks] = useState([]);
  const [isMetricsModalOpen, setIsMetricsModalOpen] = useState(false);
  const [metricsData, setMetricsData] = useState("");
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [requestLogs, setRequestLogs] = useState([]);
  const [requestLogsLoading, setRequestLogsLoading] = useState(false);
  const [globalRequestLogs, setGlobalRequestLogs] = useState([]);
  const [globalRequestLogsLoading, setGlobalRequestLogsLoading] = useState(false);
  const [isGlobalMetricsModalOpen, setIsGlobalMetricsModalOpen] = useState(false);
  const [globalMetricsData, setGlobalMetricsData] = useState("");
  const [globalMetricsLoading, setGlobalMetricsLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  
  // Функция для загрузки метрик (с индикатором загрузки)
  const loadMetrics = async (showLoading = true) => {
    if (showLoading) {
      setMetricsLoading(true);
    }
    try {
      const { name, parent_folder } = parseFolderKey(selectedFolder);
      const folderParam = parent_folder ? `${name}|${parent_folder}` : name;
      const metricsUrl = `${host}/api/metrics/folder/${encodeURIComponent(folderParam)}`;
      const response = await fetch(metricsUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setMetricsData(data);
    } catch (error) {
      setMetricsData({ error: `Ошибка загрузки метрик: ${error.message}` });
    } finally {
      if (showLoading) {
        setMetricsLoading(false);
      }
    }
  };

  const loadRequestLogs = async (showLoading = true) => {
    if (!selectedFolder) return;
    if (showLoading) {
      setRequestLogsLoading(true);
    }
    try {
      const { name, parent_folder } = parseFolderKey(selectedFolder);
      const folderParam = parent_folder ? `${name}|${parent_folder}` : name;
      const response = await fetch(`${host}/api/request-logs?folder=${encodeURIComponent(folderParam)}&limit=10000`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setRequestLogs(data.logs || []);
    } catch (error) {
      console.error("Error loading request logs:", error);
      setRequestLogs([]);
    } finally {
      if (showLoading) {
        setRequestLogsLoading(false);
      }
    }
  };

  const clearRequestLogs = async () => {
    if (!selectedFolder) return;
    try {
      const response = await fetch(`${host}/api/request-logs?folder=${encodeURIComponent(selectedFolder)}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      message.success('История вызовов очищена');
      // Обновляем и историю, и метрики, так как метрики содержат данные из истории
      loadRequestLogs(true);
      loadMetrics(true);
    } catch (error) {
      message.error(`Ошибка очистки истории: ${error.message}`);
    }
  };

  const clearCacheByKey = async (cacheKey, isGlobal = false) => {
    try {
      const response = await fetch(`${host}/api/cache/clear?cache_key=${encodeURIComponent(cacheKey)}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      message.success('Кэш очищен');
      
      // Обновляем записи в requestLogs, убирая TTL для записей с этим cache_key
      if (isGlobal) {
        setGlobalRequestLogs(prevLogs => 
          prevLogs.map(log => 
            log.cache_key === cacheKey 
              ? { ...log, cache_ttl_seconds: null, cache_key: null }
              : log
          )
        );
        // Также перезагружаем для синхронизации с сервером
        loadGlobalRequestLogs(false);
      } else {
        setRequestLogs(prevLogs => 
          prevLogs.map(log => 
            log.cache_key === cacheKey 
              ? { ...log, cache_ttl_seconds: null, cache_key: null }
              : log
          )
        );
        // Также перезагружаем для синхронизации с сервером
        loadRequestLogs(false);
      }
    } catch (error) {
      message.error(`Ошибка очистки кэша: ${error.message}`);
    }
  };

  const loadGlobalRequestLogs = async (showLoading = true) => {
    if (showLoading) {
      setGlobalRequestLogsLoading(true);
    }
    try {
      const response = await fetch(`${host}/api/request-logs?limit=10000`);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setGlobalRequestLogs(data.logs || []);
    } catch (error) {
      console.error("Error loading global request logs:", error);
      setGlobalRequestLogs([]);
    } finally {
      if (showLoading) {
        setGlobalRequestLogsLoading(false);
      }
    }
  };

  const clearGlobalRequestLogs = async () => {
    try {
      const response = await fetch(`${host}/api/request-logs`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      message.success('История вызовов очищена');
      // Обновляем и историю, и метрики, так как метрики содержат данные из истории
      loadGlobalRequestLogs(true);
      loadGlobalMetrics(true);
    } catch (error) {
      message.error(`Ошибка очистки истории: ${error.message}`);
    }
  };
  
  const generateMockFromProxy = async (logId) => {
    try {
      const response = await fetch(`${host}/api/mocks/generate-from-proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(logId)
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: 'Неизвестная ошибка' }));
        throw new Error(errorData.detail || 'Ошибка при формировании мока');
      }
      message.success('Мок успешно сформирован');
      // Обновляем список моков
      fetchMocks();
    } catch (error) {
      message.error(error.message || 'Ошибка при формировании мока');
    }
  };
  
  // Функция для загрузки метрик всего сервиса (без фильтра по папке)
  const loadGlobalMetrics = async (showLoading = true) => {
    if (showLoading) {
      setGlobalMetricsLoading(true);
    }
    try {
      const metricsUrl = `${host}/api/metrics/global`;
      const response = await fetch(metricsUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const data = await response.json();
      setGlobalMetricsData(data);
    } catch (error) {
      setGlobalMetricsData({ error: `Ошибка загрузки метрик: ${error.message}` });
    } finally {
      if (showLoading) {
        setGlobalMetricsLoading(false);
      }
    }
  };
  
  // Автоматическое обновление метрик каждые 5 секунд, когда модальное окно открыто (фоново, без мигания)
  useEffect(() => {
    if (!isMetricsModalOpen) return;
    
    // Загружаем метрики и историю вызовов сразу при открытии (с индикатором)
    loadMetrics(true);
    loadRequestLogs(true);
    
    // Устанавливаем интервал для автоматического обновления (без индикатора)
    const interval = setInterval(() => {
      loadMetrics(false);
      loadRequestLogs(false);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isMetricsModalOpen, selectedFolder]);

  // Обновление времени каждую секунду для динамического TTL (когда открыто модальное окно метрик)
  useEffect(() => {
    if (!isMetricsModalOpen && !isGlobalMetricsModalOpen) return;
    
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);
    
    return () => clearInterval(timeInterval);
  }, [isMetricsModalOpen, isGlobalMetricsModalOpen]);

  // Функция для вычисления оставшегося TTL кэша
  const getRemainingTTL = (timestamp, ttlSeconds) => {
    if (!timestamp || !ttlSeconds) return null;
    try {
      const requestTime = new Date(timestamp);
      const elapsed = Math.floor((currentTime - requestTime) / 1000);
      const remaining = ttlSeconds - elapsed;
      return remaining > 0 ? remaining : 0;
    } catch {
      return null;
    }
  };
  
  // Автоматическое обновление глобальных метрик каждые 5 секунд
  useEffect(() => {
    if (!isGlobalMetricsModalOpen) return;
    
    // Загружаем метрики и историю вызовов сразу при открытии (с индикатором)
    loadGlobalMetrics(true);
    loadGlobalRequestLogs(true);
    
    // Устанавливаем интервал для автоматического обновления (без индикатора)
    const interval = setInterval(() => {
      loadGlobalMetrics(false);
      loadGlobalRequestLogs(false);
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isGlobalMetricsModalOpen]);
  const [modalOpen, setModalOpen] = useState(false);
  const [isFolderModalOpen, setFolderModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [host, setHost] = useState(getBackendUrl());
  const [theme, setTheme] = useState("light");
  const screens = useBreakpoint();
  const fileInputRef = useRef();
  const responseFileInputRef = useRef();
  const requestFileInputRef = useRef();
  const [responseFile, setResponseFile] = useState(null);
  const [requestFile, setRequestFile] = useState(null);
  const [originalFileBody, setOriginalFileBody] = useState(null);
  const [isFolderSettingsModalOpen, setFolderSettingsModalOpen] = useState(false);
  const [folderSettingsForm] = Form.useForm();
  const [isOpenapiModalOpen, setOpenapiModalOpen] = useState(false);
  const [openapiForm] = Form.useForm();
  const [isPostmanImportModalOpen, setPostmanImportModalOpen] = useState(false);
  const [postmanImportForm] = Form.useForm();
  const [postmanFileToImport, setPostmanFileToImport] = useState(null);
  const [isDuplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateForm] = Form.useForm();
  const [folderToDuplicate, setFolderToDuplicate] = useState(null);
  const [isDuplicateMockModalOpen, setDuplicateMockModalOpen] = useState(false);
  const [duplicateMockForm] = Form.useForm();
  const [mockToDuplicate, setMockToDuplicate] = useState(null);
  const [isRenameModalOpen, setRenameModalOpen] = useState(false);
  const [renameForm] = Form.useForm();
  const [folderToRename, setFolderToRename] = useState(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("mockl-theme") || "light";
    setTheme(savedTheme);
  }, []);

  useEffect(() => {
    document.body.style.background = theme === "light" ? "#f0f2f5" : "#141414";
    // Устанавливаем data-theme для стилей скроллбара
    document.body.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    const newTheme = theme === "light" ? "dark" : "light";
    setTheme(newTheme);
    localStorage.setItem("mockl-theme", newTheme);
  };

  const copyToClipboard = text => {
    navigator.clipboard.writeText(text)
      .then(() => message.success('Скопировано'))
      .catch(() => message.error('Не удалось скопировать'));
  };

  const uploadJson = async file => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${host}/api/mocks/import`, {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error("Импорт не удался");
      const data = await res.json();
      message.success(`Импортировано ${data.imported_ids.length} мока(ов)`);
      // ✅ ИСПРАВЛЕНИЕ: вызываем fetchFolders и fetchMocks для обновления UI
      fetchFolders();
      fetchMocks();
    } catch (e) {
      message.error("Ошибка импорта: " + e.message);
    }
  };

  const onImportClick = () => fileInputRef.current.click();

  const handleFileChange = e => {
    const file = e.target.files[0];
    if (file) {
      setPostmanFileToImport(file);
      postmanImportForm.resetFields();
      postmanImportForm.setFieldsValue({
        target_folder: selectedFolder
      });
      setPostmanImportModalOpen(true);
    }
    e.target.value = "";
  };

  const handlePostmanImport = async (vals) => {
    if (!postmanFileToImport) return;
    
    const targetFolderKey = vals.target_folder || selectedFolder;
    const { name: targetFolderName, parent_folder: targetParentFolder } = parseFolderKey(targetFolderKey);
    const folderValue = targetParentFolder ? `${targetFolderName}|${targetParentFolder}` : targetFolderName;
    
    const formData = new FormData();
    formData.append("file", postmanFileToImport);
    formData.append("folder_name", folderValue);
    
    try {
      const res = await fetch(`${host}/api/mocks/import`, {
        method: "POST",
        body: formData
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Импорт не удался");
      }
      const data = await res.json();
      message.success(`Импортировано ${data.imported_ids.length} мока(ов) в папку "${targetFolderName}"`);
      setPostmanImportModalOpen(false);
      setPostmanFileToImport(null);
      postmanImportForm.resetFields();
      await fetchFolders();
      setSelectedFolder(targetFolderKey);
      await fetchMocks();
    } catch (e) {
      message.error("Ошибка импорта: " + (e.message || ""));
    }
  };

  const toggleMockActive = async (id, active) => {
    try {
      const res = await fetch(`${host}/api/mocks/${id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active })
      });
      if (!res.ok) throw new Error();
      setMocks(prev => prev.map(m => m.id === id ? { ...m, active } : m));
      message.success(active ? "Активировано" : "Деактивировано");
    } catch {
      message.error("Ошибка смены статуса");
    }
  };

  const deactivateAllMocks = (folderKey = null) => {
    const isCurrentFolder = folderKey === selectedFolder || folderKey === null;
    const { name, parent_folder } = folderKey ? parseFolderKey(folderKey) : { name: null, parent_folder: null };
    Modal.confirm({
      title: name ? `Отключить все моки в папке "${name}"?` : 'Отключить все моки во всех папках?',
      content: name ? 'Будут отключены все моки в этой папке и всех её вложенных папках.' : 'Будут отключены все моки во всех папках.',
      icon: <ExclamationCircleOutlined />,
      okText: 'Отключить',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          const folderParam = name ? (parent_folder ? `${name}|${parent_folder}` : name) : null;
          const url = folderParam 
            ? `${host}/api/mocks/deactivate-all?folder=${encodeURIComponent(folderParam)}`
            : `${host}/api/mocks/deactivate-all`;
          const res = await fetch(url, { method: "POST" });
          if (!res.ok) throw new Error();
          if (isCurrentFolder) {
          setMocks(prev => prev.map(m => ({ ...m, active: false })));
          }
          const data = await res.json();
          message.success(data.message || `Отключено моков: ${data.count || 0}`);
          if (isCurrentFolder) {
            await fetchMocks();
          }
        } catch {
          message.error("Ошибка отключения");
        }
      }
    });
  };

  const moveFolder = (from, to) => {
    // Работаем только с корневыми папками (без подпапок)
    // Сортируем по order для согласованности с рендерингом
    const rootFolders = foldersData
      .filter(f => (!f.parent_folder || f.parent_folder === '') && f.name !== "default")
      .sort((a, b) => (a.order || 0) - (b.order || 0));
    const defaultFolder = foldersData.find(f => f.name === "default");
    
    // Исключаем default из перетаскивания (индекс 0)
    if (from === 0 || to === 0) return;
    
    // Корректируем индексы, так как default не участвует в перетаскивании
    const adjustedFrom = from - 1;
    const adjustedTo = to - 1;
    
    if (adjustedFrom < 0 || adjustedTo < 0 || adjustedFrom >= rootFolders.length || adjustedTo >= rootFolders.length) {
      return;
    }
    
    // Перемещаем папку
    const [m] = rootFolders.splice(adjustedFrom, 1);
    rootFolders.splice(adjustedTo, 0, m);
    
    // Обновляем order для всех корневых папок
    const updatedFoldersData = foldersData.map(f => {
      // Обновляем order только для корневых папок (не подпапок)
      if ((!f.parent_folder || f.parent_folder === '') && f.name !== "default") {
        const newIndex = rootFolders.findIndex(rf => rf.name === f.name);
        if (newIndex !== -1) {
          return { ...f, order: newIndex + 1 }; // +1 потому что default имеет order 0
        }
      }
      return f;
    });
    
    setFoldersData(updatedFoldersData);
    
    // Обновляем массив folders для обратной совместимости
    const newFolders = defaultFolder ? [defaultFolder.name, ...rootFolders.map(f => f.name)] : rootFolders.map(f => f.name);
    setFolders(newFolders);
  };

  const moveMock = async (from, to) => {
    const arr = [...mocks];
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    setMocks(arr);
    
    // Сохраняем новый порядок на сервере
    try {
      const mockIds = arr.map(m => m.id);
      const { name, parent_folder } = parseFolderKey(selectedFolder);
      const folderParam = parent_folder ? `${name}|${parent_folder}` : name;
      await fetch(`${host}/api/mocks/reorder?folder=${encodeURIComponent(folderParam)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mockIds)
      });
    } catch (e) {
      message.error("Ошибка сохранения порядка моков");
      // Откатываем изменения
      fetchMocks();
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch(`${host}/api/mocks/folders`);
      if (!res.ok) throw new Error();
      let data = await res.json();
      if (!data.length) data = [{ name: "default", parent_folder: null, order: 0 }];
      
      // Сохраняем полную структуру папок с parent_folder
      const foldersData = data.map(f => typeof f === 'string' ? { name: f, parent_folder: null, order: 0 } : f);
      
      // Сортируем: сначала default, потом корневые папки, потом подпапки
      const defaultFolder = foldersData.find(f => f.name === "default") || { name: "default", parent_folder: null, order: 0 };
      const rootFolders = foldersData.filter(f => f.name !== "default" && !f.parent_folder).sort((a, b) => (a.order || 0) - (b.order || 0));
      const subFolders = foldersData.filter(f => f.name !== "default" && f.parent_folder).sort((a, b) => (a.order || 0) - (b.order || 0));
      
      // Формируем плоский список: default, корневые, подпапки (с отступом)
      const sorted = [
        defaultFolder.name,
        ...rootFolders.map(f => f.name),
        ...subFolders.map(f => f.name)
      ];
      
      setFolders(sorted);
      // Сохраняем полные данные папок для использования в форме
      setFoldersData(foldersData);
      // Проверяем, существует ли сохраненная папка в списке
      const savedFolder = localStorage.getItem("mockl-selected-folder") || "default|";
      const savedFolderData = parseFolderKey(savedFolder);
      const folderExists = foldersData.some(f => 
        f.name === savedFolderData.name && 
        (f.parent_folder || '') === (savedFolderData.parent_folder || '')
      );
      if (folderExists) {
        // Восстанавливаем сохраненную папку, если она существует
        setSelectedFolder(savedFolder);
      } else {
        // Если текущая папка не существует, выбираем первую доступную
        const firstFolder = foldersData[0];
        if (firstFolder) {
          setSelectedFolder(getFolderKey(firstFolder.name, firstFolder.parent_folder));
        } else {
          setSelectedFolder("default|");
        }
      }
    } catch {
      setFolders(["default"]);
      setFoldersData([{ name: "default", parent_folder: null, order: 0 }]);
      setSelectedFolder("default|");
      message.error("Ошибка получения папок");
    }
  };

  const fetchMocks = async () => {
    try {
      const { name, parent_folder } = parseFolderKey(selectedFolder);
      // Для запроса используем только имя папки, бэкенд сам определит по parent_folder
      const folderParam = parent_folder ? `${name}|${parent_folder}` : name;
      const res = await fetch(`${host}/api/mocks?folder=${encodeURIComponent(folderParam)}`);
      if (!res.ok) throw new Error();
      setMocks(await res.json());
    } catch {
      setMocks([]);
      message.error("Ошибка получения моков");
    }
  };

  const openFolderSettings = async () => {
    try {
      const res = await fetch(`${host}/api/folders/${encodeURIComponent(selectedFolder)}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      folderSettingsForm.setFieldsValue({
        proxy_enabled: data.proxy_enabled,
        proxy_base_url: data.proxy_base_url || ""
      });
      setFolderSettingsModalOpen(true);
    } catch (e) {
      message.error("Не удалось загрузить настройки proxy");
    }
  };

  const saveFolderSettings = async vals => {
    try {
      const res = await fetch(`${host}/api/folders/${encodeURIComponent(selectedFolder)}/settings`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          proxy_enabled: !!vals.proxy_enabled,
          proxy_base_url: vals.proxy_base_url || null
        })
      });
      if (!res.ok) throw new Error();
      message.success("Настройки proxy сохранены");
      setFolderSettingsModalOpen(false);
    } catch (e) {
      message.error("Ошибка сохранения настроек proxy");
    }
  };

  const openOpenapiModal = () => {
    openapiForm.resetFields();
    openapiForm.setFieldsValue({
      target_folder: selectedFolder
    });
    setOpenapiModalOpen(true);
  };

  const handleOpenapiImport = async vals => {
    const url = (vals.url || "").trim();
    if (!url) {
      message.error("Укажите URL OpenAPI");
      return;
    }
    const targetFolderKey = vals.target_folder || selectedFolder;
    const { name: targetFolderName, parent_folder: targetParentFolder } = parseFolderKey(targetFolderKey);
    const folderValue = targetParentFolder ? `${targetFolderName}|${targetParentFolder}` : targetFolderName;
    
    try {
      const res = await fetch(`${host}/api/openapi/specs/from-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          name: (vals.spec_name || "").trim() || undefined,
          folder_name: folderValue
        })
      });
      if (!res.ok) throw new Error("Не удалось загрузить спецификацию");
      const data = await res.json();
      message.success(`OpenAPI импортирован в папку "${targetFolderName}"`);
      setOpenapiModalOpen(false);
      openapiForm.resetFields();
      await fetchFolders();
      setSelectedFolder(targetFolderKey);
      await fetchMocks();
    } catch (e) {
      message.error("Ошибка импорта OpenAPI: " + (e.message || ""));
    }
  };

  const handleRequestFileUpload = e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    const currentMode = form.getFieldValue("request_body_mode");
    if (currentMode === "file") {
      setRequestFile(file);
      form.setFieldsValue({
        request_body_raw: ""
      });
      message.success("Файл для запроса загружен");
    } else {
      const reader = new FileReader();
      const isText = /^text\/|\/json$|\/xml$|csv$/.test(file.type) || /\.(csv|xml|json|txt)$/i.test(file.name);

      reader.onload = () => {
        const content = reader.result;
        form.setFieldsValue({
          request_body_raw: isText ? content : btoa(content)
        });
        message.success("Файл загружен в тело запроса");
      };

      if (isText) {
        reader.readAsText(file);
      } else {
        reader.readAsBinaryString(file);
      }
    }
  };

  const handleResponseFileUpload = async e => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;

    setResponseFile(file);
    
    const reader = new FileReader();
    reader.onload = () => {
      const content = reader.result;
      const base64Content = typeof content === 'string' 
        ? btoa(content) 
        : btoa(String.fromCharCode(...new Uint8Array(content)));
      
      const body = {
        __file__: true,
        filename: file.name,
        mime_type: file.type || "application/octet-stream",
        data_base64: base64Content
      };
      form.setFieldsValue({
        response_type: "file",
        response_body: JSON.stringify(body, null, 2)
      });
      message.success("Файл для ответа загружен");
    };
    
    reader.readAsBinaryString(file);
  };

  const buildPostmanCollection = (folderName, mocksToExport) => {
    const items = (mocksToExport || []).map(m => {
      const reqHeaders = Object.entries(m.request_condition.headers || {}).map(
        ([key, value]) => ({ key, value: getHeaderValue(value) })
      );
      const resHeaders = Object.entries(m.response_config.headers || {}).map(
        ([key, value]) => ({ key, value: getHeaderValue(value) })
      );

      const path = m.request_condition.path || "/";
      const cleanPath = path.startsWith("/") ? path.slice(1) : path;

      const request = {
        method: (m.request_condition.method || "GET").toUpperCase(),
        header: reqHeaders,
        url: {
          raw: path,
          path: cleanPath ? cleanPath.split("/") : []
        }
      };

      return {
        name: `${request.method} ${path}`,
        request,
        response: [
          {
            name: `Example ${m.response_config.status_code}`,
            originalRequest: request,
            status: String(m.response_config.status_code),
            code: m.response_config.status_code,
            header: resHeaders,
            body: JSON.stringify(m.response_config.body ?? {}, null, 2)
          }
        ]
      };
    });

    return {
      info: {
        name: folderName || "mock-collection",
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
      },
      item: items
    };
  };

  const exportCurrentFolder = () => {
    if (!mocks.length) {
      message.warning("Нет моков для экспорта");
      return;
    }
    const collection = buildPostmanCollection(folderTitle, mocks);
    const blob = new Blob([JSON.stringify(collection, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${folderTitle || "mock-collection"}.postman_collection.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    message.success("Экспорт выполнен");
  };

  useEffect(() => { fetchFolders(); }, [host]);
  useEffect(() => { fetchMocks(); }, [selectedFolder, host]);

  const handleStatusChange = code => {
    const st = HTTP_STATUSES.find(s => s.value === code);
    if (st) form.setFieldsValue({ response_body: JSON.stringify(st.example, null, 2) });
  };

  const openAddMock = () => {
    setEditing(null);
    setResponseFile(null);
    setRequestFile(null);
    setOriginalFileBody(null);
    form.resetFields();
    form.setFieldsValue({
      folder: selectedFolder,
      method: "GET",
      status_code: 200,
      active: true,
      name: "",
      requestHeaders: [{ key: "", value: "", optional: false }],
      request_body_mode: "none",
      request_body_contains: "",
      body_contains_required: true,
      request_body_params: [{ key: "", value: "" }],
      request_body_formdata: [{ key: "", value: "" }],
      responseHeaders: [{ key: "", value: "" }],
      response_type: "json",
      delay_ms: 0,
      delay_range_min_ms: undefined,
      delay_range_max_ms: undefined,
      cache_enabled: false,
      cache_ttl: undefined,
      error_simulation_enabled: false,
      error_simulation_probability: undefined,
      error_simulation_status_code: undefined,
      error_simulation_body: undefined,
      error_simulation_delay_ms: undefined,
      response_body: JSON.stringify({ message: "success", data: {} }, null, 2)
    });
    setModalOpen(true);
  };

  const openEditMock = m => {
    setEditing(m);
    setResponseFile(null);
    if (m.response_config.body && typeof m.response_config.body === "object" && m.response_config.body.__file__) {
      setOriginalFileBody(m.response_config.body);
    } else {
      setOriginalFileBody(null);
    }
    const headers = m.request_condition.headers || {};
    const contentTypeKey = Object.keys(headers).find(
      k => k.toLowerCase() === "content-type"
    );
    const contentType = contentTypeKey ? getHeaderValue(headers[contentTypeKey]) : "";
    const bodyContains = m.request_condition.body_contains || "";

    let request_body_mode = "raw";
    let request_body_raw = bodyContains;
    let request_body_params = [{ key: "", value: "" }];
    let request_body_formdata = [{ key: "", value: "" }];

    if (/application\/x-www-form-urlencoded/i.test(contentType) && bodyContains) {
      request_body_mode = "urlencoded";
      const pairs = bodyContains.split("&").filter(Boolean);
      request_body_params =
        pairs.map(p => {
          const [k, v = ""] = p.split("=");
          return {
            key: decodeURIComponent(k),
            value: decodeURIComponent(v)
          };
        }) || [{ key: "", value: "" }];
    } else if (/multipart\/form-data/i.test(contentType)) {
      request_body_mode = "form-data";
    } else if (!bodyContains) {
      request_body_mode = "none";
    }

    let cache_enabled = false;
    let cache_ttl;
    try {
      // Читаем настройки кэша из полей мока, а не из тела ответа
      if (m.cache_enabled && m.cache_ttl_seconds) {
        cache_enabled = true;
        cache_ttl = m.cache_ttl_seconds;
      }
    } catch {
      cache_enabled = false;
    }

    // Преобразуем заголовки в формат формы
    const requestHeadersList = headersToFormList(m.request_condition.headers);
    
    // Логируем для отладки
    console.log('Loading mock headers:', m.request_condition.headers);
    console.log('Converted headers list:', requestHeadersList);
    
    // Устанавливаем значения формы
    form.setFieldsValue({
      id: m.id,
      folder: (() => {
        // Преобразуем имя папки в составной ключ, если это подпапка
        const folderData = foldersData.find(f => f.name === m.folder);
        return folderData ? getFolderKey(m.folder, folderData.parent_folder) : getFolderKey(m.folder, null);
      })(),
      name: m.name || "",
      method: m.request_condition.method,
      path: m.request_condition.path,
      requestHeaders: requestHeadersList,
      request_body_mode,
      request_body_raw,
      body_contains_required: m.request_condition.body_contains_required !== undefined ? m.request_condition.body_contains_required : true,
      request_body_params,
      request_body_formdata,
      status_code: m.response_config.status_code,
      active: m.active !== false,
      responseHeaders: headersToFormList(m.response_config.headers),
      response_type: (m.response_config.body && m.response_config.body.__file__) ? "file" : "json",
      delay_ms: m.delay_ms || 0,
      delay_range_min_ms: m.delay_range_min_ms || undefined,
      delay_range_max_ms: m.delay_range_max_ms || undefined,
      cache_enabled: m.cache_enabled || false,
      cache_ttl: m.cache_ttl_seconds || undefined,
      error_simulation_enabled: m.error_simulation_enabled || false,
      error_simulation_probability: m.error_simulation_probability || undefined,
      error_simulation_status_code: m.error_simulation_status_code || undefined,
      error_simulation_body: m.error_simulation_body ? JSON.stringify(m.error_simulation_body, null, 2) : undefined,
      error_simulation_delay_ms: m.error_simulation_delay_ms || undefined,
      response_body: JSON.stringify(m.response_config.body, null, 2)
    });
    
    setModalOpen(true);
    
    // Принудительно обновляем форму после открытия модального окна
    // Используем несколько setTimeout для надежности
    setTimeout(() => {
      // Устанавливаем значения для каждого заголовка
      requestHeadersList.forEach((header, index) => {
        const optionalValue = header.optional === true;
        form.setFieldValue(['requestHeaders', index, 'optional'], optionalValue);
        console.log(`Setting optional=${optionalValue} for header ${index}:`, header);
      });
      
      // Принудительно обновляем форму
      form.validateFields().catch(() => {});
      
      // Еще раз проверяем и устанавливаем значения
      setTimeout(() => {
        const currentHeaders = form.getFieldValue('requestHeaders') || [];
        requestHeadersList.forEach((header, index) => {
          if (header.optional === true && currentHeaders[index]?.optional !== true) {
            form.setFieldValue(['requestHeaders', index, 'optional'], true);
          }
        });
      }, 100);
    }, 300);
  };

  const saveMock = async vals => {
    try {
      const toHeaderObject = list => {
        const obj = {};
        (list || []).forEach(it => {
          if (it.key) {
            // Проверяем, что optional явно установлен (не undefined)
            const isOptional = it.optional === true;
            // Если заголовок помечен как необязательный, используем новый формат
            if (isOptional) {
              obj[it.key] = { value: null, optional: true };
            } else {
              // Для обязательных заголовков используем старый формат (просто строка) для обратной совместимости
              obj[it.key] = it.value || "";
            }
          }
        });
        return obj;
      };

      const responseHeadersObj = toHeaderObject(vals.responseHeaders || []);
      const requestHeadersObj = toHeaderObject(vals.requestHeaders || []);

      const bodyMode = vals.request_body_mode || "none";
      let bodyContains = "";
      let contentType = "";

      if (bodyMode === "urlencoded") {
        const params = vals.request_body_params || [];
        bodyContains = params
          .filter(p => p.key)
          .map(
            p =>
              `${encodeURIComponent(p.key)}=${encodeURIComponent(
                p.value || ""
              )}`
          )
          .join("&");
        contentType = "application/x-www-form-urlencoded";
      } else if (bodyMode === "form-data") {
        contentType = "multipart/form-data";
        bodyContains = "";
      } else if (bodyMode === "raw") {
        bodyContains = (vals.request_body_raw || "").trim();
      } else if (bodyMode === "file") {
        if (requestFile) {
          const fileContent = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsBinaryString(requestFile);
          });
          bodyContains = btoa(fileContent);
          contentType = requestFile.type || "application/octet-stream";
        } else {
          bodyContains = (vals.request_body_raw || "").trim();
        }
      }

      if (contentType) {
        requestHeadersObj["Content-Type"] = contentType;
      }

      let responseBodyObj;
      try {
        responseBodyObj = JSON.parse(vals.response_body || "{}");
      } catch {
        throw new Error("Некорректный JSON в теле ответа");
      }

      if (vals.response_type === "json" && responseBodyObj && typeof responseBodyObj === "object" && responseBodyObj.__file__) {
        delete responseBodyObj.__file__;
        delete responseBodyObj.filename;
        delete responseBodyObj.mime_type;
        delete responseBodyObj.data_base64;
      }

      // Настройки кэша больше не добавляются в тело ответа
      const cacheEnabled = !!vals.cache_enabled;
      const cacheTtl = Number(vals.cache_ttl || 0);

      // Сохраняем order только если мок новый (не редактируется)
      const isEditing = vals.id && editing;
      const currentMock = isEditing ? mocks.find(m => m.id === vals.id) : null;

      const entry = {
        id: vals.id || crypto.randomUUID?.() || Math.random().toString(36).substr(2, 9),
        folder: vals.folder,
        name: (vals.name || "").trim() || null,
        active: vals.active !== undefined ? vals.active !== false : true,
        request_condition: {
          method: vals.method,
          path: vals.path,
          headers: Object.keys(requestHeadersObj).length ? requestHeadersObj : {},
          body_contains: bodyContains || null,
          body_contains_required: vals.body_contains_required !== undefined ? vals.body_contains_required : true
        },
        response_config: {
          status_code: Number(vals.status_code),
          headers: responseHeadersObj,
          body: responseBodyObj
        },
        delay_ms: Number(vals.delay_ms || 0) || 0,
        delay_range_min_ms: vals.delay_range_min_ms ? Number(vals.delay_range_min_ms) : null,
        delay_range_max_ms: vals.delay_range_max_ms ? Number(vals.delay_range_max_ms) : null,
        cache_enabled: cacheEnabled,
        cache_ttl_seconds: cacheEnabled && cacheTtl > 0 ? cacheTtl : null,
        error_simulation_enabled: !!vals.error_simulation_enabled,
        error_simulation_probability: vals.error_simulation_enabled && vals.error_simulation_probability ? Number(vals.error_simulation_probability) : null,
        error_simulation_status_code: vals.error_simulation_enabled && vals.error_simulation_status_code ? Number(vals.error_simulation_status_code) : null,
        error_simulation_body: vals.error_simulation_enabled && vals.error_simulation_body ? (typeof vals.error_simulation_body === 'string' ? JSON.parse(vals.error_simulation_body) : vals.error_simulation_body) : null,
        error_simulation_delay_ms: vals.error_simulation_enabled && vals.error_simulation_delay_ms ? Number(vals.error_simulation_delay_ms) : null
      };
      
      // При редактировании не меняем order, при создании он будет установлен автоматически
      if (isEditing && currentMock && currentMock.order !== undefined) {
        entry.order = currentMock.order;
      }

      let res;
      if ((vals.response_type === "file") && responseFile) {
        if (entry.response_config.body && entry.response_config.body.__file__) {
          const { data_base64, ...bodyWithoutBase64 } = entry.response_config.body;
          entry.response_config.body = bodyWithoutBase64;
        }
        const formData = new FormData();
        formData.append("entry", JSON.stringify(entry));
        formData.append("file", responseFile);
        res = await fetch(`${host}/api/mocks`, {
          method: "POST",
          body: formData
        });
      } else if ((vals.response_type === "file") && responseBodyObj && responseBodyObj.__file__) {
        if (responseBodyObj.data_base64) {
          res = await fetch(`${host}/api/mocks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry)
          });
        } else if (originalFileBody && originalFileBody.data_base64) {
          entry.response_config.body = {
            ...responseBodyObj,
            data_base64: originalFileBody.data_base64,
            filename: responseBodyObj.filename || originalFileBody.filename,
            mime_type: responseBodyObj.mime_type || originalFileBody.mime_type
          };
          res = await fetch(`${host}/api/mocks`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(entry)
          });
        } else {
          throw new Error("Для файлового ответа требуется либо загрузить новый файл, либо сохранить существующий с data_base64");
        }
      } else {
        res = await fetch(`${host}/api/mocks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry)
        });
      }
      if (!res.ok) throw new Error();
      setModalOpen(false);
      setResponseFile(null);
      setOriginalFileBody(null);
      fetchMocks();
      fetchFolders();
      message.success("Сохранено");
    } catch (e) {
      message.error("Ошибка: " + e.message);
    }
  };

  const deleteMock = async id => {
    try {
      const res = await fetch(`${host}/api/mocks?id_=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      fetchMocks();
      fetchFolders();
      message.success("Удалено");
    } catch {
      message.error("Ошибка удаления");
    }
  };

  const startDuplicateMock = (mock) => {
    setMockToDuplicate(mock);
    duplicateMockForm.setFieldsValue({
      target_folder: selectedFolder
    });
    setDuplicateMockModalOpen(true);
  };

  const duplicateMock = async (vals) => {
    if (!mockToDuplicate) return;
    
    try {
      const targetFolderKey = vals.target_folder;
      // Бэкенд поддерживает формат "name|parent_folder" в поле folder
      // Если это корневая папка, передаем просто имя, иначе "name|parent_folder"
      const { name: targetFolderName, parent_folder: targetParentFolder } = parseFolderKey(targetFolderKey);
      const folderValue = targetParentFolder ? `${targetFolderName}|${targetParentFolder}` : targetFolderName;
      
      const copy = {
        folder: folderValue,
        active: mockToDuplicate.active !== false,
        name: mockToDuplicate.name ? `${mockToDuplicate.name} copy` : "copy",
        request_condition: {
          method: mockToDuplicate.request_condition.method,
          path: mockToDuplicate.request_condition.path,
          headers: mockToDuplicate.request_condition.headers || {},
          body_contains: mockToDuplicate.request_condition.body_contains || null,
          body_contains_required: mockToDuplicate.request_condition.body_contains_required !== false,
          request_body_params: mockToDuplicate.request_condition.request_body_params || [],
          request_body_formdata: mockToDuplicate.request_condition.request_body_formdata || []
        },
        response_config: {
          status_code: mockToDuplicate.response_config.status_code,
          headers: mockToDuplicate.response_config.headers || {},
          body: mockToDuplicate.response_config.body
        },
        delay_ms: mockToDuplicate.delay_ms || 0,
        delay_range_min_ms: mockToDuplicate.delay_range_min_ms,
        delay_range_max_ms: mockToDuplicate.delay_range_max_ms,
        cache_enabled: mockToDuplicate.cache_enabled || false,
        cache_ttl_seconds: mockToDuplicate.cache_ttl_seconds,
        error_simulation_enabled: mockToDuplicate.error_simulation_enabled || false,
        error_simulation_probability: mockToDuplicate.error_simulation_probability,
        error_simulation_status_code: mockToDuplicate.error_simulation_status_code,
        error_simulation_body: mockToDuplicate.error_simulation_body,
        error_simulation_delay_ms: mockToDuplicate.error_simulation_delay_ms
      };
      
      const res = await fetch(`${host}/api/mocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copy)
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Ошибка дублирования");
      }
      message.success("Мок продублирован");
      setDuplicateMockModalOpen(false);
      setMockToDuplicate(null);
      fetchMocks();
    } catch (e) {
      message.error("Не удалось продублировать мок: " + (e.message || "Неизвестная ошибка"));
    }
  };

  const parseCurlCommand = async (curlStr) => {
    try {
      const res = await fetch(`${host}/api/mocks/parse-curl`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ curl_command: curlStr })
      });
      if (!res.ok) throw new Error("Ошибка парсинга curl");
      const parsed = await res.json();
      
      // Заполняем форму данными из curl
      form.setFieldsValue({
        method: parsed.method || "GET",
        path: parsed.path || "/",
        requestHeaders: Object.entries(parsed.headers || {}).map(([key, value]) => ({
          key,
          value: typeof value === 'string' ? value : (value.value || ''),
          optional: typeof value === 'object' && value.optional === true
        })),
        request_body_mode: parsed.body ? "raw" : "none",
        request_body_raw: parsed.body || ""
      });
      
      message.success("Curl команда успешно распарсена");
    } catch (e) {
      message.error("Ошибка парсинга curl команды: " + e.message);
    }
  };

  const buildCurlForMock = mock => {
    if (!mock || !mock.request_condition) return "";
    if (!baseFolderUrl) return "";
    const method = (mock.request_condition.method || "GET").toUpperCase();
    const path = mock.request_condition.path || "/";
    const headers = mock.request_condition.headers || {};
    const bodyContains = mock.request_condition.body_contains || "";

    const normalizedHost = (baseFolderUrl || "").replace(/\/+$/, "");
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${normalizedHost}${normalizedPath}`;

    // Используем формат Postman: --location вместо -X, --header вместо -H
    const parts = [`curl --location '${url}'`];

    let contentType = "";
    let hasContentType = false;
    Object.entries(headers).forEach(([key, value]) => {
      const headerValue = getHeaderValue(value);
      if (key.toLowerCase() === "content-type") {
        contentType = headerValue || "";
        hasContentType = true;
      }
      // Для необязательных заголовков всё равно показываем их в curl (со значением, если оно есть)
      parts.push(`\\\n--header '${key}: ${headerValue}'`);
    });

    // Для GET, HEAD, OPTIONS запросов не добавляем тело (даже если оно указано в моке)
    // Это стандартное поведение HTTP - эти методы обычно не имеют тела
    const methodsWithoutBody = ["GET", "HEAD", "OPTIONS"];
    const shouldIncludeBody = bodyContains && !methodsWithoutBody.includes(method);
    
    if (shouldIncludeBody) {
      // Определяем тип тела запроса по содержимому и заголовкам
      const trimmedBody = bodyContains.trim();
      
      // Проверяем, является ли содержимое JSON (начинается с { или [)
      const isJsonContent = /^[\s]*[{\[]/.test(trimmedBody);
      
      // Проверяем, является ли содержимое URL-encoded форматом (key=value&key2=value2)
      // Но НЕ если это JSON в виде строки
      const isUrlEncodedFormat = !isJsonContent && /^[^=]+=[^&]*(&[^=]+=[^&]*)*$/.test(trimmedBody);
      
      // Проверяем, похоже ли на base64 (только если не JSON и не URL-encoded)
      const isBase64 = !isJsonContent && !isUrlEncodedFormat && 
                       /^[A-Za-z0-9+/=]+$/.test(trimmedBody) && 
                       trimmedBody.length > 50;
      
      const contentTypeLower = contentType.toLowerCase();
      const isFormUrlencodedHeader = /application\/x-www-form-urlencoded/i.test(contentType);
      const isMultipartHeader = /multipart\/form-data/i.test(contentType);
      const isJsonHeader = /application\/json/i.test(contentType);

      // Если это JSON и нет Content-Type, добавляем его
      if ((isJsonContent || isJsonHeader) && !hasContentType) {
        parts.push(`\\\n--header 'Content-Type: application/json'`);
      }

      // ПРИОРИТЕТ 1: Если содержимое - JSON (начинается с { или [), ВСЕГДА используем --data
      // Это важно, даже если заголовок говорит application/x-www-form-urlencoded
      if (isJsonContent || isJsonHeader) {
        // Экранируем кавычки для JSON
        const escapedBody = bodyContains.replace(/'/g, "'\\''");
        parts.push(`\\\n--data '${escapedBody}'`);
      }
      // ПРИОРИТЕТ 2: Если заголовок form-urlencoded И содержимое в формате key=value, используем --data-urlencode
      else if (isFormUrlencodedHeader && isUrlEncodedFormat) {
        const pairs = bodyContains.split("&").filter(Boolean);
        if (pairs.length) {
          pairs.forEach(p => {
            parts.push(`\\\n--data-urlencode '${p}'`);
          });
        } else {
          parts.push(`\\\n--data-urlencode '${bodyContains}'`);
        }
      }
      // ПРИОРИТЕТ 3: Если это multipart/form-data
      else if (isMultipartHeader) {
        // Для multipart лучше использовать --form, но это требует парсинга
        // Пока используем --data
        parts.push(`\\\n--data '${bodyContains.replace(/'/g, "'\\''")}'`);
      }
      // ПРИОРИТЕТ 4: Если это base64 (файл)
      else if (isBase64) {
        parts.push(`\\\n--data-binary '${bodyContains}'`);
      }
      // ПРИОРИТЕТ 5: Для остальных случаев используем --data (raw)
      else {
        const escapedBody = bodyContains.replace(/'/g, "'\\''");
        parts.push(`\\\n--data '${escapedBody}'`);
      }
    }

    return parts.join("");
  };

  const openAddFolder = () => {
    folderForm.resetFields();
    setFolderModalOpen(true);
  };


  const addFolder = async vals => {
    const name = vals.name.trim();
    // Убираем проверку на фронтенде - бэкенд проверит с учетом parent_folder
    try {
      const payload = {
        name: name,
        parent_folder: vals.parent_folder || null
      };
      const res = await fetch(`${host}/api/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Ошибка создания папки");
      }
      message.success("Создано");
      setFolderModalOpen(false);
      folderForm.resetFields();
      await fetchFolders();
      const newFolderKey = getFolderKey(name, vals.parent_folder || null);
      setSelectedFolder(newFolderKey);
      await fetchMocks();
    } catch (e) {
      message.error("Ошибка: " + (e.message || "Не удалось создать папку"));
    }
  };

  const deleteFolder = (name, parentFolder = null) => {
    if (name === "default") return message.warning("Нельзя удалить Главная");
    const folderKey = getFolderKey(name, parentFolder);
    Modal.confirm({
      title: `Удалить страницу ${name === "default" ? "Главная" : name}?`,
      icon: <ExclamationCircleOutlined />,
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          // Передаем составной ключ для правильной идентификации папки/подпапки
          // Для корневых папок (parentFolder = null или '') передаем только name
          // Для подпапок передаем формат "name|parentFolder"
          const folderParam = parentFolder ? `${name}|${parentFolder}` : name;
          const res = await fetch(`${host}/api/folders?name=${encodeURIComponent(folderParam)}`, { method: "DELETE" });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.detail || "Ошибка удаления");
          }
          message.success("Удалено");
          // Если удаляем выбранную папку, переключаемся на default
          // Проверяем оба формата: с getFolderKey и просто имя
          const { name: selectedName, parent_folder: selectedParent } = parseFolderKey(selectedFolder);
          if ((selectedName === name && (selectedParent || '') === (parentFolder || '')) || selectedFolder === name) {
            setSelectedFolder("default");
          }
          fetchFolders();
          fetchMocks();
        } catch (e) {
          message.error("Ошибка: " + (e.message || "Не удалось удалить папку"));
        }
      }
    });
  };


  const clearCacheForMock = async mock => {
    const path = mock?.request_condition?.path || "/";
    try {
      const res = await fetch(`${host}/api/cache?path_prefix=${encodeURIComponent(path)}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error();
      message.success("Кэш для этого пути очищен");
    } catch {
      message.error("Не удалось очистить кэш для этого пути");
    }
  };

  const startDuplicateFolder = name => {
    setFolderToDuplicate(name);
    // Извлекаем только имя папки (без parent_folder, если есть формат "name|parent_folder")
    const { name: folderName } = parseFolderKey(name);
    duplicateForm.setFieldsValue({
      new_name: `${folderName}-copy`
    });
    setDuplicateModalOpen(true);
  };

  const duplicateFolder = async vals => {
    const newName = (vals.new_name || "").trim();
    if (!folderToDuplicate || !newName) {
      setDuplicateModalOpen(false);
      return;
    }
    // Проверяем, не существует ли уже корневая папка с таким именем
    const existingFolder = foldersData.find(f => f.name === newName && !f.parent_folder);
    if (existingFolder) {
      return message.error("Корневая папка с таким именем уже существует");
    }
    try {
      const res = await fetch(`${host}/api/folders/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_name: folderToDuplicate, new_name: newName })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Ошибка дублирования");
      }
      message.success("Страница продублирована");
      setDuplicateModalOpen(false);
      await fetchFolders();
      // Устанавливаем выбранную папку на новую (дублированную) папку
      // Дублирование создает только корневую папку, поэтому используем только имя
      setSelectedFolder(newName);
      await fetchMocks();
    } catch (e) {
      message.error(e.message || "Ошибка дублирования страницы");
    }
  };

  const startRenameFolder = name => {
    setFolderToRename(name);
    // Извлекаем только имя папки для отображения в форме
    const { name: folderName } = parseFolderKey(name);
    renameForm.setFieldsValue({
      new_name: folderName
    });
    setRenameModalOpen(true);
  };

  const renameFolder = async vals => {
    const newName = (vals.new_name || "").trim();
    if (!folderToRename || !newName) {
      setRenameModalOpen(false);
      return;
    }
    // Проверяем, не существует ли уже корневая папка с таким именем
    const { name: oldName, parent_folder } = parseFolderKey(folderToRename);
    if (oldName === newName) {
      setRenameModalOpen(false);
      return;
    }
    const existingFolder = foldersData.find(f => f.name === newName && !f.parent_folder);
    if (existingFolder) {
      return message.error("Корневая папка с таким именем уже существует");
    }
    try {
      const res = await fetch(`${host}/api/folders/${encodeURIComponent(folderToRename)}/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_name: newName })
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || "Ошибка переименования");
      }
      message.success("Страница переименована");
      setRenameModalOpen(false);
      await fetchFolders();
      // Обновляем выбранную папку на новое имя
      // Сохраняем parent_folder, если он был
      const newFolderKey = parent_folder ? `${newName}|${parent_folder}` : newName;
      setSelectedFolder(newFolderKey);
      await fetchMocks();
    } catch (e) {
      message.error(e.message || "Ошибка переименования страницы");
    }
  };

  const isDesktop = screens.md ?? false;
  const stickyTopOffset = isDesktop ? 88 : 64;
  const selectedFolderData = parseFolderKey(selectedFolder);
  const isDefaultFolder = selectedFolderData.name === "default";
  const folderTitle = isDefaultFolder ? "Главная" : selectedFolderData.name;
  // Находим информацию о выбранной папке для получения родительской папки
  const folderData = foldersData.find(f => 
    f.name === selectedFolderData.name && 
    (f.parent_folder || '') === (selectedFolderData.parent_folder || '')
  );
  const parentFolder = folderData?.parent_folder || selectedFolderData.parent_folder;
  const baseFolderUrl = buildFolderHost(host, selectedFolderData.name, parentFolder);
  const primaryButtonStyle = {
    minWidth: isDesktop ? 160 : "calc(50% - 8px)",
    flex: isDesktop ? "0 0 auto" : "1 1 calc(50% - 8px)"
  };

  const themeConfig = {
    algorithm: theme === "dark" ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
    token: {
      colorBgBase: theme === "light" ? "#f0f2f5" : "#141414",
      colorPrimary: theme === "dark" ? "#177ddc" : "#1890ff",
      borderRadius: 8,
    }
  };

  const actionToolbar = (
    <div style={{ position: "sticky", top: stickyTopOffset, zIndex: 10, marginBottom: 24 }}>
      <div style={{
        background: theme === "light" ? "#fff" : "#1f1f1f",
        borderRadius: 12,
        padding: isDesktop ? 20 : 16,
        boxShadow: "0 15px 35px rgba(15,23,42,0.08)",
        display: "flex",
        flexWrap: "wrap",
        gap: 12,
        justifyContent: isDesktop ? "space-between" : "center",
        alignItems: "center"
      }}>
        <div style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 12,
          flex: 1,
          justifyContent: isDesktop ? "flex-start" : "center"
        }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={openAddMock}
            style={primaryButtonStyle}
          >
            Создать mock
          </Button>
          <Button
            icon={<PlusOutlined />}
            onClick={openAddFolder}
            style={primaryButtonStyle}
          >
            Добавить страницу
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={onImportClick}
            style={primaryButtonStyle}
          >
            Импорт
          </Button>
          <Button
            icon={<UploadOutlined />}
            onClick={openOpenapiModal}
            style={primaryButtonStyle}
          >
            Импорт OpenAPI/Swagger
          </Button>
          <Button
            icon={<DownloadOutlined />}
            onClick={exportCurrentFolder}
            style={primaryButtonStyle}
            disabled={!mocks.length}
          >
            Экспорт
          </Button>
          <Button
            icon={<BarChartOutlined />}
            onClick={() => setIsGlobalMetricsModalOpen(true)}
            style={primaryButtonStyle}
          >
            Получить метрики
          </Button>
          <input
            type="file"
            accept="application/json"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
        {!isDefaultFolder && (
          <Button
            danger
            icon={<PoweroffOutlined />}
            onClick={() => deactivateAllMocks(selectedFolder)}
            disabled={!mocks.length}
            style={{ ...primaryButtonStyle, justifySelf: "flex-end" }}
            title="Отключить все моки в текущей папке"
          >
            Отключить все в папке
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <ConfigProvider theme={themeConfig}>
        <Layout style={{ minHeight: "100vh", background: theme === "light" ? "#f0f2f5" : "#141414" }}>
          <Header style={{
            background: theme === "light" ? "#fff" : "#1f1f1f",
            padding: isDesktop ? "0 80px" : "12px 16px",
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            position: "relative",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12, flex: "0 0 auto" }}>
              <Typography.Title level={3} style={{ margin: 0, fontSize: "48px" }}>ᨐᵒᶜᵏ</Typography.Title>
              <Typography.Text type="secondary">mock-сервер</Typography.Text>
            </div>
            <div style={{
              position: "absolute",
              left: "50%",
              transform: "translateX(-50%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center"
            }}>
              <Typography.Text
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  padding: "4px 12px",
                  borderRadius: "4px",
                  backgroundColor: theme === "dark" ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.06)",
                  color: theme === "dark" ? "rgba(255, 255, 255, 0.85)" : "rgba(0, 0, 0, 0.85)"
                }}
              >
                FIX-price
              </Typography.Text>
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flex: isDesktop ? "0 0 420px" : "1 1 100%",
              marginLeft: "auto"
            }}>
              <Typography.Text strong>Бэк:</Typography.Text>
              <Tooltip title="Копировать адрес">
                <Button
                  icon={<CopyOutlined />}
                  onClick={() => copyToClipboard(host)}
                  size="small"
                />
              </Tooltip>
              <Input
                value={host}
                onChange={e => setHost(e.target.value)}
                placeholder="Адрес бэкенда"
                size="small"
                style={{ flex: 1 }}
              />
              <Button
                icon={<BgColorsOutlined />}
                onClick={toggleTheme}
                type="text"
              >
                {theme === "light" ? "Dark" : "Light"}
              </Button>
            </div>
          </Header>

          <Content style={{ padding: isDesktop ? "24px 80px" : "16px" }}>
            {actionToolbar}
            <Layout style={{
              background: "transparent",
              display: "flex",
              flexDirection: isDesktop ? "row" : "column",
              gap: 24,
              height: isDesktop ? "calc(100vh - 200px)" : "auto",
              overflowY: isDesktop ? "auto" : "visible",
              overflowX: "hidden"
            }}>
              <Sider
                width={isDesktop ? 320 : "100%"}
                style={{
                  background: "transparent",
                  marginRight: isDesktop ? 0 : 0,
                  overflowY: isDesktop ? "auto" : "visible",
                  flex: "0 0 auto"
                }}
              >
                <div style={{
                  background: theme === "light" ? "#fff" : "#1f1f1f",
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: "0 12px 30px rgba(15, 23, 42, 0.05)"
                }}>
                  <Typography.Title level={5} style={{ margin: 0, marginBottom: 12 }}>
                    Страницы
                  </Typography.Title>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                    Перетаскивайте, чтобы упорядочить, или удаляйте ненужные.
                  </Typography.Paragraph>
                  <Input
                    placeholder="Поиск папки..."
                    prefix={<SearchOutlined />}
                    value={folderSearchQuery}
                    onChange={(e) => setFolderSearchQuery(e.target.value)}
                    style={{ marginBottom: 16 }}
                    allowClear
                  />
                  {(() => {
                    // Фильтруем папки по поисковому запросу
                    const filteredFoldersData = folderSearchQuery
                      ? foldersData.filter(f => 
                          f.name.toLowerCase().includes(folderSearchQuery.toLowerCase()) ||
                          (f.parent_folder && f.parent_folder.toLowerCase().includes(folderSearchQuery.toLowerCase()))
                        )
                      : foldersData;
                    
                    // Группируем папки по родителям
                    // Сортируем по order для согласованности с moveFolder
                    const rootFolders = filteredFoldersData
                      .filter(f => (!f.parent_folder || f.parent_folder === '') || f.name === "default")
                      .sort((a, b) => {
                        // default всегда первый
                        if (a.name === "default") return -1;
                        if (b.name === "default") return 1;
                        return (a.order || 0) - (b.order || 0);
                      });
                    const foldersByParent = {};
                    filteredFoldersData.forEach(f => {
                      if (f.parent_folder && f.name !== "default") {
                        if (!foldersByParent[f.parent_folder]) {
                          foldersByParent[f.parent_folder] = [];
                        }
                        foldersByParent[f.parent_folder].push(f);
                      }
                    });
                    
                    return rootFolders.map((rootFolder, rootIndex) => {
                      const subFolders = foldersByParent[rootFolder.name] || [];
                      const hasSubfolders = subFolders.length > 0;
                      
                      if (rootFolder.name === "default") {
                        // Для default папки показываем без сворачивания
                        return (
                    <DraggableFolder
                            key={rootFolder.name}
                            folder={rootFolder.name}
                            index={rootIndex}
                      moveFolder={moveFolder}
                      selectedFolder={selectedFolder}
                      setSelectedFolder={setSelectedFolder}
                      deleteFolder={deleteFolder}
                      theme={theme}
                            isSubfolder={false}
                            parentFolder={null}
                            getFolderKey={getFolderKey}
                          />
                        );
                      }
                      
                      // Для остальных папок используем FolderWithSubfolders если есть подпапки
                      if (hasSubfolders) {
                        return (
                          <FolderWithSubfolders
                            key={rootFolder.name}
                            rootFolder={rootFolder}
                            subFolders={subFolders}
                            rootIndex={rootIndex}
                            moveFolder={moveFolder}
                            selectedFolder={selectedFolder}
                            setSelectedFolder={setSelectedFolder}
                            deleteFolder={deleteFolder}
                            theme={theme}
                            foldersData={foldersData}
                            getFolderKey={getFolderKey}
                          />
                        );
                      } else {
                        return (
                          <DraggableFolder
                            key={rootFolder.name}
                            folder={rootFolder.name}
                            index={rootIndex}
                            moveFolder={moveFolder}
                            selectedFolder={selectedFolder}
                            setSelectedFolder={setSelectedFolder}
                            deleteFolder={deleteFolder}
                            theme={theme}
                            isSubfolder={false}
                            parentFolder={null}
                            getFolderKey={getFolderKey}
                          />
                        );
                      }
                    });
                  })()}
                </div>
              </Sider>

              <Content style={{ width: "100%", flex: 1, minHeight: 0, overflowY: isDefaultFolder ? "hidden" : "auto", display: "flex", flexDirection: "column" }}>
                {isDefaultFolder && (
                  <div style={{
                    background: theme === "light" ? "#fff" : "#1f1f1f",
                    borderRadius: 12,
                    padding: isDesktop ? 24 : 16,
                    boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
                    flex: 1,
                    minHeight: 0,
                    overflowY: "auto",
                    overflowX: "hidden"
                  }}
                  className="description-scroll-container"
                  >
                    <Typography.Title level={3} style={{ marginTop: 0 }}>
                      Mock — визуальный mock-сервер и песочница API
                    </Typography.Title>
                    <Typography.Paragraph>
                      Мощный инструмент для создания и управления HTTP моками с удобным веб-интерфейсом. Создавайте моки визуально,
                      группируйте их по папкам и подпапкам, импортируйте из Postman Collection, OpenAPI/Swagger или curl команд.
                      Настраивайте задержки (фиксированные и случайные из диапазона), кэширование ответов, имитацию ошибок с вероятностью,
                      проксирование на реальный backend, rate limiting — всё через удобный интерфейс, без редактирования кода.
                      Система поддерживает все HTTP методы, умные заголовки (обязательные/необязательные), проверку содержимого тела запроса,
                      историю всех запросов, метрики Prometheus и логирование в JSON формате.
                    </Typography.Paragraph>
                    <Typography.Title level={4}>Базовый сценарий</Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      <ol style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                        <li>В поле «Бэк» сверху укажите URL работающего backend-сервера (по умолчанию выведен текущий).</li>
                        <li>Слева создайте страницу (папку) для логической группы моков и выберите её. Страницы можно перетаскивать для изменения порядка.</li>
                        <li>Нажмите «Создать mock» или используйте быстрый импорт из curl команды прямо в форме создания мока.</li>
                        <li>Укажите метод и путь, по которому должны приходить запросы. Можно вставить curl команду — система автоматически извлечёт метод, URL, заголовки и тело запроса.</li>
                        <li>Добавьте условия по заголовкам и/или телу запроса. Заголовки могут быть обязательными (проверяется точное значение) или необязательными (проверяется только наличие).</li>
                        <li>Настройте статус, заголовки и тело ответа (JSON или файл), а также задержку и кэширование.</li>
                        <li>Сохраните мок и убедитесь, что он активен — URL для вызова будет виден как «Базовый URL этой страницы» + путь.</li>
                        <li>Используйте drag-and-drop для изменения порядка моков в таблице — порядок сохраняется автоматически.</li>
                      </ol>
                    </Typography.Paragraph>

                    <Typography.Title level={4} style={{ marginTop: 16 }}>Импорт и экспорт</Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      <ul style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                        <li><b>Импорт из curl команд</b> — в форме создания/редактирования мока есть поле «Импорт из curl».
                            Вставьте curl команду (в том числе многострочную) или нажмите «Из буфера» — система автоматически
                            извлечёт метод, URL, заголовки и тело запроса. Поддерживаются все популярные форматы curl.</li>
                        <li><b>Импорт из Postman Collection</b> — используйте кнопку «Импорт» для загрузки Postman Collection v2.1.
                            Система автоматически создаст страницу и моки по всем запросам из коллекции, включая примеры ответов.</li>
                        <li><b>Импорт из OpenAPI/Swagger</b> — нажмите кнопку «Импорт OpenAPI/Swagger» в верхней панели. Вставьте URL до спецификации
                            (JSON или YAML) или загрузите файл. Система поддерживает <b>OpenAPI 3.x</b> и <b>Swagger 2.0</b> форматы.
                            Автоматически извлекаются примеры запросов и ответов из спецификации. Если примеры не указаны явно,
                            система генерирует их из схем (JSON Schema), создавая готовые моки с реалистичными данными для всех эндпоинтов.</li>
                        <li><b>Экспорт curl</b> — для любого мока можно скопировать готовую curl команду, нажав кнопку «Скопировать curl»
                            в таблице моков. Команда будет корректно сформирована с учётом метода, заголовков и тела запроса.</li>
                      </ul>
                    </Typography.Paragraph>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 8 }}>
                      Советы: создайте отдельную страницу под каждую большую спецификацию или коллекцию. Используйте человекочитаемые
                      имена моков и страниц для быстрой навигации. Клонируйте моки для создания вариаций сценариев — клонированный мок
                      автоматически получит имя с суффиксом "copy" и будет добавлен в конец списка.
                    </Typography.Paragraph>

                    <Typography.Title level={4} style={{ marginTop: 16 }}>Расширенные возможности моков</Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      <ul style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                        <li><b>Умные заголовки</b> — при настройке заголовков запроса можно указать, является ли заголовок обязательным
                            или необязательным. Для необязательных заголовков (переключатель «Авто») проверяется только наличие заголовка,
                            а его значение игнорируется. Это удобно для заголовков, которые автоматически заполняются клиентом или сервером.</li>
                        <li><b>Автоматическая нормализация JSON</b> — система автоматически нормализует JSON в запросах и ответах,
                            убирая лишние пробелы и форматирование. Это гарантирует корректное сопоставление моков даже при различиях
                            в форматировании JSON.</li>
                        <li><b>Кэширование ответов</b> — в настройках мока есть опция «Включить кэширование ответа» и поле «TTL кэша (сек)».
                            Включите её, если хотите, чтобы одинаковые запросы временно обслуживались из кэша без повторной обработки.
                            Статус кэша можно проверить через API <code>GET /api/cache/status</code>.</li>
                        <li><b>Задержки ответа</b> — система поддерживает два способа задания задержки ответа для эмуляции медленных сетей
                            или долгих операций на сервере.
                            <br/><br/>
                            <b>Способ 1: Фиксированная задержка через UI</b><br/>
                            В форме создания/редактирования мока есть поле <b>«Задержка (мс)»</b>. Укажите значение в миллисекундах
                            (например: <code>500</code> для задержки в 0.5 секунды, <code>2000</code> для 2 секунд).
                            <br/><br/>
                            <b>Способ 2: Диапазон задержек в теле ответа</b><br/>
                            Для более реалистичной эмуляции нестабильных сетей можно задать случайную задержку из диапазона.
                            Добавьте в тело ответа специальный блок <code>__delay_range_ms__</code>:
                            <pre style={{ background: theme === "light" ? "#f5f5f5" : "#1f1f1f", padding: "12px", borderRadius: "4px", overflow: "auto", fontSize: "12px" }}>
{`{
  "data": {
    "message": "Успешный ответ"
  },
  "__delay_range_ms__": {
    "min": 100,
    "max": 500
  }
}`}
                            </pre>
                            <b>Параметры:</b>
                            <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                              <li><code>min</code> — минимальная задержка в миллисекундах (обязательный)</li>
                              <li><code>max</code> — максимальная задержка в миллисекундах (обязательный)</li>
                            </ul>
                            При каждом запросе система случайным образом выберет значение задержки от <code>min</code> до <code>max</code> включительно.
                            <br/><br/>
                            <b>Примеры использования:</b>
                            <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                              <li><b>Медленная сеть:</b> <code>{"{"}"min": 1000, "max": 3000{"}"}</code> — задержка от 1 до 3 секунд</li>
                              <li><b>Нестабильная сеть:</b> <code>{"{"}"min": 50, "max": 2000{"}"}</code> — задержка от 50 мс до 2 секунд</li>
                              <li><b>Быстрая, но с вариациями:</b> <code>{"{"}"min": 100, "max": 300{"}"}</code> — задержка от 100 до 300 мс</li>
                            </ul>
                            <b>Приоритет:</b> Если задан диапазон в теле ответа, он имеет приоритет над фиксированной задержкой из UI.
                            Если диапазон не задан или задан некорректно, используется фиксированная задержка из поля «Задержка (мс)».
                        </li>
                        <li><b>Имитация ошибок</b> — система позволяет эмулировать случайные ошибки сервера для тестирования обработки
                            ошибок в клиентском приложении. Добавьте в тело ответа специальный блок <code>__error_simulation__</code>:
                            <pre style={{ background: theme === "light" ? "#f5f5f5" : "#1f1f1f", padding: "12px", borderRadius: "4px", overflow: "auto", fontSize: "12px" }}>
{`{
  "data": {
    "message": "Успешный ответ"
  },
  "__error_simulation__": {
    "probability": 0.3,
    "status_code": 500,
    "delay_ms": 100,
    "body": {
      "error": "Internal Server Error",
      "message": "Произошла случайная ошибка"
    }
  }
}`}
                            </pre>
                            <b>Параметры блока <code>__error_simulation__</code>:</b>
                            <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                              <li><code>probability</code> — вероятность возврата ошибки (от 0.0 до 1.0, обязательный).
                                  <ul style={{ paddingLeft: 20, marginTop: 4 }}>
                                    <li><code>0.0</code> — ошибка никогда не возвращается (функция отключена)</li>
                                    <li><code>0.1</code> — ошибка возвращается в 10% запросов</li>
                                    <li><code>0.5</code> — ошибка возвращается в 50% запросов</li>
                                    <li><code>1.0</code> — ошибка возвращается всегда (100% запросов)</li>
                                  </ul>
                              </li>
                              <li><code>status_code</code> — HTTP статус-код ошибки (по умолчанию: <code>500</code>, опциональный).
                                  Может быть любым кодом ошибки: <code>400</code>, <code>401</code>, <code>403</code>, <code>404</code>,
                                  <code>500</code>, <code>502</code>, <code>503</code> и т.д.</li>
                              <li><code>delay_ms</code> — дополнительная задержка перед возвратом ошибки в миллисекундах (по умолчанию: <code>0</code>, опциональный).
                                  Полезно для эмуляции таймаутов или медленных ошибок.</li>
                              <li><code>body</code> — тело ответа при ошибке (по умолчанию: <code>{"{"}"error": "simulated error"{"}"}</code>, опциональный).
                                  Может быть любым JSON объектом. В теле ошибки также работают плейсхолдеры.</li>
                            </ul>
                            <br/>
                            <b>Примеры использования:</b>
                            <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                              <li><b>Редкие ошибки сервера (5%):</b>
                                <pre style={{ background: theme === "light" ? "#f5f5f5" : "#1f1f1f", padding: "8px", borderRadius: "4px", overflow: "auto", fontSize: "11px", marginTop: 4 }}>
{`"__error_simulation__": {
  "probability": 0.05,
  "status_code": 500,
  "body": {"error": "Временная ошибка сервера"}
}`}
                                </pre>
                              </li>
                              <li><b>Частые таймауты (30%):</b>
                                <pre style={{ background: theme === "light" ? "#f5f5f5" : "#1f1f1f", padding: "8px", borderRadius: "4px", overflow: "auto", fontSize: "11px", marginTop: 4 }}>
{`"__error_simulation__": {
  "probability": 0.3,
  "status_code": 504,
  "delay_ms": 5000,
  "body": {"error": "Gateway Timeout", "message": "Сервер не ответил вовремя"}
}`}
                                </pre>
                              </li>
                              <li><b>Случайные 404 ошибки (20%):</b>
                                <pre style={{ background: theme === "light" ? "#f5f5f5" : "#1f1f1f", padding: "8px", borderRadius: "4px", overflow: "auto", fontSize: "11px", marginTop: 4 }}>
{`"__error_simulation__": {
  "probability": 0.2,
  "status_code": 404,
  "body": {"error": "Not Found", "path": "` + "{path}" + `"}
}`}
                                </pre>
                              </li>
                            </ul>
                            <b>Как это работает:</b> При каждом запросе система генерирует случайное число от 0 до 1. Если это число меньше
                            значения <code>probability</code>, возвращается ошибка с указанным статус-кодом и телом. В противном случае
                            возвращается обычный успешный ответ. Это позволяет тестировать устойчивость клиентского приложения к ошибкам.
                        </li>
                        <li><b>Файловые ответы</b> — выберите тип ответа «Файл» и загрузите нужный файл прямо из формы.
                            Сервис сам сформирует корректные заголовки для скачивания, включая поддержку кириллицы в именах файлов.</li>
                        <li><b>Управление порядком</b> — моки можно перетаскивать в таблице для изменения порядка отображения.
                            Порядок сохраняется автоматически и не меняется при редактировании мока.</li>
                      </ul>
                    </Typography.Paragraph>

                    <Typography.Title level={4} style={{ marginTop: 16 }}>Прокси, редиректы и безопасность</Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      <ul style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                        <li><b>Прокси-режим</b> настраивается для каждой страницы через кнопку «Настройки proxy»:
                            укажите базовый URL реального backend'а. Если подходящего мока для запроса нет,
                            запрос будет автоматически проксирован туда.</li>
                        <li><b>Редиректы</b> при проксировании автоматически «приземляются» на текущий mock-сервер,
                            чтобы цепочки переходов не уводили вас на другой домен.</li>
                        <li><b>Безопасность</b> — все вызовы UI идут только на указанный в поле «Бэк» адрес и текущий
                            mock-сервер; настройку ограничения размеров и хостов прокси можно считать уже встроенной.</li>
                      </ul>
                    </Typography.Paragraph>

                    <Typography.Title level={4} style={{ marginTop: 16 }}>Кэш, метрики и история вызовов</Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      <ul style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                        <li><b>Кэш на уровне мока</b> вы включаете прямо в форме мока — это удобно для эндпоинтов,
                            где ответ редко меняется и важно тестировать работу клиентов с кэшем. TTL задаётся в секундах
                            через поле <code>__cache_ttl__</code> в теле ответа или через UI.</li>
                        <li><b>Управление кэшем</b> — в таблице моков доступны действия, позволяющие очистить кэш
                            для конкретного пути (кнопка «Кэш» в строке мока). Также доступны API endpoints:
                            <code>GET /api/cache/status</code> для проверки состояния кэша и
                            <code>DELETE /api/cache/clear</code> для очистки (с опциональными фильтрами по папке и ключу кэша).
                            В детальной истории вызовов можно сбросить кэш для конкретного запроса прямо из таблицы.</li>
                        <li><b>Детальная история вызовов</b> — система сохраняет информацию о каждом вызове метода в отдельную запись.
                            В модальном окне метрик доступна таблица «Детальная история вызовов», которая показывает:
                            <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                              <li>Время вызова (с точностью до миллисекунд)</li>
                              <li>HTTP метод (GET, POST, PUT, DELETE и т.д.)</li>
                              <li>Путь запроса</li>
                              <li>Был ли запрос проксирован (Да/Нет)</li>
                              <li>Время ответа в миллисекундах</li>
                              <li>TTL кэша (если использовался) с возможностью сброса</li>
                              <li>HTTP статус код ответа</li>
                            </ul>
                            Каждый вызов метода, даже если он один и тот же, отображается как отдельная строка с полной информацией.
                            История вызовов можно очистить через кнопку «Очистить историю» в модальном окне метрик.</li>
                        <li><b>Метрики Prometheus</b> — сервер экспортирует метрики в формате Prometheus по адресу
                            <code>/metrics</code>, включая количество запросов, попаданий в кэш, время ответа и другие.
                            Также доступны структурированные метрики через API endpoints:
                            <code>GET /api/metrics/folder/{'{folder}'}</code> для метрик конкретной папки и
                            <code>GET /api/metrics/global</code> для метрик всего сервиса.</li>
                        <li><b>Ограничения и нагрузка</b> — сервер следит за частотой запросов и размерами тела;
                            для повседневной работы об этом можно не думать, но при нагрузочном тестировании
                            эти ограничения помогут не «убить» окружение.</li>
                      </ul>
                    </Typography.Paragraph>

                    <Typography.Title level={4} style={{ marginTop: 16 }}>Управление и организация</Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      <ul style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                        <li><b>Организация моков</b> — моки можно перетаскивать в таблице для изменения порядка отображения.
                            Порядок сохраняется автоматически и не меняется при редактировании. При клонировании мока
                            он автоматически получает имя с суффиксом "copy" и добавляется в конец списка.</li>
                        <li><b>Клонирование моков</b> — используйте кнопку «Дублировать» в таблице моков для быстрого
                            создания копии мока с теми же настройками. Клонированный мок можно затем отредактировать
                            для создания вариаций сценариев.</li>
                        <li><b>Дублирование страниц</b> — через кнопку «Дублировать страницу» можно быстро
                            скопировать целый набор моков и адаптировать его под новый сценарий.</li>
                        <li><b>Фильтрация системных заголовков</b> — система автоматически игнорирует системные заголовки
                            (Accept-Encoding, Connection, User-Agent, Host, Content-Length и др.) при импорте и сопоставлении,
                            чтобы избежать ложных несовпадений из-за автоматически добавляемых заголовков.</li>
                        <li><b>Темы и удобство</b> — переключайте светлую/тёмную тему, перетаскивайте страницы и моки,
                            давайте понятные имена — всё это помогает держать сложные сценарии в порядке.</li>
                      </ul>
                    </Typography.Paragraph>
                  </div>
                )}

                {!isDefaultFolder && (
                  <div style={{
                    background: theme === "light" ? "#fff" : "#1f1f1f",
                    borderRadius: 12,
                    padding: isDesktop ? 24 : 16,
                    boxShadow: "0 12px 30px rgba(15,23,42,0.05)"
                  }}>
                    <div style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 8,
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 16
                    }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                      <Typography.Title level={4} style={{ margin: 0 }}>
                        {folderTitle}
                      </Typography.Title>
                        <Input
                          placeholder="Поиск мока по наименованию..."
                          prefix={<SearchOutlined />}
                          value={mockSearchQuery}
                          onChange={(e) => setMockSearchQuery(e.target.value)}
                          style={{ width: 300 }}
                          allowClear
                        />
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                        <Typography.Text type="secondary">
                          {(() => {
                            const filteredMocks = mockSearchQuery
                              ? mocks.filter(m => 
                                  (m.name || "").toLowerCase().includes(mockSearchQuery.toLowerCase())
                                )
                              : mocks;
                            return filteredMocks.length ? `${filteredMocks.length} мок(ов)` : "Пока нет моков";
                          })()}
                        </Typography.Text>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                              Базовый URL этой страницы: {baseFolderUrl || "—"}
                            </Typography.Text>
                            {baseFolderUrl && (
                              <Tooltip title="Копировать базовый URL">
                                <Button
                                  size="small"
                                  icon={<CopyOutlined />}
                                  type="text"
                                  onClick={() => copyToClipboard(baseFolderUrl)}
                                />
                              </Tooltip>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: 8 }}>
                            <Button size="small" onClick={openFolderSettings}>
                              Настройки proxy
                            </Button>
                            <Button
                              size="small"
                              icon={<EditOutlined />}
                              onClick={() => startRenameFolder(selectedFolder)}
                            >
                              Переименовать
                            </Button>
                            <Button
                              size="small"
                              onClick={() => startDuplicateFolder(selectedFolder)}
                            >
                              Дублировать страницу
                            </Button>
                            <Button
                              size="small"
                              icon={<BarChartOutlined />}
                              onClick={async () => {
                                setIsMetricsModalOpen(true);
                                await loadMetrics();
                              }}
                            >
                              Получить метрики
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <Table
                      dataSource={mockSearchQuery
                        ? mocks.filter(m => 
                            (m.name || "").toLowerCase().includes(mockSearchQuery.toLowerCase())
                          )
                        : mocks}
                      rowKey="id"
                      size="middle"
                      pagination={false}
                      components={{
                        body: {
                          row: (props) => {
                            const index = mocks.findIndex(m => m.id === props['data-row-key']);
                            return <DraggableMockRow {...props} index={index} moveMock={moveMock} />;
                          }
                        }
                      }}
                      columns={[
                        {
                          title: "",
                          width: 40,
                          render: () => <MenuOutlined style={{ color: theme === "dark" ? "#999" : "#999", cursor: 'grab' }} />
                        },
                        {
                          title: "№",
                          width: 60,
                          render: (_, __, index) => index + 1
                        },
                        {
                          title: "Активно",
                          dataIndex: "active",
                          width: 90,
                          render: (a, r) => (
                            <Switch
                              checked={a !== false}
                              onChange={ch => toggleMockActive(r.id, ch)}
                            />
                          )
                        },
                        { title: "Наименование", dataIndex: "name", ellipsis: true },
                        { title: "Метод", dataIndex: ["request_condition", "method"], width: 90 },
                        { title: "Путь", dataIndex: ["request_condition", "path"], ellipsis: true },
                        { title: "Код", dataIndex: ["response_config", "status_code"], width: 90 },
                        {
                          title: "Настройки",
                          width: 300,
                          render: (_, r) => {
                            const delayInfo = r.delay_range_min_ms != null && r.delay_range_max_ms != null 
                              ? `${r.delay_range_min_ms}-${r.delay_range_max_ms} мс`
                              : r.delay_ms ? `${r.delay_ms} мс` : '—';
                            const cacheInfo = r.cache_enabled && r.cache_ttl_seconds 
                              ? `Кэш: ${r.cache_ttl_seconds}с`
                              : '—';
                            const errorInfo = r.error_simulation_enabled && r.error_simulation_probability != null
                              ? `Ошибка: ${(Number(r.error_simulation_probability) * 100).toFixed(0)}%`
                              : '—';
                            return (
                              <div style={{ fontSize: 11, lineHeight: 1.6 }}>
                                <div><strong>Задержка:</strong> {delayInfo}</div>
                                <div><strong>Кэш:</strong> {cacheInfo}</div>
                                <div><strong>Ошибки:</strong> {errorInfo}</div>
                              </div>
                            );
                          }
                        },
                        {
                          title: "Действия",
                          width: 200,
                          render: (_, r) => (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              <Tooltip title="Редактировать">
                                <Button
                                  size="small"
                                  type="text"
                                  icon={<EditOutlined />}
                                  onClick={() => openEditMock(r)}
                                />
                              </Tooltip>
                              <Tooltip title="Дублировать">
                                <Button
                                  size="small"
                                  type="text"
                                  icon={<CopyOutlined />}
                                  onClick={() => startDuplicateMock(r)}
                                />
                              </Tooltip>
                              <Tooltip title="Скопировать curl">
                                <Button
                                  size="small"
                                  type="text"
                                  icon={<SnippetsOutlined />}
                                  onClick={() => copyToClipboard(buildCurlForMock(r))}
                                />
                              </Tooltip>
                              <Tooltip title="Очистить кэш для этого пути">
                                <Button
                                  size="small"
                                  type="text"
                                  onClick={() => clearCacheForMock(r)}
                                >
                                  Кэш
                                </Button>
                              </Tooltip>
                              <Tooltip title="Удалить">
                                <Button
                                  size="small"
                                  type="text"
                                  danger
                                  icon={<DeleteOutlined />}
                                  onClick={() => deleteMock(r.id)}
                                />
                              </Tooltip>
                            </div>
                          )
                        }
                      ]}
                      scroll={{ x: 700 }}
                    />
                  </div>
                )}
              </Content>
            </Layout>
          </Content>

          <Modal
            title={editing ? "Редактировать мок" : "Создать мок"}
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={() => form.submit()}
            width={1600}
            bodyStyle={{ maxHeight: "80vh", overflowY: "auto", padding: "24px" }}
            destroyOnClose
          >
            <Form
              form={form}
              layout="vertical"
              onFinish={saveMock}
              initialValues={{
                folder: selectedFolder,
                method: "GET",
                status_code: 200,
                active: true,
                requestHeaders: [{ key: "", value: "", optional: false }],
                request_body_mode: "none",
                request_body_raw: "",
                request_body_params: [{ key: "", value: "" }],
                request_body_formdata: [{ key: "", value: "" }],
                responseHeaders: [{ key: "", value: "" }],
                response_type: "json",
                delay_ms: 0,
                delay_range_min_ms: undefined,
                delay_range_max_ms: undefined,
                cache_enabled: false,
                cache_ttl: undefined,
                error_simulation_enabled: false,
                error_simulation_probability: undefined,
                error_simulation_status_code: undefined,
                error_simulation_body: undefined,
                error_simulation_delay_ms: undefined
              }}
            >
              <Form.Item name="id" hidden><Input /></Form.Item>

              <Row gutter={16} style={{ marginBottom: 16 }}>
                <Col span={12}>
                  <Form.Item name="folder" label="Папка" rules={[{ required: true }]}>
                    <Select options={folders.map(f => ({
                      label: f === "default" ? "Главная" : f,
                      value: f
                    }))} />
                  </Form.Item>
                </Col>
                <Col span={12}>
                  <Form.Item name="name" label="Наименование">
                    <Input placeholder="Например: Успешный ответ /users" />
                  </Form.Item>
                </Col>
              </Row>

              <Divider style={{ margin: "16px 0" }} />

              <Row gutter={24}>
                <Col span={8}>
                  <div style={{ 
                    padding: "16px", 
                    background: theme === "light" ? "#fafafa" : "#1f1f1f",
                    borderRadius: 8,
                    border: `1px solid ${theme === "light" ? "#d9d9d9" : "#434343"}`,
                    height: "100%"
                  }}>
                    <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
                      Настройки запроса
                    </Typography.Title>

                    <Form.Item label="Импорт из curl" style={{ marginBottom: 16 }}>
                      <Input.Group compact style={{ display: "flex", gap: 8 }}>
                        <TextArea
                          placeholder="Вставьте curl команду здесь..."
                          rows={3}
                          style={{ flex: 1 }}
                          onPaste={async (e) => {
                            const text = e.clipboardData.getData('text');
                            if (text.trim().toLowerCase().startsWith('curl')) {
                              e.preventDefault();
                              await parseCurlCommand(text);
                            }
                          }}
                        />
                        <Button
                          type="primary"
                          onClick={async () => {
                            try {
                              const text = await navigator.clipboard.readText();
                              if (text.trim().toLowerCase().startsWith('curl')) {
                                await parseCurlCommand(text);
                              } else {
                                message.warning("Буфер обмена не содержит curl команду");
                              }
                            } catch (e) {
                              message.error("Не удалось прочитать буфер обмена");
                            }
                          }}
                        >
                          Из буфера
                        </Button>
                      </Input.Group>
                    </Form.Item>

                    <Form.Item label="Метод и путь" required>
                      <Input.Group compact style={{ display: "flex", gap: 8 }}>
                        <Form.Item name="method" noStyle rules={[{ required: true }]}>
                          <Select options={METHODS.map(m => ({ label: m, value: m }))} style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name="path" noStyle rules={[{ required: true }]}>
                          <Input style={{ flex: 1 }} placeholder="/path" />
                        </Form.Item>
                      </Input.Group>
                    </Form.Item>

                    <Form.List name="requestHeaders">
                      {(fields, { add, remove }) => (
                        <>
                          <Typography.Text strong>Заголовки запроса</Typography.Text>
                          {fields.map(field => (
                            <HeaderRow 
                              key={field.key} 
                              field={field} 
                              remove={remove} 
                              fieldsLength={fields.length}
                              form={form}
                            />
                          ))}
                          <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ key: "", value: "", optional: false })} style={{ marginTop: 8 }}>
                            Добавить заголовок
                          </Button>
                        </>
                      )}
                    </Form.List>

                    <Form.Item label="Тип запроса" name="request_body_mode" style={{ marginTop: 16 }}>
                      <Select
                        options={REQUEST_BODY_MODES}
                      />
                    </Form.Item>

                    <Form.Item
                      noStyle
                      shouldUpdate={(prev, cur) =>
                        prev.request_body_mode !== cur.request_body_mode
                      }
                    >
                      {({ getFieldValue }) => {
                        const mode = getFieldValue("request_body_mode") || "none";
                        if (mode !== "none") {
                          return (
                            <Form.Item
                              name="body_contains_required"
                              valuePropName="checked"
                              style={{ marginTop: 8 }}
                            >
                              <Checkbox>
                                Обязательно проверять запрос
                              </Checkbox>
                            </Form.Item>
                          );
                        }
                        return null;
                      }}
                    </Form.Item>

                    <Form.Item label="Тело запроса" style={{ marginTop: 16 }}>
                      <Form.Item
                        noStyle
                        shouldUpdate={(prev, cur) =>
                          prev.request_body_mode !== cur.request_body_mode
                        }
                      >
                        {({ getFieldValue }) => {
                          const mode = getFieldValue("request_body_mode") || "none";
                          
                          if (mode === "none") {
                            return <Typography.Text type="secondary">Без тела запроса</Typography.Text>;
                          }
                          
                          if (mode === "urlencoded") {
                            return (
                              <Form.List name="request_body_params">
                                {(fields, { add, remove }) => (
                                  <>
                                    {fields.map(field => (
                                      <Form.Item key={field.key} style={{ marginTop: 8 }}>
                                        <Input.Group
                                          compact
                                          style={{ display: "flex", gap: 8 }}
                                        >
                                          <Form.Item
                                            {...field}
                                            name={[field.name, "key"]}
                                            noStyle
                                          >
                                            <Input
                                              placeholder="Ключ"
                                              style={{ width: "40%" }}
                                            />
                                          </Form.Item>
                                          <Form.Item
                                            {...field}
                                            name={[field.name, "value"]}
                                            noStyle
                                          >
                                            <Input
                                              placeholder="Значение"
                                              style={{ flex: 1 }}
                                            />
                                          </Form.Item>
                                          {fields.length > 1 && (
                                            <MinusCircleOutlined
                                              onClick={() => remove(field.name)}
                                              style={{ color: "red", fontSize: 20, cursor: 'pointer' }}
                                            />
                                          )}
                                        </Input.Group>
                                      </Form.Item>
                                    ))}
                                    <Button
                                      type="dashed"
                                      block
                                      icon={<PlusOutlined />}
                                      onClick={() => add()}
                                      style={{ marginTop: 8 }}
                                    >
                                      Добавить параметр
                                    </Button>
                                  </>
                                )}
                              </Form.List>
                            );
                          }
                          
                          if (mode === "form-data") {
                            return (
                              <Form.List name="request_body_formdata">
                                {(fields, { add, remove }) => (
                                  <>
                                    {fields.map(field => (
                                      <Form.Item key={field.key} style={{ marginTop: 8 }}>
                                        <Input.Group
                                          compact
                                          style={{ display: "flex", gap: 8 }}
                                        >
                                          <Form.Item
                                            {...field}
                                            name={[field.name, "key"]}
                                            noStyle
                                          >
                                            <Input
                                              placeholder="Ключ"
                                              style={{ width: "40%" }}
                                            />
                                          </Form.Item>
                                          <Form.Item
                                            {...field}
                                            name={[field.name, "value"]}
                                            noStyle
                                          >
                                            <Input
                                              placeholder="Значение"
                                              style={{ flex: 1 }}
                                            />
                                          </Form.Item>
                                          {fields.length > 1 && (
                                            <MinusCircleOutlined
                                              onClick={() => remove(field.name)}
                                              style={{ color: "red", fontSize: 20, cursor: 'pointer' }}
                                            />
                                          )}
                                        </Input.Group>
                                      </Form.Item>
                                    ))}
                                    <Button
                                      type="dashed"
                                      block
                                      icon={<PlusOutlined />}
                                      onClick={() => add()}
                                      style={{ marginTop: 8 }}
                                    >
                                      Добавить поле
                                    </Button>
                                  </>
                                )}
                              </Form.List>
                            );
                          }
                          
                          if (mode === "file") {
                            return (
                              <>
                                <Form.Item
                                  label="Файл для тела запроса"
                                  tooltip="Можно загрузить файл, его содержимое будет подставлено в тело запроса при проверке условия"
                                >
                                  <Button
                                    type="dashed"
                                    onClick={() => requestFileInputRef.current?.click()}
                                    block
                                  >
                                    {requestFile ? requestFile.name : "Выбрать файл"}
                                  </Button>
                                  <input
                                    type="file"
                                    ref={requestFileInputRef}
                                    style={{ display: "none" }}
                                    onChange={handleRequestFileUpload}
                                  />
                                </Form.Item>
                                {requestFile && (
                                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                                    Файл: {requestFile.name} ({(requestFile.size / 1024).toFixed(2)} KB)
                                  </Typography.Text>
                                )}
                              </>
                            );
                          }
                          
                          return (
                            <Form.Item
                              name="request_body_raw"
                              tooltip="Если заполнено, мок сработает только когда тело содержит эту строку / JSON"
                            >
                              <TextArea rows={3} placeholder='Например {{"user":"123"}}' />
                            </Form.Item>
                          );
                        }}
                      </Form.Item>
                    </Form.Item>
                  </div>
                </Col>

                <Col span={8}>
                  <div style={{ 
                    padding: "16px", 
                    background: theme === "light" ? "#fafafa" : "#1f1f1f",
                    borderRadius: 8,
                    border: `1px solid ${theme === "light" ? "#d9d9d9" : "#434343"}`,
                    height: "100%"
                  }}>
                    <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
                      Настройки ответа
                    </Typography.Title>

                    <Form.Item name="status_code" label="HTTP статус" rules={[{ required: true }]}>
                      <Select 
                        options={HTTP_STATUSES} 
                        onChange={handleStatusChange}
                        showSearch
                        filterOption={(input, option) =>
                          (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                        }
                      />
                    </Form.Item>

                    <Form.List name="responseHeaders">
                      {(fields, { add, remove }) => (
                        <>
                          <Typography.Text strong>Заголовки ответа</Typography.Text>
                          {fields.map(field => (
                            <Form.Item key={field.key} style={{ marginTop: 8 }}>
                              <Input.Group compact style={{ display: "flex", gap: 8 }}>
                                <Form.Item {...field} name={[field.name, 'key']} noStyle>
                                  <Input placeholder="Ключ" style={{ width: '35%' }} />
                                </Form.Item>
                                <Form.Item {...field} name={[field.name, 'value']} noStyle>
                                  <Input placeholder="Значение" style={{ flex: 1 }} />
                                </Form.Item>
                                {fields.length > 1 && (
                                  <MinusCircleOutlined
                                    onClick={() => remove(field.name)}
                                    style={{ color: 'red', fontSize: 20, cursor: 'pointer' }}
                                  />
                                )}
                              </Input.Group>
                            </Form.Item>
                          ))}
                          <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add()} style={{ marginTop: 8 }}>
                            Добавить заголовок
                          </Button>
                        </>
                      )}
                    </Form.List>

                    <Form.Item label="Тип ответа" name="response_type" style={{ marginTop: 16 }}>
                      <Select
                        options={[
                          { label: "JSON", value: "json" },
                          { label: "Файл (изображение, CSV, XML, JSON и т.п.)", value: "file" }
                        ]}
                      />
                    </Form.Item>

                    <Form.Item label="Тело ответа" required style={{ marginTop: 16 }}>
                      <Form.Item noStyle shouldUpdate={(prev, cur) => prev.response_type !== cur.response_type}>
                        {({ getFieldValue }) => {
                          const type = getFieldValue("response_type") || "json";

                          return (
                            <>
                              <Form.Item
                                name="response_body"
                                style={{ marginBottom: 8 }}
                                rules={[{ required: true, message: "Укажите тело ответа" }]}
                              >
                                <TextArea
                                  rows={6}
                                  placeholder={
                                    type === "json"
                                      ? '{{"message":"ok"}}'
                                      : '{{"__file__":true,"filename":"file.png","mime_type":"image/png","data_base64":"..."}}'
                                  }
                                />
                              </Form.Item>
                              {type === "file" && (
                                <>
                                  <Button
                                    type="dashed"
                                    onClick={() => responseFileInputRef.current?.click()}
                                  >
                                    Загрузить файл для ответа
                                  </Button>
                                  <input
                                    type="file"
                                    ref={responseFileInputRef}
                                    style={{ display: "none" }}
                                    onChange={handleResponseFileUpload}
                                  />
                                </>
                              )}
                            </>
                          );
                        }}
                      </Form.Item>
                    </Form.Item>
                  </div>
                </Col>

                <Col span={8}>
                  <div style={{ 
                    padding: "16px", 
                    background: theme === "light" ? "#fafafa" : "#1f1f1f",
                    borderRadius: 8,
                    border: `1px solid ${theme === "light" ? "#d9d9d9" : "#434343"}`,
                    height: "100%"
                  }}>
                    <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
                      Дополнительные параметры
                    </Typography.Title>

                    <Divider style={{ marginTop: 0, marginBottom: 16 }}>Задержки</Divider>

                    <Form.Item label="Задержка ответа (мс)" name="delay_ms" style={{ marginTop: 16 }}>
                      <Input type="number" min={0} placeholder="Фиксированная задержка, например 500" />
                    </Form.Item>

                    <Form.Item label="Диапазон задержки (мс)" style={{ marginTop: 16 }}>
                      <Row gutter={8}>
                        <Col span={12}>
                          <Form.Item name="delay_range_min_ms" noStyle>
                            <Input type="number" min={0} placeholder="Мин. (например 100)" />
                          </Form.Item>
                        </Col>
                        <Col span={12}>
                          <Form.Item name="delay_range_max_ms" noStyle>
                            <Input type="number" min={0} placeholder="Макс. (например 500)" />
                          </Form.Item>
                        </Col>
                      </Row>
                      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                        Если указан диапазон, будет использоваться случайная задержка из диапазона вместо фиксированной
                      </Typography.Text>
                    </Form.Item>

                    <Divider style={{ marginTop: 16 }}>Кэширование</Divider>

                    <Form.Item name="cache_enabled" valuePropName="checked" style={{ marginTop: 16 }}>
                      <Checkbox>Включить кэширование ответа</Checkbox>
                    </Form.Item>

                    <Form.Item
                      label="TTL кэша (сек)"
                      name="cache_ttl"
                      tooltip="Через сколько секунд кэш для этого мока будет считаться устаревшим"
                    >
                      <Input type="number" min={0} placeholder="Например 60" />
                    </Form.Item>

                    <Divider style={{ marginTop: 16 }}>Имитация ошибок</Divider>

                    <Form.Item name="error_simulation_enabled" valuePropName="checked" style={{ marginTop: 16 }}>
                      <Checkbox>Включить имитацию ошибок</Checkbox>
                    </Form.Item>

                    <Form.Item
                      label="Вероятность ошибки (0.0 - 1.0)"
                      name="error_simulation_probability"
                      tooltip="Вероятность возврата ошибки при каждом запросе (0.0 = никогда, 1.0 = всегда)"
                    >
                      <Input type="number" min={0} max={1} step={0.01} placeholder="Например 0.1 для 10%" />
                    </Form.Item>

                    <Form.Item
                      label="Статус код ошибки"
                      name="error_simulation_status_code"
                    >
                      <Select
                        placeholder="Выберите код ошибки"
                        showSearch
                        optionFilterProp="children"
                        onChange={(value) => {
                          const errorCode = ERROR_STATUS_CODES.find(e => e.value === value);
                          if (errorCode) {
                            form.setFieldsValue({
                              error_simulation_body: JSON.stringify(errorCode.body, null, 2)
                            });
                          }
                        }}
                      >
                        {ERROR_STATUS_CODES.map(code => (
                          <Select.Option key={code.value} value={code.value}>
                            {code.label}
                          </Select.Option>
                        ))}
                      </Select>
                    </Form.Item>

                    <Form.Item
                      label="Тело ответа при ошибке (JSON)"
                      name="error_simulation_body"
                    >
                      <TextArea 
                        rows={4} 
                        placeholder='{"error": "simulated error", "message": "Something went wrong"}' 
                      />
                    </Form.Item>

                    <Form.Item
                      label="Задержка перед ошибкой (мс)"
                      name="error_simulation_delay_ms"
                    >
                      <Input type="number" min={0} placeholder="Например 1000" />
                    </Form.Item>
                  </div>
                </Col>
              </Row>
            </Form>
          </Modal>

          <Modal
            title="Создать страницу"
            open={isFolderModalOpen}
            onCancel={() => setFolderModalOpen(false)}
            footer={null}
            destroyOnClose
          >
            <Form form={folderForm} onFinish={addFolder} layout="vertical">
              <Form.Item
                name="name"
                label="Имя страницы"
                rules={[
                  { required: true, message: "Введите имя страницы" }
                  // Убираем проверку на дубликаты - бэкенд проверит с учетом parent_folder
                ]}
              >
                <Input placeholder="Например lost" />
              </Form.Item>
              <Form.Item
                name="parent_folder"
                label="Родительская папка (опционально)"
                tooltip="Выберите родительскую папку для создания вложенной папки. Если не указано, создаётся корневая папка."
              >
                <Select
                  placeholder="Выберите родительскую папку (необязательно)"
                  allowClear
                  options={foldersData
                    .filter(f => f.name !== "default" && !f.parent_folder)
                    .map(f => ({ label: f.name, value: f.name }))}
                />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>Создать</Button>
              </Form.Item>
            </Form>
          </Modal>


          <Modal
            title="Импорт OpenAPI/Swagger"
            open={isOpenapiModalOpen}
            onCancel={() => setOpenapiModalOpen(false)}
            footer={null}
            destroyOnClose
          >
            <Form form={openapiForm} onFinish={handleOpenapiImport} layout="vertical">
              <Form.Item
                name="url"
                label="URL OpenAPI/Swagger (JSON/YAML)"
                rules={[{ required: true, message: "Введите URL OpenAPI/Swagger" }]}
                help="Поддерживаются OpenAPI 3.x и Swagger 2.0 форматы"
              >
                <Input placeholder="https://example.com/openapi.json" />
              </Form.Item>
              <Form.Item
                name="spec_name"
                label="Имя спецификации (опционально)"
              >
                <Input placeholder="Например Payments API" />
              </Form.Item>
              <Form.Item
                name="target_folder"
                label="Выберите папку для импорта"
                rules={[{ required: true, message: "Выберите папку" }]}
                tooltip="Моки будут импортированы в выбранную папку или подпапку"
              >
                <Select
                  placeholder="Выберите папку или подпапку"
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {foldersData
                    .filter(f => f.name === "default" ? !f.parent_folder : true)
                    .sort((a, b) => {
                      if (!a.parent_folder && b.parent_folder) return -1;
                      if (a.parent_folder && !b.parent_folder) return 1;
                      if (!a.parent_folder && !b.parent_folder) {
                        if (a.name === "default") return -1;
                        if (b.name === "default") return 1;
                        return a.name.localeCompare(b.name);
                      }
                      if (a.parent_folder !== b.parent_folder) {
                        return a.parent_folder.localeCompare(b.parent_folder);
                      }
                      return a.name.localeCompare(b.name);
                    })
                    .map(f => {
                      const folderKey = getFolderKey(f.name, f.parent_folder);
                      const displayName = f.name === "default" 
                        ? "Главная" 
                        : f.parent_folder 
                          ? `${f.parent_folder} / ${f.name}` 
                          : f.name;
                      return (
                        <Select.Option key={folderKey} value={folderKey}>
                          {displayName}
                        </Select.Option>
                      );
                    })}
                </Select>
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  Импортировать
                </Button>
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title="Импорт Postman Collection"
            open={isPostmanImportModalOpen}
            onCancel={() => {
              setPostmanImportModalOpen(false);
              setPostmanFileToImport(null);
            }}
            footer={null}
            destroyOnClose
          >
            <Form form={postmanImportForm} onFinish={handlePostmanImport} layout="vertical">
              <Form.Item label="Файл">
                <Typography.Text>{postmanFileToImport?.name || "Файл не выбран"}</Typography.Text>
              </Form.Item>
              <Form.Item
                name="target_folder"
                label="Выберите папку для импорта"
                rules={[{ required: true, message: "Выберите папку" }]}
                tooltip="Моки будут импортированы в выбранную папку или подпапку"
              >
                <Select
                  placeholder="Выберите папку или подпапку"
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {foldersData
                    .filter(f => f.name === "default" ? !f.parent_folder : true)
                    .sort((a, b) => {
                      if (!a.parent_folder && b.parent_folder) return -1;
                      if (a.parent_folder && !b.parent_folder) return 1;
                      if (!a.parent_folder && !b.parent_folder) {
                        if (a.name === "default") return -1;
                        if (b.name === "default") return 1;
                        return a.name.localeCompare(b.name);
                      }
                      if (a.parent_folder !== b.parent_folder) {
                        return a.parent_folder.localeCompare(b.parent_folder);
                      }
                      return a.name.localeCompare(b.name);
                    })
                    .map(f => {
                      const folderKey = getFolderKey(f.name, f.parent_folder);
                      const displayName = f.name === "default" 
                        ? "Главная" 
                        : f.parent_folder 
                          ? `${f.parent_folder} / ${f.name}` 
                          : f.name;
                      return (
                        <Select.Option key={folderKey} value={folderKey}>
                          {displayName}
                        </Select.Option>
                      );
                    })}
                </Select>
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  Импортировать
                </Button>
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title="Дублировать страницу"
            open={isDuplicateModalOpen}
            onCancel={() => setDuplicateModalOpen(false)}
            footer={null}
            destroyOnClose
          >
            <Form form={duplicateForm} onFinish={duplicateFolder} layout="vertical">
              <Form.Item
                name="new_name"
                label="Имя новой страницы"
                rules={[{ required: true, message: "Введите имя новой страницы" }]}
              >
                <Input placeholder="Например lost-copy" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  Продублировать
                </Button>
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title="Дублировать мок"
            open={isDuplicateMockModalOpen}
            onCancel={() => {
              setDuplicateMockModalOpen(false);
              setMockToDuplicate(null);
            }}
            footer={null}
            destroyOnClose
          >
            <Form form={duplicateMockForm} onFinish={duplicateMock} layout="vertical">
              <Form.Item
                name="target_folder"
                label="Выберите папку для дублирования"
                rules={[{ required: true, message: "Выберите папку" }]}
              >
                <Select
                  placeholder="Выберите папку или подпапку"
                  showSearch
                  optionFilterProp="children"
                  filterOption={(input, option) =>
                    (option?.children ?? '').toLowerCase().includes(input.toLowerCase())
                  }
                >
                  {foldersData
                    .filter(f => f.name === "default" ? !f.parent_folder : true)
                    .sort((a, b) => {
                      // Сначала корневые папки, потом подпапки
                      if (!a.parent_folder && b.parent_folder) return -1;
                      if (a.parent_folder && !b.parent_folder) return 1;
                      // Если обе корневые или обе подпапки, сортируем по имени
                      if (!a.parent_folder && !b.parent_folder) {
                        if (a.name === "default") return -1;
                        if (b.name === "default") return 1;
                        return a.name.localeCompare(b.name);
                      }
                      // Для подпапок сортируем сначала по родителю, потом по имени
                      if (a.parent_folder !== b.parent_folder) {
                        return a.parent_folder.localeCompare(b.parent_folder);
                      }
                      return a.name.localeCompare(b.name);
                    })
                    .map(f => {
                      const folderKey = getFolderKey(f.name, f.parent_folder);
                      const displayName = f.name === "default" 
                        ? "Главная" 
                        : f.parent_folder 
                          ? `${f.parent_folder} / ${f.name}` 
                          : f.name;
                      return (
                        <Select.Option key={folderKey} value={folderKey}>
                          {displayName}
                        </Select.Option>
                      );
                    })}
                </Select>
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  Продублировать мок
                </Button>
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title="Переименовать страницу"
            open={isRenameModalOpen}
            onCancel={() => setRenameModalOpen(false)}
            footer={null}
            destroyOnClose
          >
            <Form form={renameForm} onFinish={renameFolder} layout="vertical">
              <Form.Item
                label="Новое имя страницы"
                name="new_name"
                rules={[{ required: true, message: "Введите новое имя страницы" }]}
              >
                <Input placeholder="Введите новое имя" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  Переименовать
                </Button>
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title={`Настройки proxy "${folderTitle}"`}
            open={isFolderSettingsModalOpen}
            onCancel={() => setFolderSettingsModalOpen(false)}
            footer={null}
            destroyOnClose
          >
            <Form form={folderSettingsForm} layout="vertical" onFinish={saveFolderSettings}>
              <Form.Item name="proxy_enabled" valuePropName="checked">
                <Checkbox>Включить прокси для этой страницы</Checkbox>
              </Form.Item>
              <Form.Item
                name="proxy_base_url"
                label="Базовый URL реального backend"
                tooltip="Например https://real-backend.internal. Запросы без мока будут проксироваться туда."
              >
                <Input placeholder="https://backend.example.com" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  Сохранить
                </Button>
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title={`Метрики для папки "${selectedFolder}"`}
            open={isMetricsModalOpen}
            onCancel={() => setIsMetricsModalOpen(false)}
            width="95%"
            style={{ top: 10 }}
            bodyStyle={{ maxHeight: 'calc(100vh - 120px)', overflow: 'auto' }}
            footer={[
              <Button key="clear" danger icon={<DeleteOutlined />} onClick={() => {
                Modal.confirm({
                  title: 'Очистить историю вызовов',
                  content: 'Вы уверены, что хотите очистить всю историю вызовов для этой папки?',
                  onOk: clearRequestLogs
                });
              }}>
                Очистить историю
              </Button>,
              <Button key="refresh" icon={<ReloadOutlined />} onClick={() => {
                loadMetrics(true);
                loadRequestLogs(true);
              }} loading={metricsLoading || requestLogsLoading}>
                Обновить
              </Button>,
              <Button key="download" icon={<DownloadOutlined />} onClick={() => {
                const blob = new Blob([JSON.stringify(metricsData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `metrics-${selectedFolder}-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}>
                Скачать метрики
              </Button>,
              <Button key="close" onClick={() => setIsMetricsModalOpen(false)}>
                Закрыть
              </Button>
            ]}
            destroyOnClose
          >
            {metricsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <Typography.Text>Загрузка метрик...</Typography.Text>
              </div>
            ) : (() => {
              // Проверяем, есть ли ошибка
              if (metricsData && metricsData.error) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <Typography.Text type="danger">{metricsData.error}</Typography.Text>
                  </div>
                );
              }
              
              // Если данные еще не загружены или это старый формат (строка)
              if (!metricsData || typeof metricsData === 'string') {
                return (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <Typography.Text type="secondary">
                      Нет данных о выполнении методов. Выполните запросы к мокам или прокси для получения метрик.
                    </Typography.Text>
                  </div>
                );
              }
              
              // Используем структурированные данные из API
              const data = metricsData;
              
              return (
                <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
                  {/* Общая статистика */}
                  <div style={{ 
                    background: theme === "dark" ? "#262626" : "#fff",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 16,
                    border: `1px solid ${theme === "dark" ? "#434343" : "#d9d9d9"}`
                  }}>
                    <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                      Общая статистика
                    </Typography.Title>
                    <Row gutter={16}>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Всего запросов
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 24, fontWeight: 600, display: 'block', marginTop: 4 }}>
                            {data.total_requests || 0}
                          </Typography.Text>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Методов/Путей
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 24, fontWeight: 600, display: 'block', marginTop: 4 }}>
                            {data.total_methods_paths || 0}
                          </Typography.Text>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Среднее время ответа
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 24, fontWeight: 600, display: 'block', marginTop: 4 }}>
                            {data.avg_response_time_ms > 0 ? `${data.avg_response_time_ms.toFixed(2)} мс` : '—'}
                          </Typography.Text>
                        </div>
                      </Col>
                    </Row>
                    <Row gutter={16} style={{ marginTop: 16 }}>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Успешных моков
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 20, fontWeight: 600, display: 'block', marginTop: 4, color: theme === "dark" ? "#81c784" : "#52c41a" }}>
                            {data.mock_hits_total || 0}
                          </Typography.Text>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Проксированных
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 20, fontWeight: 600, display: 'block', marginTop: 4, color: theme === "dark" ? "#ffb74d" : "#fa8c16" }}>
                            {data.proxied_total || 0}
                          </Typography.Text>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Ошибок
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 20, fontWeight: 600, display: 'block', marginTop: 4, color: theme === "dark" ? "#ef5350" : "#ff4d4f" }}>
                            {data.errors_total || 0}
                          </Typography.Text>
                        </div>
                      </Col>
                    </Row>
                  </div>
                  
                  {/* Удален пункт "Детальная статистика по методам и путям" */}

                  {/* Детальная история вызовов */}
                  <div style={{ 
                    background: theme === "dark" ? "#262626" : "#fff",
                    borderRadius: 8,
                    padding: 16,
                    marginTop: 16,
                    border: `1px solid ${theme === "dark" ? "#434343" : "#d9d9d9"}`
                  }}>
                    <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
                      Детальная история вызовов
                    </Typography.Title>
                    {requestLogsLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <Typography.Text>Загрузка истории...</Typography.Text>
                      </div>
                    ) : requestLogs.length > 0 ? (
                      <Table
                        dataSource={requestLogs.map((log, idx) => ({ ...log, key: log.id || idx }))}
                        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `Всего ${total} записей` }}
                        size="small"
                        scroll={{ x: 'max-content', y: '400px' }}
                        columns={[
                          {
                            title: 'Время',
                            dataIndex: 'timestamp',
                            key: 'timestamp',
                            width: 180,
                            render: (timestamp) => {
                              try {
                                const date = new Date(timestamp);
                                return (
                                  <Typography.Text style={{ fontSize: 11 }}>
                                    {date.toLocaleString('ru-RU', { 
                                      year: 'numeric', 
                                      month: '2-digit', 
                                      day: '2-digit', 
                                      hour: '2-digit', 
                                      minute: '2-digit', 
                                      second: '2-digit',
                                      fractionalSecondDigits: 3
                                    })}
                                  </Typography.Text>
                                );
                              } catch {
                                return <Typography.Text style={{ fontSize: 11 }}>{timestamp}</Typography.Text>;
                              }
                            }
                          },
                          {
                            title: 'Метод',
                            dataIndex: 'method',
                            key: 'method',
                            width: 80,
                            render: (method) => (
                              <Typography.Text strong style={{ 
                                color: theme === "dark" ? "#4fc3f7" : "#1890ff" 
                              }}>
                                {method}
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'Путь',
                            dataIndex: 'path',
                            key: 'path',
                            width: 300,
                            render: (path) => (
                              <Typography.Text code style={{ fontSize: 11 }}>
                                {path}
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'Прокси',
                            dataIndex: 'is_proxied',
                            key: 'is_proxied',
                            width: 80,
                            align: 'center',
                            render: (isProxied) => (
                              <Typography.Text style={{ 
                                color: isProxied ? (theme === "dark" ? "#ffb74d" : "#fa8c16") : (theme === "dark" ? "#81c784" : "#52c41a")
                              }}>
                                {isProxied ? 'Да' : 'Нет'}
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'Время ответа',
                            dataIndex: 'response_time_ms',
                            key: 'response_time_ms',
                            width: 130,
                            align: 'right',
                            render: (time) => (
                              <Typography.Text>
                                {time} мс
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'TTL кэша',
                            dataIndex: 'cache_ttl_seconds',
                            key: 'cache_ttl_seconds',
                            width: 150,
                            align: 'right',
                            render: (ttl, record) => {
                              const remainingTTL = getRemainingTTL(record.timestamp, ttl);
                              if (remainingTTL !== null && remainingTTL > 0) {
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                    <Typography.Text style={{ 
                                      color: remainingTTL < 10 ? (theme === "dark" ? "#ef5350" : "#ff4d4f") : undefined
                                    }}>
                                      {remainingTTL} с
                                    </Typography.Text>
                                    {record.cache_key && (
                                      <Button 
                                        size="small" 
                                        type="link" 
                                        danger
                                        onClick={() => {
                                          Modal.confirm({
                                            title: 'Очистить кэш',
                                            content: `Очистить кэш с ключом "${record.cache_key}"?`,
                                            onOk: () => clearCacheByKey(record.cache_key, false)
                                          });
                                        }}
                                      >
                                        Сбросить
                                      </Button>
                                    )}
                                  </div>
                                );
                              }
                              return <Typography.Text type="secondary">—</Typography.Text>;
                            }
                          },
                          {
                            title: 'Статус код',
                            dataIndex: 'status_code',
                            key: 'status_code',
                            width: 120,
                            align: 'right',
                            render: (code) => (
                              <Typography.Text 
                                strong 
                                style={{ 
                                  color: code >= 200 && code < 300
                                    ? (theme === "dark" ? "#81c784" : "#52c41a")
                                    : code >= 400
                                    ? (theme === "dark" ? "#ef5350" : "#ff4d4f")
                                    : (theme === "dark" ? "#ffb74d" : "#fa8c16")
                                }}
                              >
                                {code}
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'Действия',
                            key: 'actions',
                            width: 150,
                            fixed: 'right',
                            render: (_, record) => (
                              record.is_proxied ? (
                                <Button
                                  size="small"
                                  type="primary"
                                  onClick={() => generateMockFromProxy(record.id)}
                                >
                                  Сформировать мок
                                </Button>
                              ) : null
                            )
                          }
                        ]}
                      />
                    ) : (
                      <div style={{ 
                        padding: 40,
                        textAlign: 'center',
                      }}>
                        <Typography.Text type="secondary">
                          Нет данных о вызовах. Выполните запросы к мокам или прокси для получения истории.
                        </Typography.Text>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </Modal>

          {/* Модальное окно для глобальных метрик всего сервиса */}
          <Modal
            title="Метрики всего сервиса"
            open={isGlobalMetricsModalOpen}
            onCancel={() => setIsGlobalMetricsModalOpen(false)}
            width="95%"
            style={{ top: 10 }}
            bodyStyle={{ maxHeight: 'calc(100vh - 120px)', overflow: 'auto' }}
            footer={[
              <Button key="clear" danger icon={<DeleteOutlined />} onClick={() => {
                Modal.confirm({
                  title: 'Очистить историю вызовов',
                  content: 'Вы уверены, что хотите очистить всю историю вызовов для всего сервиса?',
                  onOk: clearGlobalRequestLogs
                });
              }}>
                Очистить историю
              </Button>,
              <Button key="refresh" icon={<ReloadOutlined />} onClick={() => {
                loadGlobalMetrics(true);
                loadGlobalRequestLogs(true);
              }} loading={globalMetricsLoading || globalRequestLogsLoading}>
                Обновить
              </Button>,
              <Button key="download" icon={<DownloadOutlined />} onClick={() => {
                const blob = new Blob([JSON.stringify(globalMetricsData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `metrics-all-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
              }}>
                Скачать метрики
              </Button>,
              <Button key="close" onClick={() => setIsGlobalMetricsModalOpen(false)}>
                Закрыть
              </Button>
            ]}
            destroyOnClose
          >
            {globalMetricsLoading ? (
              <div style={{ textAlign: 'center', padding: '40px' }}>
                <Typography.Text>Загрузка метрик...</Typography.Text>
              </div>
            ) : (() => {
              // Проверяем, есть ли ошибка
              if (globalMetricsData && globalMetricsData.error) {
                return (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <Typography.Text type="danger">{globalMetricsData.error}</Typography.Text>
                  </div>
                );
              }
              
              // Если данные еще не загружены или это старый формат (строка)
              if (!globalMetricsData || typeof globalMetricsData === 'string') {
                return (
                  <div style={{ textAlign: 'center', padding: '40px' }}>
                    <Typography.Text type="secondary">
                      Нет данных о выполнении методов. Выполните запросы к мокам или прокси для получения метрик.
                    </Typography.Text>
                  </div>
                );
              }
              
              // Используем структурированные данные из API
              const data = globalMetricsData;
              
              // Преобразуем структуру folders в плоский список для таблицы
              const allMethodsPaths = [];
              if (data.folders) {
                Object.values(data.folders).forEach(folderData => {
                  if (folderData.methods_paths) {
                    folderData.methods_paths.forEach(mp => {
                      allMethodsPaths.push({
                        ...mp,
                        folder: folderData.folder
                      });
                    });
                  }
                });
              }
              
              return (
                <div style={{ maxHeight: '70vh', overflow: 'auto' }}>
                  <div style={{ 
                    background: theme === "dark" ? "#262626" : "#fff",
                    borderRadius: 8,
                    padding: 16,
                    marginBottom: 16,
                    border: `1px solid ${theme === "dark" ? "#434343" : "#d9d9d9"}`
                  }}>
                    <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 12 }}>
                      Общая статистика всего сервиса
                    </Typography.Title>
                    <Row gutter={16}>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Всего запросов
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 24, fontWeight: 600, display: 'block', marginTop: 4 }}>
                            {data.total_requests || 0}
                          </Typography.Text>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Методов/Путей
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 24, fontWeight: 600, display: 'block', marginTop: 4 }}>
                            {data.total_methods_paths || 0}
                          </Typography.Text>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Среднее время ответа
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 24, fontWeight: 600, display: 'block', marginTop: 4 }}>
                            {data.avg_response_time_ms > 0 ? `${data.avg_response_time_ms.toFixed(2)} мс` : '—'}
                          </Typography.Text>
                        </div>
                      </Col>
                    </Row>
                    <Row gutter={16} style={{ marginTop: 16 }}>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Успешных моков
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 20, fontWeight: 600, display: 'block', marginTop: 4, color: theme === "dark" ? "#81c784" : "#52c41a" }}>
                            {data.mock_hits_total || 0}
                          </Typography.Text>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Проксированных
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 20, fontWeight: 600, display: 'block', marginTop: 4, color: theme === "dark" ? "#ffb74d" : "#fa8c16" }}>
                            {data.proxied_total || 0}
                          </Typography.Text>
                        </div>
                      </Col>
                      <Col span={8}>
                        <div style={{ textAlign: 'center' }}>
                          <Typography.Text type="secondary" style={{ display: 'block', fontSize: 12 }}>
                            Ошибок
                          </Typography.Text>
                          <Typography.Text style={{ fontSize: 20, fontWeight: 600, display: 'block', marginTop: 4, color: theme === "dark" ? "#ef5350" : "#ff4d4f" }}>
                            {data.errors_total || 0}
                          </Typography.Text>
                        </div>
                      </Col>
                    </Row>
                  </div>
                  
                  {/* Удален пункт "Детальная статистика по всем папкам, методам и путям" */}
                  
                  {/* Детальная история вызовов */}
                  <div style={{ 
                    background: theme === "dark" ? "#262626" : "#fff",
                    borderRadius: 8,
                    padding: 16,
                    marginTop: 16,
                    border: `1px solid ${theme === "dark" ? "#434343" : "#d9d9d9"}`
                  }}>
                    <Typography.Title level={5} style={{ marginTop: 0, marginBottom: 16 }}>
                      Детальная история вызовов (всего сервиса)
                    </Typography.Title>
                    {globalRequestLogsLoading ? (
                      <div style={{ textAlign: 'center', padding: '20px' }}>
                        <Typography.Text>Загрузка истории...</Typography.Text>
                      </div>
                    ) : globalRequestLogs.length > 0 ? (
                      <Table
                        dataSource={globalRequestLogs.map((log, idx) => ({ ...log, key: log.id || idx }))}
                        pagination={{ pageSize: 20, showSizeChanger: true, showTotal: (total) => `Всего ${total} записей` }}
                        size="small"
                        scroll={{ x: 'max-content', y: '400px' }}
                        columns={[
                          {
                            title: 'Время',
                            dataIndex: 'timestamp',
                            key: 'timestamp',
                            width: 180,
                            render: (timestamp) => {
                              try {
                                const date = new Date(timestamp);
                                return (
                                  <Typography.Text style={{ fontSize: 11 }}>
                                    {date.toLocaleString('ru-RU', { 
                                      year: 'numeric', 
                                      month: '2-digit', 
                                      day: '2-digit', 
                                      hour: '2-digit', 
                                      minute: '2-digit', 
                                      second: '2-digit',
                                      fractionalSecondDigits: 3
                                    })}
                                  </Typography.Text>
                                );
                              } catch {
                                return <Typography.Text style={{ fontSize: 11 }}>{timestamp}</Typography.Text>;
                              }
                            }
                          },
                          {
                            title: 'Папка',
                            dataIndex: 'folder_name',
                            key: 'folder_name',
                            width: 150,
                            render: (folder) => (
                              <Typography.Text code style={{ fontSize: 11 }}>
                                {folder || 'default'}
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'Метод',
                            dataIndex: 'method',
                            key: 'method',
                            width: 80,
                            render: (method) => (
                              <Typography.Text strong style={{ 
                                color: theme === "dark" ? "#4fc3f7" : "#1890ff" 
                              }}>
                                {method}
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'Путь',
                            dataIndex: 'path',
                            key: 'path',
                            width: 300,
                            render: (path) => (
                              <Typography.Text code style={{ fontSize: 11 }}>
                                {path}
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'Прокси',
                            dataIndex: 'is_proxied',
                            key: 'is_proxied',
                            width: 80,
                            align: 'center',
                            render: (isProxied) => (
                              <Typography.Text style={{ 
                                color: isProxied ? (theme === "dark" ? "#ffb74d" : "#fa8c16") : (theme === "dark" ? "#81c784" : "#52c41a")
                              }}>
                                {isProxied ? 'Да' : 'Нет'}
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'Время ответа',
                            dataIndex: 'response_time_ms',
                            key: 'response_time_ms',
                            width: 130,
                            align: 'right',
                            render: (time) => (
                              <Typography.Text>
                                {time} мс
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'TTL кэша',
                            dataIndex: 'cache_ttl_seconds',
                            key: 'cache_ttl_seconds',
                            width: 150,
                            align: 'right',
                            render: (ttl, record) => {
                              const remainingTTL = getRemainingTTL(record.timestamp, ttl);
                              if (remainingTTL !== null && remainingTTL > 0) {
                                return (
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                                    <Typography.Text style={{ 
                                      color: remainingTTL < 10 ? (theme === "dark" ? "#ef5350" : "#ff4d4f") : undefined
                                    }}>
                                      {remainingTTL} с
                                    </Typography.Text>
                                    {record.cache_key && (
                                      <Button 
                                        size="small" 
                                        type="link" 
                                        danger
                                        onClick={() => {
                                          Modal.confirm({
                                            title: 'Очистить кэш',
                                            content: `Очистить кэш с ключом "${record.cache_key}"?`,
                                            onOk: () => clearCacheByKey(record.cache_key, true)
                                          });
                                        }}
                                      >
                                        Сбросить
                                      </Button>
                                    )}
                                  </div>
                                );
                              }
                              return <Typography.Text type="secondary">—</Typography.Text>;
                            }
                          },
                          {
                            title: 'Статус код',
                            dataIndex: 'status_code',
                            key: 'status_code',
                            width: 120,
                            align: 'right',
                            render: (code) => (
                              <Typography.Text 
                                strong 
                                style={{ 
                                  color: code >= 200 && code < 300
                                    ? (theme === "dark" ? "#81c784" : "#52c41a")
                                    : code >= 400
                                    ? (theme === "dark" ? "#ef5350" : "#ff4d4f")
                                    : (theme === "dark" ? "#ffb74d" : "#fa8c16")
                                }}
                              >
                                {code}
                              </Typography.Text>
                            )
                          },
                          {
                            title: 'Действия',
                            key: 'actions',
                            width: 150,
                            fixed: 'right',
                            render: (_, record) => (
                              record.is_proxied ? (
                                <Button
                                  size="small"
                                  type="primary"
                                  onClick={() => generateMockFromProxy(record.id)}
                                >
                                  Сформировать мок
                                </Button>
                              ) : null
                            )
                          }
                        ]}
                      />
                    ) : (
                      <div style={{ 
                        padding: 40,
                        textAlign: 'center',
                      }}>
                        <Typography.Text type="secondary">
                          Нет данных о вызовах. Выполните запросы к мокам или прокси для получения истории.
                        </Typography.Text>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </Modal>
        </Layout>
      </ConfigProvider>
    </DndProvider>
  );
}
