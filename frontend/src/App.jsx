import React, { useState, useEffect } from "react";
import {
  Table,
  Button,
  Form,
  Input,
  Select,
  Modal,
  Layout,
  message,
  ConfigProvider,
  Typography,
  Grid,
  Tooltip,
  Switch,
  Checkbox,
  Upload
} from "antd";
import { theme as antdTheme } from "antd";
import {
  PlusOutlined,
  MinusCircleOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined,
  CopyOutlined,
  MenuOutlined,
  PoweroffOutlined,
  UploadOutlined
} from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";

const { Header, Content, Sider } = Layout;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const { Dragger } = Upload;

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

const HTTP_STATUSES = [
  { value: 200, label: "200 - OK", example: { message: "success", data: {} } },
  { value: 201, label: "201 - Created", example: { message: "created", id: "123" } },
  { value: 400, label: "400 - Bad Request", example: { error: "bad request", message: "Invalid input" } },
  { value: 401, label: "401 - Unauthorized", example: { error: "unauthorized", message: "Authentication required" } },
  { value: 403, label: "403 - Forbidden", example: { error: "forbidden", message: "Access denied" } },
  { value: 404, label: "404 - Not Found", example: { error: "not found", message: "Resource not found" } },
  { value: 422, label: "422 - Unprocessable Entity", example: { error: "validation failed", details: [] } },
  { value: 500, label: "500 - Internal Server Error", example: { error: "internal server error", message: "Something went wrong" } },
  { value: 502, label: "502 - Bad Gateway", example: { error: "bad gateway", message: "Upstream server error" } },
  { value: 503, label: "503 - Service Unavailable", example: { error: "service unavailable", message: "Service temporarily unavailable" } }
];

function getBackendUrl() {
  return import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
}

