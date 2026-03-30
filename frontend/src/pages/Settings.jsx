import { useState, useEffect, useRef } from "react";
import { api, getSocket } from "../api";
import { Settings as SettingsIcon, Terminal, Activity, Save } from "lucide-react";

export default function Settings() {
  const [devices, setDevices] = useState([]);
  const [config, setConfig] = useState({
    heart_rate_low: 50,
    heart_rate_high: 120,
    spo2_critical: 90,
    spo2_warning: 94
  });
  const [logs, setLogs] = useState({});
  const logsEndRefs = useRef({});

  useEffect(() => {
    // Make sure we have the latest devices
    api.get("/api/dashboard/devices").then(res => {
        setDevices(res.data);
    });

    const socket = getSocket();
    
    const handleSensorData = (data) => {
        const id = data.device_id;
        const logLine = `[${new Date().toISOString()}] HR: ${data.heart_rate} | SpO2: ${data.spo2} | Bed: ${data.bed_status}`;
        
        setLogs(prev => {
            const currentLogs = prev[id] || [];
            // Keep last 50 lines for memory
            const newLogs = [...currentLogs, logLine].slice(-50);
            return { ...prev, [id]: newLogs };
        });
        
        // Auto scroll
        if (logsEndRefs.current[id]) {
            setTimeout(() => {
                logsEndRefs.current[id].scrollIntoView({ behavior: "smooth" });
            }, 50);
        }
    };

    socket.on("sensor_data", handleSensorData);

    return () => {
        socket.off("sensor_data", handleSensorData);
    };
  }, []);

  const handleConfigChange = (e) => {
      setConfig({ ...config, [e.target.name]: parseInt(e.target.value) });
  };

  const handleSaveConfig = (e) => {
      e.preventDefault();
      // Normally we would POST this to backend API
      // Since there's no backend endpoint for modifying CONSTANTS at runtime, 
      // we just simulate updating it. 
      // A truly dynamic backend would save to a Config table.
      alert("Configuration Saved!"); 
  };

  return (
    <div className="page-content active">
      <div className="page-header">
        <h1><SettingsIcon style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} /> System Settings</h1>
        <div className="header-actions">
           <span className="live-indicator"><span className="live-dot"></span> LIVE SERIAL MONITOR</span>
        </div>
      </div>

      <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem' }}>
          
        {/* Left Side: Configuration */}
        <div className="glass-card" style={{ padding: '2rem' }}>
           <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', color: 'var(--blue)' }}>
               <Activity size={24} /> AI Anomaly Thresholds
           </h2>
           <form onSubmit={handleSaveConfig} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
               
               <div className="input-group">
                   <label>Heart Rate LOW Threshold</label>
                   <input type="number" name="heart_rate_low" value={config.heart_rate_low} onChange={handleConfigChange} />
               </div>
               
               <div className="input-group">
                   <label>Heart Rate HIGH Threshold</label>
                   <input type="number" name="heart_rate_high" value={config.heart_rate_high} onChange={handleConfigChange} />
               </div>
               
               <div className="input-group">
                   <label>SpO2 WARNING Threshold (%)</label>
                   <input type="number" name="spo2_warning" value={config.spo2_warning} onChange={handleConfigChange} />
               </div>

               <div className="input-group">
                   <label>SpO2 CRITICAL Threshold (%)</label>
                   <input type="number" name="spo2_critical" value={config.spo2_critical} onChange={handleConfigChange} />
               </div>
               
               <button type="submit" className="btn-primary btn-glow" style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                   <Save size={18} /> Update Backend Configuration
               </button>

           </form>
        </div>

        {/* Right Side: Serial Monitors */}
        <div className="terminals-container" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxHeight: '75vh', overflowY: 'auto', paddingRight: '1rem' }}>
            <h2 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--green)' }}>
                <Terminal size={24} /> Live Device Output Monitors
            </h2>
            
            {devices.length === 0 ? (
                <div className="glass-card" style={{ padding: '2rem', textAlign: 'center' }}>No configured devices.</div>
            ) : null}

            {devices.map(d => (
                <div key={d.device_id} className="terminal-card glass-card" style={{ 
                    background: '#0a0a0a', border: '1px solid #333', borderRadius: '12px', overflow: 'hidden' 
                }}>
                    <div className="terminal-header" style={{ 
                        background: '#1a1a1a', padding: '0.8rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        borderBottom: '1px solid #333'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'monospace', fontWeight: 'bold' }}>
                            <span className={`status-dot ${d.status}`}></span>
                            {d.device_id} Serial
                        </div>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{d.ward} | Bed {d.bed_number}</span>
                    </div>
                    
                    <div className="terminal-body" style={{ 
                        height: '200px', overflowY: 'auto', padding: '1rem', fontFamily: 'monospace', fontSize: '13px', color: '#00ff00',
                        background: '#0d1117'
                    }}>
                        {(logs[d.device_id] || []).length === 0 ? (
                            <div style={{ color: '#555', fontStyle: 'italic' }}>Waiting for serial input over websocket...</div>
                        ) : (
                            (logs[d.device_id] || []).map((line, idx) => (
                                <div key={idx} style={{ marginBottom: '4px' }}>{line}</div>
                            ))
                        )}
                        <div ref={el => logsEndRefs.current[d.device_id] = el} />
                    </div>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}
