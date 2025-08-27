import React, { useState, useEffect } from "react";
import {
  Table, Button, Form, Input, Select, Modal, Layout, message,
  ConfigProvider, Grid, InputNumber, Typography
} from "antd";
import { theme as antdTheme } from "antd";
import { v4 as uuidv4 } from "uuid";
import {
  PlusOutlined,
  DeleteOutlined,
  ExclamationCircleOutlined
} from "@ant-design/icons";

const { Header, Content, Sider } = Layout;
const { TextArea } = Input;
const { useBreakpoint } = Grid;
const { confirm } = Modal;

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

function getBackendUrl() {
  return import.meta.env.VITE_BACKEND_URL || "http://localhost:8000";
}

export default function App() {
  const [form] = Form.useForm();
  const [folders, setFolders] = useState(["default"]);
  const [selectedFolder, setSelectedFolder] = useState("default");
  const [mocks, setMocks] = useState([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [isFolderModalOpen, setFolderModalOpen] = useState(false);
  const [folderForm] = Form.useForm();
  const [host, setHost] = useState(getBackendUrl());
  const screens = useBreakpoint();

  useEffect(() => {
    document.body.style.background = "#f7f8fa";
  }, []);

  const fetchFolders = async () => {
    try {
      const res = await fetch(`${host}/api/mocks/folders`);
      if (!res.ok) throw new Error("Ошибка ответа сервера");
      const data = await res.json();
      setFolders(data.length ? data : ["default"]);
      if (!data.includes(selectedFolder)) setSelectedFolder(data[0] || "default");
    } catch {
      setFolders(["default"]);
      setSelectedFolder("default");
      message.error("Ошибка получения папок (backend недоступен)");
    }
  };

  const fetchMocks = async () => {
    if (!selectedFolder) return;
    try {
      const res = await fetch(`${host}/api/mocks?folder=${encodeURIComponent(selectedFolder)}`);
      if (!res.ok) throw new Error("Ошибка ответа сервера");
      const data = await res.json();
      setMocks(data);
    } catch {
      setMocks([]);
      message.error("Ошибка получения моков (backend недоступен)");
    }
  };

  useEffect(() => { fetchFolders(); }, [host]);
  useEffect(() => { fetchMocks(); }, [selectedFolder, host]);

  const openAddFolderModal = () => {
    folderForm.resetFields();
    setFolderModalOpen(true);
  };

  const handleAddFolder = async (values) => {
    const name = values.name.trim();
    if (folders.includes(name)) {
      message.error("Папка с таким именем уже существует");
      return;
    }
    try {
      const res = await fetch(`${host}/api/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("Не удалось создать папку");
      message.success("Папка создана");
      setFolderModalOpen(false);
      fetchFolders();
    } catch (e) {
      message.error(e.message);
    }
  };

  const handleDeleteFolder = (name) => {
    confirm({
      title: `Удалить папку "${name === "default" ? "Главная" : name}" и все моки в ней?`,
      icon: <ExclamationCircleOutlined />,
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          const res = await fetch(`${host}/api/folders?name=${encodeURIComponent(name)}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Не удалось удалить папку");
          message.success("Папка удалена");
          if (selectedFolder === name) setSelectedFolder("default");
          fetchFolders();
          fetchMocks();
        } catch (e) {
          message.error(e.message);
        }
      },
    });
  };

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      folder: selectedFolder,
      status_code: 200,
      headers: "{}",
      response_headers: "{}",
      response_body: "{}",
    });
    setModalOpen(true);
  };

  const openEdit = (mock) => {
    setEditing(mock);
    form.setFieldsValue({
      id: mock.id,
      folder: mock.folder || "Моки",
      method: mock.request_condition.method,
      path: mock.request_condition.path,
      headers: JSON.stringify(mock.request_condition.headers || {}, null, 2),
      body_contains: mock.request_condition.body_contains || "",
      status_code: mock.response_config.status_code,
      response_headers: JSON.stringify(mock.response_config.headers || {}, null, 2),
      response_body: JSON.stringify(mock.response_config.body, null, 2),
      sequence_next_id: mock.sequence_next_id || "",
    });
    setModalOpen(true);
  };

  const saveMock = async (values) => {
    try {
      const reqHeaders = JSON.parse(values.headers || "{}");
      const respHeaders = JSON.parse(values.response_headers || "{}");
      const respBody = JSON.parse(values.response_body || "{}");

      const entry = {
        id: values.id || uuidv4(),
        folder: values.folder || "default",
        request_condition: {
          method: values.method,
          path: values.path,
          headers: reqHeaders,
          body_contains: values.body_contains || null,
        },
        response_config: {
          status_code: Number(values.status_code),
          headers: respHeaders,
          body: respBody,
        },
        sequence_next_id: values.sequence_next_id || null,
      };
      const r = await fetch(`${host}/api/mocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry),
      });
      if (!r.ok) throw new Error("Ошибка сохранения");
      setModalOpen(false);
      fetchMocks();
      fetchFolders();
      message.success("Мок сохранён");
    } catch (e) {
      message.error("Ошибка сохранения мока: " + (e?.message || ""));
    }
  };

  const deleteMock = async (id) => {
    try {
      const r = await fetch(`${host}/api/mocks?id_=${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Ошибка удаления");
      fetchMocks();
      fetchFolders();
      message.success("Мок удалён");
    } catch (e) {
      message.error("Ошибка удаления моков: " + (e?.message || ""));
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: antdTheme.defaultAlgorithm,
        token: { colorBgBase: "#f7f8fa" },
      }}
    >
      <Layout style={{ minHeight: "100vh", background: "#f7f8fa" }}>
        <Header
          style={{
            color: "#222",
            fontSize: 26,
            background: "white",
            display: "flex",
            alignItems: "center",
            padding: screens.xs ? "4px 8px" : "0 20px",
          }}
        >
          <span style={{ fontWeight: 800, letterSpacing: 0.5 }}>Mock API UI</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              style={{ maxWidth: screens.xs ? 140 : 320, background: "white" }}
              placeholder="Адрес бэкенда"
              size={screens.xs ? "small" : "middle"}
            />
            <Button onClick={fetchFolders} type="default" size={screens.xs ? "small" : "middle"}>
              Подключиться
            </Button>
          </div>
        </Header>
        <Layout style={{ minHeight: "calc(100vh - 64px)" }}>
          {/* Sidebar — увеличенная панель папок */}
          <Sider
            width={550}
            style={{
              background: "transparent",
              border: "none",
              minHeight: "calc(100vh - 64px)",
              maxHeight: "none",
              height: "100%",
            }}
          >
            <div
              style={{
                margin: "32px 18px 0 18px",
                background: "#fff",
                borderRadius: 16,
                boxShadow: "0 3px 16px 0 #ddd4",
                padding: 0,
                minHeight: "calc(100vh - 94px)",
                display: "flex",
                flexDirection: "column",
              }}
            >
              {/* Заголовок/кнопки */}
              <div
                style={{
                  borderBottom: "1px solid #f0f0f0",
                  padding: "14px 18px 12px 18px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <Typography.Text style={{ fontWeight: 600, fontSize: 17 }}>
                  Папки{" "}
                </Typography.Text>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    icon={<PlusOutlined />}
                    onClick={openAddFolderModal}
                    size="small"
                    type="default"
                  >
                    Добавить папку
                  </Button>
                  <Button
                    icon={<PlusOutlined />}
                    onClick={openAdd}
                    type="primary"
                    size="middle"
                    style={{ fontWeight: 600, minWidth: 128 }}
                  >
                    Создать мок
                  </Button>
                </div>
              </div>
              {/* Список папок */}
              <div style={{ overflowY: "auto", flex: 1, padding: "16px 12px 18px 12px" }}>
                {folders.map((folder) => (
                  <div
                    key={folder}
                    style={{
                      padding: "9px 16px",
                      display: "flex",
                      alignItems: "center",
                      background: folder === selectedFolder ? "#dde6fa" : "transparent",
                      borderRadius: 8,
                      margin: "2px 2px",
                      fontWeight: folder === selectedFolder ? 700 : 400,
                      cursor: "pointer",
                      color: "#222",
                      justifyContent: "space-between",
                      transition: "background .2s",
                    }}
                    onClick={() => setSelectedFolder(folder)}
                  >
                    <span style={{ fontWeight: folder === selectedFolder ? 700 : 400 }}>
                      {folder === "default" ? "Главная" : folder}
                    </span>
                    {folder !== "default" && (
                      <Button
                        icon={<DeleteOutlined />}
                        size="small"
                        type="text"
                        danger
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteFolder(folder);
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Sider>

          {/* Content */}
          <Content
            style={{
              minHeight: "calc(100vh - 64px)",
              maxWidth: 980,
              margin: "20px auto",
              background: "#fff",
              borderRadius: 16,
              padding: screens.xs ? 12 : 28,
              boxSizing: "border-box",
              boxShadow: "0 3px 16px 0 #ddd4",
              flex: 1,
            }}
          >
            <Table
              dataSource={mocks}
              rowKey="id"
              columns={[
                { title: "Метод", dataIndex: ["request_condition", "method"], width: 90 },
                { title: "Путь с параметрами", dataIndex: ["request_condition", "path"], ellipsis: true },
                {
                  title: "Статус ответа",
                  dataIndex: ["response_config", "status_code"],
                  width: 110,
                },
                {
                  title: "Действия",
                  width: 160,
                  render: (_, record) => (
                    <>
                      <Button size="small" onClick={() => openEdit(record)} style={{ marginRight: 8 }}>
                        Редактировать
                      </Button>
                      <Button size="small" danger onClick={() => deleteMock(record.id)}>
                        Удалить
                      </Button>
                    </>
                  ),
                },
              ]}
              pagination={{ pageSize: 10 }}
              scroll={{ x: 600 }}
              rowClassName={() => ""}
            />

            {/* Модалки */}
            <Modal
              title={editing ? "Редактирование мока" : "Создание мока"}
              open={modalOpen}
              onCancel={() => setModalOpen(false)}
              onOk={() => form.submit()}
              width="90vw"
              style={{ maxWidth: 900 }}
              bodyStyle={{ maxHeight: "80vh", overflowY: "auto" }}
              destroyOnClose
            >
              <Form form={form} layout="vertical" onFinish={saveMock} initialValues={{ status_code: 200, folder: "default" }}>
                <Form.Item name="id" style={{ display: "none" }}>
                  <Input />
                </Form.Item>

                <Form.Item name="folder" label="Папка" rules={[{ required: true, message: "Введите папку" }]}>
                  <Input placeholder="Например: default, branch1, test" />
                </Form.Item>

                <Form.Item name="method" label="Метод" rules={[{ required: true }]}>
                  <Select options={METHODS.map((m) => ({ label: m, value: m }))} />
                </Form.Item>

                <Form.Item
                  name="path"
                  label="Путь (с параметрами)"
                  rules={[{ required: true, message: "Введите путь для совпадения" }]}
                >
                  <Input placeholder="Например: v1/orders/check?buyerId=123" />
                </Form.Item>

                <Form.Item name="headers" label="Заголовки запроса (JSON), опционально">
                  <TextArea rows={4} placeholder='{"X-FXAPI-RQ-METHOD": "core.user.Login"}' />
                </Form.Item>

                <Form.Item name="body_contains" label="Тело запроса содержит (ключ или JSON), опционально">
                  <Input placeholder="Например: passwordHash" />
                </Form.Item>

                <Form.Item name="status_code" label="HTTP Статус ответа" rules={[{ required: true }]}>
                  <InputNumber min={100} max={599} style={{ width: "100%" }} />
                </Form.Item>

                <Form.Item name="response_headers" label="Заголовки ответа (JSON), опционально">
                  <TextArea rows={3} placeholder='{"X-Custom-Header": "value"}' />
                </Form.Item>

                <Form.Item name="response_body" label="Тело ответа (JSON)" rules={[{ required: true }]}>
                  <TextArea rows={8} placeholder='{"message": "ok"}' />
                </Form.Item>

                <Form.Item name="sequence_next_id" label="ID следующего мока в цепочке (опционально)">
                  <Input placeholder="UUID следующего мок-запроса" />
                </Form.Item>
              </Form>
            </Modal>

            <Modal
              title="Создание новой папки"
              open={isFolderModalOpen}
              onCancel={() => setFolderModalOpen(false)}
              footer={null}
              destroyOnClose
            >
              <Form form={folderForm} onFinish={handleAddFolder} layout="vertical">
                <Form.Item
                  label="Имя папки"
                  name="name"
                  rules={[
                    { required: true, message: "Введите имя папки" },
                    {
                      validator: (_, value) =>
                        folders.includes(value)
                          ? Promise.reject(new Error("Папка с таким именем уже существует"))
                          : Promise.resolve(),
                    },
                  ]}
                >
                  <Input placeholder="Например: new-folder" />
                </Form.Item>
                <Form.Item>
                  <Button type="primary" htmlType="submit" block>
                    Создать папку
                  </Button>
                </Form.Item>
              </Form>
            </Modal>
          </Content>
        </Layout>
      </Layout>
    </ConfigProvider>
  );
}
