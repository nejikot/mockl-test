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

const headersToFormList = headersObj => {
  const list = Object.entries(headersObj || {}).map(([k, v]) => ({ key: k, value: v }));
  return list.length ? list : [{ key: "", value: "" }];
};

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
      requestHeaders: [{ key: "", value: "" }],
      request_body_contains: "",
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
      requestHeaders: headersToFormList(m.request_condition.headers),
      request_body_contains: m.request_condition.body_contains || "",
      status_code: m.response_config.status_code,
      active: m.active !== false,
      responseHeaders: headersToFormList(m.response_config.headers),
      response_body: JSON.stringify(m.response_config.body, null, 2)
    });
    setModalOpen(true);
  };

  const saveMock = async vals => {
    try {
      const toHeaderObject = list => {
        const obj = {};
        (list || []).forEach(it => {
          if (it.key) obj[it.key] = it.value || "";
        });
        return obj;
      };

      const responseHeadersObj = toHeaderObject(vals.responseHeaders || []);
      const requestHeadersObj = toHeaderObject(vals.requestHeaders || []);

      const bodyContains = (vals.request_body_contains || "").trim();

      const entry = {
        id: vals.id || uuidv4(),
        folder: vals.folder,
        active: vals.active !== false,
        request_condition: {
          method: vals.method,
          path: vals.path,
          headers: Object.keys(requestHeadersObj).length ? requestHeadersObj : {},
          body_contains: bodyContains || null
        },
        response_config: {
          status_code: Number(vals.status_code),
          headers: responseHeadersObj,
          body: JSON.parse(vals.response_body || "{}")
        }
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

  const isDesktop = screens.md ?? false;
  const stickyTopOffset = isDesktop ? 88 : 64;
  const isDefaultFolder = selectedFolder === "default";
  const folderTitle = isDefaultFolder ? "Главная" : selectedFolder;
  const primaryButtonStyle = {
    minWidth: isDesktop ? 160 : "calc(50% - 8px)",
    flex: isDesktop ? "0 0 auto" : "1 1 calc(50% - 8px)"
  };

  const actionToolbar = (
    <div style={{ position: "sticky", top: stickyTopOffset, zIndex: 10, marginBottom: 24 }}>
      <div style={{
        background: "#fff",
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
          onClick={deactivateAllMocks}
          disabled={!mocks.length}
          style={{ ...primaryButtonStyle, justifySelf: "flex-end" }}
        >
          Отключить все
        </Button>
      </div>
    </div>
  );

  return (
    <DndProvider backend={HTML5Backend}>
      <ConfigProvider theme={{ algorithm: antdTheme.defaultAlgorithm, token: { colorBgBase: "#f0f2f5" } }}>
        <Layout style={{ minHeight: "100vh" }}>
          <Header style={{
            background: "#fff",
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
              <Typography.Text type="secondary">гибкий mock-сервер</Typography.Text>
            </div>
            <div style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flex: isDesktop ? "0 0 320px" : "1 1 100%"
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
            </div>
          </Header>

          <Content style={{ padding: isDesktop ? "24px 80px" : "16px" }}>
            {actionToolbar}
            <Layout style={{
              background: "transparent",
              display: "flex",
              flexDirection: isDesktop ? "row" : "column",
              gap: 24
            }}>
              <Sider
                width={isDesktop ? 320 : "100%"}
                style={{
                  background: "transparent",
                  marginRight: isDesktop ? 0 : 0
                }}
              >
                <div style={{
                  background: "#fff",
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
                  position: isDesktop ? "sticky" : "static",
                  top: isDesktop ? stickyTopOffset + 40 : "auto",
                  maxHeight: isDesktop ? "calc(100vh - 180px)" : "none",
                  overflowY: "auto"
                }}>
                  <Typography.Title level={5} style={{ margin: 0, marginBottom: 12 }}>
                    Страницы
                  </Typography.Title>
                  <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
                    Перетаскивайте, чтобы упорядочить, или удаляйте ненужные.
                  </Typography.Paragraph>
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

              <Content style={{ width: "100%" }}>
                {isDefaultFolder && (
                  <div style={{
                    background: "#fff",
                    borderRadius: 12,
                    padding: isDesktop ? 24 : 16,
                    boxShadow: "0 12px 30px rgba(15,23,42,0.05)",
                    marginBottom: 16
                  }}>
                    <Typography.Title level={3} style={{ marginTop: 0 }}>
                      MockK — среда для гибкого тестирования
                    </Typography.Title>
                    <Typography.Paragraph>
                      Проект помогает эмулировать backend-эндпоинты без поднятия реальных сервисов.
                      Поддерживаются фильтры по HTTP-методу, пути, заголовкам и даже частям тела запроса,
                      а ответ можно настроить с нужным статусом, заголовками и JSON.
                    </Typography.Paragraph>
                    <Typography.Title level={4}>Как пользоваться</Typography.Title>
                    <ol style={{ paddingLeft: 18, lineHeight: 1.6 }}>
                      <li>Настройте адрес работающего backend-а сверху, чтобы панель могла обращаться к API.</li>
                      <li>Создайте страницу (папку) для логической группы моков и выберите её слева.</li>
                      <li>Нажмите «Создать mock», укажите метод, путь, необходимые заголовки/фрагмент тела и соберите желаемый ответ.</li>
                      <li>Сохраните и убедитесь, что мок активен — он сразу начнёт перехватывать запросы.</li>
                    </ol>
                    <Typography.Paragraph type="secondary" style={{ marginTop: 12 }}>
                      Советы: используйте заголовки и поиск по телу запроса, чтобы разделять похожие вызовы,
                      а с помощью кнопок сверху быстро переключайте сценарии и импортируйте коллекции Postman.
                    </Typography.Paragraph>
                  </div>
                )}

                <div style={{
                  background: "#fff",
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
                    <Typography.Text type="secondary">
                      {mocks.length ? `${mocks.length} мок(ов)` : "Пока нет моков"}
                    </Typography.Text>
                  </div>

                  <Table
                    dataSource={mocks}
                    rowKey="id"
                    size="middle"
                    columns={[
                      {
                        title: "UUID",
                        dataIndex: "id",
                        width: 120,
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
                        width: 90,
                        render: (a, r) => (
                          <Switch
                            checked={a !== false}
                            onChange={ch => toggleMockActive(r.id, ch)}
                          />
                        )
                      },
                      { title: "Метод", dataIndex: ["request_condition", "method"], width: 90 },
                      { title: "Путь", dataIndex: ["request_condition", "path"], ellipsis: true },
                      { title: "Код", dataIndex: ["response_config", "status_code"], width: 90 },
                      {
                        title: "Действия",
                        width: 200,
                        render: (_, r) => (
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <Button size="small" onClick={() => openEditMock(r)}>Редактировать</Button>
                            <Button size="small" danger onClick={() => deleteMock(r.id)}>Удалить</Button>
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
                requestHeaders: [{ key: "", value: "" }],
                request_body_contains: "",
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

              <Form.List name="requestHeaders">
                {(fields, { add, remove }) => (
                  <>
                    <Typography.Text strong>Заголовки запроса</Typography.Text>
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

              <Form.Item
                name="request_body_contains"
                label="Фрагмент тела запроса"
                tooltip="Если заполнено, мок сработает только когда тело содержит эту строку"
              >
                <TextArea rows={3} placeholder='Например {"user":"123"}' />
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
