import React, { useState, useEffect } from "react";
import {
  Table, Button, Form, Input, Select, Modal, Layout, message,
  ConfigProvider, Typography, Grid, Tooltip, Switch, Checkbox
} from "antd";
import { theme as antdTheme } from "antd";
import { PlusOutlined, MinusCircleOutlined, DeleteOutlined, ExclamationCircleOutlined, CopyOutlined, MenuOutlined, PoweroffOutlined } from "@ant-design/icons";
import { v4 as uuidv4 } from "uuid";
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

const { Header, Content, Sider } = Layout;
const { TextArea } = Input;
const { useBreakpoint } = Grid;

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH"];

// HTTP статусы с примерами ответов
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

// Компонент для перетаскиваемого элемента папки
const DraggableFolder = ({ folder, index, moveFolder, selectedFolder, setSelectedFolder, deleteFolder }) => {
  const [{ isDragging }, drag] = useDrag({
    type: 'folder',
    item: { index, folder },
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  });

  const [, drop] = useDrop({
    accept: 'folder',
    hover: (item) => {
      if (item.index !== index) {
        moveFolder(item.index, index);
        item.index = index;
      }
    },
  });

  return (
    <div
      ref={(node) => drag(drop(node))}
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
      onClick={() => setSelectedFolder(folder)}
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

  useEffect(() => {
    document.body.style.background = "#f7f8fa";
  }, []);

  // Функция для копирования UUID в буфер обмена
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      message.success('UUID скопирован в буфер обмена');
    }).catch(() => {
      message.error('Не удалось скопировать UUID');
    });
  };

  // Функция для переключения активности мока
  const toggleMockActive = async (mockId, isActive) => {
    try {
      const res = await fetch(`${host}/api/mocks/${mockId}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: isActive })
      });
      if (!res.ok) throw new Error("Ошибка изменения статуса");
      fetchMocks();
      message.success(isActive ? "Мок активирован" : "Мок деактивирован");
    } catch (e) {
      message.error("Ошибка: " + e.message);
    }
  };

  // Функция для отключения всех моков
  const deactivateAllMocks = async () => {
    Modal.confirm({
      title: 'Отключить все моки в текущей папке?',
      icon: <ExclamationCircleOutlined />,
      okText: 'Отключить все',
      cancelText: 'Отмена',
      onOk: async () => {
        try {
          const res = await fetch(`${host}/api/mocks/deactivate-all?folder=${encodeURIComponent(selectedFolder)}`, {
            method: "PATCH"
          });
          if (!res.ok) throw new Error("Ошибка отключения моков");
          fetchMocks();
          message.success("Все моки отключены");
        } catch (e) {
          message.error("Ошибка: " + e.message);
        }
      }
    });
  };

  // Функция для перемещения папок
  const moveFolder = (fromIndex, toIndex) => {
    const newFolders = [...folders];
    const [movedFolder] = newFolders.splice(fromIndex, 1);
    newFolders.splice(toIndex, 0, movedFolder);
    
    // Убеждаемся, что "default" всегда первая
    const defaultIndex = newFolders.indexOf("default");
    if (defaultIndex > 0) {
      const [defaultFolder] = newFolders.splice(defaultIndex, 1);
      newFolders.unshift(defaultFolder);
    }
    
    setFolders(newFolders);
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch(`${host}/api/mocks/folders`);
      if (!res.ok) throw new Error("Ошибка ответа сервера");
      let data = await res.json();
      if (!data.length) data = ["default"];
      
      // Убеждаемся, что "default" всегда первая
      const sortedFolders = data.filter(f => f !== "default");
      sortedFolders.unshift("default");
      
      setFolders(sortedFolders);
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

  // Функция для обновления примера ответа при выборе статуса
  const handleStatusChange = (statusCode) => {
    const status = HTTP_STATUSES.find(s => s.value === statusCode);
    if (status) {
      form.setFieldsValue({
        response_body: JSON.stringify(status.example, null, 2)
      });
    }
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
      response_body: JSON.stringify({ "message": "success", "data": {} }, null, 2)
    });
    setModalOpen(true);
  };

  const openEditMock = (mock) => {
    setEditing(mock);
    form.setFieldsValue({
      id: mock.id,
      folder: mock.folder,
      method: mock.request_condition.method,
      path: mock.request_condition.path,
      status_code: mock.response_config.status_code,
      active: mock.active !== false, // по умолчанию true если не указано
      responseHeaders: Object.entries(mock.response_config.headers || {}).map(([key, value]) => ({ key, value })),
      response_body: JSON.stringify(mock.response_config.body, null, 2),
      sequence_next_id: mock.sequence_next_id || ""
    });
    setModalOpen(true);
  };

  const saveMock = async (values) => {
    try {
      let headersObj = {};
      (values.responseHeaders || []).forEach(item => {
        if (item?.key) {
          headersObj[item.key] = item.value || "";
        }
      });

      const entry = {
        id: values.id || uuidv4(),
        folder: values.folder,
        active: values.active !== false,
        request_condition: {
          method: values.method,
          path: values.path,
          headers: {}
        },
        response_config: {
          status_code: Number(values.status_code),
          headers: headersObj,
          body: JSON.parse(values.response_body || "{}")
        },
        sequence_next_id: values.sequence_next_id || null
      };

      const res = await fetch(`${host}/api/mocks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(entry)
      });

      if (!res.ok) throw new Error("Ошибка сохранения");
      setModalOpen(false);
      fetchMocks();
      fetchFolders();
      message.success("Мок сохранён");
    } catch (e) {
      message.error("Ошибка: " + e.message);
    }
  };

  const deleteMock = async (id) => {
    try {
      const res = await fetch(`${host}/api/mocks?id_=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Ошибка удаления");
      fetchMocks();
      fetchFolders();
      message.success("Мок удалён");
    } catch (e) {
      message.error("Ошибка: " + e.message);
    }
  };

  const openAddFolder = () => {
    folderForm.resetFields();
    setFolderModalOpen(true);
  };

  const addFolder = async (values) => {
    const name = values.name.trim();
    if (folders.includes(name)) {
      message.error("Папка с таким именем уже существует");
      return;
    }
    try {
      const res = await fetch(`${host}/api/folders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name })
      });
      if (!res.ok) throw new Error("Ошибка при создании папки");
      message.success("Папка создана");
      setFolderModalOpen(false);
      fetchFolders();
    } catch (e) {
      message.error(e.message);
    }
  };

  const deleteFolder = (name) => {
    if (name === 'default') {
      message.warning("Нельзя удалить папку 'Главная'");
      return;
    }
    Modal.confirm({
      title: `Удалить папку '${name === 'default' ? 'Главная' : name}' и все её содержимое?`,
      icon: <ExclamationCircleOutlined />,
      okText: "Удалить",
      okType: "danger",
      cancelText: "Отмена",
      onOk: async () => {
        try {
          const res = await fetch(`${host}/api/folders?name=${encodeURIComponent(name)}`, { method: "DELETE" });
          if (!res.ok) throw new Error("Ошибка при удалении папки");
          message.success("Папка удалена");
          if (selectedFolder === name) setSelectedFolder("default");
          fetchFolders();
          fetchMocks();
        } catch (e) {
          message.error(e.message);
        }
      }
    });
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <ConfigProvider theme={{ algorithm: antdTheme.defaultAlgorithm, token: { colorBgBase: "#f7f8fa" } }}>
        <Layout style={{ minHeight: "100vh", background: "#f7f8fa" }}>
          <Header style={{ color: "#222", fontSize: 26, background: "white", display: "flex", alignItems: "center", padding: screens.xs ? "4px 8px" : "0 20px" }}>
            <span style={{ fontWeight: 800, letterSpacing: 0.5 }}>Mock API UI</span>
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
              <Input value={host} onChange={(e) => setHost(e.target.value)} style={{ maxWidth: screens.xs ? 140 : 320, background: "white" }} placeholder="Адрес бэкенда" size={screens.xs ? "small" : "middle"} />
              <Button onClick={fetchFolders} type="default" size={screens.xs ? "small" : "middle"}>Подключиться</Button>
            </div>
          </Header>
          
          {/* Добавляем отступ от шапки */}
          <div style={{ padding: "20px 20px 0 20px" }}>
            <Layout style={{ minHeight: "calc(100vh - 104px)", background: "transparent" }}>
              <Sider width={350} style={{ background: "transparent", border: "none", padding: 0 }}>
                <div style={{ 
                  background: "white", 
                  height: "calc(100vh - 104px)", 
                  borderRadius: 16, 
                  boxShadow: "0 0 35px rgb(0 0 0 / 5%)", 
                  display: "flex", 
                  flexDirection: "column" 
                }}>
                  <div style={{ 
                    padding: 16, 
                    borderBottom: "1px solid #eee", 
                    display: "flex", 
                    flexDirection: "column", 
                    gap: 12 
                  }}>

                    <div style={{ display: "flex", gap: 20 }}>
                      <Button size="small" onClick={openAddFolder} icon={<PlusOutlined />}>Добавить страницу</Button>
                      <Button size="small" type="primary" onClick={openAddMock} icon={<PlusOutlined />}>Создать mock</Button>
                    </div>
                  </div>
                  <div style={{ flexGrow: 1, overflowY: "auto", padding: "8px 16px" }}>
                    {folders.length === 0 && <Typography.Text>Папок нет</Typography.Text>}
                    {folders.map((folder, index) => (
                      <DraggableFolder
                        key={folder}
                        folder={folder}
                        index={index}
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
                marginLeft: 20,
                background: "white", 
                borderRadius: 16, 
                boxShadow: "0 0 35px rgb(0 0 0 / 5%)",
                height: "calc(100vh - 104px)",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column"
              }}>
                <div style={{ 
                  padding: 16, 
                  borderBottom: "1px solid #eee", 
                  display: "flex", 
                  justifyContent: "space-between", 
                  alignItems: "center",
                  flexShrink: 0
                }}>
                  <Typography.Title level={4} style={{ margin: 0 }}>
                    Mock на странице: {selectedFolder === "default" ? "Главная" : selectedFolder}
                  </Typography.Title>
                  <Button 
                    danger 
                    icon={<PoweroffOutlined />} 
                    onClick={deactivateAllMocks}
                    disabled={mocks.length === 0}
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
                        title: "UUID", 
                        dataIndex: "id", 
                        width: 90, 
                        ellipsis: true,
                        render: (text) => (
                          <Tooltip title="Нажмите чтобы скопировать">
                            <Button 
                              type="text" 
                              size="small"
                              icon={<CopyOutlined />}
                              onClick={() => copyToClipboard(text)}
                              style={{ padding: '1 4px' }}
                            >
                              {text.substring(0, 8)}...
                            </Button>
                          </Tooltip>
                        )
                      },
                      { 
                        title: "Статус", 
                        dataIndex: "active", 
                        width: 80,
                        render: (active, record) => (
                          <Switch 
                            checked={active !== false}
                            size="small"
                            onChange={(checked) => toggleMockActive(record.id, checked)}
                          />
                        )
                      },
                      { title: "Метод", dataIndex: ["request_condition", "method"], width: 65 },
                      { title: "Путь с параметрами", dataIndex: ["request_condition", "path"], ellipsis: true },
                      { title: "Статус ответа", dataIndex: ["response_config", "status_code"], width: 110 },
                      {
                        title: "Действия",
                        width: 200,
                        render: (_, record) => (
                          <div style={{ display: "flex", gap: 8 }}>
                            <Button size="small" onClick={() => openEditMock(record)}>
                              Редактировать
                            </Button>
                            <Button size="small" danger onClick={() => deleteMock(record.id)}>
                              Удалить
                            </Button>
                          </div>
                        )
                      }
                    ]}
                    pagination={{ 
                      pageSize: 15, 
                      showSizeChanger: true, 
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
            <Form form={form} layout="vertical" onFinish={saveMock} initialValues={{
              folder: selectedFolder,
              method: "GET",
              status_code: 200,
              active: true,
              responseHeaders: [{ key: "", value: "" }]
            }}>
              <Form.Item name="id" hidden><Input /></Form.Item>
              
              <Form.Item name="folder" label="Папка" rules={[{ required: true }]}>
                <Select options={folders.map(f => ({ label: f === "default" ? "Главная" : f, value: f }))} />
              </Form.Item>

              <Form.Item name="active" valuePropName="checked" style={{ marginBottom: 16 }}>
                <Checkbox>Активный мок</Checkbox>
              </Form.Item>

              <Form.Item label="Метод и путь" required style={{ marginBottom: 0 }}>
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
                    <Typography.Text strong>Заголовки ответа (ключ / значение), опционально:</Typography.Text>
                    {fields.map((field, index) => (
                      <Form.Item key={field.key} style={{ marginBottom: 8, marginTop: 8 }}>
                        <Input.Group compact style={{ display: "flex" }}>
                          <Form.Item
                            {...field}
                            name={[field.name, 'key']}
                            noStyle
                          >
                            <Input placeholder="Ключ" style={{ width: '40%' }} />
                          </Form.Item>
                          <Form.Item
                            {...field}
                            name={[field.name, 'value']}
                            noStyle
                          >
                            <Input placeholder="Значение" style={{ width: '50%', marginLeft: 8 }} />
                          </Form.Item>
                          {fields.length > 1 && (
                            <MinusCircleOutlined 
                              onClick={() => remove(field.name)} 
                              style={{ color: 'red', fontSize: 16, marginLeft: 8, lineHeight: '32px' }} 
                            />
                          )}
                        </Input.Group>
                      </Form.Item>
                    ))}
                    <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />} style={{ marginTop: 8 }}>
                      Добавить заголовок
                    </Button>
                  </>
                )}
              </Form.List>

              <Form.Item name="response_body" label="Тело ответа (JSON)" rules={[{ required: true }]}>
                <TextArea rows={8} placeholder='{"message": "ok"}' />
              </Form.Item>

              <Form.Item name="sequence_next_id" label="UUID следующего мока в цепочке (В разработке)">
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
              <Form.Item name="name" label="Имя страницы" rules={[
                { required: true, message: 'Введите имя страницы' },
                { validator: (_, val) => folders.includes(val) ? Promise.reject('Страница уже существует') : Promise.resolve() }
              ]}>
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
