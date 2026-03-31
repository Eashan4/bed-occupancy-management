import { useState, useMemo, Suspense } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Grid, Html } from '@react-three/drei';
import { easing } from 'maath';
import * as THREE from 'three';
import BedUnit from './BedUnit';

// ── Ward wall builder ──
function WardWalls({ wardCount, bedsPerWard = 4, spacingX = 3, spacingZ = 4 }) {
    const walls = [];
    const columns = bedsPerWard;

    for (let w = 0; w < wardCount; w++) {
        const wardOffsetZ = w * (Math.ceil(6 / columns) * spacingZ + 3);
        const wallWidth = columns * spacingX + 1;
        const wallDepth = Math.ceil(6 / columns) * spacingZ + 1;
        const cx = 0;
        const cz = wardOffsetZ + wallDepth / 2 - spacingZ;

        // Back wall
        walls.push(
            <mesh key={`back-${w}`} position={[cx, 1.5, cz - wallDepth / 2 - 0.05]}>
                <boxGeometry args={[wallWidth + 1, 3, 0.08]} />
                <meshStandardMaterial color="#0f172a" transparent opacity={0.3} />
            </mesh>
        );
        // Side walls
        walls.push(
            <mesh key={`left-${w}`} position={[cx - wallWidth / 2 - 0.5, 1.5, cz]}>
                <boxGeometry args={[0.08, 3, wallDepth + 0.5]} />
                <meshStandardMaterial color="#0f172a" transparent opacity={0.2} />
            </mesh>
        );
        walls.push(
            <mesh key={`right-${w}`} position={[cx + wallWidth / 2 + 0.5, 1.5, cz]}>
                <boxGeometry args={[0.08, 3, wallDepth + 0.5]} />
                <meshStandardMaterial color="#0f172a" transparent opacity={0.2} />
            </mesh>
        );
    }
    return <group>{walls}</group>;
}

// ── Camera controller with smooth easing ──
function CameraRig({ activeBedPos }) {
    const { camera } = useThree();
    const targetPosition = useMemo(() => new THREE.Vector3(), []);
    const targetLookAt = useMemo(() => new THREE.Vector3(), []);

    useFrame((state, delta) => {
        if (activeBedPos) {
            targetPosition.set(activeBedPos[0] + 2, activeBedPos[1] + 3.5, activeBedPos[2] + 5);
            targetLookAt.set(activeBedPos[0], activeBedPos[1] + 0.5, activeBedPos[2]);
        } else {
            targetPosition.set(0, 9, 14);
            targetLookAt.set(0, 0, 0);
        }

        easing.damp3(camera.position, targetPosition, 0.35, delta);

        const currentLookAt = new THREE.Vector3(0, 0, -1)
            .applyQuaternion(camera.quaternion)
            .add(camera.position);
        easing.damp3(currentLookAt, targetLookAt, 0.35, delta);
        camera.lookAt(currentLookAt);
    });

    return null;
}

// ── Loading fallback ──
function LoadingFallback() {
    return (
        <Html center>
            <div style={{
                color: '#64748b',
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: '13px',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
            }}>
                <div style={{
                    width: '28px', height: '28px',
                    border: '2px solid rgba(100,116,139,0.2)',
                    borderTopColor: '#00e6b4',
                    borderRadius: '50%',
                    animation: 'spin 0.8s linear infinite',
                }} />
                Loading Digital Twin…
            </div>
        </Html>
    );
}

