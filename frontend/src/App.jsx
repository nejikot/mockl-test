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
    <div ref={node => drag(drop(node))}
      style={{
        opacity: isDragging ? 0.5 : 1,
        padding: 10, marginBottom: 6,
        borderRadius: 6, cursor: "pointer",
        background: folder === selectedFolder ? '#d9e4ff' : 'transparent',
        fontWeight: folder === selectedFolder ? 'bold' : 'normal',
        display: "flex", justifyContent: "space-between", alignItems: "center"
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

  useEffect(() => { document.body.style.background = "#f7f8fa"; }, []);

  const copyToClipboard = text => {
    navigator.clipboard.writeText(text)
      .then(() => message.success('UUID скопирован'))
      .catch(() => message.error('Не удалось скопировать'));
  };

  const toggleMockActive = async (id, active) => {
    try {
      const res = await fetch(`${host}/api/mocks/${id}/toggle`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active })
      });
      if (!res.ok) throw new Error();
      fetchMocks();
      message.success(active ? "Активирован" : "Деактивирован");
    } catch {
      message.error("Ошибка переключения");
    }
  };

  const deactivateAllMocks = () => {
    Modal.confirm({
      title: 'Отключить все моки?',
      icon: <ExclamationCircleOutlined />,
      okText: 'Отключить', cancelText: 'Отмена',
      onOk: async () => {
        try {
          const res = await fetch(`${host}/api/mocks/deactivate-all?folder=${encodeURIComponent(selectedFolder)}`, { method: "PATCH" });
          if (!res.ok) throw new Error();
          fetchMocks();
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
      const arr = data.filter(f => f !== "default");
      arr.unshift("default");
      setFolders(arr);
      if (!data.includes(selectedFolder)) setSelectedFolder(arr[0]);
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

  const openEditMock = mock => {
    setEditing(mock);
    form.setFieldsValue({
      id: mock.id,
      folder: mock.folder,
      method: mock.request_condition.method,
      path: mock.request_condition.path,
      status_code: mock.response_config.status_code,
      active: mock.active,
      responseHeaders: Object.entries(mock.response_config.headers || {}).map(([k,v]) => ({ key:k, value:v })),
      response_body: JSON.stringify(mock.response_config.body, null, 2),
      sequence_next_id: mock.sequence_next_id || ""
    });
    setModalOpen(true);
  };

  const saveMock = async vals => {
    try {
      const hdrs = {};
      (vals.responseHeaders||[]).forEach(i=>{ if(i.key) hdrs[i.key]=i.value||"" });
      const entry = {
        id: vals.id||uuidv4(),
        folder: vals.folder,
        active: vals.active,
        request_condition: { method: vals.method, path: vals.path },
        response_config: { status_code:+vals.status_code, headers: hdrs, body: JSON.parse(vals.response_body) },
        sequence_next_id: vals.sequence_next_id||null
      };
      const res = await fetch(`${host}/api/mocks`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify(entry)
      });
      if(!res.ok) throw new Error();
      setModalOpen(false);
      fetchMocks(); fetchFolders();
      message.success("Сохранено");
    } catch {
      message.error("Ошибка сохранения");
    }
  };

  const deleteMock = async id => {
    try {
      const res = await fetch(`${host}/api/mocks?id_=${id}`, { method:"DELETE" });
      if(!res.ok) throw new Error();
      fetchMocks(); fetchFolders();
      message.success("Удалено");
    } catch {
      message.error("Ошибка удаления");
    }
  };

  const openAddFolder = () => { folderForm.resetFields(); setFolderModalOpen(true); };
  const addFolder = async v => {
    const name = v.name.trim();
    if (folders.includes(name)) return message.error("Страница есть");
    try {
      const res = await fetch(`${host}/api/folders`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ name })
      });
      if(!res.ok) throw new Error();
      message.success("Добавлено"); setFolderModalOpen(false); fetchFolders();
    } catch {
      message.error("Ошибка");
    }
  };

  const deleteFolder = name => {
    if(name==="default") return message.warning("Нельзя");
    Modal.confirm({
      title: `Удалить '${name}'?`, icon:<ExclamationCircleOutlined/>,
      okText:"Да", cancelText:"Отмена",
      onOk:async()=>{
        try{
          const res=await fetch(`${host}/api/folders?name=${encodeURIComponent(name)}`,{method:"DELETE"});
          if(!res.ok)throw new Error();
          message.success("Удалено");
          if(selectedFolder===name) setSelectedFolder("default");
          fetchFolders(); fetchMocks();
        }catch{message.error("Ошибка");}
      }
    });
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <ConfigProvider theme={{ algorithm: antdTheme.defaultAlgorithm }}>
        <Layout style={{ minHeight:"100vh", background:"#f7f8fa" }}>
          <Header style={{ background:"white", display:"flex", alignItems:"center", padding:screens.xs?"4px":"0 20px" }}>
            <Typography.Title level={3} style={{ margin:0 }}>Mock API UI</Typography.Title>
            <div style={{ marginLeft:"auto", display:"flex", gap:12 }}>
              <Input value={host} onChange={e=>setHost(e.target.value)} placeholder="Backend URL" style={{ width: screens.xs?140:320 }}/>
              <Button onClick={fetchFolders}>Подключиться</Button>
            </div>
          </Header>
          <div style={{ padding:"20px" }}>
            <Layout style={{ background:"transparent", minHeight:"calc(100vh - 64px)" }}>
              <Sider width={300} style={{ background:"transparent" }}>
                <div style={{ background:"white", height:"100%", borderRadius:16, padding:16, boxShadow:"0 0 35px rgba(0,0,0,0.05)" }}>
                  <div style={{ display:"flex", gap:8, marginBottom:16 }}>
                    <Button icon={<PlusOutlined />} onClick={openAddFolder}>Добавить страницу</Button>
                    <Button type="primary" icon={<PlusOutlined />} onClick={openAddMock}>Создать mock</Button>
                  </div>
                  <div style={{ overflowY:"auto", maxHeight:"calc(100vh - 160px)" }}>
                    {folders.map((f,i)=>(
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
                marginLeft:20, background:"white", borderRadius:16,
                boxShadow:"0 0 35px rgba(0,0,0,0.05)", padding:16
              }}>
                <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16 }}>
                  <Typography.Title level={4} style={{ margin:0 }}>
                    Mock на странице: {selectedFolder}
                  </Typography.Title>
                  <Button danger icon={<PoweroffOutlined />} onClick={deactivateAllMocks} disabled={!mocks.length}>
                    Отключить все моки
                  </Button>
                </div>
                <Table dataSource={mocks} rowKey="id" size="small"
                  columns={[
                    {
                      title:"UUID", dataIndex:"id", width:90, ellipsis:true,
                      render:text=>(
                        <Tooltip title="Копировать">
                          <Button type="text" icon={<CopyOutlined/>} onClick={()=>copyToClipboard(text)}>
                            {text.slice(0,8)}…
                          </Button>
                        </Tooltip>
                      )
                    },
                    {
                      title:"Статус", dataIndex:"active", width:80,
                      render:(act,rec)=><Switch checked={act} size="small" onChange={c=>toggleMockActive(rec.id,c)}/>
                    },
                    { title:"Метод", dataIndex:["request_condition","method"], width:80 },
                    { title:"Путь", dataIndex:["request_condition","path"], ellipsis:true },
                    { title:"Код", dataIndex:["response_config","status_code"], width:80 },
                    {
                      title:"Действия", width:160,
                      render:(_,rec)=>(
                        <div style={{display:"flex",gap:8}}>
                          <Button onClick={()=>openEditMock(rec)}>Редактировать</Button>
                          <Button danger onClick={()=>deleteMock(rec.id)}>Удалить</Button>
                        </div>
                      )
                    }
                  ]}
                  pagination={{ pageSize:15, showSizeChanger:true }}
                  scroll={{ x:true }}
                />
              </Content>
            </Layout>
          </div>

          <Modal title={editing?"Редактировать мок":"Создать мок"}
            open={modalOpen} onCancel={()=>setModalOpen(false)} onOk={()=>form.submit()}
            width={700} bodyStyle={{maxHeight:"70vh",overflowY:"auto"}} destroyOnClose
          >
            <Form form={form} layout="vertical" onFinish={saveMock} initialValues={{
              folder:selectedFolder,method:"GET",status_code:200,
              active:true,responseHeaders:[{key:"",value:""}]
            }}>
              <Form.Item name="id" hidden><Input/></Form.Item>
              <Form.Item name="folder" label="Папка" rules={[{required:true}]}>
                <Select options={folders.map(f=>({label:f,value:f}))}/>
              </Form.Item>
              <Form.Item name="active" valuePropName="checked" style={{marginBottom:16}}>
                <Checkbox>Активный мок</Checkbox>
              </Form.Item>
              <Form.Item label="Метод и путь" required style={{marginBottom:0}}>
                <Input.Group compact style={{display:"flex"}}>
                  <Form.Item name="method" noStyle rules={[{required:true}]}>
                    <Select style={{width:120}} options={METHODS.map(m=>({label:m,value:m}))}/>
                  </Form.Item>
                  <Form.Item name="path" noStyle rules={[{required:true}]}>
                    <Input style={{flex:1,marginLeft:8}}/>
                  </Form.Item>
                </Input.Group>
              </Form.Item>
              <Form.Item name="status_code" label="HTTP Статус" rules={[{required:true}]}>
                <Select options={HTTP_STATUSES} onChange={handleStatusChange}/>
              </Form.Item>
              <Form.List name="responseHeaders">
                {(fields,{add,remove})=>(
                  <>
                    <Typography.Text strong>Заголовки (опц.):</Typography.Text>
                    {fields.map(f=>(
                      <Form.Item key={f.key} style={{marginTop:8}}>
                        <Input.Group compact style={{display:"flex"}}>
                          <Form.Item {...f} name={[f.name,"key"]} noStyle>
                            <Input placeholder="Ключ" style={{width:"40%"}}/>
                          </Form.Item>
                          <Form.Item {...f} name={[f.name,"value"]} noStyle>
                            <Input placeholder="Значение" style={{width:"50%",marginLeft:8}}/>
                          </Form.Item>
                          {fields.length>1&&<MinusCircleOutlined onClick={()=>remove(f.name)} style={{color:"red",marginLeft:8}}/>}
                        </Input.Group>
                      </Form.Item>
                    ))}
                    <Button type="dashed" block onClick={add} icon={<PlusOutlined/>}>Добавить заголовок</Button>
                  </>
                )}
              </Form.List>
              <Form.Item name="response_body" label="Тело (JSON)" rules={[{required:true}]}>
                <TextArea rows={6}/>
              </Form.Item>
              <Form.Item name="sequence_next_id" label="UUID следующего мок-запроса">
                <Input/>
              </Form.Item>
            </Form>
          </Modal>

          <Modal title="Создать страницу"
            open={isFolderModalOpen} footer={null}
            onCancel={()=>setFolderModalOpen(false)} destroyOnClose
          >
            <Form form={folderForm} layout="vertical" onFinish={addFolder}>
              <Form.Item name="name" label="Имя" rules={[
                {required:true,message:"Введите имя"},
                {validator:(_,v)=>folders.includes(v)?Promise.reject("Есть"):Promise.resolve()}
              ]}>
                <Input/>
              </Form.Item>
              <Form.Item><Button type="primary" htmlType="submit" block>Создать</Button></Form.Item>
            </Form>
          </Modal>
        </Layout>
      </ConfigProvider>
    </DndProvider>
  );
}
