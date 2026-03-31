import { useState, useEffect } from "react";
import { api, getSocket } from "../api";
import { Activity, Radio, Bed, AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import DigitalTwinScene from "../components/3d/DigitalTwinScene";

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
  const [thresholds, setThresholds] = useState({
      heart_rate_low: 50, heart_rate_high: 120, spo2_warning: 94, spo2_critical: 90
  });
  const navigate = useNavigate();

  const loadData = async () => {
    try {
      const [statsRes, devicesRes, configRes] = await Promise.all([
        api.get("/api/dashboard/stats"),
        api.get("/api/dashboard/devices"),
        api.get("/api/system/config")
      ]);
      setStats(statsRes.data);
      setDevices(devicesRes.data);
      if (configRes.data) setThresholds(configRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadData();
    const socket = getSocket();

    // Sensor data: update vitals map inline — NO API call
    const handleSensorData = (data) => {
      setLatestVitals(prev => ({ ...prev, [data.device_id]: data }));
    };

    // Device status change: update device list inline + refresh stats counter
    const handleDeviceStatus = (data) => {
      setDevices(prev => prev.map(d =>
        d.device_id === data.device_id ? { ...d, status: data.status } : d
      ));
      setStats(prev => {
        const onlineCount = data.status === 'online'
          ? prev.online_devices + 1
          : Math.max(0, prev.online_devices - 1);
        return { ...prev, online_devices: onlineCount };
      });
    };

    // Alert: bump active_alerts counter inline — NO API call
    const handleAlert = (data) => {
      if (data.severity === 'critical' || data.severity === 'high') {
        setStats(prev => ({ ...prev, active_alerts: prev.active_alerts + 1 }));
      }
    };

    socket.on("sensor_data", handleSensorData);
    socket.on("device_status", handleDeviceStatus);
    socket.on("alert", handleAlert);

    // Background sync every 8s to catch any drift (not 5s — reduce backend load)
    const pollInterval = setInterval(loadData, 8000);

    return () => {
      socket.off("sensor_data", handleSensorData);
      socket.off("device_status", handleDeviceStatus);
      socket.off("alert", handleAlert);
      clearInterval(pollInterval);
    };
  }, []);

  const getDeviceStatus = (d) => {
    if (d.status !== "online") return "offline";
    const v = latestVitals[d.device_id] || {};
    if (v.spo2 > 0 && v.spo2 < thresholds.spo2_critical) return "critical";
    if (v.spo2 > 0 && v.spo2 < thresholds.spo2_warning) return "warning";
    if (v.heart_rate > thresholds.heart_rate_high || (v.heart_rate > 0 && v.heart_rate < thresholds.heart_rate_low)) return "warning";
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
            <h2>Digital Twin Floor Plan</h2>
            <span className="subtitle">Real-time 3D simulation of ward occupancy</span>
        </div>
        <DigitalTwinScene devices={devices} latestVitals={latestVitals} thresholds={thresholds} />
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
                <span>👤 {d.patient?.name || d.patient_name || "Unassigned"}</span>
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