export default function DigitalTwinScene({ devices, latestVitals, thresholds }) {
    const [activeDevice, setActiveDevice] = useState(null);

    const calculatePosition = (index) => {
        const columns = 4;
        const spacingX = 3;
        const spacingZ = 4;
        const x = (index % columns) * spacingX - ((columns - 1) * spacingX) / 2;
        const z = Math.floor(index / columns) * spacingZ - 2;
        return [x, 0, z];
    };

    // Generate mock history data (replace with real data from state in production)
    const mockHistory = useMemo(() =>
        Array.from({ length: 15 }, (_, i) => ({
            heart_rate: 72 + Math.sin(i * 0.5) * 8 + (Math.random() - 0.5) * 4,
            spo2: 96 + Math.sin(i * 0.3) * 2 + (Math.random() - 0.5) * 1.5,
        })), []
    );

    // Count unique wards for wall geometry
    const wardNames = useMemo(() => {
        const wards = new Set();
        devices.forEach(d => wards.add(d.ward || 'default'));
        return wards;
    }, [devices]);

    return (
        <div style={{
            width: '100%',
            height: '600px',
            borderRadius: '12px',
            overflow: 'hidden',
            background: 'linear-gradient(180deg, #070b14 0%, #0f172a 100%)',
            position: 'relative',
        }}>
            {/* Top-left overlay legend */}
            <div style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                zIndex: 10,
                display: 'flex',
                gap: '10px',
                pointerEvents: 'none',
            }}>
                {[
                    { color: '#00e676', label: 'Occupied' },
                    { color: '#448aff', label: 'Empty' },
                    { color: '#ff9100', label: 'Warning' },
                    { color: '#ff1744', label: 'Critical' },
                    { color: '#2d3748', label: 'Offline' },
                ].map(item => (
                    <div key={item.label} style={{
                        display: 'flex', alignItems: 'center', gap: '5px',
                        fontSize: '10px', color: '#64748b',
                        fontFamily: 'Inter, system-ui, sans-serif',
                    }}>
                        <span style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: item.color,
                            boxShadow: `0 0 6px ${item.color}`,
                            display: 'inline-block',
                        }} />
                        {item.label}
                    </div>
                ))}
            </div>

            {/* Top-right controls hint */}
            <div style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                zIndex: 10,
                fontSize: '10px',
                color: '#475569',
                fontFamily: 'Inter, system-ui, sans-serif',
                pointerEvents: 'none',
                textAlign: 'right',
                lineHeight: 1.6,
            }}>
                🖱 Click bed to inspect · Click empty space to reset
            </div>

            {/* Active device info bar */}
            {activeDevice && (
                <div style={{
                    position: 'absolute',
                    bottom: '12px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    zIndex: 10,
                    background: 'rgba(10, 14, 23, 0.85)',
                    backdropFilter: 'blur(12px)',
                    border: '1px solid rgba(0, 230, 180, 0.15)',
                    borderRadius: '10px',
                    padding: '6px 16px',
                    fontSize: '11px',
                    color: '#94a3b8',
                    fontFamily: 'Inter, system-ui, sans-serif',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                }}>
                    <span style={{ color: '#00e6b4', fontWeight: 600 }}>Inspecting:</span>
                    {activeDevice}
                    <button
                        onClick={() => setActiveDevice(null)}
                        style={{
                            background: 'rgba(255,255,255,0.06)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: '#94a3b8',
                            borderRadius: '6px',
                            padding: '2px 8px',
                            fontSize: '10px',
                            cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif',
                        }}
                    >
                        ✕ Reset
                    </button>
                </div>
            )}

            <Canvas
                shadows
                camera={{ position: [0, 9, 14], fov: 50 }}
                onPointerMissed={() => setActiveDevice(null)}
            >
                <Suspense fallback={<LoadingFallback />}>
                    {/* Lighting */}
                    <ambientLight intensity={0.35} color="#e8f0ff" />
                    <directionalLight
                        position={[8, 12, 6]}
                        intensity={0.9}
                        castShadow
                        shadow-mapSize={[1024, 1024]}
                        color="#f0f4ff"
                    />
                    <directionalLight position={[-5, 8, -3]} intensity={0.3} color="#448aff" />
                    <pointLight position={[0, 6, 0]} intensity={0.2} color="#00e6b4" distance={20} />

                    {/* Floor grid */}
                    <Grid
                        infiniteGrid
                        fadeDistance={25}
                        fadeStrength={1.5}
                        sectionColor="#1e293b"
                        cellColor="#0f172a"
                        sectionSize={3}
                        cellSize={1}
                    />

                    {/* Floor plane for shadows */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
                        <planeGeometry args={[50, 50]} />
                        <shadowMaterial transparent opacity={0.3} />
                    </mesh>

                    {/* Bed units */}
                    {devices.map((device, index) => {
                        const pos = calculatePosition(index);
                        return (
                            <BedUnit
                                key={device.device_id}
                                device={device}
                                vitals={latestVitals[device.device_id]}
                                vitalsHistory={mockHistory}
                                position={pos}
                                isActive={activeDevice === device.device_id}
                                onClick={() => setActiveDevice(
                                    activeDevice === device.device_id ? null : device.device_id
                                )}
                                thresholds={thresholds}
                            />
                        );
                    })}

                    {/* Camera controller */}
                    <CameraRig
                        activeBedPos={
                            activeDevice
                                ? calculatePosition(devices.findIndex(d => d.device_id === activeDevice))
                                : null
                        }
                    />
                </Suspense>
            </Canvas>
        </div>
    );
}