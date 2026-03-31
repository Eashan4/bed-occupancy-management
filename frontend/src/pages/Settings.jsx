import { useState, useEffect, useRef, useCallback } from "react";
import { api, API_BASE, getSocket } from "../api";
import { Server, Settings as SettingsIcon, Terminal, Activity, Wifi, Usb, Save, HardDrive, RefreshCw, AlertCircle } from "lucide-react";

export default function Settings() {
    const [activeTab, setActiveTab] = useState("data_source");
    const [devices, setDevices] = useState([]);
    const [ports, setPorts] = useState([]);
    const [serialStatus, setSerialStatus] = useState({ active: [], assigned: {} });
    const [config, setConfig] = useState({
        heart_rate_low: 50,
        heart_rate_high: 120,
        spo2_warning: 94,
        spo2_critical: 90
    });
    const [loadingDevice, setLoadingDevice] = useState({}); // per-device loading
    const [loadingConfig, setLoadingConfig] = useState(false);
    const [loadingExport, setLoadingExport] = useState(false);
    const [refreshingPorts, setRefreshingPorts] = useState(false);
    const [message, setMessage] = useState({ type: "", text: "" });
    const [stats, setStats] = useState({
        total: 0,
        online: 0,
        backendVersion: "2.1.0-NeuroGuard",
        dbStatus: "Connected",
    });

    // Serial Console logs
    const [logs, setLogs] = useState([]);
    const logsEndRef = useRef(null);

    // Show message with auto-clear
    const showMessage = useCallback((type, text) => {
        setMessage({ type, text });
        if (type === "success") {
            setTimeout(() => setMessage({ type: "", text: "" }), 4000);
        }
    }, []);

    // ── Initial data fetch (called once + on tab change to data_source) ──────
    const fetchDevicesAndStatus = useCallback(async () => {
        try {
            const [devicesRes, serialRes] = await Promise.all([
                api.get("/api/dashboard/devices"),
                api.get("/api/serial/status").catch(() => ({ data: { active: [], assigned: {} } })),
            ]);
            setDevices(devicesRes.data || []);
            setSerialStatus(serialRes.data || { active: [], assigned: {} });
            setStats(prev => ({
                ...prev,
                total: (devicesRes.data || []).length,
                online: (devicesRes.data || []).filter(d => d.status === "online").length
            }));
        } catch (e) {
            showMessage("error", "Failed to load device list");
        }
    }, [showMessage]);

    const fetchPorts = useCallback(async () => {
        setRefreshingPorts(true);
        try {
            const res = await api.get("/api/serial/ports").catch(() => ({ data: [] }));
            setPorts(res.data || []);
        } finally {
            setRefreshingPorts(false);
        }
    }, []);

    const fetchConfig = useCallback(async () => {
        try {
            const res = await api.get("/api/system/config").catch(() => null);
            if (res?.data) setConfig(res.data);
        } catch (e) { /* silent */ }
    }, []);

    // Load on mount once
    useEffect(() => {
        fetchDevicesAndStatus();
        fetchPorts();
        fetchConfig();
    }, []);

    // WebSocket: update device status in local state without re-fetching all 4 APIs
    useEffect(() => {
        const socket = getSocket();

        const handleSensorData = (data) => {
            if (data.type === "sensor_data" || data.type === "alert") {
                setLogs(prev => [
                    ...prev.slice(-199),
                    `[${new Date().toLocaleTimeString()}] ${data.device_id}: ${
                        data.type === "alert"
                            ? "⚠ " + data.message
                            : `HR=${Math.round(data.heart_rate || 0)} SpO2=${Math.round(data.spo2 || 0)}`
                    }`
                ]);
            }
        };

        const handleDeviceStatus = (data) => {
            if (data.type === "device_status") {
                // Update device status in local state only
                setDevices(prev => prev.map(d =>
                    d.device_id === data.device_id
                        ? { ...d, status: data.status }
                        : d
                ));
                setStats(prev => {
                    const newDevices = devices.map(d =>
                        d.device_id === data.device_id ? { ...d, status: data.status } : d
                    );
                    return {
                        ...prev,
                        online: newDevices.filter(d => d.status === "online").length
                    };
                });
            }
        };

        socket.on("sensor_data", handleSensorData);
        socket.on("alert", handleSensorData);
        socket.on("device_status", handleDeviceStatus);

        return () => {
            socket.off("sensor_data", handleSensorData);
            socket.off("alert", handleSensorData);
            socket.off("device_status", handleDeviceStatus);
        };
    }, [devices]);

    // Auto-scroll console
    useEffect(() => {
        if (activeTab === "console" && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [logs, activeTab]);

    // ── Tab switch: refresh relevant data ────────────────────────────────────
    const handleTabChange = (tab) => {
        setActiveTab(tab);
        if (tab === "data_source") {
            fetchDevicesAndStatus();
            fetchPorts();
        } else if (tab === "thresholds") {
            fetchConfig();
        }
    };

    // ── Port assignment ───────────────────────────────────────────────────────
    const handleAssignPort = async (deviceId, port) => {
        try {
            await api.post("/api/serial/assign", { device_id: deviceId, port });
            setSerialStatus(prev => ({
                ...prev,
                assigned: { ...prev.assigned, [deviceId]: port }
            }));
            if (port) showMessage("success", `Port ${port} assigned to ${deviceId}`);
        } catch (e) {
            showMessage("error", e.response?.data?.detail || "Failed to assign port");
        }
    };

    // ── Start wired mode ─────────────────────────────────────────────────────
    const handleStartSerial = async (deviceId) => {
        setLoadingDevice(prev => ({ ...prev, [deviceId]: "starting" }));
        try {
            const res = await api.post(`/api/serial/start/${deviceId}`);
            // Refresh serial status to confirm it's active
            const statusRes = await api.get("/api/serial/status").catch(() => null);
            if (statusRes?.data) setSerialStatus(statusRes.data);
            showMessage("success", res.data?.message || `Wired mode started for ${deviceId}`);
        } catch (e) {
            const detail = e.response?.data?.detail || "Failed to start wired mode";
            showMessage("error", detail);
        } finally {
            setLoadingDevice(prev => ({ ...prev, [deviceId]: null }));
        }
    };

    // ── Stop wired mode ───────────────────────────────────────────────────────
    const handleStopSerial = async (deviceId) => {
        setLoadingDevice(prev => ({ ...prev, [deviceId]: "stopping" }));
        try {
            await api.post(`/api/serial/stop/${deviceId}`);
            setSerialStatus(prev => ({
                ...prev,
                active: prev.active.filter(a => a.device_id !== deviceId)
            }));
            showMessage("success", `Switched ${deviceId} back to wireless mode`);
        } catch (e) {
            showMessage("error", "Failed to stop serial reader");
        } finally {
            setLoadingDevice(prev => ({ ...prev, [deviceId]: null }));
        }
    };

    // ── Save AI thresholds ────────────────────────────────────────────────────
    const handleSaveConfig = async () => {
        setLoadingConfig(true);
        try {
            await api.post("/api/system/config", config);
            showMessage("success", "AI thresholds saved and applied immediately");
        } catch (e) {
            showMessage("error", "Failed to save thresholds");
        } finally {
            setLoadingConfig(false);
        }
    };

    // ── Export logs — uses fetch() with Authorization header ─────────────────
    const handleExportLogs = async () => {
        setLoadingExport(true);
        try {
            const token = sessionStorage.getItem("iot_token");
            const response = await fetch(`${API_BASE}/api/system/export`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = `neuroguard_audit_logs_${new Date().toISOString().split("T")[0]}.csv`;
            a.click();
            URL.revokeObjectURL(url);
            showMessage("success", "Audit logs exported successfully");
        } catch (e) {
            showMessage("error", "Export failed: " + e.message);
        } finally {
            setLoadingExport(false);
        }
    };

    const getAssignedPort = (deviceId) => serialStatus.assigned?.[deviceId] || "";
    const isSerialActive = (deviceId) => serialStatus.active?.some(a => a.device_id === deviceId);
    const getActivePort  = (deviceId) => serialStatus.active?.find(a => a.device_id === deviceId)?.port || "";

    const tabStyle = (tab) => ({
        padding: "12px 16px",
        borderRadius: "8px",
        textAlign: "left",
        display: "flex",
        alignItems: "center",
        gap: "10px",
        background: activeTab === tab ? "rgba(0, 230, 180, 0.1)" : "transparent",
        border: "none",
        color: activeTab === tab ? "var(--accent)" : "var(--text-secondary)",
        transition: "all 0.2s",
        fontWeight: activeTab === tab ? 600 : 400,
        cursor: "pointer",
        width: "100%",
    });

    return (
        <div className="page-content active" style={{ maxWidth: "1200px", margin: "0 auto" }}>
            <div className="page-header">
                <div>
                    <h1>System Settings</h1>
                    <p className="subtitle">Configure NeuroGuard AIoT hardware, AI modules, and connection parameters.</p>
                </div>
            </div>

            {/* Message Banner */}
            {message.text && (
                <div style={{
                    padding: "12px 16px", borderRadius: "8px", marginBottom: "20px",
                    background: message.type === "error" ? "rgba(255,23,68,0.1)" : "rgba(0,230,118,0.1)",
                    border: `1px solid ${message.type === "error" ? "rgba(255,23,68,0.3)" : "rgba(0,230,118,0.3)"}`,
                    color: message.type === "error" ? "#ff1744" : "#00e676",
                    display: "flex", alignItems: "center", justifyContent: "space-between"
                }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {message.type === "error" && <AlertCircle size={16} />}
                        {message.text}
                    </span>
                    <button onClick={() => setMessage({ type: "", text: "" })}
                        style={{ background: "none", border: "none", color: "inherit", cursor: "pointer", fontSize: "1.2rem" }}>×</button>
                </div>
            )}

            <div style={{ display: "flex", gap: "24px", alignItems: "flex-start" }}>
                {/* ── Sidebar Tabs ── */}
                <div className="glass-card" style={{ width: "240px", flexShrink: 0, padding: "12px" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        <button style={tabStyle("data_source")} onClick={() => handleTabChange("data_source")}>
                            <Server size={18} /> Data Source
                        </button>
                        <button style={tabStyle("thresholds")} onClick={() => handleTabChange("thresholds")}>
                            <Activity size={18} /> AI Thresholds
                        </button>
                        <button style={tabStyle("console")} onClick={() => handleTabChange("console")}>
                            <Terminal size={18} /> Serial Console
                            {logs.length > 0 && (
                                <span style={{
                                    marginLeft: "auto", background: "var(--accent)", color: "#000",
                                    borderRadius: "10px", padding: "1px 6px", fontSize: "0.7rem", fontWeight: 700
                                }}>{logs.length}</span>
                            )}
                        </button>
                        <button style={tabStyle("system")} onClick={() => handleTabChange("system")}>
                            <SettingsIcon size={18} /> System Info
                        </button>
                    </div>
                </div>

                {/* ── Main Panel ── */}
                <div className="glass-card" style={{ flex: 1, padding: "24px", minHeight: "520px" }}>

                    {/* ════ DATA SOURCE TAB ════ */}
                    {activeTab === "data_source" && (
                        <div>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                                <h2>Hardware Connection Mode</h2>
                                <button
                                    className="btn-secondary"
                                    onClick={() => { fetchDevicesAndStatus(); fetchPorts(); }}
                                    disabled={refreshingPorts}
                                    style={{ display: "flex", alignItems: "center", gap: "6px" }}
                                >
                                    <RefreshCw size={14} style={{ animation: refreshingPorts ? "spin 1s linear infinite" : "none" }} />
                                    {refreshingPorts ? "Scanning..." : "Refresh Ports"}
                                </button>
                            </div>
                            <p style={{ color: "var(--text-muted)", marginBottom: "20px", fontSize: "0.9rem" }}>
                                Each device can operate in <strong style={{ color: "var(--accent)" }}>Wireless (WiFi)</strong> mode
                                or <strong style={{ color: "#60a5fa" }}>Wired (USB Serial)</strong> mode.
                                Select a COM port below and click <em>Switch to Wired</em> to start direct serial ingestion.
                            </p>

                            {/* Port inventory */}
                            {ports.length === 0 ? (
                                <div style={{
                                    background: "rgba(255,193,7,0.08)", border: "1px solid rgba(255,193,7,0.25)",
                                    borderRadius: "8px", padding: "12px 16px", marginBottom: "20px",
                                    color: "#ffc107", fontSize: "0.85rem", display: "flex", gap: "8px", alignItems: "center"
                                }}>
                                    <AlertCircle size={16} />
                                    No serial ports detected. Plug in your ESP8266 via USB and click Refresh Ports.
                                </div>
                            ) : (
                                <div style={{
                                    background: "rgba(0,230,118,0.06)", border: "1px solid rgba(0,230,118,0.2)",
                                    borderRadius: "8px", padding: "10px 16px", marginBottom: "20px",
                                    color: "#00e676", fontSize: "0.85rem"
                                }}>
                                    {ports.length} port{ports.length > 1 ? "s" : ""} detected: {ports.map(p => p.device).join(", ")}
                                    {" · "}<strong>Close Arduino IDE Serial Monitor</strong> before starting wired mode.
                                </div>
                            )}

                            <div style={{
                                background: "rgba(0,0,0,0.2)", borderRadius: "12px",
                                border: "1px solid var(--glass-border)", overflow: "hidden"
                            }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
                                    <thead>
                                        <tr style={{ background: "rgba(255,255,255,0.02)", borderBottom: "1px solid var(--glass-border)" }}>
                                            <th style={{ padding: "14px 16px", fontWeight: 600, color: "var(--text-muted)", fontSize: "0.82rem" }}>DEVICE</th>
                                            <th style={{ padding: "14px 16px", fontWeight: 600, color: "var(--text-muted)", fontSize: "0.82rem" }}>MODE</th>
                                            <th style={{ padding: "14px 16px", fontWeight: 600, color: "var(--text-muted)", fontSize: "0.82rem" }}>ASSIGN COM PORT</th>
                                            <th style={{ padding: "14px 16px", fontWeight: 600, color: "var(--text-muted)", fontSize: "0.82rem" }}>ACTION</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {devices.map(device => {
                                            const wired = isSerialActive(device.device_id);
                                            const assignedPort = getAssignedPort(device.device_id);
                                            const activePort = getActivePort(device.device_id);
                                            const devLoading = loadingDevice[device.device_id];

                                            return (
                                                <tr key={device.device_id} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                                                    {/* Device */}
                                                    <td style={{ padding: "16px" }}>
                                                        <div style={{ fontWeight: 600 }}>{device.device_id}</div>
                                                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "2px" }}>
                                                            Ward {device.ward} · Bed {device.bed_number || "—"}
                                                        </div>
                                                    </td>

                                                    {/* Mode indicator */}
                                                    <td style={{ padding: "16px" }}>
                                                        {wired ? (
                                                            <div style={{
                                                                display: "inline-flex", alignItems: "center", gap: "6px",
                                                                background: "rgba(96,165,250,0.12)", color: "#60a5fa",
                                                                border: "1px solid rgba(96,165,250,0.3)",
                                                                borderRadius: "20px", padding: "4px 10px", fontSize: "0.82rem", fontWeight: 600
                                                            }}>
                                                                <Usb size={13} /> Wired · {activePort}
                                                            </div>
                                                        ) : device.status === "online" ? (
                                                            <div style={{
                                                                display: "inline-flex", alignItems: "center", gap: "6px",
                                                                background: "rgba(0,230,118,0.1)", color: "#00e676",
                                                                border: "1px solid rgba(0,230,118,0.25)",
                                                                borderRadius: "20px", padding: "4px 10px", fontSize: "0.82rem", fontWeight: 600
                                                            }}>
                                                                <Wifi size={13} /> WiFi · Online
                                                            </div>
                                                        ) : (
                                                            <div style={{
                                                                display: "inline-flex", alignItems: "center", gap: "6px",
                                                                background: "rgba(255,255,255,0.05)", color: "var(--text-muted)",
                                                                border: "1px solid rgba(255,255,255,0.1)",
                                                                borderRadius: "20px", padding: "4px 10px", fontSize: "0.82rem"
                                                            }}>
                                                                <Wifi size={13} /> WiFi · Offline
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Port select */}
                                                    <td style={{ padding: "16px" }}>
                                                        <select
                                                            className="input-select"
                                                            style={{ padding: "8px 10px", width: "220px", fontSize: "0.85rem" }}
                                                            value={assignedPort}
                                                            onChange={(e) => handleAssignPort(device.device_id, e.target.value)}
                                                            disabled={wired}
                                                        >
                                                            <option value="">-- Select COM Port --</option>
                                                            {ports.map(p => (
                                                                <option key={p.device} value={p.device}>
                                                                    {p.device} · {p.description}
                                                                </option>
                                                            ))}
                                                        </select>
                                                    </td>

                                                    {/* Action button */}
                                                    <td style={{ padding: "16px" }}>
                                                        {wired ? (
                                                            <button
                                                                onClick={() => handleStopSerial(device.device_id)}
                                                                disabled={devLoading === "stopping"}
                                                                style={{
                                                                    background: "rgba(255,23,68,0.1)", color: "#ff1744",
                                                                    border: "1px solid rgba(255,23,68,0.3)",
                                                                    padding: "7px 14px", borderRadius: "6px",
                                                                    display: "flex", alignItems: "center", gap: "6px",
                                                                    cursor: "pointer", fontSize: "0.85rem", fontWeight: 500
                                                                }}
                                                            >
                                                                <Wifi size={13} />
                                                                {devLoading === "stopping" ? "Stopping..." : "Revert to WiFi"}
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleStartSerial(device.device_id)}
                                                                disabled={!assignedPort || devLoading === "starting"}
                                                                style={{
                                                                    background: assignedPort ? "rgba(96,165,250,0.12)" : "rgba(255,255,255,0.04)",
                                                                    color: assignedPort ? "#60a5fa" : "var(--text-muted)",
                                                                    border: `1px solid ${assignedPort ? "rgba(96,165,250,0.3)" : "rgba(255,255,255,0.1)"}`,
                                                                    padding: "7px 14px", borderRadius: "6px",
                                                                    display: "flex", alignItems: "center", gap: "6px",
                                                                    cursor: assignedPort ? "pointer" : "not-allowed",
                                                                    fontSize: "0.85rem", fontWeight: 500
                                                                }}
                                                            >
                                                                <Usb size={13} />
                                                                {devLoading === "starting" ? "Connecting..." : "Switch to Wired"}
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                        {devices.length === 0 && (
                                            <tr>
                                                <td colSpan="4" style={{ padding: "32px", textAlign: "center", color: "var(--text-muted)" }}>
                                                    No devices registered. Register a device first.
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Wired mode instructions */}
                            <div style={{
                                marginTop: "20px", padding: "16px", borderRadius: "10px",
                                background: "rgba(0,0,0,0.15)", border: "1px solid var(--glass-border)", fontSize: "0.85rem"
                            }}>
                                <div style={{ fontWeight: 600, marginBottom: "8px", color: "var(--text-secondary)" }}>
                                    📋 Wired Mode Checklist
                                </div>
                                <ol style={{ color: "var(--text-muted)", lineHeight: "1.8", paddingLeft: "1.2rem", margin: 0 }}>
                                    <li>Plug ESP8266 into Mac via USB cable</li>
                                    <li><strong style={{ color: "#ffc107" }}>Close Arduino IDE Serial Monitor</strong> (Tools → Serial Monitor or Ctrl+Shift+M)</li>
                                    <li>Click <em>Refresh Ports</em> — select the port (e.g. <code>/dev/cu.usbserial-XXXXX</code>)</li>
                                    <li>Click <em>Switch to Wired</em> — the backend will send <code>MODE:OFFLINE</code> to the device</li>
                                    <li>Vitals will appear in the Serial Console tab within ~2 seconds</li>
                                </ol>
                            </div>
                        </div>
                    )}

                    {/* ════ AI THRESHOLDS TAB ════ */}
                    {activeTab === "thresholds" && (
                        <div>
                            <h2>AI Warning &amp; Critical Thresholds</h2>
                            <p style={{ color: "var(--text-muted)", marginBottom: "24px", fontSize: "0.9rem" }}>
                                Changes apply immediately to the live anomaly detection engine — no restart needed.
                            </p>

                            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px" }}>
                                <div style={{ background: "rgba(0,0,0,0.2)", padding: "24px", borderRadius: "12px", border: "1px solid var(--glass-border)" }}>
                                    <h3 style={{ color: "#ff5252", display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                                        ❤️ Heart Rate (BPM)
                                    </h3>
                                    <div className="input-group">
                                        <label>Low Alert (BPM)</label>
                                        <input
                                            type="number" value={config.heart_rate_low}
                                            onChange={e => setConfig({ ...config, heart_rate_low: parseInt(e.target.value) || 0 })}
                                            className="input-select" style={{ marginBottom: "16px" }}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>High Alert (BPM)</label>
                                        <input
                                            type="number" value={config.heart_rate_high}
                                            onChange={e => setConfig({ ...config, heart_rate_high: parseInt(e.target.value) || 0 })}
                                            className="input-select"
                                        />
                                    </div>
                                </div>

                                <div style={{ background: "rgba(0,0,0,0.2)", padding: "24px", borderRadius: "12px", border: "1px solid var(--glass-border)" }}>
                                    <h3 style={{ color: "#60a5fa", display: "flex", alignItems: "center", gap: "8px", marginBottom: "20px" }}>
                                        🩸 Blood Oxygen (SpO₂)
                                    </h3>
                                    <div className="input-group">
                                        <label>Warning Level (%)</label>
                                        <input
                                            type="number" value={config.spo2_warning}
                                            onChange={e => setConfig({ ...config, spo2_warning: parseInt(e.target.value) || 0 })}
                                            className="input-select" style={{ marginBottom: "16px" }}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <label>Critical Level (%)</label>
                                        <input
                                            type="number" value={config.spo2_critical}
                                            onChange={e => setConfig({ ...config, spo2_critical: parseInt(e.target.value) || 0 })}
                                            className="input-select"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div style={{ marginTop: "24px", padding: "14px", background: "rgba(0,0,0,0.15)", borderRadius: "8px", border: "1px solid var(--glass-border)", fontSize: "0.82rem", color: "var(--text-muted)" }}>
                                Current: HR alert at &lt;{config.heart_rate_low} or &gt;{config.heart_rate_high} BPM ·
                                SpO₂ warning &lt;{config.spo2_warning}% · SpO₂ critical &lt;{config.spo2_critical}%
                            </div>

                            <button
                                className="btn-primary"
                                onClick={handleSaveConfig}
                                disabled={loadingConfig}
                                style={{ marginTop: "20px", padding: "10px 24px", display: "flex", alignItems: "center", gap: "8px" }}
                            >
                                <Save size={16} />
                                {loadingConfig ? "Applying..." : "Apply Thresholds"}
                            </button>
                        </div>
                    )}

                    {/* ════ SERIAL CONSOLE TAB ════ */}
                    {activeTab === "console" && (
                        <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                                <div>
                                    <h2 style={{ margin: 0 }}>Live Event Stream</h2>
                                    <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", margin: "4px 0 0" }}>
                                        Real-time sensor data and alerts from all connected devices
                                    </p>
                                </div>
                                <button className="btn-secondary" onClick={() => setLogs([])}
                                    style={{ padding: "6px 14px", fontSize: "0.84rem" }}>
                                    Clear
                                </button>
                            </div>
                            <div style={{
                                flex: 1, background: "#050a0f",
                                border: "1px solid var(--glass-border)", borderRadius: "10px",
                                padding: "16px", fontFamily: "monospace", fontSize: "0.83rem",
                                color: "#00e676", overflowY: "auto", minHeight: "380px",
                                display: "flex", flexDirection: "column"
                            }}>
                                {logs.length === 0 ? (
                                    <div style={{ color: "#4a5568", fontStyle: "italic" }}>
                                        Awaiting data stream... Wired or WiFi devices will appear here.
                                    </div>
                                ) : (
                                    logs.map((log, i) => (
                                        <div key={i} style={{
                                            marginBottom: "3px",
                                            color: log.includes("⚠") ? "#ff5252" : log.includes("HR=") ? "#00e676" : "#94a3b8"
                                        }}>
                                            {log}
                                        </div>
                                    ))
                                )}
                                <div ref={logsEndRef} />
                            </div>
                        </div>
                    )}

                    {/* ════ SYSTEM INFO TAB ════ */}
                    {activeTab === "system" && (
                        <div>
                            <h2>System Diagnostics</h2>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px", marginTop: "20px" }}>
                                <div style={{ background: "rgba(0,0,0,0.2)", padding: "20px", borderRadius: "12px", border: "1px solid var(--glass-border)" }}>
                                    <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: "6px" }}>Backend Version</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{stats.backendVersion}</div>
                                </div>
                                <div style={{ background: "rgba(0,0,0,0.2)", padding: "20px", borderRadius: "12px", border: "1px solid var(--glass-border)" }}>
                                    <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: "6px" }}>Database</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "#00e676" }}>{stats.dbStatus}</div>
                                </div>
                                <div style={{ background: "rgba(0,0,0,0.2)", padding: "20px", borderRadius: "12px", border: "1px solid var(--glass-border)" }}>
                                    <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: "6px" }}>Total Devices</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 700 }}>{stats.total}</div>
                                </div>
                                <div style={{ background: "rgba(0,0,0,0.2)", padding: "20px", borderRadius: "12px", border: "1px solid var(--glass-border)" }}>
                                    <div style={{ color: "var(--text-muted)", fontSize: "0.82rem", marginBottom: "6px" }}>Online Nodes</div>
                                    <div style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--accent)" }}>{stats.online}</div>
                                </div>
                            </div>

                            <h3 style={{ marginTop: "36px", marginBottom: "16px" }}>Data Archival</h3>
                            <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                                <button
                                    className="btn-secondary"
                                    onClick={handleExportLogs}
                                    disabled={loadingExport}
                                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                                >
                                    <HardDrive size={16} />
                                    {loadingExport ? "Exporting..." : "Export Audit Logs (CSV)"}
                                </button>
                                <button
                                    className="btn-secondary"
                                    onClick={fetchDevicesAndStatus}
                                    style={{ display: "flex", alignItems: "center", gap: "8px" }}
                                >
                                    <RefreshCw size={16} /> Refresh Stats
                                </button>
                            </div>

                            <div style={{ marginTop: "32px", padding: "16px", background: "rgba(0,0,0,0.15)", borderRadius: "10px", border: "1px solid var(--glass-border)", fontSize: "0.84rem" }}>
                                <div style={{ fontWeight: 600, marginBottom: "10px", color: "var(--text-secondary)" }}>🔒 Security Notes</div>
                                <ul style={{ color: "var(--text-muted)", lineHeight: "1.8", paddingLeft: "1.2rem", margin: 0 }}>
                                    <li>All API endpoints require JWT Bearer token (expires every {24} hours)</li>
                                    <li>Device data ingestion requires per-device API key (x-api-key header)</li>
                                    <li>Wired serial mode: API key embedded in DATA payload, verified per-packet</li>
                                    <li>Audit log records all admin actions with user ID and timestamp</li>
                                </ul>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
