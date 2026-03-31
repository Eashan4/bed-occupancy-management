import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import PatientAvatar from './PatientAvatar';

// Inline chart component
function MiniSparkline({ data, dataKey, color, width = 180, height = 40 }) {
    if (!data || data.length < 2) return null;
    const values = data.map(d => d[dataKey]).filter(v => v != null);
    if (values.length < 2) return null;

    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const points = values.map((v, i) => {
        const x = (i / (values.length - 1)) * width;
        const y = height - ((v - min) / range) * (height - 4) - 2;
        return `${x},${y}`;
    }).join(' ');

    return (
        <svg width={width} height={height} style={{ display: 'block' }}>
            <defs>
                <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity="0.3" />
                    <stop offset="100%" stopColor={color} stopOpacity="0.02" />
                </linearGradient>
            </defs>
            <polygon
                points={`0,${height} ${points} ${width},${height}`}
                fill={`url(#grad-${dataKey})`}
            />
            <polyline
                fill="none"
                stroke={color}
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                points={points}
            />
            {values.length > 0 && (() => {
                const lastX = width;
                const lastY = height - ((values[values.length - 1] - min) / range) * (height - 4) - 2;
                return <circle cx={lastX} cy={lastY} r="2.5" fill={color} />;
            })()}
        </svg>
    );
}

