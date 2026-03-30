import { useState, useEffect } from "react";
import { api } from "../api";
import { Link } from "react-router-dom";
import { PlusCircle, Search, Edit2, LogOut } from "lucide-react";

export default function Patients() {
  const [patients, setPatients] = useState([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingPatient, setEditingPatient] = useState(null);
  const [formData, setFormData] = useState({ name: "", age: "", gender: "", condition: "", device_id: "", notes: "" });

  const fetchPatients = async () => {
    try {
      const res = await api.get("/api/patients");
      setPatients(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPatients();
  }, []);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleOpenAdd = () => {
    setEditingPatient(null);
    setFormData({ name: "", age: "", gender: "", condition: "", device_id: "", notes: "" });
    setIsAdding(true);
  };

  const handleOpenEdit = (p) => {
    setEditingPatient(p.id);
    setFormData({ 
      name: p.name, 
      age: p.age || "", 
      gender: p.gender || "", 
      condition: p.condition || "", 
      device_id: p.device_id || "", 
      notes: p.notes || "" 
    });
    setIsAdding(true);
  };

  const handleCloseModal = () => {
    setIsAdding(false);
    setEditingPatient(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        age: formData.age ? parseInt(formData.age) : null,
        gender: formData.gender || null,
        condition: formData.condition || null,
        device_id: formData.device_id || null,
        notes: formData.notes || null
      };

      if (editingPatient) {
        await api.put(`/api/patients/${editingPatient}`, payload);
      } else {
        await api.post("/api/patients", payload);
      }
      setIsAdding(false);
      fetchPatients();
    } catch (err) {
      alert(err.response?.data?.detail || "Error saving patient");
    }
  };

  const handleDischarge = async (id, name) => {
    if (!confirm(`Are you sure you want to discharge ${name}?`)) return;
    try {
      await api.post(`/api/patients/${id}/discharge`);
      fetchPatients();
    } catch (err) {
      alert(err.response?.data?.detail || "Error discharging patient");
    }
  };

  return (
    <div className="page-content active">
      <div className="page-header">
        <h1>Patient Management</h1>
        <button className="btn-primary btn-glow" onClick={handleOpenAdd}>
          <PlusCircle size={18} /> Admit Patient
        </button>
      </div>

      <div className="table-container glass-card">
        {patients.length === 0 ? (
          <p style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>No patients found.</p>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Name</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Condition</th>
                <th>Device</th>
                <th>Admitted</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {patients.map(p => (
                <tr key={p.id} className={p.status === "discharged" ? "discharged-row" : ""}>
                  <td>
                    <span className={`patient-status-dot ${p.status}`}>{p.status === 'admitted' ? '🟢' : '⚪'}</span> 
                    {p.status}
                  </td>
                  <td>
                    <Link to={`/dashboard/patients/${p.id}`} style={{textDecoration: 'none', color: 'inherit'}}>
                        <strong>{p.name}</strong>
                    </Link>
                  </td>
                  <td>{p.age || "—"}</td>
                  <td>{p.gender || "—"}</td>
                  <td>{p.condition || "—"}</td>
                  <td>{p.device_id || "—"}</td>
                  <td>{p.admission_date ? new Date(p.admission_date).toLocaleDateString() : "—"}</td>
                  <td style={{ display: 'flex', gap: '0.5rem' }}>
                    {p.status === 'admitted' && (
                      <button className="btn-table" onClick={() => handleOpenEdit(p)}>
                        <Edit2 size={14} /> Edit
                      </button>
                    )}
                    {p.status === 'admitted' ? (
                      <button className="btn-table danger" onClick={() => handleDischarge(p.id, p.name)}>
                        <LogOut size={14} /> Discharge
                      </button>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Discharged {new Date(p.discharge_date).toLocaleDateString()}
                      </span>
                    )}
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
            <h2>{editingPatient ? "Edit Patient" : "Admit New Patient"}</h2>
            <form onSubmit={handleSubmit}>
              <div className="input-group">
                <label>Patient Name *</label>
                <input type="text" name="name" placeholder="Full name" required value={formData.name} onChange={handleInputChange} />
              </div>
              <div className="form-row">
                <div className="input-group">
                  <label>Age</label>
                  <input type="number" name="age" placeholder="Age" min="0" max="150" value={formData.age} onChange={handleInputChange} />
                </div>
                <div className="input-group">
                  <label>Gender</label>
                  <select name="gender" className="input-select" value={formData.gender} onChange={handleInputChange}>
                    <option value="">Select</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>
              <div className="input-group">
                <label>Condition</label>
                <input type="text" name="condition" placeholder="e.g., Post-surgery monitoring" value={formData.condition} onChange={handleInputChange} />
              </div>
              <div className="input-group">
                <label>Assign Device (optional)</label>
                <input type="text" name="device_id" placeholder="e.g., BED_A_01" value={formData.device_id} onChange={handleInputChange} />
              </div>
              <div className="input-group">
                <label>Notes</label>
                <textarea name="notes" placeholder="Additional notes..." rows="2" value={formData.notes} onChange={handleInputChange}></textarea>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={handleCloseModal}>Cancel</button>
                <button type="submit" className="btn-primary">{editingPatient ? "Save Changes" : "Admit Patient"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
