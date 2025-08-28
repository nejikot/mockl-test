import React, { useState, useEffect, useRef } from "react";
import {
  Table, Button, Form, Input, Select, Modal, Layout, message,
  ConfigProvider, Typography, Grid, Tooltip, Switch, Checkbox
} from "antd";
import { theme as antdTheme } from "antd";
import {
  PlusOutlined, MinusCircleOutlined, DeleteOutlined,
  ExclamationCircleOutlined, CopyOutlined,
  MenuOutlined, PoweroffOutlined, UploadOutlined
} from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const { Header, Content, Sider } = Layout;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

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
  return (
    <div
      ref={node => drag(drop(node))}
      style={{
        opacity: isDragging ? 0.5 : 1,
        padding: 12,
        marginBottom: 8,
        borderRadius: 8,
        cursor: "pointer",
        background: folder === selectedFolder ? '#e6f7ff' : 'white',
        fontWeight: folder === selectedFolder ? 600 : 400,
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        transition: "background 0.3s"
      }}
      onClick={() => setSelectedFolder(folder)}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MenuOutlined style={{ color: '#999', cursor: 'grab' }} />
        <Typography.Text>
          {folder === "default" ? "Главная" : folder}
        </Typography.Text>
      </div>
      {folder !== "default" && (
        <DeleteOutlined
          onClick={e => { e.stopPropagation(); deleteFolder(folder); }}
          style={{ color: 'red', fontSize: 16 }}
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
  const [editing, setEditing] = useState(null);
  const [host, setHost] = useState(getBackendUrl());
  const screens = useBreakpoint();
  const fileInputRef = useRef();

  useEffect(() => {
    document.body.style.background = "#f0f2f5";
  }, []);

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

  const deactivateAllMocks = () => {
    Modal.confirm({
      title: 'Отключить все моки во всех папках?',
      icon: <ExclamationCircleOutlined />,
      okText: 'Отключить все',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          const res = await fetch(`${host}/api/mocks/deactivate-all`, { method: "PATCH" });
          if (!res.ok) throw new Error();
          setMocks(prev => prev.map(m => ({ ...m, active: false })));
          message.success("Все моки отключены");
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

  const fetchFolders = async () => {
    try {
      const res = await fetch(`${host}/api/mocks/folders`);
      if (!res.ok) throw new Error();
      let data = await res.json();
      if (!data.length) data = ["default"];
      const sorted = ["default", ...data.filter(f => f !== "default")];
      setFolders(sorted);
      if (!sorted.includes(selectedFolder)) setSelectedFolder(sorted[0]);
    } catch {
      setFolders(["default"]);
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

  useEffect(() => { fetchFolders(); }, [host]);
  useEffect(() => { fetchMocks(); }, [selectedFolder, host]);

  const handleStatusChange = code => {
    const st = HTTP_STATUSES.find(s => s.value === code);
    if (st) form.setFieldsValue({ response_body: JSON.stringify(st.example, null, 2) });
  };

  const openAddMock = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      folder: selectedFolder,
      method: "GET",
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
      active: m.active !== false,
      responseHeaders: Object.entries(m.response_config.headers || {}).map(([k, v]) => ({ key: k, value: v })),
      response_body: JSON.stringify(m.response_config.body, null, 2),
      sequence_next_id: m.sequence_next_id || ""
    });
    setModalOpen(true);
  };

  const saveMock = async vals => {
    try {
      const headersObj = {};
      (vals.responseHeaders || []).forEach(it => {
        if (it.key) headersObj[it.key] = it.value || "";
      });
      const entry = {
        id: vals.id || uuidv4(),
        folder: vals.folder,
        active: vals.active !== false,
        request_condition: { method: vals.method, path: vals.path, headers: {} },
        response_config: {
          status_code: Number(vals.status_code),
          headers: headersObj,
          body: JSON.parse(vals.response_body || "{}")
        },
        sequence_next_id: vals.sequence_next_id || null
      };
      const res = await fetch(`${host}/api/mocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      });
      if (!res.ok) throw new Error();
      setModalOpen(false);
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

  const openAddFolder = () => {
    folderForm.resetFields();
    setFolderModalOpen(true);
  };

  const addFolder = async vals => {
    const name = vals.name.trim();
    if (folders.includes(name)) return message.error("Уже существует");
    try {
      const res = await fetch(`${host}/api/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error();
      message.success("Создано");
      setFolderModalOpen(false);
      fetchFolders();
    } catch (e) {
      message.error("Ошибка: " + e.message);
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

  return (
    <DndProvider backend={HTML5Backend}>
      <ConfigProvider theme={{ algorithm: antdTheme.defaultAlgorithm, token: { colorBgBase: "#f0f2f5" } }}>
        <Layout style={{ minHeight: "100vh" }}>
          <Header style={{
            background: "#fff",
            padding: screens.xs ? "8px 16px" : "0 80px",
            display: "flex",
            alignItems: "center",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
          }}>
            <Typography.Title level={30} style={{ margin: 10 }}>ᨐᵒᶜᵏ</Typography.Title>
            <div style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: screens.xs ? "40%" : "25%"
            }}>
              <Typography.Text>Бэк:</Typography.Text>
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
            </div>
          </Header>

          <Content style={{ padding: screens.xs ? "16px" : "24px 80px" }}>
            <Layout style={{ background: "transparent" }}>
              <Sider
                width="25vw"
                style={{
                  background: "transparent",
                  marginRight: screens.xs ? 0 : 24
                }}
              >
                <div style={{
                  background: "#fff",
                  borderRadius: 8,
                  padding: 16,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
                  height: "calc(100vh - 128px)",
                  overflowY: "auto"
                }}>
                  <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                    <Button block onClick={openAddFolder} icon={<PlusOutlined />}>Добавить страницу</Button>
                    <Button block type="primary" onClick={openAddMock} icon={<PlusOutlined />}>Создать mock</Button>
                    <Button
                      block
                      icon={<UploadOutlined />}
                      onClick={onImportClick}
                    >
                      + Импорт mock
                    </Button>
                    <input
                      type="file"
                      accept="application/json"
                      ref={fileInputRef}
                      style={{ display: "none" }}
                      onChange={handleFileChange}
                    />
                  </div>
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
              </Sider>

              <Content style={{ width: "75vw" }}>
                <div style={{
                  background: "#fff",
                  borderRadius: 8,
                  padding: 16,
                  boxShadow: "0 2px 8px rgba(0,0,0,0.05)"
                }}>
                  <div style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 16
                  }}>
                    <Typography.Title level={4} style={{ margin: 0 }}>
                      Mock: {selectedFolder === "default" ? "Главная" : selectedFolder}
                    </Typography.Title>
                    <Button
                      danger
                      icon={<PoweroffOutlined />}
                      onClick={deactivateAllMocks}
                      disabled={!mocks.length}
                    >
                      Отключить все
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
                        width: 100,
                        render: text => (
                          <Tooltip title="Скопировать UUID">
                            <Button
                              type="text"
                              icon={<CopyOutlined />}
                              onClick={() => copyToClipboard(text)}
                              size="small"
                            >
                              {text.slice(0, 8)}...
                            </Button>
                          </Tooltip>
                        )
                      },
                      {
                        title: "Активно",
                        dataIndex: "active",
                        width: 80,
                        render: (a, r) => (
                          <Switch
                            checked={a !== false}
                            onChange={ch => toggleMockActive(r.id, ch)}
                          />
                        )
                      },
                      { title: "Метод", dataIndex: ["request_condition", "method"], width: 80 },
                      { title: "Путь", dataIndex: ["request_condition", "path"], ellipsis: true },
                      { title: "Код", dataIndex: ["response_config", "status_code"], width: 80 },
                      {
                        title: "Действия",
                        width: 180,
                        render: (_, r) => (
                          <div style={{ display: "flex", gap: 8 }}>
                            <Button size="small" onClick={() => openEditMock(r)}>Ред.</Button>
                            <Button size="small" danger onClick={() => deleteMock(r.id)}>Удалить</Button>
                          </div>
                        )
                      }
                    ]}
                    pagination={{
                      pageSize: 10,
                      showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total, range) => `${range[0]}-${range[1]} из ${total}`
                    }}
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
            width={700}
            bodyStyle={{ maxHeight: "70vh", overflowY: "auto" }}
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
                responseHeaders: [{ key: "", value: "" }]
              }}
            >
              <Form.Item name="id" hidden><Input /></Form.Item>

              <Form.Item name="folder" label="Папка" rules={[{ required: true }]}>
                <Select options={folders.map(f => ({
                  label: f === "default" ? "Главная" : f,
                  value: f
                }))} />
              </Form.Item>

              <Form.Item name="active" valuePropName="checked">
                <Checkbox>Активный мок</Checkbox>
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

              <Form.Item name="status_code" label="HTTP статус" rules={[{ required: true }]}>
                <Select options={HTTP_STATUSES} onChange={handleStatusChange} />
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
                              style={{ color: 'red', fontSize: 20 }}
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

              <Form.Item name="response_body" label="Тело (JSON)" rules={[{ required: true }]}>
                <TextArea rows={6} placeholder='{"message":"ok"}' />
              </Form.Item>

              <Form.Item name="sequence_next_id" label="UUID следующего мока">
                <Input placeholder="UUID" />
              </Form.Item>
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
              <Form.Item>
                <Button type="primary" htmlType="submit" block>Создать</Button>
              </Form.Item>
            </Form>
          </Modal>
        </Layout>
      </ConfigProvider>
    </DndProvider>
  );
}
