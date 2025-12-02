import React, { useState, useEffect, useRef } from "react";
import { Table, Button, Form, Input, Select, Modal, Layout, message, ConfigProvider, Typography, Grid, Tooltip, Switch, Checkbox } from "antd";
import { theme as antdTheme } from "antd";
import { PlusOutlined, MinusCircleOutlined, DeleteOutlined, ExclamationCircleOutlined, CopyOutlined, MenuOutlined, PoweroffOutlined, UploadOutlined, EditOutlined, SnippetsOutlined, BgColorsOutlined } from "@ant-design/icons";
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
  { value: "urlencoded", label: "x-www-form-urlencoded" }
];

function getBackendUrl() {
  return import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
}

const headersToFormList = headersObj => {
  const list = Object.entries(headersObj || {}).map(([k, v]) => ({ key: k, value: v }));
  return list.length ? list : [{ key: "", value: "" }];
};

const DraggableFolder = ({ folder, index, moveFolder, selectedFolder, setSelectedFolder, deleteFolder, startRename, theme }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'folder',
    item: { index, folder },
    collect: monitor => ({
      isDragging: monitor.isDragging()
    })
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
  const bgColor = isActive ? (theme === "dark" ? "#1890ff" : "#e6f7ff") : (theme === "dark" ? "#262626" : "#fafafa");
  const textColor = isActive ? (theme === "dark" ? "#fff" : "#000") : (theme === "dark" ? "#e8e8e8" : "#000");
  const hoverBgColor = theme === "dark" ? "#1890ff" : "#e6f7ff";

  return (
    <div
      ref={node => drag(drop(node))}
      style={{
        padding: "8px 12px",
        margin: "4px 0",
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: "4px",
        cursor: isDragging ? "grabbing" : "grab",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        transition: "background-color 0.2s"
      }}
      onMouseEnter={e => e.currentTarget.style.backgroundColor = hoverBgColor}
      onMouseLeave={e => e.currentTarget.style.backgroundColor = bgColor}
      onClick={() => setSelectedFolder(folder)}
    >
      <MenuOutlined style={{ marginRight: "8px", cursor: "grab" }} />
      <span style={{ flex: 1, cursor: "pointer" }}>{folder}</span>
      <div>
        <EditOutlined style={{ marginRight: "8px", cursor: "pointer" }} onClick={e => { e.stopPropagation(); startRename(folder); }} />
        <DeleteOutlined style={{ cursor: "pointer", color: "#ff4d4f" }} onClick={e => { e.stopPropagation(); deleteFolder(folder); }} />
      </div>
    </div>
  );
};

