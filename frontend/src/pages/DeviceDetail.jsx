import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api, getSocket } from "../api";
import { HeartPulse, Droplet, Download, ArrowLeft, Bed } from "lucide-react";
import { Line } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

export default function DeviceDetail() {
  const { deviceId } = useParams();
  const navigate = useNavigate();
  const [device, setDevice] = useState(null);
  const [vitals, setVitals] = useState([]);
  const [alerts, setAlerts] = useState([]);
  
  const MAX_POINTS = 30;

  const loadDetail = async () => {
    try {
      const res = await api.get(`/api/dashboard/device/${deviceId}?limit=30`);
      setDevice(res.data.device);
      setVitals(res.data.vitals); // already reversed in backend, oldest to newest
      setAlerts(res.data.alerts);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    loadDetail();
    const socket = getSocket();

    const handleSensorData = (data) => {
      if (data.device_id === deviceId) {
        setVitals(prev => {
          const newVitals = [...prev, data];
          if (newVitals.length > MAX_POINTS) return newVitals.slice(newVitals.length - MAX_POINTS);
          return newVitals;
        });
      }
    };
    
    const reloadOnEvent = (data) => {
        if (data.device_id === deviceId) {
            loadDetail();
        }
    };

    socket.on("sensor_data", handleSensorData);
    socket.on("device_status", reloadOnEvent);
    socket.on("alert", reloadOnEvent);

    return () => {
      socket.off("sensor_data", handleSensorData);
      socket.off("device_status", reloadOnEvent);
      socket.off("alert", reloadOnEvent);
    };
  }, [deviceId]);

  const handleExport = async () => {
    try {
      const res = await api.get(`/api/dashboard/export/${deviceId}`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${deviceId}_vitals.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      console.error(err);
    }
  };

  if (!device) return <div className="page-content active">Loading...</div>;

  const latestVital = vitals.length > 0 ? vitals[vitals.length - 1] : null;

  const chartData = {
    labels: vitals.map(v => new Date(v.timestamp).toLocaleTimeString()),
    datasets: [
      {
        label: 'Heart Rate (BPM)',
        data: vitals.map(v => v.heart_rate),
        borderColor: '#ff1744',
        backgroundColor: 'rgba(255, 23, 68, 0.5)',
        tension: 0.3,
      },
      {
        label: 'SpO2 (%)',
        data: vitals.map(v => v.spo2),
        borderColor: '#00e676',
        backgroundColor: 'rgba(0, 230, 118, 0.5)',
        tension: 0.3,
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
        y: { grid: { color: 'rgba(255, 255, 255, 0.1)' } },
        x: { grid: { display: false } }
    },
    plugins: { legend: { labels: { color: '#e0e0e0' } } }
  };

  return (
    <div className="page-content active">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn-icon" onClick={() => navigate("/dashboard/devices")}>
            <ArrowLeft />
          </button>
          <h1>Device {deviceId}</h1>
        </div>
        <div className="header-actions">
          <span className={`status-badge ${device.status}`}>{device.status}</span>
          <button className="btn-secondary" onClick={handleExport}>
            <Download size={18} /> Export CSV
          </button>
        </div>
      </div>

      <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="device-info-panel glass-card" style={{ padding: '1.5rem' }}>
          <h3>Patient Info</h3>
          <p><strong>Name:</strong> {device.patient_name || "Unassigned"}</p>
          <p><strong>Ward:</strong> {device.ward}</p>
          <p><strong>Bed:</strong> {device.bed_number}</p>
          <p><strong>Last Seen:</strong> {device.last_seen ? new Date(device.last_seen).toLocaleString() : 'Never'}</p>
          <div style={{ marginTop: '1rem', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.85rem', color: 'var(--text-muted)' }}>Device API Key</p>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <code style={{ flex: 1, fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', userSelect: 'all' }}>
                {device.api_key}
              </code>
              <button 
                className="btn-icon" 
                onClick={() => {
                  navigator.clipboard.writeText(device.api_key);
                  alert("API Key copied to clipboard!");
                }}
                title="Copy API Key"
              >
                📋
              </button>
            </div>
          </div>
        </div>

        <div className="live-vitals-panel glass-card" style={{ padding: '1.5rem', display: 'flex', gap: '2rem', alignItems: 'center', justifyContent: 'center' }}>
          <div className="vital-large" style={{ textAlign: 'center' }}>
            <HeartPulse size={48} color="#ff1744" style={{ animation: "pulse 1s infinite" }} />
            <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--text-primary)'}}>
                {latestVital ? Math.round(latestVital.heart_rate) : '--'}
            </div>
            <div style={{ color: 'var(--text-muted)'}}>BPM</div>
          </div>
          <div className="vital-large" style={{ textAlign: 'center' }}>
            <Droplet size={48} color="#00e676" />
            <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--text-primary)'}}>
                {latestVital ? Math.round(latestVital.spo2) : '--'}
            </div>
            <div style={{ color: 'var(--text-muted)'}}>SpO₂ %</div>
          </div>
          <div className="vital-large" style={{ textAlign: 'center' }}>
            <Bed size={48} color="#2196f3" />
            <div style={{ fontSize: '3rem', fontWeight: 700, color: 'var(--text-primary)'}}>
                {latestVital ? (latestVital.bed_status ? 'OCCUPIED' : 'EMPTY') : '--'}
            </div>
            <div style={{ color: 'var(--text-muted)'}}>Bed Status</div>
          </div>
        </div>
      </div>

      <div className="chart-container glass-card" style={{ height: '350px', padding: '1.5rem', marginBottom: '1.5rem' }}>
         <Line options={chartOptions} data={chartData} />
      </div>

      <div className="recent-alerts glass-card" style={{ padding: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem' }}>Recent Alerts</h3>
        <table className="data-table">
          <thead>
            <tr>
              <th>Time</th>
              <th>Severity</th>
              <th>Message</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {alerts.length === 0 ? <tr><td colSpan="4" style={{textAlign: "center"}}>No recent alerts</td></tr> : null}
            {alerts.map(a => (
              <tr key={a.id}>
                <td>{new Date(a.timestamp).toLocaleTimeString()}</td>
                <td><span className={`severity-badge ${a.severity}`}>{a.severity}</span></td>
                <td>{a.message}</td>
                <td><span className={`escalation-badge ${a.escalation_status}`}>{a.escalation_status}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
