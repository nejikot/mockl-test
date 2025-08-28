// App.jsx
import React, { useState, useEffect } from "react";
import {
  Table, Button, Form, Input, Select, Modal, Layout, message,
  ConfigProvider, Typography, Grid, Tooltip, Switch, Checkbox, Upload
} from "antd";
import { theme as antdTheme } from "antd";
import {
  PlusOutlined, MinusCircleOutlined, DeleteOutlined,
  ExclamationCircleOutlined, CopyOutlined, MenuOutlined,
  PoweroffOutlined, UploadOutlined
} from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const { Header, Content, Sider } = Layout;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

const HTTP_STATUSES = [
  { value: 200, label: "200 - OK", example: { "message": "success", "data": {} } },
  { value: 201, label: "201 - Created", example: { "message": "created", "id": "123" } },
  { value: 400, label: "400 - Bad Request", example: { "error": "bad request", "message": "Invalid input" } },
  { value: 401, label: "401 - Unauthorized", example: { "error": "unauthorized", "message": "Authentication required" } },
  { value: 403, label: "403 - Forbidden", example: { "error": "forbidden", "message": "Access denied" } },
  { value: 404, label: "404 - Not Found", example: { "error": "not found", "message": "Resource not found" } },
  { value: 422, label: "422 - Unprocessable Entity", example: { "error": "validation failed", "details": [] } },
  { value: 500, label: "500 - Internal Server Error", example: { "error": "internal server error", "message": "Something went wrong" } },
  { value: 502, label: "502 - Bad Gateway", example: { "error": "bad gateway", "message": "Upstream server error" } },
  { value: 503, label: "503 - Service Unavailable", example: { "error": "service unavailable", "message": "Service temporarily unavailable" } }
];

function getBackendUrl() {
  return import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
}

