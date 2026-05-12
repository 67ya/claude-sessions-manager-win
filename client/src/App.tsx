import { useState } from "react";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import Sidebar from "./components/layout/Sidebar";
import Toast from "./components/layout/Toast";
import SessionsPage from "./pages/SessionsPage";
import NodesPage from "./pages/NodesPage";
import TerminalPage from "./pages/TerminalPage";
import FilesPage from "./pages/FilesPage";
import MonitorPage from "./pages/MonitorPage";
import DeployPage from "./pages/DeployPage";
import UsagePage from "./pages/UsagePage";
import ProxyPoolPage from "./pages/ProxyPoolPage";
import UsersPage from "./pages/UsersPage";

export default function App() {
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  return (
    <HashRouter>
      <div className="min-h-screen bg-gray-950 text-gray-100 md:flex">
        <Sidebar />
        <div className="flex-1 min-w-0 pt-12 md:pt-0">
          <Routes>
            <Route path="/sessions" element={<SessionsPage showToast={showToast} />} />
            <Route path="/nodes" element={<NodesPage showToast={showToast} />} />
            <Route path="/terminal" element={<TerminalPage />} />
            <Route path="/files" element={<FilesPage />} />
            <Route path="/monitor" element={<MonitorPage />} />
            <Route path="/proxy-pool" element={<ProxyPoolPage />} />
            <Route path="/deploy" element={<DeployPage />} />
            <Route path="/usage" element={<UsagePage />} />
            <Route path="/users" element={<UsersPage />} />
            <Route path="*" element={<Navigate to="/sessions" replace />} />
          </Routes>
        </div>
        <Toast message={toast} />
      </div>
    </HashRouter>
  );
}
