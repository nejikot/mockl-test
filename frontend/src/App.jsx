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
  theme as antdTheme,
} from "antd";
import { BulbOutlined, BulbFilled } from "@ant-design/icons";

const { Header, Content } = Layout;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const statuses = [
  { code: 200, label: "OK", desc: "Запрос выполнен успешно", example: '{"result":"ok"}' },
  { code: 201, label: "Created", desc: "Создан новый ресурс", example: '{"id":1,"message":"Created"}' },
  { code: 204, label: "No Content", desc: "Успешно, без содержимого", example: "{}" },
  { code: 400, label: "Bad Request", desc: "Некорректный запрос", example: '{"error":"Bad Request"}' },
  { code: 401, label: "Unauthorized", desc: "Неавторизован", example: '{"error":"Unauthorized"}' },
  { code: 404, label: "Not Found", desc: "Ресурс не найден", example: '{"error":"Not Found"}' },
  { code: 500, label: "Internal Server Error", desc: "Ошибка сервера", example: '{"error":"Internal Server Error"}' },
];

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

export default function App() {
  const [form] = Form.useForm();
  // Считываем адрес бекенда из переменной окружения
  const [host, setHost] = useState(import.meta.env.VITE_BACKEND_URL || "http://localhost:8000");
  const [mocks, setMocks] = useState([]);
  const [editing, setEditing] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const screens = useBreakpoint();

  useEffect(() => {
    document.body.style.background = dark ? "#18181c" : "#f7f8fa";
  }, [dark]);

  async function fetchMocks() {
    try {
      const r = await fetch(`${host}/api/mocks`);
      const data = await r.json();
      setMocks(data);
    } catch (e) {
      message.error("Ошибка подключения к серверу");
    }
  }

  useEffect(() => {
    fetchMocks();
  }, [host]);

  function openEdit(mock) {
    setEditing(mock);
    form.setFieldsValue({
      path: mock.path,
      method: mock.method,
      status_code: mock.status_code,
      response: JSON.stringify(mock.response, null, 2),
    });
    setModalOpen(true);
  }

  function handleStatusChange(val) {
    const stat = statuses.find((s) => s.code === val);
    if (stat) {
      form.setFieldsValue({ response: stat.example });
      message.info(stat.desc);
    }
  }

  function openAdd() {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  }

  async function save(values) {
    try {
      const mock = {
        path: values.path,
        method: values.method,
        status_code: Number(values.status_code),
        response: JSON.parse(values.response),
      };
      await fetch(`${host}/api/mocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(mock),
      });
      setModalOpen(false);
      fetchMocks();
      message.success("Мок сохранён!");
    } catch {
      message.error("Ошибка JSON формата!");
    }
  }

  async function remove(mock) {
    await fetch(`${host}/api/mocks?path=${encodeURIComponent(mock.path)}&method=${encodeURIComponent(mock.method)}`, {
      method: "DELETE",
    });
    fetchMocks();
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: dark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
        token: { colorBgBase: dark ? "#18181c" : "#f7f8fa" },
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
            padding: screens.xs ? "4px 8px" : "0 20px",
          }}
        >
          <span style={{ fontWeight: 800, letterSpacing: 0.5 }}>Mock API UI</span>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
            <Input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              style={{ maxWidth: screens.xs ? 140 : 320, background: dark ? "#22232a" : "white" }}
              placeholder="FastAPI адрес"
              size={screens.xs ? "small" : "middle"}
            />
            <Button onClick={fetchMocks} type="default" size={screens.xs ? "small" : "middle"}>
              Подключиться
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
            maxWidth: 900,
            margin: "0 auto",
            width: "100%",
            background: dark ? "#232328" : "#fff",
            borderRadius: 16,
            padding: screens.xs ? 8 : 28,
            boxSizing: "border-box",
            boxShadow: dark ? "0 3px 24px 0 #0004" : "0 3px 16px 0 #ddd4",
            marginTop: screens.xs ? 4 : 26,
          }}
        >
          <Button
            type="primary"
            style={{ marginBottom: 16, width: screens.xs ? "100%" : 160, fontSize: screens.xs ? 16 : 18 }}
            onClick={openAdd}
            block={screens.xs}
          >
            Добавить мок
          </Button>
          <Table
            dataSource={mocks}
            rowKey={(r) => `${r.method}:${r.path}`}
            columns={[
              { title: "Метод", dataIndex: "method", width: 75, responsive: ["xs", "sm", "md", "lg"] },
              { title: "Путь", dataIndex: "path", ellipsis: true },
              { title: "Статус", dataIndex: "status_code", width: 90 },
              {
                title: "Действия",
                render: (m) => (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                    <Button size="small" onClick={() => openEdit(m)}>
                      Редактировать
                    </Button>
                    <Button size="small" danger onClick={() => remove(m)}>
                      Удалить
                    </Button>
                  </div>
                ),
                width: 130,
                responsive: ["sm", "md", "lg"],
              },
            ]}
            scroll={{ x: true }}
            pagination={{ pageSize: screens.xs ? 5 : 10 }}
            style={{ background: dark ? "#232328" : "#fff", borderRadius: 10 }}
            rowClassName={() => (dark ? "ant-table-row-dark" : "")}
          />
          <Modal
            open={modalOpen}
            title={editing ? "Редактирование мока" : "Создание мока"}
            onCancel={() => setModalOpen(false)}
            okText="Сохранить"
            destroyOnClose
            onOk={() => {
              form.submit();
            }}
            width={screens.xs ? "98vw" : 520}
            style={{ top: screens.xs ? 10 : 60 }}
            bodyStyle={{ background: dark ? "#18181c" : "#fff" }}
          >
            <Form form={form} layout="vertical" onFinish={save}>
              <Form.Item label="Путь" name="path" rules={[{ required: true }]}>
                <Input placeholder="например, users/1" autoComplete="off" />
              </Form.Item>
              <Form.Item label="HTTP Метод" name="method" rules={[{ required: true }]}>
                <Select options={METHODS.map((v) => ({ label: v, value: v }))} />
              </Form.Item>
              <Form.Item label="HTTP Статус" name="status_code" rules={[{ required: true }]}>
                <Select onChange={handleStatusChange} options={statuses.map((s) => ({ value: s.code, label: `${s.code} ${s.label}` }))} />
              </Form.Item>
              <Form.Item label="JSON Ответ" name="response" rules={[{ required: true }]}>
                <TextArea rows={6} placeholder='{"id": 1, "name": "Alice"}' style={{ fontFamily: "monospace", fontSize: 15 }} />
              </Form.Item>
            </Form>
            <div style={{ marginTop: 6, fontSize: 13, color: dark ? "#fadb14" : "#888" }}>
              {statuses.find((s) => s.code === form.getFieldValue("status_code"))?.desc}
            </div>
          </Modal>
        </Content>
      </Layout>
    </ConfigProvider>
  );
}
