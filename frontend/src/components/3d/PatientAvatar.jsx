import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';

export default function PatientAvatar({ patient, patientName, isCritical, isOccupied }) {
    const meshRef = useRef();
    const glowRef = useRef();

    // Animation loop: thrash if critical, gentle breathing if stable
    useFrame(({ clock }) => {
        const t = clock.getElapsedTime();
        if (meshRef.current) {
            if (isCritical) {
                // Critical: rapid lateral shake
                meshRef.current.position.x = Math.sin(t * 15) * 0.05;
                meshRef.current.rotation.z = Math.sin(t * 12) * 0.03;
            } else {
                // Stable: gentle breathing animation
                meshRef.current.position.x = 0;
                meshRef.current.rotation.z = 0;
                meshRef.current.scale.y = 1 + Math.sin(t * 1.5) * 0.015;
            }
        }
        // Pulsing glow ring for critical patients
        if (glowRef.current && isCritical) {
            glowRef.current.scale.setScalar(1 + Math.sin(t * 4) * 0.15);
            glowRef.current.material.opacity = 0.3 + Math.sin(t * 4) * 0.2;
        }
    });

    // Show avatar if occupied OR if a patient name exists (even without full patient record)
    if (!isOccupied) return null;

    // Digital Twin Logic: scale for children, color by gender
    // Use patient object if available, otherwise use sensible defaults
    const hasFullPatient = patient && patient.name;
    const isChild = hasFullPatient && patient.age && patient.age < 14;
    const bodyScale = isChild ? [0.55, 0.55, 0.55] : [1, 1, 1];
    
    // Color: use gender from patient obj, or default to neutral teal
    const genderColor = hasFullPatient && patient.gender === 'female' ? '#ff80ab' : 
                        hasFullPatient && patient.gender === 'male' ? '#82b1ff' : '#80cbc4';
    const baseColor = genderColor;
    const criticalColor = '#ff1744';

    return (
        <group scale={bodyScale} position={[0, 0.55, 0]}>
            {/* Body - lying capsule */}
            <mesh ref={meshRef} rotation={[Math.PI / 2, 0, 0]}>
                <capsuleGeometry args={[0.25, 0.9, 8, 16]} />
                <meshStandardMaterial
                    color={isCritical ? criticalColor : baseColor}
                    emissive={isCritical ? criticalColor : baseColor}
                    emissiveIntensity={isCritical ? 0.6 : 0.08}
                    roughness={0.4}
                    metalness={0.1}
                />
            </mesh>

            {/* Head sphere */}
            <mesh position={[0, 0, -0.72]}>
                <sphereGeometry args={[0.2, 16, 16]} />
                <meshStandardMaterial
                    color={isCritical ? criticalColor : '#e8d5b7'}
                    emissive={isCritical ? criticalColor : '#000000'}
                    emissiveIntensity={isCritical ? 0.5 : 0}
                    roughness={0.6}
                />
            </mesh>

            {/* Critical state: pulsing danger ring */}
            {isCritical && (
                <mesh ref={glowRef} position={[0, 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <ringGeometry args={[0.5, 0.65, 32]} />
                    <meshBasicMaterial color="#ff1744" transparent opacity={0.4} side={2} />
                </mesh>
            )}

            {/* Floating 3D badge for alerts */}
            {isCritical && (
                <Html position={[0, 1.4, 0]} center>
                    <div style={{
                        background: 'linear-gradient(135deg, #ff1744, #d50000)',
                        color: '#fff',
                        padding: '3px 10px',
                        borderRadius: '6px',
                        fontSize: '10px',
                        fontWeight: 700,
                        letterSpacing: '0.08em',
                        fontFamily: 'Inter, sans-serif',
                        boxShadow: '0 0 16px rgba(255,23,68, 0.6)',
                        animation: 'pulse 1.2s ease-in-out infinite',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                    }}>
                        ⚠ CRITICAL
                    </div>
                </Html>
            )}

            {/* Child indicator badge */}
            {isChild && !isCritical && (
                <Html position={[0, 1.2, 0]} center>
                    <div style={{
                        background: 'rgba(255, 193, 7, 0.15)',
                        border: '1px solid rgba(255, 193, 7, 0.4)',
                        color: '#ffc107',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        fontSize: '9px',
                        fontWeight: 600,
                        fontFamily: 'Inter, sans-serif',
                        whiteSpace: 'nowrap',
                        userSelect: 'none',
                    }}>
                        👶 Pediatric
                    </div>
                </Html>
            )}
        </group>
    );
}