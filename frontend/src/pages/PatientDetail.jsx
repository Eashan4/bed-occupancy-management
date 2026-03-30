import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { api } from "../api";
import { User, Activity, ArrowLeft, Calendar, FileText, Edit2 } from "lucide-react";

export default function PatientDetail() {
  const { patientId } = useParams();
  const navigate = useNavigate();
  const [patient, setPatient] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({ name: "", age: "", gender: "", condition: "", device_id: "", notes: "" });

  const fetchPatient = async () => {
    try {
      const { data } = await api.get(`/api/patients/${patientId}`);
      setPatient(data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchPatient();
  }, [patientId]);

  const handleOpenEdit = () => {
    setFormData({
      name: patient.name,
      age: patient.age || "",
      gender: patient.gender || "",
      condition: patient.condition || "",
      device_id: patient.device_id || "",
      notes: patient.notes || ""
    });
    setIsEditing(true);
  };

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleCloseModal = () => setIsEditing(false);

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
      await api.put(`/api/patients/${patientId}`, payload);
      setIsEditing(false);
      fetchPatient();
    } catch (err) {
      alert(err.response?.data?.detail || "Error saving patient");
    }
  };

  if (!patient) return <div className="page-content active">Loading patient details...</div>;

  return (
    <div className="page-content active">
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <button className="btn-icon" onClick={() => navigate("/dashboard/patients")}>
            <ArrowLeft />
          </button>
          <h1>Patient Record</h1>
        </div>
        <div className="header-actions">
          {patient.status === 'admitted' && (
            <button className="btn-secondary" onClick={handleOpenEdit}>
              <Edit2 size={18} /> Edit Patient
            </button>
          )}
          <span className={`status-badge ${patient.status === 'admitted' ? 'online' : 'offline'}`}>
            {patient.status.toUpperCase()}
          </span>
          {patient.device_id && (
             <button className="btn-secondary" onClick={() => navigate(`/dashboard/devices/${patient.device_id}`)}>
               <Activity size={18} /> View Device Live Vitals
             </button>
          )}
        </div>
      </div>

      <div className="detail-grid" style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: '1.5rem' }}>
        <div className="patient-profile-card glass-card" style={{ padding: '2rem', textAlign: 'center' }}>
          <div style={{ 
            width: '100px', height: '100px', borderRadius: '50%', 
            background: 'var(--bg-secondary)', border: '2px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.5rem'
           }}>
             <User size={48} color="var(--accent)" />
          </div>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>{patient.name}</h2>
          <p style={{ color: 'var(--text-muted)' }}>ID: #{patient.id}</p>
          
          <div style={{ marginTop: '2rem', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
             <div>
               <small style={{ color: 'var(--text-muted)' }}>AGE</small>
               <div style={{ fontWeight: 600 }}>{patient.age || '—'} years</div>
             </div>
             <div>
               <small style={{ color: 'var(--text-muted)' }}>GENDER</small>
               <div style={{ fontWeight: 600 }}>{patient.gender || '—'}</div>
             </div>
             <div>
               <small style={{ color: 'var(--text-muted)' }}>CURRENT CONDITION</small>
               <div style={{ fontWeight: 600 }}>{patient.condition || '—'}</div>
             </div>
          </div>
        </div>

        <div className="patient-history-card" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Calendar size={20} color="var(--blue)" /> Admission Details
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <div>
                <small style={{ color: 'var(--text-muted)' }}>ADMISSION DATE</small>
                <div>{patient.admission_date ? new Date(patient.admission_date).toLocaleString() : '—'}</div>
              </div>
              <div>
                <small style={{ color: 'var(--text-muted)' }}>DISCHARGE DATE</small>
                <div>{patient.discharge_date ? new Date(patient.discharge_date).toLocaleString() : '—'}</div>
              </div>
              <div>
                <small style={{ color: 'var(--text-muted)' }}>ASSIGNED DEVICE</small>
                <div>{patient.device_id || 'None assigned'}</div>
              </div>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.5rem', flex: 1 }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <FileText size={20} color="var(--yellow)" /> Medical Notes
            </h3>
            <p style={{ 
               background: 'rgba(0,0,0,0.2)', padding: '1rem', borderRadius: '8px', 
               minHeight: '150px', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)'
            }}>
              {patient.notes || "No notes available for this patient."}
            </p>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="modal">
          <div className="modal-overlay" onClick={handleCloseModal}></div>
          <div className="modal-card glass-card">
            <h2>Edit Patient</h2>
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
                <button type="submit" className="btn-primary">Save Changes</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