const DraggableFolder = ({ folder, index, moveFolder, selectedFolder, setSelectedFolder, deleteFolder }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'folder',
    item: { index, folder },
    collect: monitor => ({ isDragging: monitor.isDragging() }),
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
      onClick={() => setSelectedFolder(folder)}
      style={{
        opacity: isDragging ? 0.5 : 1,
        padding: 10,
        marginBottom: 6,
        borderRadius: 6,
        cursor: "pointer",
        background: folder === selectedFolder ? '#d9e4ff' : 'transparent',
        fontWeight: folder === selectedFolder ? 'bold' : 'normal',
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <MenuOutlined style={{ color: '#999', cursor: 'grab' }} />
        <span>{folder === "default" ? "Главная" : folder}</span>
      </div>
      {folder !== "default" && (
        <DeleteOutlined
          onClick={e => { e.stopPropagation(); deleteFolder(folder); }}
          style={{ color: 'red' }}
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

  useEffect(() => { document.body.style.background = "#f7f8fa"; }, []);

  const copyToClipboard = text => {
    navigator.clipboard.writeText(text)
      .then(() => message.success('Скопировано'))
      .catch(() => message.error('Ошибка копирования'));
  };

  const toggleMockActive = async (mockId, isActive) => {
    try {
      const res = await fetch(`${host}/api/mocks/${mockId}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: isActive })
      });
      if (!res.ok) throw new Error("Ошибка изменения статуса");
      fetchMocks();
      message.success(isActive ? "Активировано" : "Деактивировано");
    } catch (e) {
      message.error("Ошибка: " + e.message);
    }
  };

  const deactivateAllMocks = async () => {
    Modal.confirm({
      title: 'Отключить все моки во всех папках?',
      icon: <ExclamationCircleOutlined />,
      okText: 'Отключить все',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          const res = await fetch(`${host}/api/mocks/deactivate-all`, {
            method: "PATCH"
          });
          if (!res.ok) throw new Error("Ошибка отключения");
          fetchMocks();
          message.success("Все моки отключены");
        } catch (e) {
          message.error("Ошибка: " + e.message);
        }
      }
    });
  };

  const moveFolder = (fromIndex, toIndex) => {
    const newFolders = [...folders];
    const [moved] = newFolders.splice(fromIndex, 1);
    newFolders.splice(toIndex, 0, moved);
    const defIdx = newFolders.indexOf("default");
    if (defIdx > 0) {
      newFolders.splice(defIdx, 1);
      newFolders.unshift("default");
    }
    setFolders(newFolders);
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch(`${host}/api/mocks/folders`);
      if (!res.ok) throw new Error();
      let data = await res.json();
      if (!data.length) data = ["default"];
      const sorted = data.filter(f => f !== "default");
      sorted.unshift("default");
      setFolders(sorted);
      if (!data.includes(selectedFolder)) setSelectedFolder(sorted[0]);
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
      const data = await res.json();
      setMocks(data);
    } catch {
      setMocks([]);
      message.error("Ошибка получения моков");
    }
  };

  useEffect(fetchFolders, [host]);
  useEffect(fetchMocks, [selectedFolder, host]);

  const handleStatusChange = statusCode => {
    const status = HTTP_STATUSES.find(s => s.value === statusCode);
    if (status) form.setFieldsValue({ response_body: JSON.stringify(status.example, null, 2) });
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

  const openEditMock = mock => {
    setEditing(mock);
    form.setFieldsValue({
      id: mock.id,
      folder: mock.folder,
      method: mock.request_condition.method,
      path: mock.request_condition.path,
      status_code: mock.response_config.status_code,
      active: mock.active !== false,
      responseHeaders: Object.entries(mock.response_config.headers || {}).map(([k, v]) => ({ key: k, value: v })),
      response_body: JSON.stringify(mock.response_config.body, null, 2),
      sequence_next_id: mock.sequence_next_id || ""
    });
    setModalOpen(true);
  };

  const saveMock = async values => {
    try {
      const headersObj = {};
      (values.responseHeaders || []).forEach(({ key, value }) => {
        if (key) headersObj[key] = value || "";
      });
      const entry = {
        id: values.id || uuidv4(),
        folder: values.folder,
        active: values.active !== false,
        request_condition: { method: values.method, path: values.path, headers: {} },
        response_config: { status_code: Number(values.status_code), headers: headersObj, body: JSON.parse(values.response_body || "{}") },
        sequence_next_id: values.sequence_next_id || null
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
      message.success("Мок сохранён");
    } catch {
      message.error("Ошибка сохранения");
    }
  };

  const deleteMock = async id => {
    try {
      const res = await fetch(`${host}/api/mocks?id_=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      fetchMocks();
      fetchFolders();
      message.success("Мок удалён");
    } catch {
      message.error("Ошибка удаления");
    }
  };

  const openAddFolder = () => {
    folderForm.resetFields();
    setFolderModalOpen(true);
  };

  const addFolder = async values => {
    const name = values.name.trim();
    if (folders.includes(name)) {
      message.error("Такая папка уже есть");
      return;
    }
    try {
      const res = await fetch(`${host}/api/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error();
      message.success("Папка создана");
      setFolderModalOpen(false);
      fetchFolders();
    } catch {
      message.error("Ошибка создания папки");
    }
  };

  const deleteFolder = name => {
    if (name === "default") {
      message.warning("Нельзя удалить Главная");
      return;
    }
    Modal.confirm({
      title: `Удалить папку '${name}' и все её моки?`,
      icon: <ExclamationCircleOutlined />,  
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          const res = await fetch(`${host}/api/folders?name=${encodeURIComponent(name)}`, { method: "DELETE" });
          if (!res.ok) throw new Error();
          message.success("Папка удалена");
          if (selectedFolder === name) setSelectedFolder(" default");
          fetchFolders();
          fetchMocks();
        } catch {
          message.error("Ошибка удаления папки");
        }
      }
    });
  };

  const uploadProps = {
    name: 'file',
    accept: '.json',
    showUploadList: false,
    customRequest: async ({ file, onSuccess, onError }) => {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch(`${host}/api/mocks/import`, {
          method: 'POST',
          body: formData
        });
        if (!res.ok) {
          const err = await res.text();
          throw new Error(err || 'Import failed');
        }
        const data = await res.json();
        message.success(data.message);
        fetchFolders();
        fetchMocks();
        onSuccess(data, file);
      } catch (err) {
        message.error("Ошибка импорта: " + err.message);
        onError(err);
      }
    }
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <ConfigProvider theme={{ algorithm: antdTheme.defaultAlgorithm, token: { colorBgBase: "#f7f8fa" } }}>
        <Layout style={{ minHeight: "100vh", background: "#f7f8fa" }}>
          <Header style={{
            color: "#222", fontSize: 60, background: "white",
            display: "flex", alignItems: "center", padding: screens.xs ? "4px 8px" : "0 100px"
          }}>
            <span style={{ fontWeight: 80, letterSpacing: 0.5 }}>ᨐock</span>
            <div style={{
              marginLeft: "auto", display: "flex",
              alignItems: "center", gap: 8, width: screens.xs ? "50%" : "30%"
            }}>
              <Typography.Text>Это бэк:</Typography.Text>
              <Input
                value={host}
                onChange={e => setHost(e.target.value)}
                style={{ flex: 1, background: "white" }}
                placeholder="Адрес бэкенда"
                size={screens.xs ? "small" : "middle"}
              />
              <Tooltip title="Копировать">
                <Button icon={<CopyOutlined />} onClick={() => copyToClipboard(host)} />
              </Tooltip>
              <Upload {...uploadProps}>
                <Button icon={<UploadOutlined />}>Импортировать JSON</Button>
              </Upload>
            </div>
          </Header>

          <div style={{ padding: "20px" }}>
            <Layout style={{ minHeight: "calc(100vh - 104px)", background: "transparent" }}>
              <Sider width={350} style={{ background: "transparent", padding: 0 }}>
                <div style={{
                  background: "white", height: "calc(100vh - 104px)",
                  borderRadius: 16, boxShadow: "0 0 35px rgb(0 0 0 / 5%)",
                  display: "flex", flexDirection: "column"
                }}>
                  <div style={{
                    padding: 16, borderBottom: "1px solid #eee",
                    display: "flex", gap: 12
                  }}>
                    <Button size="small" onClick={openAddFolder} icon={<PlusOutlined />}>Добавить страницу</Button>
                    <Button size="small" type="primary" onClick={openAddMock} icon={<PlusOutlined />}>Создать mock</Button>
                  </div>
                  <div style={{ flex: 1, overflowY: "auto", padding: "8px 16px" }}>
                    {folders.map((f, i) => (
                      <DraggableFolder
                        key={f} folder={f} index={i}
                        moveFolder={moveFolder}
                        selectedFolder={selectedFolder}
                        setSelectedFolder={setSelectedFolder}
                        deleteFolder={deleteFolder}
                      />
                    ))}
                  </div>
                </div>
              </Sider>

              <Content style={{
                marginLeft: 20, background: "white",
                borderRadius: 16, boxShadow: "0 0 35px rgb(0 0 0 / 5%)",
                height: "calc(100vh - 104px)", overflowY: "auto",
                display: "flex", flexDirection: "column"
              }}>
                <div style={{
                  padding: 16, borderBottom: "1px solid #eee",
                  display: "flex", justifyContent: "space-between", alignItems: "center"
                }}>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    Mock на странице: {selectedFolder === "default" ? "Главная" : selectedFolder}
                  </Typography.Title>
                  <Button
                    danger icon={<PoweroffOutlined />}
                    onClick={deactivateAllMocks}
                    disabled={!mocks.length}
                  >
                    Отключить все моки
                  </Button>
                </div>
                <div style={{ flex: 1, padding: 16 }}>
                  <Table
                    dataSource={mocks}
                    rowKey="id"
                    size="small"
                    columns={[
                      {
                        title: "UUID", dataIndex: "id", width: 90, ellipsis: true,
                        render: t => (
                          <Tooltip title="Нажмите чтобы скопировать">
                            <Button
                              type="text" size="small"
                              icon={<CopyOutlined />}
                              onClick={() => copyToClipboard(t)}
                            >
                              {t.substring(0, 8)}...
                            </Button>
                          </Tooltip>
                        )
                      },
                      {
                        title: "Статус", dataIndex: "active", width: 80,
                        render: (a, r) => (
                          <Switch
                            checked={a !== false}
                            size="small"
                            onChange={ch => toggleMockActive(r.id, ch)}
                          />
                        )
                      },
                      { title: "Метод", dataIndex: ["request_condition", "method"], width: 65 },
                      { title: "Путь с параметрами", dataIndex: ["request_condition", "path"], ellipsis: true },
                      { title: "Статус ответа", dataIndex: ["response_config", "status_code"], width: 110 },
                      {
                        title: "Действия", width: 200,
                        render: (_, r) => (
                          <div style={{ display: "flex", gap: 8 }}>
                            <Button size="small" onClick={() => openEditMock(r)}>Редактировать</Button>
                            <Button size="small" danger onClick={() => deleteMock(r.id)}>Удалить</Button>
                          </div>
                        )
                      }
                    ]}
                    pagination={{
                      pageSize: 15, showSizeChanger: true,
                      showQuickJumper: true,
                      showTotal: (total, range) => `${range[0]}-${range[1]} из ${total} записей`
                    }}
                    scroll={{ x: 700 }}
                  />
                </div>
              </Content>
            </Layout>
          </div>

          <Modal
            title={editing ? "Редактирование мока" : "Создание мока"}
            open={modalOpen}
            onCancel={() => setModalOpen(false)}
            onOk={() => form.submit()}
            width={700}
            bodyStyle={{ maxHeight: "70vh", overflowY: "auto" }}
            destroyOnClose
          >
            <Form form={form} layout="vertical" onFinish={saveMock}>
              <Form.Item name="id" hidden><Input /></Form.Item>
              <Form.Item name="folder" label="Папка" rules={[{ required: true }]}>
                <Select options={folders.map(f => ({ label: f === "default" ? "Главная" : f, value: f }))} />
              </Form.Item>
              <Form.Item name="active" valuePropName="checked">
                <Checkbox>Активный мок</Checkbox>
              </Form.Item>
              <Form.Item label="Метод и путь" required>
                <Input.Group compact style={{ display: "flex" }}>
                  <Form.Item name="method" noStyle rules={[{ required: true }]}>
                    <Select style={{ width: 120 }} options={METHODS.map(m => ({ label: m, value: m }))} />
                  </Form.Item>
                  <Form.Item name="path" noStyle rules={[{ required: true }]}>
                    <Input style={{ flex: 1, marginLeft: 8 }} placeholder="/api/sample/path" />
                  </Form.Item>
                </Input.Group>
              </Form.Item>
              <Form.Item name="status_code" label="HTTP Статус ответа" rules={[{ required: true }]}>
                <Select
                  options={HTTP_STATUSES}
                  onChange={handleStatusChange}
                  placeholder="Выберите статус"
                />
              </Form.Item>
              <Form.List name="responseHeaders">
                {(fields, { add, remove }) => (
                  <>
                    <Typography.Text strong>Заголовки ответа:</Typography.Text>
                    {fields.map((f, i) => (
                      <Form.Item key={f.key}>
                        <Input.Group compact style={{ display: "flex" }}>
                          <Form.Item {...f} name={[f.name, 'key']} noStyle>
                            <Input placeholder="Ключ" style={{ width: '40%' }} />
                          </Form.Item>
                          <Form.Item {...f} name={[f.name, 'value']} noStyle>
                            <Input placeholder="Значение" style={{ width: '50%', marginLeft: 8 }} />
                          </Form.Item>
                          {fields.length > 1 && (
                            <MinusCircleOutlined onClick={() => remove(f.name)} style={{ color: 'red', marginLeft: 8 }} />
                          )}
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
                <TextArea rows={8} placeholder='{"message":"ok"}' />
              </Form.Item>
              <Form.Item name="sequence_next_id" label="UUID следующего мока">
                <Input placeholder="UUID следующего мок-запроса" />
              </Form.Item>
            </Form>
          </Modal>

          <Modal
            title="Создание новой страницы"
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
                  { required: true, message: 'Введите имя страницы' },
                  { validator: (_, val) => folders.includes(val) ? Promise.reject('Страница уже существует') : Promise.resolve() }
                ]}
              >
                <Input placeholder="Например: lost" />
              </Form.Item>
              <Form.Item>
                <Button type="primary" htmlType="submit" block>Создать страницу</Button>
              </Form.Item>
            </Form>
          </Modal>
        </Layout>
      </ConfigProvider>
    </DndProvider>
  );
}
