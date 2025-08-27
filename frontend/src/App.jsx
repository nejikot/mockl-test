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
  Switch,
  Grid,
  InputNumber
} from "antd";
import { v4 as uuidv4 } from "uuid";
import { BulbOutlined, BulbFilled } from "@ant-design/icons";

const { Header, Content } = Layout;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

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

  const [dark, setDark] = useState(false);

  const screens = useBreakpoint();

  const [host, setHost] = useState(getBackendUrl());

  useEffect(() => {
    document.body.style.background = dark ? "#18181c" : "#f7f8fa";
  }, [dark]);

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

  useEffect(() => {
    fetchFolders();
  }, [host]);

  useEffect(() => {
    fetchMocks();
  }, [selectedFolder, host]);

  const openAdd = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({
      folder: selectedFolder,
      status_code: 200,
      headers: "{}",
      response_headers: "{}",
      response_body: "{}"
    });
    setModalOpen(true);
  };

  const openEdit = (mock) => {
    setEditing(mock);
    form.setFieldsValue({
      id: mock.id,
      folder: mock.folder || "default",
      method: mock.request_condition.method,
      path: mock.request_condition.path,
      headers: JSON.stringify(mock.request_condition.headers || {}, null, 2),
      body_contains: mock.request_condition.body_contains || "",
      status_code: mock.response_config.status_code,
      response_headers: JSON.stringify(mock.response_config.headers || {}, null, 2),
      response_body: JSON.stringify(mock.response_config.body, null, 2),
      sequence_next_id: mock.sequence_next_id || ""
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
          body_contains: values.body_contains || null
        },
        response_config: {
          status_code: Number(values.status_code),
          headers: respHeaders,
          body: respBody
        },
        sequence_next_id: values.sequence_next_id || null
      };
      const r = await fetch(`${host}/api/mocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      });
      if (!r.ok) throw new Error("Ошибка сохранения");
      setModalOpen(false);
      fetchMocks();
      fetchFolders();
      message.success("Мок сохранён");
    } catch (e) {
      message.error("Ошибка сохранения мока: " + (e.message || ""));
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
      message.error("Ошибка удаления мока: " + (e.message || ""));
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { colorBgBase: dark ? "#18181c" : "#f7f8fa" }
      }}
    >
      <Layout style={{ minHeight: "100vh", background: dark ? "#18181c" : "#f7f8fa" }}>
        <Header
          style={{
            color: dark ? "#ddd" : "#222",
            fontSize: 26,
            background: dark ? "#22232a" : "white",
            display: "flex",
            alignItems: "center",
            padding: screens.xs ? "4px 8px" : "0 20px"
          }}
        >
          <span style={{ fontWeight: 800, letterSpacing: 0.5 }}>Mock API UI</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              style={{ maxWidth: screens.xs ? 140 : 320, background: dark ? "#22232a" : "white" }}
              placeholder="Адрес бэкенда"
              size={screens.xs ? "small" : "middle"}
            />
            <Button onClick={fetchFolders} type="default" size={screens.xs ? "small" : "middle"}>
              Подключиться
            </Button>

            <Select
              value={selectedFolder}
              onChange={setSelectedFolder}
              style={{ minWidth: screens.xs ? 120 : 200 }}
              options={folders.map((f) => ({ label: f, value: f }))}
              dropdownMatchSelectWidth={false}
            />

            <Button type="primary" onClick={openAdd}>
              Добавить мок
            </Button>

            <Switch
              checkedChildren={<BulbFilled />}
              unCheckedChildren={<BulbOutlined />}
              checked={dark}
              onChange={setDark}
              style={{ background: dark ? "#eeb622" : "#eee" }}
            />
          </div>
        </Header>
        <Content
          style={{
            minHeight: "calc(100vh - 64px)",
            maxWidth: 980,
            margin: "20px auto",
            background: dark ? "#232328" : "#fff",
            borderRadius: 16,
            padding: screens.xs ? 12 : 28,
            boxSizing: "border-box",
            boxShadow: dark ? "0 3px 24px 0 #0004" : "0 3px 16px 0 #ddd4"
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
                width: 110
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
                )
              }
            ]}
            pagination={{ pageSize: 10 }}
            scroll={{ x: 600 }}
            rowClassName={() => (dark ? "ant-table-row-dark" : "")}
          />

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
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
