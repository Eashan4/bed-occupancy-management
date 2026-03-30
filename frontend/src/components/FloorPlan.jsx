import { useState } from "react";
import { useNavigate } from "react-router-dom";

const BLOCK_COLORS = ['accent-teal', 'accent-blue', 'accent-purple', 'accent-amber'];

export default function FloorPlan({ devices, latestVitals }) {
  const navigate = useNavigate();
  const [hoveredDevice, setHoveredDevice] = useState(null);

  const getBedStatus = (device) => {
    if (!device || device.status !== 'online') return 'offline';
    const v = latestVitals[device.device_id] || {};
    if (v.spo2 && v.spo2 < 90) return 'critical';
    if ((v.spo2 && v.spo2 < 94) || (v.heart_rate && (v.heart_rate > 120 || v.heart_rate < 50))) return 'warning';
    return 'stable';
  };

  const blocks = {};
  devices.forEach(d => {
    const ward = d.ward || 'Unassigned';
    if (!blocks[ward]) blocks[ward] = [];
    blocks[ward].push(d);
  });

  const blockNames = Object.keys(blocks);

  if (blockNames.length === 0) {
    return (
      <div className="floor-plan-empty" style={{ textAlign: "center", padding: "3rem", color: "var(--text-muted)" }}>
         <div className="empty-icon" style={{ fontSize: "3rem" }}>🏥</div>
         <p>No blocks registered yet</p>
         <p className="empty-sub">Register a device from the <strong>Devices</strong> page — a block will be auto-assigned.</p>
      </div>
    );
  }

  const [hoverPos, setHoverPos] = useState({ x: 0, y: 0 });

  const handleMouseEnter = (e, device) => {
    if (device) {
      setHoveredDevice(device);
      setHoverPos({ x: e.clientX, y: e.clientY });
    }
  };
  
  const handleMouseMove = (e) => {
      setHoverPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseLeave = () => {
    setHoveredDevice(null);
  };

  const renderBed = (device, bedNum) => {
    const status = getBedStatus(device);
    const isEmpty = !device;
    const devId = device ? device.device_id : '';
    const patient = device?.patient_name || '';

    return (
      <div 
        key={bedNum}
        className={`bed-unit ${status} ${isEmpty ? 'empty-bed' : ''}`}
        onMouseEnter={(e) => handleMouseEnter(e, device)}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={() => devId && navigate(`/dashboard/devices/${devId}`)}
      >
        <div className="bed-shape">
            <div className="bed-headboard"></div>
            <div className="bed-mattress">
                <div className="bed-pillow"></div>
            </div>
        </div>
        <div className="bed-info" style={{ marginLeft: "0.5rem", flex: 1, display: "flex", flexDirection: "column" }}>
            <span className="bed-number" style={{ fontSize: "0.75rem", fontWeight: "bold" }}>Bed {bedNum}</span>
            <span className="bed-patient-name" style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
               {patient || (isEmpty ? '— empty —' : 'No patient')}
            </span>
        </div>
        <div className={`bed-status-dot ${status}`} style={{ width: "10px", height: "10px", borderRadius: "50%", background: status === 'stable' ? 'var(--green)' : status === 'warning' ? 'var(--yellow)' : status === 'critical' ? 'var(--red)' : 'var(--grey)' }}></div>
      </div>
    );
  };

  const roomsHTML = blockNames.map((name, idx) => {
    const colorClass = BLOCK_COLORS[idx % BLOCK_COLORS.length];
    const devicesInBlock = [...blocks[name]];
    while (devicesInBlock.length < 6) devicesInBlock.push(null);
    
    const leftBeds = devicesInBlock.slice(0, 3);
    const rightBeds = devicesInBlock.slice(3, 6);

    return (
      <div key={name} style={{ display: "contents" }}>
        <div className={`room ${colorClass}`}>
          <div className="room-label">{name}</div>
          <div className="room-inner">
              <div className="bed-column left">
                  {leftBeds.map((d, i) => renderBed(d, i + 1))}
              </div>
              <div className="room-aisle">
                  <div className="aisle-arrow">↕</div>
              </div>
              <div className="bed-column right">
                  {rightBeds.map((d, i) => renderBed(d, i + 4))}
              </div>
          </div>
          <div className="room-door">
              <span className="door-icon">🚪</span>
              <span className="door-text">Entry</span>
          </div>
        </div>
        {idx < blockNames.length - 1 && (
          <div className="corridor">
              <div className="corridor-line"></div>
              <span className="corridor-label">Corridor</span>
              <div className="corridor-line"></div>
          </div>
        )}
      </div>
    );
  });

  return (
    <div style={{ position: "relative" }}>
      <div className="floor-plan">{roomsHTML}</div>
      <div className="floor-legend" style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
          <span className="legend-item" style={{display:'flex', alignItems:'center', gap:'0.3rem', fontSize:'0.8rem'}}><span className="legend-dot stable" style={{width:'10px', height:'10px', borderRadius:'50%', background:'var(--green)'}}></span> Stable</span>
          <span className="legend-item" style={{display:'flex', alignItems:'center', gap:'0.3rem', fontSize:'0.8rem'}}><span className="legend-dot warning" style={{width:'10px', height:'10px', borderRadius:'50%', background:'var(--yellow)'}}></span> Warning</span>
          <span className="legend-item" style={{display:'flex', alignItems:'center', gap:'0.3rem', fontSize:'0.8rem'}}><span className="legend-dot critical" style={{width:'10px', height:'10px', borderRadius:'50%', background:'var(--red)'}}></span> Critical</span>
          <span className="legend-item" style={{display:'flex', alignItems:'center', gap:'0.3rem', fontSize:'0.8rem'}}><span className="legend-dot offline" style={{width:'10px', height:'10px', borderRadius:'50%', background:'var(--grey)'}}></span> Offline / Empty</span>
      </div>

      {hoveredDevice && (
        <div className="bed-tooltip glass-card" style={{
           position: 'fixed', left: hoverPos.x + 15 + 'px', top: hoverPos.y + 15 + 'px', zIndex: 1000, 
           padding: '1rem', minWidth: '200px',
           pointerEvents: 'none',
           background: "rgba(10, 15, 25, 0.95)"
        }}>
           <div className={`tooltip-header ${getBedStatus(hoveredDevice)}`} style={{display:'flex', justifyContent:'space-between', borderBottom:'1px solid var(--glass-border)', paddingBottom:'0.5rem', marginBottom:'0.5rem'}}>
               <strong>{hoveredDevice.device_id}</strong>
               <span>{getBedStatus(hoveredDevice).toUpperCase()}</span>
           </div>
           <div className="tooltip-body" style={{fontSize: "0.85rem", display: "flex", flexDirection: "column", gap: "0.4rem"}}>
               <div>👤 Patient: {hoveredDevice.patient_name || 'Unassigned'}</div>
               <div>🏥 Ward: {hoveredDevice.ward || '—'}</div>
               <div>❤️ BPM: {latestVitals[hoveredDevice.device_id]?.heart_rate ? Math.round(latestVitals[hoveredDevice.device_id].heart_rate) : '--'}</div>
               <div>🩸 SpO2: {latestVitals[hoveredDevice.device_id]?.spo2 ? Math.round(latestVitals[hoveredDevice.device_id].spo2) : '--'}</div>
           </div>
        </div>
      )}
    </div>
  );
}
