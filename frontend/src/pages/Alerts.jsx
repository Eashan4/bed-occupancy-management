import { useState, useEffect } from "react";
import { api, getSocket } from "../api";
import { AlertTriangle, CheckCircle } from "lucide-react";

export default function Alerts() {
  const [alerts, setAlerts] = useState([]);
  const [filter, setFilter] = useState("all");

  const fetchAlerts = async () => {
    try {
      const qs = filter !== "all" ? `?severity=${filter}` : "";
      const { data } = await api.get(`/api/dashboard/alerts${qs}`);
      setAlerts(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchAlerts();
    
    const socket = getSocket();
    const handleAlert = () => fetchAlerts();
    const handleEscalation = () => fetchAlerts();

    socket.on("alert", handleAlert);
    socket.on("alert_escalation", handleEscalation);

    return () => {
      socket.off("alert", handleAlert);
      socket.off("alert_escalation", handleEscalation);
    };
  }, [filter]);

  const acknowledgeAlert = async (id) => {
    try {
      await api.put(`/api/dashboard/alerts/${id}/acknowledge`);
      fetchAlerts();
    } catch (err) {
      alert("Error acknowledging alert");
    }
  };

  const clearAllAlerts = async () => {
    try {
      if (alerts.length === 0) return;
      if (window.confirm("Are you sure you want to acknowledge and clear all active alerts?")) {
        await api.delete("/api/dashboard/alerts");
        fetchAlerts();
      }
    } catch (err) {
      alert("Error clearing alerts");
    }
  };

  return (
    <div className="page-content active">
      <div className="page-header">
        <h1>System Alerts</h1>
        <div className="filter-controls" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <select 
            className="input-select" 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">All Severities</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button 
            className="btn-secondary" 
            onClick={clearAllAlerts}
            disabled={alerts.length === 0}
            style={{ 
              borderColor: 'rgba(255, 23, 68, 0.4)', 
              color: alerts.length > 0 ? '#ff1744' : 'var(--text-muted)' 
            }}
          >
            Clear All
          </button>
        </div>
      </div>

      <div className="alerts-feed">
        {alerts.length === 0 ? (
          <div className="glass-card" style={{ padding: "3rem", textAlign: "center", color: "var(--text-muted)" }}>
            No active alerts matching criteria.
          </div>
        ) : (
          alerts.map(a => (
            <div key={a.id} className={`alert-card glass-card ${a.severity} ${a.escalation_status === 'escalated' ? 'escalated' : ''}`}>
              <div className="alert-header">
                <span className="alert-time">{new Date(a.timestamp).toLocaleString()}</span>
                <span className={`severity-badge ${a.severity}`}>{a.severity}</span>
                <span className={`escalation-badge ${a.escalation_status}`}>{a.escalation_status}</span>
              </div>
              <div className="alert-body">
                <AlertTriangle size={24} className="alert-icon" />
                <div className="alert-content">
                  <h4>{a.alert_type} on Device {a.device_id}</h4>
                  <p>{a.message}</p>
                </div>
              </div>
              <div className="alert-actions">
                {a.escalation_status !== "acknowledged" ? (
                  <button className="btn-secondary" onClick={() => acknowledgeAlert(a.id)}>
                    <CheckCircle size={16} /> Acknowledge
                  </button>
                ) : (
                  <span className="acknowledged-stamp">Acknowledged by {a.acknowledged_by}</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
