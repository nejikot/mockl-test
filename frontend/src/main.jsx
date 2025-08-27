import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css"; // Глобальное подключение стилей, включая reset.css для AntD 5+

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
