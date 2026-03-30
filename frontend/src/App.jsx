import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, Outlet } from "react-router-dom";
import { connectSocket, disconnectSocket, getSocket } from "./api";
import { 
    LayoutDashboard, 
    Server, 
    MonitorSmartphone, 
    Users, 
    Bell, 
    BarChart3, 
    Moon, 
    Sun, 
    LogOut,
    CheckCircle2,
    Settings as SettingsIcon
} from "lucide-react";

import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Devices from "./pages/Devices";
import DeviceDetail from "./pages/DeviceDetail";
import Patients from "./pages/Patients";
import Alerts from "./pages/Alerts";
import Analytics from "./pages/Analytics";
import PatientDetail from "./pages/PatientDetail";
import Settings from "./pages/Settings";

import "./index.css";

function App() {
  const [theme, setTheme] = useState(localStorage.getItem("iot_theme") || "dark");

  useEffect(() => {
    document.body.setAttribute("data-theme", theme);
    localStorage.setItem("iot_theme", theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<AppLayout theme={theme} setTheme={setTheme} />}>
          <Route index element={<Overview />} />
          <Route path="devices" element={<Devices />} />
          <Route path="devices/:deviceId" element={<DeviceDetail />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/:patientId" element={<PatientDetail />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function AppLayout({ theme, setTheme }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sessionToken] = useState(sessionStorage.getItem("iot_token"));
  const [token, setToken] = useState(sessionToken);
  const [username, setUsername] = useState(sessionStorage.getItem("iot_username") || "Admin");
  
  useEffect(() => {
    if (!token) {
      navigate("/");
    } else {
      const socket = connectSocket();
      socket.on("connect", () => console.log("SocketIO connected from modern UI"));

      return () => {
        disconnectSocket();
      };
    }
  }, [token, navigate]);

  const handleLogout = () => {
    sessionStorage.clear();
    setToken(null);
    disconnectSocket();
    navigate("/");
  };

  if (!token) return null;

  return (
    <div className="app-layout">
      {/* DEBUG TEST DIV */}
      <div style={{ position: 'fixed', top: 0, left: 0, background: 'red', color: 'white', zIndex: 9999, padding: '5px' }}>
        v2.0 UI Mounted
      </div>
      <aside className="sidebar glass-card">
        <div className="sidebar-header">
          <div className="logo-pulse">
            <span className="pulse-dot"></span>
          </div>
          <h2>Hospital IoT</h2>
        </div>
        <nav className="sidebar-nav">
          <SidebarLink to="/dashboard" icon={<LayoutDashboard size={20} />} label="Overview" />
          <SidebarLink to="/dashboard/devices" icon={<Server size={20} />} label="Devices" />
          {location.pathname.includes("/devices/") && (
            <SidebarLink to={location.pathname} icon={<MonitorSmartphone size={20} />} label="Device Detail" />
          )}
          <SidebarLink to="/dashboard/patients" icon={<Users size={20} />} label="Patients" />
          <SidebarLink to="/dashboard/alerts" icon={<Bell size={20} />} label="Alerts" />
          <SidebarLink to="/dashboard/analytics" icon={<BarChart3 size={20} />} label="AI Analytics" />
          <SidebarLink to="/dashboard/settings" icon={<SettingsIcon size={20} />} label="Settings" />
        </nav>
        <div className="sidebar-footer">
          <div className="theme-switcher">
            <button className={`theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => setTheme('dark')}>🌙</button>
            <button className={`theme-btn ${theme === 'medical' ? 'active' : ''}`} onClick={() => setTheme('medical')}>💙</button>
            <button className={`theme-btn ${theme === 'emergency' ? 'active' : ''}`} onClick={() => setTheme('emergency')}>🔴</button>
          </div>
          <button className="btn-logout" onClick={handleLogout}>
            <LogOut size={18} />
            <span>{username}</span>
          </button>
        </div>
      </aside>
      <main className="main-content">
        <div id="toast-container"></div>
        <RouteRenderer />
      </main>
    </div>
  );
}

function SidebarLink({ to, icon, label }) {
    const location = useLocation();
    const isActive = location.pathname === to || (to !== "/dashboard" && location.pathname.startsWith(to));
    const navigate = useNavigate();

    return (
        <a 
            href="#" 
            className={`nav-link ${isActive ? 'active' : ''}`} 
            onClick={(e) => { e.preventDefault(); navigate(to); }}
        >
            {icon}
            <span>{label}</span>
        </a>
    )
}

function RouteRenderer() {
    return <Outlet />;
}

export default App;
