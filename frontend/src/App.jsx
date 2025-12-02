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
  const bgColor = isActive ? (theme === "dark" ? "#1890ff" : "#e6f7ff") : (theme === "dark" ? "#262626" : "#fafafa");
  const textColor = isActive ? (theme === "dark" ? "#fff" : "#000") : (theme === "dark" ? "#e8e8e8" : "#000");
  const hoverBgColor = theme === "dark" ? "#1890ff" : "#e6f7ff";

  return (
    <div
      ref={node => drag(drop(node))}
      onClick={() => setSelectedFolder(folder)}
      onDoubleClick={() => startRename(folder)}
      style={{
        padding: "8px 12px",
        marginBottom: "4px",
        backgroundColor: bgColor,
        color: textColor,
        borderRadius: "4px",
        cursor: "pointer",
        userSelect: "none",
        opacity: isDragging ? 0.5 : 1,
        transition: "all 0.2s"
      }}
      onMouseEnter={e => !isActive && (e.currentTarget.style.backgroundColor = hoverBgColor)}
      onMouseLeave={e => !isActive && (e.currentTarget.style.backgroundColor = bgColor)}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ flex: 1 }}>
          <MenuOutlined style={{ marginRight: "8px" }} />
          {folder}
        </span>
        <Tooltip title="Delete">
          <DeleteOutlined
            onClick={e => {
              e.stopPropagation();
              deleteFolder(folder);
            }}
            style={{ color: theme === "dark" ? "#ff4d4f" : "#ff4d4f", cursor: "pointer" }}
          />
        </Tooltip>
      </div>
    </div>
  );
};

