import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Route, Routes } from "react-router-dom";
import "antd/dist/reset.css";
import App from "./App";
import { CalculatorPage } from "./pages/CalculatorPage";
import { RatingPage } from "./pages/RatingPage";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/" element={<App />}>
          <Route index element={<CalculatorPage />} />
          <Route path="rating" element={<RatingPage />} />
        </Route>
      </Routes>
    </HashRouter>
  </React.StrictMode>,
);
