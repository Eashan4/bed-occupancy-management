import { useState, useEffect } from "react";
import { api } from "../api";
import { PlusCircle, Search, Edit2, LogOut, Copy } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Devices() {
  const [devices, setDevices] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [formData, setFormData] = useState({ ward: "", bed_number: "", patient_name: "" });
  const [registeredKeys, setRegisteredKeys] = useState(null);
  const navigate = useNavigate();

  const fetchDevices = async () => {
    try {
      const res = await api.get("/api/dashboard/devices");
      setDevices(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  const handleInputChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleOpenAdd = () => {
    setFormData({ ward: "", bed_number: "", patient_name: "" });
    setRegisteredKeys(null);
    setIsAdding(true);
  };

  const handleCloseModal = () => setIsAdding(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const { data } = await api.post("/api/device/register", {
        ward: formData.ward || null,
        bed_number: formData.bed_number || null,
        patient_name: formData.patient_name || null
      });
      setRegisteredKeys(data);
      fetchDevices();
    } catch (err) {
      alert(err.response?.data?.detail || "Error registering device");
    }
  };

  const regenerateKey = async (id) => {
    if (!confirm(`Regenerate API key for ${id}?`)) return;
    try {
      const { data } = await api.post(`/api/device/${id}/regenerate-key`);
      alert(`New Key created for ${id}: ${data.new_api_key}`);
    } catch (err) {
      alert(err.response?.data?.detail || "Error");
    }
  };

  const deleteDevice = async (id) => {
    if (!confirm(`Delete device ${id}? This cannot be undone.`)) return;
    try {
      await api.delete(`/api/device/${id}`);
      fetchDevices();
    } catch (err) {
      alert(err.response?.data?.detail || "Error depending on permission?");
    }
  };

  return (
    <div className="page-content active">
      <div className="page-header">
        <h1>Device Management</h1>
        <button className="btn-primary btn-glow" onClick={handleOpenAdd}>
          <PlusCircle size={18} /> Add Device
        </button>
      </div>

      <div className="table-container glass-card">
        {devices.length === 0 ? (
          <p style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>No devices found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Device ID</th>
                <th>Ward</th>
                <th>Bed</th>
                <th>Patient</th>
                <th>Last Seen</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {devices.map(d => (
                <tr key={d.device_id}>
                  <td>
                    <span className={`status-dot ${d.status}`}></span>
                    {d.status}
                  </td>
                  <td><strong>{d.device_id}</strong></td>
                  <td>{d.ward || "—"}</td>
                  <td>{d.bed_number || "—"}</td>
                  <td>{d.patient_name || "—"}</td>
                  <td>{d.last_seen ? new Date(d.last_seen).toLocaleString() : "Never"}</td>
                  <td>
                    <button className="btn-table" onClick={() => navigate(`/dashboard/devices/${d.device_id}`)}>View</button>
                    <button className="btn-table" onClick={() => regenerateKey(d.device_id)}>🔑</button>
                    <button className="btn-table danger" onClick={() => deleteDevice(d.device_id)}>🗑️</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {isAdding && (
        <div className="modal">
          <div className="modal-overlay" onClick={handleCloseModal}></div>
          <div className="modal-card glass-card">
            <h2>Register New Device</h2>
            {registeredKeys ? (
              <div className="api-key-box">
                <p>Device registered! Save this API key:</p>
                <div className="api-key-display">
                  <code>{registeredKeys.api_key}</code>
                  <button className="btn-icon" onClick={() => navigator.clipboard.writeText(registeredKeys.api_key)} title="Copy">
                    <Copy size={16} />
                  </button>
                </div>
                <p className="warning-text">⚠️ This key is shown only once. Flash it to the ESP8266.</p>
                <p><strong>Device ID:</strong> <code>{registeredKeys.device_id}</code></p>
                <button type="button" className="btn-primary" onClick={handleCloseModal} style={{ marginTop: '1rem' }}>Close</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="input-group">
                  <label>Ward / Block (auto-assigned if empty)</label>
                  <input type="text" name="ward" placeholder="e.g., Block A" value={formData.ward} onChange={handleInputChange} />
                </div>
                <div className="input-group">
                  <label>Bed Number (auto-assigned if empty)</label>
                  <input type="text" name="bed_number" placeholder="e.g., 01, 02" value={formData.bed_number} onChange={handleInputChange} />
                </div>
                <div className="input-group">
                  <label>Patient Name (Optional)</label>
                  <input type="text" name="patient_name" placeholder="Patient name" value={formData.patient_name} onChange={handleInputChange} />
                </div>
                <div className="modal-actions">
                  <button type="button" className="btn-secondary" onClick={handleCloseModal}>Cancel</button>
                  <button type="submit" className="btn-primary">Register</button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