export default function App() {
  const [backendUrl, setBackendUrl] = useState(() => getBackendUrl());
  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const [folders, setFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState(null);
  const [mocks, setMocks] = useState([]);
  const [filteredMocks, setFilteredMocks] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [editingMock, setEditingMock] = useState(null);
  const [form] = Form.useForm();
  const [searchText, setSearchText] = useState("");
  const [newFolderName, setNewFolderName] = useState("");
  const [isCreateFolderModalVisible, setIsCreateFolderModalVisible] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const renameInputRef = useRef(null);
  const screens = useBreakpoint();

  // Загрузка моков при загрузке страницы или смене backend URL
  useEffect(() => {
    fetchMocks();
  }, [backendUrl]);

  // Фильтрация моков при изменении поиска или выбранной папки
  useEffect(() => {
    if (selectedFolder) {
      const filtered = mocks.filter(mock =>
        mock.folder === selectedFolder && (
          mock.path.toLowerCase().includes(searchText.toLowerCase()) ||
          mock.method.toLowerCase().includes(searchText.toLowerCase())
        )
      );
      setFilteredMocks(filtered);
    } else {
      const filtered = mocks.filter(mock =>
        mock.path.toLowerCase().includes(searchText.toLowerCase()) ||
        mock.method.toLowerCase().includes(searchText.toLowerCase())
      );
      setFilteredMocks(filtered);
    }
  }, [searchText, selectedFolder, mocks]);

  const fetchMocks = async () => {
    try {
      const url = backendUrl.endsWith('/') ? backendUrl.slice(0, -1) : backendUrl;
      const response = await fetch(`${url}/mocks`);
      if (response.ok) {
        const data = await response.json();
        setMocks(data.mocks || []);
        // Собираем уникальные папки
        const uniqueFolders = [...new Set((data.mocks || []).map(m => m.folder || "").filter(Boolean))];
        setFolders(uniqueFolders);
        if (uniqueFolders.length > 0 && !selectedFolder) {
          setSelectedFolder(uniqueFolders[0]);
        }
      }
    } catch (err) {
      console.error("Failed to fetch mocks:", err);
    }
  };

  const createFolder = () => {
    if (newFolderName.trim()) {
      if (!folders.includes(newFolderName)) {
        setFolders([...folders, newFolderName]);
        setSelectedFolder(newFolderName);
        setNewFolderName("");
        setIsCreateFolderModalVisible(false);
        message.success("Folder created");
      } else {
        message.error("Folder already exists");
      }
    }
  };

  const deleteFolder = folderName => {
    Modal.confirm({
      title: "Delete folder?",
      content: `All mocks in "${folderName}" will be deleted.`,
      okText: "Delete",
      cancelText: "Cancel",
      onOk() {
        setMocks(mocks.filter(m => m.folder !== folderName));
        setFolders(folders.filter(f => f !== folderName));
        if (selectedFolder === folderName) {
          setSelectedFolder(folders[0] || null);
        }
        message.success("Folder deleted");
      }
    });
  };

  const startRename = folderName => {
    setRenamingFolder(folderName);
    setRenameValue(folderName);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };

  const finishRename = (oldName, newName) => {
    if (newName.trim() && newName !== oldName) {
      if (!folders.includes(newName)) {
        const newFolders = folders.map(f => f === oldName ? newName : f);
        setFolders(newFolders);
        setMocks(mocks.map(m => m.folder === oldName ? { ...m, folder: newName } : m));
        if (selectedFolder === oldName) {
          setSelectedFolder(newName);
        }
        message.success("Folder renamed");
      } else {
        message.error("Folder name already exists");
      }
    }
    setRenamingFolder(null);
  };

  const moveFolder = (fromIndex, toIndex) => {
    const newFolders = [...folders];
    [newFolders[fromIndex], newFolders[toIndex]] = [newFolders[toIndex], newFolders[fromIndex]];
    setFolders(newFolders);
  };

  const openCreateModal = () => {
    setEditingMock(null);
    form.resetFields();
    form.setFieldsValue({
      method: "GET",
      status: 200,
      bodyMode: "none",
      headers: [{ key: "", value: "" }],
      responseHeaders: [{ key: "", value: "" }],
      body: "",
      responseBody: "{}",
      folder: selectedFolder || ""
    });
    setIsModalVisible(true);
  };

  const openEditModal = mock => {
    setEditingMock(mock);
    form.setFieldsValue({
      method: mock.method,
      path: mock.path,
      status: mock.status || 200,
      bodyMode: mock.bodyMode || "none",
      headers: headersToFormList(mock.headers),
      responseHeaders: headersToFormList(mock.responseHeaders),
      body: mock.body || "",
      responseBody: mock.responseBody || "{}",
      folder: mock.folder || ""
    });
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      const values = await form.validateFields();
      const headersObj = {};
      values.headers?.forEach(h => {
        if (h.key) headersObj[h.key] = h.value;
      });

      const responseHeadersObj = {};
      values.responseHeaders?.forEach(h => {
        if (h.key) responseHeadersObj[h.key] = h.value;
      });

      const mockData = {
        method: values.method,
        path: values.path,
        status: values.status || 200,
        bodyMode: values.bodyMode || "none",
        headers: headersObj,
        responseHeaders: responseHeadersObj,
        body: values.body || "",
        responseBody: values.responseBody || "{}",
        folder: values.folder || "",
        active: editingMock?.active ?? true
      };

      if (editingMock) {
        // Обновление существующего мока
        setMocks(mocks.map(m =>
          m.id === editingMock.id ? { ...m, ...mockData } : m
        ));
        message.success("Mock updated");
      } else {
        // Создание нового мока
        const newMock = { ...mockData, id: Date.now().toString() };
        setMocks([...mocks, newMock]);
        message.success("Mock created");
      }

      setIsModalVisible(false);
      form.resetFields();
    } catch (err) {
      console.error("Validation error:", err);
    }
  };

  const handleCancel = () => {
    setIsModalVisible(false);
    form.resetFields();
  };

  const deleteMock = mockId => {
    Modal.confirm({
      title: "Delete mock?",
      content: "This action cannot be undone.",
      okText: "Delete",
      cancelText: "Cancel",
      onOk() {
        setMocks(mocks.filter(m => m.id !== mockId));
        message.success("Mock deleted");
      }
    });
  };

  const toggleMockActive = mockId => {
    setMocks(mocks.map(m =>
      m.id === mockId ? { ...m, active: !m.active } : m
    ));
  };

  const copyMock = mock => {
    const newMock = { ...mock, id: Date.now().toString() };
    setMocks([...mocks, newMock]);
    message.success("Mock copied");
  };

  const theme = isDarkTheme ? antdTheme.dark : antdTheme.light;

  const mockColumns = [
    {
      title: "Method",
      dataIndex: "method",
      key: "method",
      width: 100,
      render: method => (
        <span style={{
          backgroundColor: method === "GET" ? "#52c41a" : method === "POST" ? "#1890ff" : method === "PUT" ? "#faad14" : method === "DELETE" ? "#f5222d" : "#666",
          color: "white",
          padding: "4px 8px",
          borderRadius: "4px",
          fontWeight: "bold"
        }}>
          {method}
        </span>
      )
    },
    {
      title: "Path",
      dataIndex: "path",
      key: "path",
      render: path => <span style={{ fontFamily: "monospace" }}>{path}</span>
    },
    {
      title: "Status",
      dataIndex: "status",
      key: "status",
      width: 80,
      render: status => (
        <span style={{
          backgroundColor: status >= 200 && status < 300 ? "#f6ffed" : status >= 400 ? "#fff1f0" : "#f5f5f5",
          color: status >= 200 && status < 300 ? "#52c41a" : status >= 400 ? "#f5222d" : "#333",
          padding: "4px 8px",
          borderRadius: "4px"
        }}>
          {status}
        </span>
      )
    },
    {
      title: "Active",
      dataIndex: "active",
      key: "active",
      width: 100,
      render: (active, record) => (
        <Switch
          checked={active}
          onChange={() => toggleMockActive(record.id)}
        />
      )
    },
    {
      title: "Actions",
      key: "actions",
      width: 150,
      render: (_, record) => (
        <div style={{ display: "flex", gap: "8px" }}>
          <Tooltip title="Edit">
            <EditOutlined
              onClick={() => openEditModal(record)}
              style={{ cursor: "pointer", color: "#1890ff" }}
            />
          </Tooltip>
          <Tooltip title="Copy">
            <CopyOutlined
              onClick={() => copyMock(record)}
              style={{ cursor: "pointer", color: "#52c41a" }}
            />
          </Tooltip>
          <Tooltip title="Delete">
            <DeleteOutlined
              onClick={() => deleteMock(record.id)}
              style={{ cursor: "pointer", color: "#f5222d" }}
            />
          </Tooltip>
        </div>
      )
    }
  ];

  return (
    <ConfigProvider theme={{ algorithm: isDarkTheme ? antdTheme.dark : antdTheme.light }}>
      <Layout style={{ minHeight: "100vh" }}>
        {/* Header */}
        <Header style={{
          background: isDarkTheme ? "#141414" : "#fff",
          borderBottom: isDarkTheme ? "1px solid #434343" : "1px solid #f0f0f0",
          padding: "0 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "auto",
          minHeight: "64px",
          flexWrap: "wrap"
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: "16px", flex: 1, minWidth: "200px" }}>
            <span style={{
              fontSize: "18px",
              fontWeight: "bold",
              color: isDarkTheme ? "#fff" : "#000"
            }}>
              Mock Panel
            </span>
          </div>

          <div style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            flex: 1,
            justifyContent: "center",
            minWidth: "250px",
            flexWrap: "wrap"
          }}>
            <span style={{
              color: isDarkTheme ? "#e8e8e8" : "#000",
              whiteSpace: "nowrap"
            }}>
              Backend:
            </span>
            <Input
              value={backendUrl}
              onChange={e => setBackendUrl(e.target.value)}
              placeholder="http://localhost:8000"
              style={{ width: "200px" }}
            />
            <Tooltip title={isDarkTheme ? "Switch to light theme" : "Switch to dark theme"}>
              <Button
                type="default"
                icon={<BgColorsOutlined />}
                onClick={() => setIsDarkTheme(!isDarkTheme)}
                style={{
                  backgroundColor: isDarkTheme ? "#1890ff" : "#f0f0f0",
                  color: isDarkTheme ? "#fff" : "#000",
                  border: "none"
                }}
              />
            </Tooltip>
          </div>
        </Header>

        <Layout style={{ flex: 1 }}>
          {/* Sidebar with folders */}
          <Sider
            width={250}
            style={{
              background: isDarkTheme ? "#141414" : "#fafafa",
              borderRight: isDarkTheme ? "1px solid #434343" : "1px solid #f0f0f0",
              overflow: "auto"
            }}
          >
            <div style={{ padding: "16px" }}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                block
                onClick={() => setIsCreateFolderModalVisible(true)}
                style={{ marginBottom: "16px" }}
              >
                New Folder
              </Button>

              <DndProvider backend={HTML5Backend}>
                {folders.map((folder, index) =>
                  renamingFolder === folder ? (
                    <Input
                      key={folder}
                      ref={renameInputRef}
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onBlur={() => finishRename(folder, renameValue)}
                      onPressEnter={() => finishRename(folder, renameValue)}
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
                      theme={isDarkTheme ? "dark" : "light"}
                    />
                  )
                )}
              </DndProvider>
            </div>
          </Sider>

          {/* Main content */}
          <Content style={{
            padding: screens.md ? "24px" : "16px",
            background: isDarkTheme ? "#000" : "#fff"
          }}>
            {selectedFolder ? (
              <>
                <div style={{ marginBottom: "24px" }}>
                  <Input.Search
                    placeholder="Search mocks..."
                    value={searchText}
                    onChange={e => setSearchText(e.target.value)}
                    style={{ marginBottom: "16px" }}
                  />
                  <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={openCreateModal}
                    style={{ marginBottom: "16px" }}
                  >
                    Create Mock
                  </Button>
                </div>

                <Table
                  columns={mockColumns}
                  dataSource={filteredMocks}
                  rowKey="id"
                  pagination={{ pageSize: 10 }}
                  style={{
                    backgroundColor: isDarkTheme ? "#141414" : "#fff"
                  }}
                />
              </>
            ) : (
              <div style={{
                padding: "48px 24px",
                textAlign: "center",
                background: isDarkTheme ? "#141414" : "#fafafa",
                borderRadius: "8px",
                border: isDarkTheme ? "1px solid #434343" : "1px solid #f0f0f0"
              }}>
                <h2 style={{
                  color: isDarkTheme ? "#e8e8e8" : "#000",
                  marginBottom: "24px",
                  fontSize: "24px",
                  fontWeight: "bold"
                }}>
                  Welcome to Mock Panel
                </h2>

                <div style={{
                  textAlign: "left",
                  maxWidth: "600px",
                  margin: "0 auto"
                }}>
                  <div style={{
                    backgroundColor: isDarkTheme ? "#262626" : "#f5f5f5",
                    padding: "20px",
                    borderRadius: "8px",
                    marginBottom: "20px",
                    border: isDarkTheme ? "1px solid #434343" : "1px solid #e8e8e8"
                  }}>
                    <h3 style={{
                      color: isDarkTheme ? "#1890ff" : "#0050b3",
                      marginTop: "0",
                      marginBottom: "12px",
                      fontSize: "16px"
                    }}>
                      📋 Project Overview
                    </h3>
                    <p style={{
                      color: isDarkTheme ? "#e8e8e8" : "#262626",
                      lineHeight: "1.6",
                      margin: "0 0 12px 0"
                    }}>
                      Проект помогает эмулировать backend-эндпоинты без поднятия реальных сервисов. Поддерживаются фильтры по HTTP-методу, пути, заголовкам и даже частям тела запроса, а ответ можно настроить с нужным статусом, заголовками и JSON.
                    </p>
                  </div>

                  <div style={{
                    backgroundColor: isDarkTheme ? "#262626" : "#f5f5f5",
                    padding: "20px",
                    borderRadius: "8px",
                    border: isDarkTheme ? "1px solid #434343" : "1px solid #e8e8e8"
                  }}>
                    <h3 style={{
                      color: isDarkTheme ? "#1890ff" : "#0050b3",
                      marginTop: "0",
                      marginBottom: "12px",
                      fontSize: "16px"
                    }}>
                      🚀 Getting Started
                    </h3>
                    <ol style={{
                      color: isDarkTheme ? "#e8e8e8" : "#262626",
                      lineHeight: "1.8",
                      paddingLeft: "20px",
                      margin: "0"
                    }}>
                      <li style={{ marginBottom: "8px" }}>
                        Адрес работающего backend-а сверху, чтобы панель могла обращаться к API.
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
                </div>
              </div>
            )}
          </Content>
        </Layout>
      </Layout>

      {/* Create Folder Modal */}
      <Modal
        title="Create Folder"
        visible={isCreateFolderModalVisible}
        onOk={createFolder}
        onCancel={() => {
          setIsCreateFolderModalVisible(false);
          setNewFolderName("");
        }}
        okText="Create"
        cancelText="Cancel"
      >
        <Input
          placeholder="Folder name"
          value={newFolderName}
          onChange={e => setNewFolderName(e.target.value)}
          onPressEnter={createFolder}
        />
      </Modal>

      {/* Mock Modal */}
      <Modal
        title={editingMock ? "Edit Mock" : "Create Mock"}
        visible={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
        width={800}
        okText={editingMock ? "Update" : "Create"}
        cancelText="Cancel"
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            label="Folder"
            name="folder"
            rules={[{ required: true, message: "Select a folder" }]}
          >
            <Select placeholder="Select folder">
              {folders.map(folder => (
                <Select.Option key={folder} value={folder}>
                  {folder}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <div style={{ display: "flex", gap: "16px" }}>
            <Form.Item
              label="Method"
              name="method"
              rules={[{ required: true }]}
              style={{ flex: 1 }}
            >
              <Select placeholder="Select HTTP method">
                {METHODS.map(method => (
                  <Select.Option key={method} value={method}>
                    {method}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>

            <Form.Item
              label="Status Code"
              name="status"
              rules={[{ required: true }]}
              style={{ flex: 1 }}
            >
              <Select placeholder="Select status code">
                {HTTP_STATUSES.map(status => (
                  <Select.Option key={status.value} value={status.value}>
                    {status.label}
                  </Select.Option>
                ))}
              </Select>
            </Form.Item>
          </div>

          <Form.Item
            label="Path"
            name="path"
            rules={[{ required: true, message: "Enter request path" }]}
          >
            <Input placeholder="/api/users" />
          </Form.Item>

          <Form.Item label="Request Body Mode" name="bodyMode">
            <Select defaultValue="none">
              {REQUEST_BODY_MODES.map(mode => (
                <Select.Option key={mode.value} value={mode.value}>
                  {mode.label}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item label="Request Headers">
            <Form.List name="headers">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(field => (
                    <div key={field.key} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <Form.Item
                        {...field}
                        name={[field.name, "key"]}
                        style={{ flex: 1, margin: 0 }}
                      >
                        <Input placeholder="Header name" />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, "value"]}
                        style={{ flex: 1, margin: 0 }}
                      >
                        <Input placeholder="Header value" />
                      </Form.Item>
                      <MinusCircleOutlined
                        onClick={() => remove(field.name)}
                        style={{ cursor: "pointer", marginTop: "8px" }}
                      />
                    </div>
                  ))}
                  <Button type="dashed" onClick={() => add()} block>
                    + Add Header
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item label="Request Body" name="body">
            <TextArea placeholder='{"key": "value"}' rows={4} />
          </Form.Item>

          <Form.Item label="Response Headers">
            <Form.List name="responseHeaders">
              {(fields, { add, remove }) => (
                <>
                  {fields.map(field => (
                    <div key={field.key} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                      <Form.Item
                        {...field}
                        name={[field.name, "key"]}
                        style={{ flex: 1, margin: 0 }}
                      >
                        <Input placeholder="Header name" />
                      </Form.Item>
                      <Form.Item
                        {...field}
                        name={[field.name, "value"]}
                        style={{ flex: 1, margin: 0 }}
                      >
                        <Input placeholder="Header value" />
                      </Form.Item>
                      <MinusCircleOutlined
                        onClick={() => remove(field.name)}
                        style={{ cursor: "pointer", marginTop: "8px" }}
                      />
                    </div>
                  ))}
                  <Button type="dashed" onClick={() => add()} block>
                    + Add Header
                  </Button>
                </>
              )}
            </Form.List>
          </Form.Item>

          <Form.Item
            label="Response Body"
            name="responseBody"
            rules={[{ required: true, message: "Enter response body" }]}
          >
            <TextArea placeholder='{"message": "success"}' rows={6} />
          </Form.Item>
        </Form>
      </Modal>
    </ConfigProvider>
  );
}