const DraggableFolder = ({ folder, index, moveFolder, selectedFolder, setSelectedFolder, deleteFolder }) => {
  const [{ isDragging }, drag] = useDrag({
    type: "folder",
    item: { index, folder },
    collect: monitor => ({ isDragging: monitor.isDragging() })
  });
  const [, drop] = useDrop({
    accept: "folder",
    hover: item => {
      if (item.index !== index) {
        moveFolder(item.index, index);
        item.index = index;
      }
    }
  });
  return (
    <div
      ref={node => drag(drop(node))}
      style={{
        opacity: isDragging ? 0.5 : 1,
        padding: 10,
        marginBottom: 6,
        borderRadius: 6,
        cursor: "pointer",
        background: folder === selectedFolder ? "#d9e4ff" : "transparent",
        fontWeight: folder === selectedFolder ? "bold" : "normal",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}
      onClick={() => setSelectedFolder(folder)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MenuOutlined style={{ color: "#999", cursor: "grab" }} />
        <span>{folder === "default" ? "Главная" : folder}</span>
      </div>
      {folder !== "default" && (
        <DeleteOutlined
          onClick={e => {
            e.stopPropagation();
            deleteFolder(folder);
          }}
          style={{ color: "red" }}
        />
      )}
    </div>
  );
};

export default function App() {
  const [form] = Form.useForm();
  const [folderForm] = Form.useForm();
  const [folders, setFolders] = useState(["default"]);
  const [selectedFolder, setSelectedFolder] = useState("default");
  const [mocks, setMocks] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [isFolderModalOpen, setFolderModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [host, setHost] = useState(getBackendUrl());
  const screens = useBreakpoint();

  useEffect(() => {
    document.body.style.background = "#f7f8fa";
  }, []);

  useEffect(() => {
    async function loadFolders() {
      try {
        const res = await fetch(`${host}/api/mocks/folders`);
        const data = await res.json();
        const list = data.length ? data : ["default"];
        list.sort((a, b) => (a === "default" ? -1 : b === "default" ? 1 : 0));
        setFolders(list);
        if (!list.includes(selectedFolder)) setSelectedFolder(list[0]);
      } catch {
        setFolders(["default"]);
        setSelectedFolder("default");
        message.error("Ошибка получения папок");
      }
    }
    loadFolders();
  }, [host]);

  useEffect(() => {
    async function loadMocks() {
      try {
        const res = await fetch(`${host}/api/mocks?folder=${encodeURIComponent(selectedFolder)}`);
        const data = await res.json();
        setMocks(data);
      } catch {
        setMocks([]);
        message.error("Ошибка получения моков");
      }
    }
    loadMocks();
  }, [selectedFolder, host]);

  const copyToClipboard = text => {
    navigator.clipboard.writeText(text)
      .then(() => message.success("Скопировано"))
      .catch(() => message.error("Ошибка"));
  };
  const handleCopyHost = () => copyToClipboard(host);

  const fetchFolders = async () => {
    // already handled in useEffect
  };
  const fetchMocks = async () => {
    // already handled in useEffect
  };

  const moveFolder = (from, to) => {
    const arr = [...folders];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setFolders(arr);
  };

  const toggleMockActive = async (id, active) => {
    await fetch(`${host}/api/mocks/${id}/toggle`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active })
    });
    setMocks(prev => prev.map(m => (m.id === id ? { ...m, active } : m)));
  };

  const deactivateAllMocks = () => {
    Modal.confirm({
      title: "Отключить все моки?",
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        await fetch(`${host}/api/mocks/deactivate-all?folder=${encodeURIComponent(selectedFolder)}`, { method: "PATCH" });
        setMocks([]);
      }
    });
  };

  const openAddMock = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      folder: selectedFolder,
      method: "GET",
      path: "/",
      status_code: 200,
      active: true,
      responseHeaders: [{ key: "", value: "" }],
      response_body: JSON.stringify({ message: "success", data: {} }, null, 2)
    });
    setModalOpen(true);
  };

  const openEditMock = m => {
    setEditing(m);
    form.setFieldsValue({
      id: m.id,
      folder: m.folder,
      method: m.request_condition.method,
      path: m.request_condition.path,
      status_code: m.response_config.status_code,
      active: m.active,
      responseHeaders: Object.entries(m.response_config.headers || {}).map(([k, v]) => ({ key: k, value: v })),
      response_body: JSON.stringify(m.response_config.body, null, 2)
    });
    setModalOpen(true);
  };

  const saveMock = async vals => {
    const headers = {};
    (vals.responseHeaders || []).forEach(x => { if (x.key) headers[x.key] = x.value; });
    const entry = {
      id: vals.id || uuidv4(),
      folder: vals.folder,
      active: vals.active,
      request_condition: { method: vals.method, path: vals.path, headers: {} },
      response_config: { status_code: Number(vals.status_code), headers, body: JSON.parse(vals.response_body || "{}") },
      sequence_next_id: vals.sequence_next_id || null
    };
    await fetch(`${host}/api/mocks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
    setModalOpen(false);
    setMocks(prev => prev.filter(m => m.id !== entry.id).concat(entry));
    if (!folders.includes(entry.folder)) setFolders(prev => [...prev, entry.folder]);
  };

  const deleteMock = async id => {
    await fetch(`${host}/api/mocks?id_=${id}`, { method: "DELETE" });
    setMocks(prev => prev.filter(m => m.id !== id));
  };

  const openAddFolder = () => {
    folderForm.resetFields();
    setFolderModalOpen(true);
  };

  const addFolder = async v => {
    const name = v.name.trim();
    await fetch(`${host}/api/folders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name })
    });
    setFolderModalOpen(false);
    setFolders(prev => [...prev, name]);
  };

  const deleteFolder = name => {
    Modal.confirm({
      title: `Удалить папку "${name}"?`,
      icon: <ExclamationCircleOutlined />,
      onOk: async () => {
        await fetch(`${host}/api/folders?name=${encodeURIComponent(name)}`, { method: "DELETE" });
        setFolders(prev => prev.filter(f => f !== name));
        if (selectedFolder === name) setSelectedFolder("default");
        setMocks([]);
      }
    });
  };

  const handleImport = async file => {
    const fd = new FormData();
    fd.append("file", file);
    await fetch(`${host}/api/mocks/import`, { method: "POST", body: fd });
    setImportModalOpen(false);
    // reload mocks
    const res = await fetch(`${host}/api/mocks?folder=${encodeURIComponent(selectedFolder)}`);
    setMocks(await res.json());
  };

  const handleStatusChange = code => {
    const s = HTTP_STATUSES.find(x => x.value === code);
    if (s) form.setFieldsValue({ response_body: JSON.stringify(s.example, null, 2) });
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <ConfigProvider theme={{ algorithm: antdTheme.defaultAlgorithm, token: { colorBgBase: "#f7f8fa" } }}>
        <Layout style={{ minHeight: "100vh" }}>
          <Header style={{ background: "white", padding: screens.xs ? "8px" : "0 32px", display: "flex", alignItems: "center" }}>
            <Typography.Title level={3} style={{ margin: 0 }}>Mock</Typography.Title>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
              <Typography.Text>Это бэк:</Typography.Text>
              <Input
                value={host}
                onChange={e => setHost(e.target.value)}
                style={{ width: screens.xs ? 200 : 400 }}
              />
              <Button icon={<CopyOutlined />} onClick={handleCopyHost}>Копировать</Button>
              <Button icon={<UploadOutlined />} onClick={() => setImportModalOpen(true)}>Импортировать JSON</Button>
            </div>
          </Header>
          <Layout>
            <Sider width={screens.xs ? 200 : 300} style={{ background: "transparent", padding: 16 }}>
              <div style={{ background: "white", borderRadius: 8, height: "100%", padding: 16, overflowY: "auto" }}>
                <Button block icon={<PlusOutlined />} onClick={openAddFolder} style={{ marginBottom: 12 }}>
                  Добавить страницу
                </Button>
                <Button block type="primary" icon={<PlusOutlined />} onClick={openAddMock}>
                  Создать mock
                </Button>
                <div style={{ marginTop: 16 }}>
                  {folders.map((f, i) => (
                    <DraggableFolder
                      key={f}
                      folder={f}
                      index={i}
                      moveFolder={moveFolder}
                      selectedFolder={selectedFolder}
                      setSelectedFolder={setSelectedFolder}
                      deleteFolder={deleteFolder}
                    />
                  ))}
                </div>
              </div>
            </Sider>
            <Content style={{ padding: 16 }}>
              <div style={{ background: "white", borderRadius: 8, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    Mock на странице: {selectedFolder === "default" ? "Главная" : selectedFolder}
                  </Typography.Title>
                  <Button danger icon={<PoweroffOutlined />} onClick={deactivateAllMocks}>
                    Отключить все моки
                  </Button>
                </div>
                <Table
                  dataSource={mocks}
                  rowKey="id"
                  size="small"
                  columns={[
                    {
                      title: "UUID",
                      dataIndex: "id",
                      width: 140,
                      ellipsis: true,
                      render: id => (
                        <Tooltip title="Копировать UUID">
                          <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyToClipboard(id)}>
                            {id.slice(0, 8)}...
                          </Button>
                        </Tooltip>
                      )
                    },
                    {
                      title: "Активен",
                      dataIndex: "active",
                      width: 80,
                      render: (a, r) => <Switch size="small" checked={a} onChange={v => toggleMockActive(r.id, v)} />
                    },
                    { title: "Метод", dataIndex: ["request_condition", "method"], width: 100 },
                    { title: "Путь", dataIndex: ["request_condition", "path"] },
                    { title: "Статус", dataIndex: ["response_config", "status_code"], width: 100 },
                    {
                      title: "Действия",
                      width: 180,
                      render: (_, r) => (
                        <div style={{ display: "flex", gap: 8 }}>
                          <Button size="small" onClick={() => openEditMock(r)}>Редактировать</Button>
                          <Button size="small" danger onClick={() => deleteMock(r.id)}>Удалить</Button>
                        </div>
                      )
                    }
                  ]}
                    pagination={{ pageSize: 15 }}
                />
              </div>
            </Content>
          </Layout>

          {/* Mock Modal */}
          <Modal
            title={editing ? "Редактирование мока" : "Создание мока"}
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={() => form.submit()}
            width={700}
          >
            <Form form={form} layout="vertical" onFinish={saveMock}>
              <Form.Item name="id" hidden><Input /></Form.Item>
              <Form.Item name="folder" label="Папка" rules={[{ required: true }]}>
                <Select options={folders.map(f => ({ label: f === "default" ? "Главная" : f, value: f }))} />
              </Form.Item>
              <Form.Item name="active" valuePropName="checked"><Checkbox>Активный мок</Checkbox></Form.Item>
              <Form.Item label="Метод и путь" required>
                <Input.Group compact>
                  <Form.Item name="method" noStyle rules={[{ required: true }]}>
                    <Select style={{ width: 120 }} options={METHODS.map(m => ({ label: m, value: m }))} />
                  </Form.Item>
                  <Form.Item name="path" noStyle rules={[{ required: true }]}>
                    <Input placeholder="/api/path" style={{ width: "calc(100% - 120px)" }} />
                  </Form.Item>
                </Input.Group>
              </Form.Item>
              <Form.Item name="status_code" label="HTTP Статус ответа" rules={[{ required: true }]}>
                <Select options={HTTP_STATUSES} onChange={handleStatusChange} />
              </Form.Item>
              <Form.List name="responseHeaders">
                {(fields, { add, remove }) => (
                  <>
                    {fields.map(field => (
                      <Form.Item key={field.key}>
                        <Input.Group compact>
                          <Form.Item {...field} name={[field.name, "key"]} noStyle>
                            <Input placeholder="Ключ" style={{ width: "40%" }} />
                          </Form.Item>
                          <Form.Item {...field} name={[field.name, "value"]} noStyle>
                            <Input placeholder="Значение" style={{ width: "50%" }} />
                          </Form.Item>
                          <MinusCircleOutlined onClick={() => remove(field.name)} style={{ margin: "0 8px", color: "red" }} />
                        </Input.Group>
                      </Form.Item>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                      Добавить заголовок
                    </Button>
                  </>
                )}
              </Form.List>
              <Form.Item name="response_body" label="Тело ответа (JSON)" rules={[{ required: true }]}>
                <TextArea rows={6} />
              </Form.Item>
            </Form>
          </Modal>

          {/* Folder Modal */}
          <Modal
            title="Создание новой страницы"
            open={isFolderModalOpen}
            onCancel={() => setFolderModalOpen(false)}
            footer={null}
          >
            <Form form={folderForm} layout="vertical" onFinish={addFolder}>
              <Form.Item name="name" label="Имя страницы" rules={[{ required: true }]}>
                <Input placeholder="Например: lost" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>
                  Создать страницу
                </Button>
              </Form.Item>
            </Form>
          </Modal>

          {/* Import Modal */}
          <Modal
            title="Импортировать JSON"
            open={importModalOpen}
            onCancel={() => setImportModalOpen(false)}
            footer={null}
          >
            <Dragger accept=".json" maxCount={1} showUploadList={false}
              beforeUpload={file => { handleImport(file); return false; }}>
              <p className="ant-upload-drag-icon"><UploadOutlined /></p>
              <p className="ant-upload-text">Перетащите JSON или нажмите для выбора</p>
            </Dragger>
          </Modal>
        </Layout>
      </ConfigProvider>
    </DndProvider>
  );
}
