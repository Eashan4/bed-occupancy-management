import { useState, useEffect } from "react";
import { api, getSocket } from "../api";
import { Activity, Radio, Bed, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import FloorPlan from "../components/FloorPlan";

// Icons and Sub-components moved to top for safety
const ServerIcon = () => <Activity size={24} />;
const RadioIcon = () => <Radio size={24} />;
const BedIcon = () => <Bed size={24} />;
const AlertIcon = () => <AlertCircle size={24} />;

function StatCard({ icon, value, label, color }) {
  return (
    <div className="stat-card glass-card">
      <div className="stat-icon" style={{ '--accent-color': color, color }}>
        {icon}
      </div>
      <div className="stat-info">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
      </div>
    </div>
  );
}

export default function Overview() {
  const [stats, setStats] = useState({ total_devices: 0, online_devices: 0, occupancy_percent: 0, active_alerts: 0 });
  const [devices, setDevices] = useState([]);
  const [latestVitals, setLatestVitals] = useState({});
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [statsRes, devicesRes] = await Promise.all([
        api.get("/api/dashboard/stats"),
        api.get("/api/dashboard/devices")
      ]);
      setStats(statsRes.data);
      setDevices(devicesRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    const socket = getSocket();
    
    const handleSensorData = (data) => {
      setLatestVitals(prev => ({ ...prev, [data.device_id]: data }));
    };
    
    const reloadOnEvent = () => loadData();

    socket.on("sensor_data", handleSensorData);
    socket.on("device_status", reloadOnEvent);
    socket.on("alert", reloadOnEvent);

    return () => {
      socket.off("sensor_data", handleSensorData);
      socket.off("device_status", reloadOnEvent);
      socket.off("alert", reloadOnEvent);
    };
  }, []);

  const getDeviceStatus = (d) => {
    if (d.status !== "online") return "offline";
    const v = latestVitals[d.device_id] || {};
    if (v.spo2 < 90) return "critical";
    if (v.spo2 < 94 || v.heart_rate > 120 || v.heart_rate < 50) return "warning";
    return "stable";
  };

  return (
    <div className="page-content active">
      <div className="page-header">
        <h1>Hospital Overview</h1>
        <div className="header-actions">
          <span className="live-indicator"><span className="live-dot"></span> LIVE</span>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon={<ServerIcon />} value={stats.total_devices} label="Total Devices" color="var(--accent)" />
        <StatCard icon={<RadioIcon />} value={stats.online_devices} label="Online" color="#00e676" />
        <StatCard icon={<BedIcon />} value={`${stats.occupancy_percent}%`} label="Bed Occupancy" color="#ff9100" />
        <StatCard icon={<AlertIcon />} value={stats.active_alerts} label="Active Alerts" color="#ff1744" />
      </div>

      <div className="hospital-3d-container glass-card" style={{ marginBottom: "1.5rem" }}>
        <div className="section-header">
            <h2>Hospital Floor Plan</h2>
            <span className="subtitle">Hover on a bed to see patient details</span>
        </div>
        <FloorPlan devices={devices} latestVitals={latestVitals} />
      </div>

      <div className="section-header">
        <h2>Device Status Grid</h2>
      </div>
      <div className="device-grid">
        {devices.map(d => {
          const v = latestVitals[d.device_id] || {};
          const status = getDeviceStatus(d);
          
          return (
            <div key={d.device_id} className={`device-tile glass-card ${status}`} onClick={() => navigate(`/dashboard/devices/${d.device_id}`)}>
              <div className="device-tile-header">
                <span className={`status-dot ${d.status}`}></span>
                <span className="device-tile-name">{d.device_id}</span>
              </div>
              <div className="device-tile-meta">
                <span>🏥 {d.ward || "—"}</span>
                <span>🛏️ Bed {d.bed_number || "—"}</span>
                <span>👤 {d.patient_name || "Unassigned"}</span>
                <span>{d.status === 'online' ? '🟢 Online' : '⚫ Offline'}</span>
              </div>
              {v.heart_rate && (
                <div className="device-tile-vitals">
                  <div className="vital-mini">
                    <span className="vital-mini-value">{Math.round(v.heart_rate)}</span>
                    <span className="vital-mini-label">BPM</span>
                  </div>
                  <div className="vital-mini">
                    <span className="vital-mini-value">{Math.round(v.spo2)}</span>
                    <span className="vital-mini-label">SpO₂</span>
                  </div>
                  <div className="vital-mini">
                    <span className="vital-mini-value">{v.bed_status ? '🟢' : '⚪'}</span>
                    <span className="vital-mini-label">Bed</span>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  );
}