export default function BedUnit({ device, vitals, vitalsHistory, position, isActive, onClick, thresholds = { heart_rate_low: 50, heart_rate_high: 120, spo2_warning: 94, spo2_critical: 90 } }) {
    const bedRef = useRef();
    const pulseRef = useRef();
    const [isHovered, setIsHovered] = useState(false);
    const isOffline = device.status !== 'online';
    const isOccupied = vitals?.bed_status === 1;
    const isCritical = vitals && (vitals.spo2 > 0 && vitals.spo2 < thresholds.spo2_critical || vitals.heart_rate > thresholds.heart_rate_high || (vitals.heart_rate > 0 && vitals.heart_rate < thresholds.heart_rate_low));
    const isWarning = vitals && !isCritical && (vitals.spo2 > 0 && vitals.spo2 < thresholds.spo2_warning);

    // Determine if a patient exists — use patient object OR patient_name string
    const hasPatient = !!(device.patient?.name || device.patient_name);
    const patientName = device.patient?.name || device.patient_name || 'Unknown Patient';

    // Status-dependent bed color
    const bedColor = useMemo(() => {
        if (isOffline) return '#2d3748';
        if (isCritical) return '#ff1744';
        if (isWarning) return '#ff9100';
        if (isOccupied) return '#00e676';
        return '#448aff';
    }, [isOffline, isCritical, isWarning, isOccupied]);

    const bedEmissive = useMemo(() => {
        if (isCritical) return '#ff1744';
        if (isWarning) return '#ff9100';
        if (isOccupied) return '#00e676';
        return '#000000';
    }, [isCritical, isWarning, isOccupied]);

    // Subtle idle float + critical pulse
    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (bedRef.current) {
            bedRef.current.position.y = 0.25 + Math.sin(t * 0.8) * 0.015;
        }
        if (pulseRef.current && isCritical) {
            const scale = 1 + Math.sin(t * 3) * 0.08;
            pulseRef.current.scale.set(scale, 1, scale);
            pulseRef.current.material.opacity = 0.15 + Math.sin(t * 3) * 0.1;
        }
    });

    // Tooltip inline styles
    const panelBg = 'rgba(10, 14, 23, 0.94)';
    const panelBorder = isCritical ? 'rgba(255, 23, 68, 0.4)' : isWarning ? 'rgba(255, 145, 0, 0.3)' : 'rgba(0, 230, 180, 0.2)';
    const glowColor = isCritical ? 'rgba(255, 23, 68, 0.25)' : isWarning ? 'rgba(255, 145, 0, 0.15)' : 'rgba(68, 138, 255, 0.15)';

    return (
        <group
            position={position}
            onClick={(e) => { e.stopPropagation(); onClick(); }}
            onPointerEnter={(e) => { e.stopPropagation(); setIsHovered(true); }}
            onPointerLeave={(e) => { e.stopPropagation(); setIsHovered(false); }}
        >
            {/* Critical pulsing floor ring */}
            {isCritical && !isOffline && (
                <mesh ref={pulseRef} position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.9, 1.4, 32]} />
                    <meshBasicMaterial color="#ff1744" transparent opacity={0.2} side={THREE.DoubleSide} />
                </mesh>
            )}

            {/* Bed Frame - base platform */}
            <mesh ref={bedRef} position={[0, 0.25, 0]} castShadow receiveShadow>
                <boxGeometry args={[1.3, 0.12, 2.2]} />
                <meshStandardMaterial
                    color={bedColor}
                    emissive={bedEmissive}
                    emissiveIntensity={isCritical ? 0.35 : 0.08}
                    roughness={0.3}
                    metalness={0.4}
                    transparent
                    opacity={isOffline ? 0.4 : 0.85}
                />
            </mesh>

            {/* Mattress */}
            <mesh position={[0, 0.35, 0]} castShadow>
                <boxGeometry args={[1.15, 0.1, 2.0]} />
                <meshStandardMaterial
                    color="#1e293b"
                    roughness={0.8}
                    metalness={0.05}
                    transparent
                    opacity={isOffline ? 0.3 : 0.9}
                />
            </mesh>

            {/* Pillow */}
            <mesh position={[0, 0.42, -0.75]}>
                <boxGeometry args={[0.7, 0.08, 0.35]} />
                <meshStandardMaterial color="#cbd5e1" roughness={0.9} transparent opacity={isOffline ? 0.2 : 0.7} />
            </mesh>

            {/* Bed legs (4 corners) */}
            {[[-0.55, 0, -0.95], [0.55, 0, -0.95], [-0.55, 0, 0.95], [0.55, 0, 0.95]].map((pos, i) => (
                <mesh key={i} position={pos}>
                    <cylinderGeometry args={[0.03, 0.03, 0.2, 8]} />
                    <meshStandardMaterial color="#475569" metalness={0.6} roughness={0.3} />
                </mesh>
            ))}

            {/* Headboard */}
            <mesh position={[0, 0.55, -1.05]}>
                <boxGeometry args={[1.3, 0.5, 0.06]} />
                <meshStandardMaterial
                    color={bedColor}
                    emissive={bedEmissive}
                    emissiveIntensity={0.05}
                    roughness={0.4}
                    metalness={0.3}
                    transparent
                    opacity={isOffline ? 0.3 : 0.7}
                />
            </mesh>

            {/* Patient avatar on the bed — visibility strictly tied to physical occupancy */}
            <PatientAvatar
                patient={device.patient}
                patientName={patientName}
                isCritical={isCritical}
                isOccupied={isOccupied}
            />

            {/* ═══════════════════════════════════════════
                HOVER TOOLTIP — compact vitals card on mouse hover
                Shown when NOT active (click) and hovered
            ═══════════════════════════════════════════ */}
            {isHovered && !isActive && (
                <Html position={[0, 2, 0]} center transform sprite>
                    <div style={{
                        background: panelBg,
                        backdropFilter: 'blur(16px)',
                        border: `1px solid ${panelBorder}`,
                        borderRadius: '12px',
                        padding: '0',
                        width: '220px',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        color: '#f1f5f9',
                        boxShadow: `0 6px 24px ${glowColor}, 0 0 1px rgba(255,255,255,0.1)`,
                        overflow: 'hidden',
                        userSelect: 'none',
                        pointerEvents: 'none',
                        animation: 'fadeIn 0.2s ease',
                        zIndex: 1000,
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '8px 12px',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            background: 'rgba(255,255,255,0.02)',
                        }}>
                            <span style={{ fontWeight: 700, fontSize: '11px' }}>
                                👤 {patientName}
                            </span>
                            <span style={{
                                fontSize: '9px',
                                background: `${bedColor}22`,
                                color: bedColor,
                                padding: '2px 6px',
                                borderRadius: '4px',
                                fontWeight: 600,
                            }}>
                                Bed {device.bed_number}
                            </span>
                        </div>

                        {/* Patient info */}
                        {device.patient && (
                            <div style={{
                                display: 'flex', gap: '8px', padding: '6px 12px',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                fontSize: '9px', color: '#94a3b8',
                            }}>
                                {device.patient.age && <span>🎂 {device.patient.age}y</span>}
                                {device.patient.gender && <span>⚧ {device.patient.gender}</span>}
                                {device.patient.condition && (
                                    <span style={{
                                        background: 'rgba(139, 92, 246, 0.12)',
                                        color: '#a78bfa',
                                        padding: '1px 5px',
                                        borderRadius: '3px',
                                    }}>{device.patient.condition}</span>
                                )}
                            </div>
                        )}

                        {/* Vitals row */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-around',
                            padding: '10px 12px',
                        }}>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '8px', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    ❤️ HR
                                </div>
                                <div style={{
                                    fontSize: '18px', fontWeight: 800, lineHeight: 1.2,
                                    color: isCritical ? '#ff5252' : '#4ade80',
                                }}>
                                    {vitals?.heart_rate ? Math.round(vitals.heart_rate) : '--'}
                                    <span style={{ fontSize: '8px', fontWeight: 400, color: '#64748b', marginLeft: '2px' }}>BPM</span>
                                </div>
                            </div>
                            <div style={{
                                width: '1px', background: 'rgba(255,255,255,0.08)',
                            }} />
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '8px', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    🩸 SpO₂
                                </div>
                                <div style={{
                                    fontSize: '18px', fontWeight: 800, lineHeight: 1.2,
                                    color: isCritical ? '#ff5252' : '#60a5fa',
                                }}>
                                    {vitals?.spo2 ? Math.round(vitals.spo2) : '--'}
                                    <span style={{ fontSize: '8px', fontWeight: 400, color: '#64748b', marginLeft: '2px' }}>%</span>
                                </div>
                            </div>
                            <div style={{
                                width: '1px', background: 'rgba(255,255,255,0.08)',
                            }} />
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '8px', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                    🛏️ Bed
                                </div>
                                <div style={{
                                    fontSize: '18px', fontWeight: 800, lineHeight: 1.2,
                                    color: vitals?.bed_status ? '#4ade80' : '#64748b',
                                }}>
                                    {vitals?.bed_status ? '●' : '○'}
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div style={{
                            padding: '4px 12px 6px',
                            background: 'rgba(255,255,255,0.02)',
                            borderTop: '1px solid rgba(255,255,255,0.04)',
                            fontSize: '8px', color: '#475569',
                            textAlign: 'center',
                        }}>
                            {device.ward} · Click to inspect
                        </div>
                    </div>
                </Html>
            )}

            {/* Compact label tag (visible when NOT active and NOT hovered) */}
            {!isActive && !isHovered && (
                <Html position={[0, -0.3, 1.3]} center>
                    <div
                        onClick={(e) => { e.stopPropagation(); onClick(); }}
                        style={{
                            background: panelBg,
                            backdropFilter: 'blur(12px)',
                            border: `1px solid ${panelBorder}`,
                            color: '#e2e8f0',
                            padding: '4px 10px',
                            borderRadius: '8px',
                            fontSize: '10px',
                            fontFamily: 'Inter, system-ui, sans-serif',
                            fontWeight: 600,
                            cursor: 'pointer',
                            whiteSpace: 'nowrap',
                            userSelect: 'none',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px',
                            transition: 'all 0.2s ease',
                            boxShadow: `0 2px 12px ${glowColor}`,
                        }}
                    >
                        <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: bedColor,
                            boxShadow: `0 0 6px ${bedColor}`,
                            display: 'inline-block',
                        }} />
                        {device.bed_number ? `Bed ${device.bed_number}` : device.device_id}
                    </div>
                </Html>
            )}

            {/* Expanded holographic HUD panel (visible when active/zoomed in) */}
            {isActive && vitals && !isOffline && (
                <Html position={[0, 2.2, 0]} center transform sprite>
                    <div style={{
                        background: panelBg,
                        backdropFilter: 'blur(16px)',
                        border: `1px solid ${panelBorder}`,
                        borderRadius: '14px',
                        padding: '0',
                        width: '280px',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        color: '#f1f5f9',
                        boxShadow: `0 8px 32px ${glowColor}, 0 0 1px rgba(255,255,255,0.1)`,
                        overflow: 'hidden',
                        userSelect: 'none',
                    }}>
                        {/* Header */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '10px 14px',
                            borderBottom: `1px solid rgba(255,255,255,0.06)`,
                            background: 'rgba(255,255,255,0.02)',
                        }}>
                            <span style={{ fontWeight: 700, fontSize: '13px' }}>
                                {patientName}
                            </span>
                            <span style={{
                                fontSize: '10px',
                                background: `${bedColor}22`,
                                color: bedColor,
                                padding: '2px 8px',
                                borderRadius: '6px',
                                fontWeight: 600,
                            }}>
                                Bed {device.bed_number}
                            </span>
                        </div>

                        {/* Patient demographics row */}
                        {device.patient && (
                            <div style={{
                                display: 'flex', gap: '12px', padding: '8px 14px',
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                                fontSize: '10px', color: '#94a3b8',
                            }}>
                                {device.patient.age && <span>🎂 {device.patient.age}y</span>}
                                {device.patient.gender && <span>⚧ {device.patient.gender}</span>}
                                {device.patient.condition && (
                                    <span style={{
                                        background: 'rgba(139, 92, 246, 0.12)',
                                        color: '#a78bfa',
                                        padding: '1px 6px',
                                        borderRadius: '4px',
                                    }}>{device.patient.condition}</span>
                                )}
                            </div>
                        )}

                        {/* Vitals cards */}
                        <div style={{
                            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px',
                            padding: '10px 14px',
                        }}>
                            <div style={{
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '10px',
                                padding: '8px 10px',
                                border: `1px solid ${isCritical ? 'rgba(255,23,68,0.2)' : 'rgba(255,255,255,0.04)'}`,
                            }}>
                                <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    ❤️ Heart Rate
                                </div>
                                <div style={{
                                    fontSize: '22px', fontWeight: 800, lineHeight: 1.2,
                                    color: isCritical ? '#ff5252' : '#4ade80',
                                }}>
                                    {Math.round(vitals.heart_rate)}
                                    <span style={{ fontSize: '10px', fontWeight: 400, color: '#64748b', marginLeft: '3px' }}>BPM</span>
                                </div>
                            </div>
                            <div style={{
                                background: 'rgba(255,255,255,0.03)',
                                borderRadius: '10px',
                                padding: '8px 10px',
                                border: `1px solid ${isCritical ? 'rgba(255,23,68,0.2)' : 'rgba(255,255,255,0.04)'}`,
                            }}>
                                <div style={{ fontSize: '9px', color: '#64748b', marginBottom: '2px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                    🩸 SpO₂
                                </div>
                                <div style={{
                                    fontSize: '22px', fontWeight: 800, lineHeight: 1.2,
                                    color: isCritical ? '#ff5252' : '#60a5fa',
                                }}>
                                    {Math.round(vitals.spo2)}
                                    <span style={{ fontSize: '10px', fontWeight: 400, color: '#64748b', marginLeft: '3px' }}>%</span>
                                </div>
                            </div>
                        </div>

                        {/* Mini sparkline trend */}
                        {vitalsHistory && vitalsHistory.length > 2 && (
                            <div style={{ padding: '4px 14px 10px' }}>
                                <div style={{ fontSize: '9px', color: '#475569', marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                                    Trend — Last {vitalsHistory.length} readings
                                </div>
                                <div style={{
                                    background: 'rgba(255,255,255,0.02)',
                                    borderRadius: '8px',
                                    padding: '6px 8px',
                                    border: '1px solid rgba(255,255,255,0.04)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '4px',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '8px', color: '#4ade80', width: '20px' }}>HR</span>
                                        <MiniSparkline data={vitalsHistory} dataKey="heart_rate" color="#4ade80" width={210} height={22} />
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <span style={{ fontSize: '8px', color: '#60a5fa', width: '20px' }}>O₂</span>
                                        <MiniSparkline data={vitalsHistory} dataKey="spo2" color="#60a5fa" width={210} height={22} />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Status bar */}
                        <div style={{
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            padding: '6px 14px',
                            background: 'rgba(255,255,255,0.02)',
                            borderTop: '1px solid rgba(255,255,255,0.04)',
                            fontSize: '9px', color: '#475569',
                        }}>
                            <span>{device.ward}</span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <span style={{
                                    width: '5px', height: '5px', borderRadius: '50%',
                                    background: '#4ade80', display: 'inline-block',
                                    boxShadow: '0 0 4px #4ade80',
                                }} />
                                Live
                            </span>
                        </div>
                    </div>
                </Html>
            )}

            {/* Offline overlay panel */}
            {isActive && isOffline && (
                <Html position={[0, 1.5, 0]} center transform sprite>
                    <div style={{
                        background: 'rgba(15, 23, 42, 0.92)',
                        backdropFilter: 'blur(12px)',
                        border: '1px solid rgba(100, 116, 139, 0.25)',
                        borderRadius: '12px',
                        padding: '14px 20px',
                        fontFamily: 'Inter, system-ui, sans-serif',
                        color: '#94a3b8',
                        textAlign: 'center',
                        width: '200px',
                    }}>
                        <div style={{ fontSize: '24px', marginBottom: '6px' }}>⚫</div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>{device.device_id}</div>
                        <div style={{ fontSize: '10px', marginTop: '4px', color: '#64748b' }}>Device Offline</div>
                    </div>
                </Html>
            )}
        </group>
    );
}