function App() {
  const [mocks, setMocks] = useState([]);
  const [folders, setFolders] = useState(["[MOCK] CATALOG"]);
  const [selectedFolder, setSelectedFolder] = useState("[MOCK] CATALOG");
  const [currentPage, setCurrentPage] = useState("home");
  const [form] = Form.useForm();
  const [theme, setTheme] = useState("light");
  const [backendUrl, setBackendUrl] = useState(getBackendUrl());
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const fileInputRef = useRef(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem("theme") || "light";
    setTheme(savedTheme);
  }, []);

  useEffect(() => {
    localStorage.setItem("theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
  };

  const createMock = (values) => {
    const newMock = {
      id: Date.now(),
      ...values,
      folder: selectedFolder,
      isActive: true
    };
    setMocks([...mocks, newMock]);
    form.resetFields();
    message.success("Mock успешно создан!");
  };

  const deleteMock = (id) => {
    setMocks(mocks.filter(m => m.id !== id));
    message.success("Mock успешно удален!");
  };

  const toggleMockStatus = (id) => {
    setMocks(mocks.map(m => m.id === id ? { ...m, isActive: !m.isActive } : m));
  };

  const addFolder = () => {
    const newFolderName = `New Folder ${folders.length}`;
    setFolders([...folders, newFolderName]);
  };

  const deleteFolder = (folderName) => {
    if (folders.length <= 1) {
      message.warning("Нужна хотя бы одна папка!");
      return;
    }
    setFolders(folders.filter(f => f !== folderName));
    if (selectedFolder === folderName) {
      setSelectedFolder(folders[0]);
    }
    setMocks(mocks.filter(m => m.folder !== folderName));
  };

  const startRename = (folderName) => {
    setRenamingFolder(folderName);
    setRenameValue(folderName);
  };

  const finishRename = () => {
    if (renameValue && renameValue !== renamingFolder) {
      setFolders(folders.map(f => f === renamingFolder ? renameValue : f));
      setMocks(mocks.map(m => m.folder === renamingFolder ? { ...m, folder: renameValue } : m));
      if (selectedFolder === renamingFolder) {
        setSelectedFolder(renameValue);
      }
    }
    setRenamingFolder(null);
  };

  const moveFolder = (fromIndex, toIndex) => {
    const newFolders = [...folders];
    const [moved] = newFolders.splice(fromIndex, 1);
    newFolders.splice(toIndex, 0, moved);
    setFolders(newFolders);
  };

  const exportMocks = () => {
    const dataStr = JSON.stringify({ mocks, folders }, null, 2);
    const element = document.createElement("a");
    element.setAttribute("href", "data:text/plain;charset=utf-8," + encodeURIComponent(dataStr));
    element.setAttribute("download", "mocks.json");
    element.style.display = "none";
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
  };

  const importMocks = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const data = JSON.parse(event.target.result);
          setMocks(data.mocks || []);
          setFolders(data.folders || []);
          message.success("Mocks успешно импортированы!");
        } catch (err) {
          message.error("Ошибка при импорте файла!");
        }
      };
      reader.readAsText(file);
    }
  };

  const mocksByFolder = mocks.filter(m => m.folder === selectedFolder);

  const columns = [
    { title: "№", dataIndex: "id", key: "id", width: 60, render: (_, __, index) => index + 1 },
    { title: "Активно", dataIndex: "isActive", key: "isActive", width: 100, render: (isActive, record) => (<Checkbox checked={isActive} onChange={() => toggleMockStatus(record.id)} />) },
    { title: "Метод", dataIndex: "method", key: "method", width: 100 },
    { title: "Путь", dataIndex: "path", key: "path", width: 200 },
    { title: "Код", dataIndex: "status", key: "status", width: 80 },
    {
      title: "Действия",
      key: "actions",
      width: 150,
      render: (_, record) => (
        <Button danger size="small" onClick={() => deleteMock(record.id)}>
          <DeleteOutlined /> Удалить
        </Button>
      )
    }
  ];

  return (
    <ConfigProvider theme={{ algorithm: theme === "dark" ? antdTheme.dark : antdTheme.default }}>
      <Layout style={{ minHeight: "100vh" }}>
        <Header
          style={{
            background: theme === "dark" ? "#1f2937" : "#fff",
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
            color: theme === "dark" ? "#fff" : "#000"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1 }}>
            <h1 style={{ margin: 0, fontSize: "18px", fontWeight: "bold" }}>🎭 Mock — среда для гибкого тестирования</h1>
          </div>
          
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <Input
              type="text"
              placeholder="Backend URL"
              value={backendUrl}
              onChange={e => setBackendUrl(e.target.value)}
              style={{ width: "280px" }}
              addonBefore="Бэк"
            />
            
            {/* CHANGE 2: Move theme toggle here - after Backend URL field */}
            <Tooltip title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}>
              <Button
                type="text"
                icon={<BgColorsOutlined />}
                onClick={toggleTheme}
                style={{ color: theme === "dark" ? "#fff" : "#000" }}
              />
            </Tooltip>
          </div>
        </Header>

        <Layout style={{ flex: 1 }}>
          <Sider width={300} style={{ background: theme === "dark" ? "#262626" : "#f5f5f5", borderRight: "1px solid #d9d9d9", overflowY: "auto" }}>
            <div style={{ padding: "16px" }}>
              <Button type="primary" block style={{ marginBottom: "12px" }} onClick={addFolder}>
                <PlusOutlined /> Добавить страницу
              </Button>

              <DndProvider backend={HTML5Backend}>
                <div>
                  {folders.map((folder, index) => (
                    renamingFolder === folder ? (
                      <Input
                        key={folder}
                        value={renameValue}
                        onChange={e => setRenameValue(e.target.value)}
                        onPressEnter={finishRename}
                        onBlur={finishRename}
                        autoFocus
                        style={{ marginBottom: "4px" }}
                      />
                    ) : (
                      <DraggableFolder
                        key={folder}
                        folder={folder}
                        index={index}
                        moveFolder={moveFolder}
                        selectedFolder={selectedFolder}
                        setSelectedFolder={setSelectedFolder}
                        deleteFolder={deleteFolder}
                        startRename={startRename}
                        theme={theme}
                      />
                    )
                  ))}
                </div>
              </DndProvider>

              <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid #d9d9d9" }}>
                <Button block size="small" onClick={exportMocks}>
                  <UploadOutlined /> Экспорт
                </Button>
                <Button block size="small" style={{ marginTop: "8px" }} onClick={() => fileInputRef.current?.click()}>
                  <UploadOutlined /> Импорт
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={importMocks}
                  style={{ display: "none" }}
                />
              </div>
            </div>
          </Sider>

          <Content style={{ padding: "24px", background: theme === "dark" ? "#1f2937" : "#fff", overflowY: "auto" }}>
            {currentPage === "home" ? (
              <div>
                <div style={{ marginBottom: "24px" }}>
                  <h2 style={{ fontSize: "24px", fontWeight: "bold", marginBottom: "12px", color: theme === "dark" ? "#fff" : "#000" }}>
                    Mock — среда для гибкого тестирования
                  </h2>
                  <p style={{
                    color: theme === "dark" ? "#d1d5db" : "#666",
                    lineHeight: "1.6",
                    fontSize: "14px",
                    margin: 0
                  }}>
                    Проект помогает эмулировать backend-эндпоинты без поднятия реальных сервисов. Поддерживаются фильтры по HTTP-методу, пути, заголовкам и даже частям тела запроса, а ответ можно настроить с нужным статусом, заголовками и JSON.
                  </p>
                </div>

                {/* CHANGE 1: Add properly styled instructions with correct dark theme colors */}
                <div style={{
                  background: theme === "dark" ? "#374151" : "#f9f9f9",
                  padding: "16px",
                  borderRadius: "8px",
                  border: `1px solid ${theme === "dark" ? "#4b5563" : "#e0e0e0"}`,
                  marginBottom: "24px"
                }}>
                  <h3 style={{ color: theme === "dark" ? "#fff" : "#000", marginTop: 0, marginBottom: "12px", fontSize: "16px", fontWeight: "600" }}>
                    Как пользоваться
                  </h3>
                  <ol style={{
                    color: theme === "dark" ? "#d1d5db" : "#333",
                    lineHeight: "1.8",
                    fontSize: "14px",
                    margin: 0,
                    paddingLeft: "20px"
                  }}>
                    <li style={{ marginBottom: "8px" }}>
                      Настройте адрес работающего backend-а сверху, чтобы панель могла обращаться к API.
                    </li>
                    <li style={{ marginBottom: "8px" }}>
                      Создайте страницу (папку) для логической группы моков и выберите её слева.
                    </li>
                    <li style={{ marginBottom: "8px" }}>
                      Нажмите «Создать mock», укажите метод, путь, необходимые заголовки/фрагмент тела и соберите желаемый ответ.
                    </li>
                    <li>
                      Сохраните и убедитесь, что мок активен — он сразу начнёт перехватывать запросы.
                    </li>
                  </ol>
                </div>

                {/* CHANGE 3: Remove/hide the Home table from main page */}
                {/* Table section removed as requested */}

                <div style={{ marginTop: "24px", padding: "16px", background: theme === "dark" ? "#374151" : "#f9f9f9", borderRadius: "8px" }}>
                  <p style={{ color: theme === "dark" ? "#9ca3af" : "#666", fontSize: "12px", margin: 0 }}>
                    💡 Совет: используйте заголовки и поиск по телу запроса, чтобы разделить похожие выводы, а с помощью кнопки сервера быстро переключайте сценарии и импортируйте коллекции Postman.
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <h2>Mock для: {selectedFolder}</h2>

                <Form form={form} onFinish={createMock} layout="vertical" style={{ background: theme === "dark" ? "#262626" : "#fff", padding: "16px", borderRadius: "8px", marginBottom: "24px" }}>
                  <Form.Item label="Метод HTTP" name="method" rules={[{ required: true }]}>
                    <Select placeholder="Выберите метод">
                      {METHODS.map(m => (<Select.Option key={m} value={m}>{m}</Select.Option>))}
                    </Select>
                  </Form.Item>

                  <Form.Item label="Путь" name="path" rules={[{ required: true }]}>
                    <Input placeholder="/api/users" />
                  </Form.Item>

                  <Form.Item label="HTTP Статус" name="status" rules={[{ required: true }]}>
                    <Select placeholder="Выберите статус">
                      {HTTP_STATUSES.map(s => (<Select.Option key={s.value} value={s.value}>{s.label}</Select.Option>))}
                    </Select>
                  </Form.Item>

                  <Form.Item label="Заголовки" name="headers">
                    <TextArea placeholder='{"Content-Type": "application/json"}' rows={4} />
                  </Form.Item>

                  <Form.Item label="Режим тела запроса" name="bodyMode">
                    <Select placeholder="Выберите режим">
                      {REQUEST_BODY_MODES.map(m => (<Select.Option key={m.value} value={m.value}>{m.label}</Select.Option>))}
                    </Select>
                  </Form.Item>

                  <Form.Item label="Тело ответа" name="responseBody">
                    <TextArea placeholder='{"message": "success"}' rows={8} />
                  </Form.Item>

                  <Button type="primary" htmlType="submit" block size="large">
                    <PlusOutlined /> Создать mock
                  </Button>
                </Form>

                <h3>Список Mocks ({mocksByFolder.length})</h3>
                <Table
                  columns={columns}
                  dataSource={mocksByFolder}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  style={{ marginTop: "16px" }}
                />
              </div>
            )}
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}

export default App;
