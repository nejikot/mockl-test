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
  DownOutlined, RightOutlined
} from "@ant-design/icons";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const { Header, Content, Sider } = Layout;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

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

function buildFolderHost(baseHost, folder) {
  if (!baseHost || !folder || folder === "default") return baseHost;
  try {
    const url = new URL(baseHost);
    const basePath = url.pathname.replace(/\/+$/, "");
    url.pathname = `${basePath}/${folder}`;
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
const FolderWithSubfolders = ({ rootFolder, subFolders, rootIndex, moveFolder, selectedFolder, setSelectedFolder, deleteFolder, startRename, theme, foldersData }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div style={{ marginBottom: 8 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 12,
          borderRadius: 8,
          background: theme === "dark" ? "#262626" : "#fafafa",
          cursor: "pointer",
        }}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? <DownOutlined /> : <RightOutlined />}
        <DraggableFolder
          folder={rootFolder.name}
          index={rootIndex}
          moveFolder={moveFolder}
          selectedFolder={selectedFolder}
          setSelectedFolder={setSelectedFolder}
          deleteFolder={deleteFolder}
          startRename={startRename}
          theme={theme}
          isSubfolder={false}
          parentFolder={null}
          showExpandIcon={false}
        />
      </div>
      {isExpanded && (
        <div style={{ marginLeft: 24, marginTop: 4 }}>
          {subFolders.map((subFolder, subIndex) => (
            <DraggableFolder
              key={subFolder.name}
              folder={subFolder.name}
              index={rootIndex + 1 + subIndex}
              moveFolder={moveFolder}
              selectedFolder={selectedFolder}
              setSelectedFolder={setSelectedFolder}
              deleteFolder={deleteFolder}
              startRename={startRename}
              theme={theme}
              isSubfolder={true}
              parentFolder={subFolder.parent_folder}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const DraggableFolder = ({ folder, index, moveFolder, selectedFolder, setSelectedFolder, deleteFolder, startRename, theme, isSubfolder = false, parentFolder = null, showExpandIcon = true }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'folder',
    item: { index, folder },
    collect: monitor => ({ isDragging: monitor.isDragging() })
  });
  const [, drop] = useDrop({
    accept: 'folder',
    hover: item => {
      if (item.index !== index) {
        moveFolder(item.index, index);
        item.index = index;
      }
    }
  });
  
  const isActive = folder === selectedFolder;
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
        marginLeft: isSubfolder ? 24 : 0,
        borderLeft: isSubfolder ? `3px solid ${theme === "dark" ? "#1890ff" : "#1890ff"}` : "none",
        paddingLeft: isSubfolder ? 16 : 12,
      }}
      onMouseEnter={e => {
        if (!isActive) e.currentTarget.style.background = hoverBgColor;
      }}
      onMouseLeave={e => {
        if (!isActive) e.currentTarget.style.background = bgColor;
      }}
      onClick={() => setSelectedFolder(folder)}
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
          <EditOutlined
            onClick={e => { e.stopPropagation(); startRename(folder); }}
            style={{ color: textColor, fontSize: 16, cursor: "pointer" }}
          />
          <DeleteOutlined
            onClick={e => { e.stopPropagation(); deleteFolder(folder); }}
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
  const [renameForm] = Form.useForm();
  const [folders, setFolders] = useState(["default"]);
  const [foldersData, setFoldersData] = useState([{ name: "default", parent_folder: null, order: 0 }]);
  const [selectedFolder, setSelectedFolder] = useState("default");
  const [mocks, setMocks] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [isFolderModalOpen, setFolderModalOpen] = useState(false);
  const [isRenameModalOpen, setRenameModalOpen] = useState(false);
  const [folderToRename, setFolderToRename] = useState(null);
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
  const [isDuplicateModalOpen, setDuplicateModalOpen] = useState(false);
  const [duplicateForm] = Form.useForm();
  const [folderToDuplicate, setFolderToDuplicate] = useState(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("mockl-theme") || "light";
    setTheme(savedTheme);
  }, []);

  useEffect(() => {
    document.body.style.background = theme === "light" ? "#f0f2f5" : "#141414";
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
    if (file) uploadJson(file);
    e.target.value = "";
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

  const deactivateAllMocks = (folderName = null) => {
    const isCurrentFolder = folderName === selectedFolder || folderName === null;
    Modal.confirm({
      title: folderName ? `Отключить все моки в папке "${folderName}"?` : 'Отключить все моки во всех папках?',
      content: folderName ? 'Будут отключены все моки в этой папке и всех её вложенных папках.' : 'Будут отключены все моки во всех папках.',
      icon: <ExclamationCircleOutlined />,
      okText: 'Отключить',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          const url = folderName 
            ? `${host}/api/mocks/deactivate-all?folder=${encodeURIComponent(folderName)}`
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
    const arr = [...folders];
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    const defIdx = arr.indexOf("default");
    if (defIdx > 0) arr.unshift(arr.splice(defIdx, 1)[0]);
    setFolders(arr);
  };

  const moveMock = async (from, to) => {
    const arr = [...mocks];
    const [m] = arr.splice(from, 1);
    arr.splice(to, 0, m);
    setMocks(arr);
    
    // Сохраняем новый порядок на сервере
    try {
      const mockIds = arr.map(m => m.id);
      await fetch(`${host}/api/mocks/reorder?folder=${selectedFolder}`, {
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
      if (!sorted.includes(selectedFolder)) setSelectedFolder(sorted[0]);
    } catch {
      setFolders(["default"]);
      setFoldersData([{ name: "default", parent_folder: null, order: 0 }]);
      setSelectedFolder("default");
      message.error("Ошибка получения папок");
    }
  };

  const fetchMocks = async () => {
    try {
      const res = await fetch(`${host}/api/mocks?folder=${encodeURIComponent(selectedFolder)}`);
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
    setOpenapiModalOpen(true);
  };

  const handleOpenapiImport = async vals => {
    const url = (vals.url || "").trim();
    if (!url) {
      message.error("Укажите URL OpenAPI");
      return;
    }
    try {
      const res = await fetch(`${host}/api/openapi/specs/from-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url,
          name: (vals.spec_name || "").trim() || undefined,
          folder_name: (vals.folder_name || "").trim() || undefined
        })
      });
      if (!res.ok) throw new Error("Не удалось загрузить спецификацию");
      const data = await res.json();
      let folderName = (data.folder_name || vals.folder_name || data.name || "openapi").trim();
      if (!folderName) folderName = "openapi";
      message.success(`OpenAPI импортирован, страница "${folderName}" готова для создания моков`);
      setOpenapiModalOpen(false);
      openapiForm.resetFields();
      // ✅ ИСПРАВЛЕНИЕ: вызываем fetchFolders и fetchMocks без await (они не async по умолчанию)
      await fetchFolders();
      setSelectedFolder(folderName);
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
      request_body_params: [{ key: "", value: "" }],
      request_body_formdata: [{ key: "", value: "" }],
      responseHeaders: [{ key: "", value: "" }],
      response_type: "json",
      delay_ms: 0,
      cache_enabled: false,
      cache_ttl: undefined,
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
      if (m.response_config.body && typeof m.response_config.body === "object" && m.response_config.body.__cache_ttl__) {
        cache_enabled = true;
        cache_ttl = m.response_config.body.__cache_ttl__;
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
      folder: m.folder,
      name: m.name || "",
      method: m.request_condition.method,
      path: m.request_condition.path,
      requestHeaders: requestHeadersList,
      request_body_mode,
      request_body_raw,
      request_body_params,
      request_body_formdata,
      status_code: m.response_config.status_code,
      active: m.active !== false,
      responseHeaders: headersToFormList(m.response_config.headers),
      response_type: (m.response_config.body && m.response_config.body.__file__) ? "file" : "json",
      delay_ms: m.delay_ms || 0,
      cache_enabled,
      cache_ttl,
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

      const cacheEnabled = !!vals.cache_enabled;
      const cacheTtl = Number(vals.cache_ttl || 0);
      if (cacheEnabled && cacheTtl > 0 && typeof responseBodyObj === "object" && responseBodyObj !== null) {
        responseBodyObj.__cache_ttl__ = cacheTtl;
      } else if (responseBodyObj && typeof responseBodyObj === "object") {
        delete responseBodyObj.__cache_ttl__;
      }

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
          body_contains: bodyContains || null
        },
        response_config: {
          status_code: Number(vals.status_code),
          headers: responseHeadersObj,
          body: responseBodyObj
        },
        delay_ms: Number(vals.delay_ms || 0) || 0
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

  const duplicateMock = async mock => {
    try {
      const copy = {
        folder: mock.folder,
        active: mock.active !== false,
        name: mock.name ? `${mock.name} copy` : "copy",
        request_condition: {
          method: mock.request_condition.method,
          path: mock.request_condition.path,
          headers: mock.request_condition.headers || {},
          body_contains: mock.request_condition.body_contains || null
        },
        response_config: {
          status_code: mock.response_config.status_code,
          headers: mock.response_config.headers || {},
          body: mock.response_config.body
        }
      };
      const res = await fetch(`${host}/api/mocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(copy)
      });
      if (!res.ok) throw new Error();
      message.success("Мок продублирован");
      fetchMocks();
    } catch {
      message.error("Не удалось продублировать мок");
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

    const parts = [`curl -X ${method}`];

    let contentType = "";
    Object.entries(headers).forEach(([key, value]) => {
      const headerValue = getHeaderValue(value);
      if (key.toLowerCase() === "content-type") {
        contentType = headerValue || "";
      }
      // Для необязательных заголовков всё равно показываем их в curl (со значением, если оно есть)
      parts.push(`-H '${key}: ${headerValue}'`);
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

      // ПРИОРИТЕТ 1: Если содержимое - JSON (начинается с { или [), ВСЕГДА используем --data
      // Это важно, даже если заголовок говорит application/x-www-form-urlencoded
      if (isJsonContent || isJsonHeader) {
        // Экранируем кавычки для JSON
        const escapedBody = bodyContains.replace(/'/g, "'\\''");
        parts.push(`--data '${escapedBody}'`);
      }
      // ПРИОРИТЕТ 2: Если заголовок form-urlencoded И содержимое в формате key=value, используем --data-urlencode
      else if (isFormUrlencodedHeader && isUrlEncodedFormat) {
        const pairs = bodyContains.split("&").filter(Boolean);
        if (pairs.length) {
          pairs.forEach(p => {
            parts.push(`--data-urlencode '${p}'`);
          });
        } else {
          parts.push(`--data-urlencode '${bodyContains}'`);
        }
      }
      // ПРИОРИТЕТ 3: Если это multipart/form-data
      else if (isMultipartHeader) {
        // Для multipart лучше использовать --form, но это требует парсинга
        // Пока используем --data
        parts.push(`--data '${bodyContains.replace(/'/g, "'\\''")}'`);
      }
      // ПРИОРИТЕТ 4: Если это base64 (файл)
      else if (isBase64) {
        parts.push(`--data-binary '${bodyContains}'`);
      }
      // ПРИОРИТЕТ 5: Для остальных случаев используем --data (raw)
      else {
        const escapedBody = bodyContains.replace(/'/g, "'\\''");
        parts.push(`--data '${escapedBody}'`);
      }
    }

    parts.push(`'${url}'`);
    return parts.join(" ");
  };

  const openAddFolder = () => {
    folderForm.resetFields();
    setFolderModalOpen(true);
  };

  const startRenameFolder = name => {
    setFolderToRename(name);
    renameForm.setFieldsValue({ new_name: name });
    setRenameModalOpen(true);
  };

  const addFolder = async vals => {
    const name = vals.name.trim();
    if (folders.includes(name)) return message.error("Уже существует");
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
      setSelectedFolder(name);
      await fetchMocks();
    } catch (e) {
      message.error("Ошибка: " + (e.message || "Не удалось создать папку"));
    }
  };

  const deleteFolder = name => {
    if (name === "default") return message.warning("Нельзя удалить Главная");
    Modal.confirm({
      title: `Удалить страницу ${name === "default" ? "Главная" : name}?`,
      icon: <ExclamationCircleOutlined />,
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          const res = await fetch(`${host}/api/folders?name=${encodeURIComponent(name)}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
          message.success("Удалено");
          if (selectedFolder === name) setSelectedFolder("default");
          fetchFolders();
          fetchMocks();
        } catch {
          message.error("Ошибка удаления");
        }
      }
    });
  };

  const renameFolder = async vals => {
    const newName = (vals.new_name || "").trim();
    if (!folderToRename || !newName || newName === folderToRename) {
      setRenameModalOpen(false);
      return;
    }
    if (folders.includes(newName)) {
      return message.error("Папка с таким именем уже существует");
    }
    try {
      const res = await fetch(`${host}/api/folders/rename`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_name: folderToRename, new_name: newName })
      });
      if (!res.ok) throw new Error();
      message.success("Переименовано");
      setRenameModalOpen(false);
      if (selectedFolder === folderToRename) {
        setSelectedFolder(newName);
      }
      fetchFolders();
    } catch {
      message.error("Ошибка переименования");
    }
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
    duplicateForm.setFieldsValue({
      new_name: `${name}-copy`
    });
    setDuplicateModalOpen(true);
  };

  const duplicateFolder = async vals => {
    const newName = (vals.new_name || "").trim();
    if (!folderToDuplicate || !newName) {
      setDuplicateModalOpen(false);
      return;
    }
    if (folders.includes(newName)) {
      return message.error("Папка с таким именем уже существует");
    }
    try {
      const res = await fetch(`${host}/api/folders/duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_name: folderToDuplicate, new_name: newName })
      });
      if (!res.ok) throw new Error();
      message.success("Страница продублирована");
      setDuplicateModalOpen(false);
      await fetchFolders();
      setSelectedFolder(newName);
      await fetchMocks();
    } catch (e) {
      message.error("Ошибка дублирования страницы");
    }
  };

  const isDesktop = screens.md ?? false;
  const stickyTopOffset = isDesktop ? 88 : 64;
  const isDefaultFolder = selectedFolder === "default";
  const folderTitle = isDefaultFolder ? "Главная" : selectedFolder;
  const baseFolderUrl = buildFolderHost(host, selectedFolder);
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
          <input
            type="file"
            accept="application/json"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
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
            justifyContent: "space-between",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
          }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
              <Typography.Title level={3} style={{ margin: 0 }}>ᨐᵒᶜᵏ</Typography.Title>
              <Typography.Text type="secondary">mock-сервер</Typography.Text>
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flex: isDesktop ? "0 0 420px" : "1 1 100%"
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
                  {(() => {
                    // Группируем папки по родителям
                    const rootFolders = foldersData.filter(f => !f.parent_folder || f.name === "default");
                    const foldersByParent = {};
                    foldersData.forEach(f => {
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
                            startRename={startRenameFolder}
                            theme={theme}
                            isSubfolder={false}
                            parentFolder={null}
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
                            startRename={startRenameFolder}
                            theme={theme}
                            foldersData={foldersData}
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
                            startRename={startRenameFolder}
                            theme={theme}
                            isSubfolder={false}
                            parentFolder={null}
                          />
                        );
                      }
                    });
                  })()}
                </div>
              </Sider>

              <Content style={{ width: "100%", flex: 1, minHeight: 0, overflowY: "auto" }}>
                {isDefaultFolder && (
                  <div style={{
                    background: theme === "light" ? "#fff" : "#1f1f1f",
                    borderRadius: 12,
                    padding: isDesktop ? 24 : 16,
                    boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
                    marginBottom: 16
                  }}>
                    <Typography.Title level={3} style={{ marginTop: 0 }}>
                      Mock — визуальный mock-сервер и песочница API
                    </Typography.Title>
                    <Typography.Paragraph>
                      Мощный инструмент для создания и управления HTTP моками. Визуально собирайте моки для эндпоинтов,
                      группируйте их по страницам, импортируйте из Postman, OpenAPI или curl команд, настраивайте задержки,
                      кэширование, ошибки и прокси — всё через удобный интерфейс, без редактирования кода.
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
                        <li><b>Подстановки в ответах и заголовках</b> — система поддерживает динамические плейсхолдеры, которые автоматически
                            заменяются значениями из входящего запроса. Плейсхолдеры работают в теле ответа (JSON) и в заголовках ответа.
                            <br/><br/>
                            <b>Доступные плейсхолдеры:</b>
                            <ul style={{ paddingLeft: 20, marginTop: 8 }}>
                              <li><code>{'{'}'method'{'}'}</code> — HTTP метод запроса (GET, POST, PUT, DELETE и т.д.)</li>
                              <li><code>{'{'}'path'{'}'}</code> — путь запроса без query параметров (например: <code>/api/users</code>)</li>
                              <li><code>{'{'}'full_path'{'}'}</code> — полный путь с query параметрами (например: <code>/api/users?page=1</code>)</li>
                              <li><code>{'{'}'query'{'}'}</code> — строка query параметров целиком (например: <code>page=1&limit=10</code>)</li>
                              <li><code>{'{'}'query_параметр'{'}'}</code> — значение конкретного query параметра (например: <code>{'{'}'query_page'{'}'}</code> для <code>?page=1</code>)</li>
                              <li><code>{'{'}'header_ИмяЗаголовка'{'}'}</code> — значение заголовка запроса. Дефисы в имени заголовка заменяются на подчёркивания
                                  (например: <code>{'{'}'header_Authorization'{'}'}</code> для заголовка <code>Authorization</code>,
                                  <code>{'{'}'header_X_Custom_Header'{'}'}</code> для <code>X-Custom-Header</code>)</li>
                            </ul>
                            <br/>
                            <b>Пример использования в теле ответа:</b>
                            <pre style={{ background: theme === "light" ? "#f5f5f5" : "#1f1f1f", padding: "12px", borderRadius: "4px", overflow: "auto", fontSize: "12px" }}>
{`{
  "request_method": "` + "{method}" + `",
  "request_path": "` + "{path}" + `",
  "user_id": "` + "{query_user_id}" + `",
  "auth_token": "` + "{header_Authorization}" + `",
  "message": "Запрос ` + "{method}" + ` на путь ` + "{path}" + ` обработан"
}`}
                            </pre>
                            <b>Пример запроса:</b> <code>GET /api/users?user_id=123</code> с заголовком <code>Authorization: Bearer token123</code><br/>
                            <b>Результат:</b>
                            <pre style={{ background: theme === "light" ? "#f5f5f5" : "#1f1f1f", padding: "12px", borderRadius: "4px", overflow: "auto", fontSize: "12px" }}>
{`{
  "request_method": "GET",
  "request_path": "/api/users",
  "user_id": "123",
  "auth_token": "Bearer token123",
  "message": "Запрос GET на путь /api/users обработан"
}`}
                            </pre>
                            <b>Использование в заголовках ответа:</b> плейсхолдеры также работают в заголовках ответа. Например, заголовок
                            <code>X-Request-ID: {'{'}header_X_Request_ID{'}'}</code> скопирует значение заголовка <code>X-Request-ID</code> из запроса в ответ.
                        </li>
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

                    <Typography.Title level={4} style={{ marginTop: 16 }}>Кэш, метрики и ограничения</Typography.Title>
                    <Typography.Paragraph style={{ marginBottom: 0 }}>
                      <ul style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                        <li><b>Кэш на уровне мока</b> вы включаете прямо в форме мока — это удобно для эндпоинтов,
                            где ответ редко меняется и важно тестировать работу клиентов с кэшем. TTL задаётся в секундах
                            через поле <code>__cache_ttl__</code> в теле ответа или через UI.</li>
                        <li><b>Управление кэшем</b> — в таблице моков доступны действия, позволяющие очистить кэш
                            для конкретного пути (кнопка «Кэш» в строке мока). Также доступны API endpoints:
                            <code>GET /api/cache/status</code> для проверки состояния кэша и
                            <code>DELETE /api/cache</code> для очистки (с опциональными фильтрами по папке и пути).</li>
                        <li><b>Метрики Prometheus</b> — сервер экспортирует метрики в формате Prometheus по адресу
                            <code>/metrics</code>, включая количество запросов, попаданий в кэш, время ответа и другие.</li>
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
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      {folderTitle}
                    </Typography.Title>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                      <Typography.Text type="secondary">
                        {mocks.length ? `${mocks.length} мок(ов)` : "Пока нет моков"}
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
                        {!isDefaultFolder && (
                          <div style={{ display: "flex", gap: 8 }}>
                            <Button size="small" onClick={openFolderSettings}>
                              Настройки proxy
                            </Button>
                            <Button
                              size="small"
                              onClick={() => startDuplicateFolder(selectedFolder)}
                            >
                              Дублировать страницу
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <Table
                    dataSource={mocks}
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
                                onClick={() => duplicateMock(r)}
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
              </Content>
            </Layout>
          </Content>

          <Modal
            title={editing ? "Редактировать мок" : "Создать мок"}
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={() => form.submit()}
            width={1200}
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
                cache_enabled: false,
                cache_ttl: undefined
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
                <Col span={12}>
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

                <Col span={12}>
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

                    <Form.Item label="Задержка ответа (мс)" name="delay_ms" style={{ marginTop: 16 }}>
                      <Input type="number" min={0} placeholder="Например 500 для 0.5 секунды" />
                    </Form.Item>

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
                  { required: true, message: "Введите имя страницы" },
                  { validator: (_, val) => folders.includes(val) ? Promise.reject("Уже существует") : Promise.resolve() }
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
            title="Переименовать страницу"
            open={isRenameModalOpen}
            onCancel={() => setRenameModalOpen(false)}
            footer={null}
            destroyOnClose
          >
            <Form form={renameForm} onFinish={renameFolder} layout="vertical">
              <Form.Item
                name="new_name"
                label="Новое имя страницы"
                rules={[{ required: true, message: "Введите новое имя" }]}
              >
                <Input placeholder="Новое имя" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>Переименовать</Button>
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
                name="folder_name"
                label="Имя новой страницы (опционально)"
                tooltip="Если не указано, будет использовано название спецификации"
              >
                <Input placeholder="Например payments" />
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
        </Layout>
      </ConfigProvider>
    </DndProvider>
  );
}
