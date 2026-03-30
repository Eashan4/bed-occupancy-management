"""
Hospital Bed Occupancy & Patient Vital Monitoring System
FastAPI Backend — All routes, WebSocket, scheduler, AI anomaly detection
"""

import os
import uuid
import csv
import io
import logging
from datetime import datetime, timedelta
from typing import List, Optional
from contextlib import asynccontextmanager

import numpy as np
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Depends, HTTPException, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, RedirectResponse
from sqlalchemy import select, func, update, desc, and_
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from passlib.context import CryptContext
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from pydantic import BaseModel

from config import (
    JWT_SECRET, JWT_ALGORITHM, JWT_EXPIRY_HOURS,
    HEARTBEAT_TIMEOUT, OFFLINE_CHECK_INTERVAL,
    HEART_RATE_LOW, HEART_RATE_HIGH, SPO2_CRITICAL, SPO2_WARNING,
    ANOMALY_THRESHOLD, PREDICTION_WINDOW, ESCALATION_TIMEOUT,
)
from database import get_db, SessionLocal, engine, Base
from models import Device, SensorData, Alert, Patient, User, AuditLog


# ============================================
# Logging
# ============================================
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("hospital_iot")


# ============================================
# Password hashing
# ============================================
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ============================================
# WebSocket Connection Manager
# ============================================
class ConnectionManager:
    """Manages all connected dashboard WebSocket clients."""

    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active_connections.append(ws)
        logger.info(f"WebSocket client connected. Total: {len(self.active_connections)}")

    def disconnect(self, ws: WebSocket):
        if ws in self.active_connections:
            self.active_connections.remove(ws)
        logger.info(f"WebSocket client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, data: dict):
        """Send data to ALL connected dashboard clients."""
        disconnected = []
        for conn in self.active_connections:
            try:
                await conn.send_json(data)
            except Exception:
                disconnected.append(conn)
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)


ws_manager = ConnectionManager()


# ============================================
# Background Scheduler — Offline Detection & Auto-Escalation
# ============================================
scheduler = AsyncIOScheduler()


async def check_offline_devices():
    """Mark devices as offline if heartbeat not received within timeout."""
    with SessionLocal() as session:
        try:
            cutoff = datetime.utcnow() - timedelta(seconds=HEARTBEAT_TIMEOUT)
            result = session.execute(
                select(Device).where(
                    Device.status == "online",
                    Device.last_seen < cutoff
                )
            )
            stale_devices = result.scalars().all()

            for device in stale_devices:
                device.status = "offline"
                alert = Alert(
                    device_id=device.device_id,
                    alert_type="device_offline",
                    severity="high",
                    message=f"Device {device.device_id} (Bed {device.bed_number}) went offline",
                )
                session.add(alert)

                await ws_manager.broadcast({
                    "type": "device_status",
                    "device_id": device.device_id,
                    "status": "offline",
                    "timestamp": datetime.utcnow().isoformat(),
                })
                await ws_manager.broadcast({
                    "type": "alert",
                    "device_id": device.device_id,
                    "alert_type": "device_offline",
                    "severity": "high",
                    "message": f"Device {device.device_id} went offline",
                    "timestamp": datetime.utcnow().isoformat(),
                })
                logger.warning(f"Device {device.device_id} marked OFFLINE")

            session.commit()
        except Exception as e:
            logger.error(f"Offline check error: {e}")
            session.rollback()


async def auto_escalate_alerts():
    """Auto-escalate unacknowledged alerts older than ESCALATION_TIMEOUT."""
    with SessionLocal() as session:
        try:
            cutoff = datetime.utcnow() - timedelta(seconds=ESCALATION_TIMEOUT)
            result = session.execute(
                select(Alert).where(
                    Alert.escalation_status == "new",
                    Alert.timestamp < cutoff
                )
            )
            stale_alerts = result.scalars().all()

            for alert in stale_alerts:
                alert.escalation_status = "escalated"
                alert.escalated_at = datetime.utcnow()

                await ws_manager.broadcast({
                    "type": "alert_escalation",
                    "alert_id": alert.id,
                    "device_id": alert.device_id,
                    "severity": alert.severity,
                    "message": f"ESCALATED: {alert.message}",
                    "timestamp": datetime.utcnow().isoformat(),
                })
                logger.warning(f"Alert {alert.id} auto-escalated for device {alert.device_id}")

            session.commit()
        except Exception as e:
            logger.error(f"Auto-escalation error: {e}")
            session.rollback()


# ============================================
# AI Anomaly Detection (Rule-Based Engine)
# ============================================
class AnomalyDetector:
    """
    Production rule-based anomaly detection engine.
    Detects: threshold violations, sudden drops, erratic patterns, trend analysis.
    """

    def __init__(self):
        self.data_buffer: dict = {}  # device_id -> list of recent readings

    def add_reading(self, device_id: str, heart_rate: float, spo2: float):
        """Buffer readings for sliding window analysis."""
        if device_id not in self.data_buffer:
            self.data_buffer[device_id] = []
        self.data_buffer[device_id].append({
            "heart_rate": heart_rate,
            "spo2": spo2,
            "timestamp": datetime.utcnow(),
        })
        # Keep only last PREDICTION_WINDOW readings
        self.data_buffer[device_id] = self.data_buffer[device_id][-PREDICTION_WINDOW:]

    def detect_anomaly(self, device_id: str, heart_rate: float, spo2: float) -> Optional[dict]:
        """
        Multi-layer anomaly detection:
        1. Critical threshold checks
        2. Warning threshold checks
        3. Sliding window pattern analysis (sudden drops, erratic HR)
        """
        # Layer 1: Critical SpO2
        if 0 < spo2 < SPO2_CRITICAL:
            return {
                "alert_type": "low_spo2",
                "severity": "critical",
                "message": f"CRITICAL: SpO2 at {spo2}% (below {SPO2_CRITICAL}%)",
            }
        # Layer 2: Warning SpO2
        if 0 < spo2 < SPO2_WARNING:
            return {
                "alert_type": "low_spo2",
                "severity": "high",
                "message": f"WARNING: SpO2 at {spo2}% (below {SPO2_WARNING}%)",
            }
        # Layer 3: High heart rate
        if heart_rate > HEART_RATE_HIGH:
            return {
                "alert_type": "high_heart_rate",
                "severity": "high",
                "message": f"Heart rate elevated: {heart_rate} BPM (above {HEART_RATE_HIGH})",
            }
        # Layer 4: Low heart rate
        if 0 < heart_rate < HEART_RATE_LOW:
            return {
                "alert_type": "low_heart_rate",
                "severity": "high",
                "message": f"Heart rate low: {heart_rate} BPM (below {HEART_RATE_LOW})",
            }

        # Layer 5: Sliding window pattern analysis
        readings = self.data_buffer.get(device_id, [])
        if len(readings) >= 5:
            recent_spo2 = [r["spo2"] for r in readings[-5:]]
            drop = recent_spo2[0] - recent_spo2[-1]
            if drop > 8:
                return {
                    "alert_type": "anomaly",
                    "severity": "critical",
                    "message": f"Sudden SpO2 drop detected: {drop:.1f}% decrease in last 5 readings",
                }
            recent_hr = [r["heart_rate"] for r in readings[-5:]]
            hr_std = float(np.std(recent_hr))
            if hr_std > 25:
                return {
                    "alert_type": "anomaly",
                    "severity": "high",
                    "message": f"Erratic heart rate detected: std dev = {hr_std:.1f}",
                }

            # Layer 6: Downward trend detection
            if len(readings) >= 10:
                recent_10_spo2 = [r["spo2"] for r in readings[-10:]]
                if all(recent_10_spo2[i] >= recent_10_spo2[i + 1] for i in range(len(recent_10_spo2) - 1)):
                    total_drop = recent_10_spo2[0] - recent_10_spo2[-1]
                    if total_drop > 5:
                        return {
                            "alert_type": "anomaly",
                            "severity": "high",
                            "message": f"Continuous SpO2 decline: {total_drop:.1f}% over last 10 readings",
                        }

        return None


ai_detector = AnomalyDetector()


# ============================================
# App Lifespan (startup/shutdown)
# ============================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    try:
        with engine.begin() as conn:
            Base.metadata.create_all(conn)
        logger.info("Database tables created/verified")

        # Seed default admin user if none exists
        with SessionLocal() as session:
            result = session.execute(select(User).limit(1))
            if not result.scalar_one_or_none():
                admin = User(
                    username="admin",
                    password_hash=pwd_context.hash("admin123"),
                    role="admin",
                )
                session.add(admin)
                session.commit()
                logger.info("Default admin user created (admin / admin123)")
    except Exception as e:
        logger.error(f"Startup DB init failed: {e}")

    # Schedule background jobs
    scheduler.add_job(check_offline_devices, "interval", seconds=OFFLINE_CHECK_INTERVAL)
    scheduler.add_job(auto_escalate_alerts, "interval", seconds=60)  # Check every 60s
    scheduler.start()
    logger.info("Scheduler started (offline detection + alert escalation)")
    logger.info("Hospital IoT backend started")
    yield

    # Shutdown
    if scheduler.running:
        scheduler.shutdown()
    logger.info("Hospital IoT backend stopped")


# ============================================
# FastAPI App
# ============================================
from fastapi.staticfiles import StaticFiles

app = FastAPI(
    title="Hospital IoT Monitoring System",
    version="2.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Serve dashboard static files
_dashboard_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dashboard")
if os.path.isdir(_dashboard_path):
    app.mount("/dashboard", StaticFiles(directory=_dashboard_path, html=True), name="dashboard")


# ============================================
# Pydantic Schemas
# ============================================
class DeviceRegisterRequest(BaseModel):
    bed_number: Optional[str] = None
    ward: Optional[str] = None
    patient_name: Optional[str] = None

class DeviceDataRequest(BaseModel):
    device_id: str
    heart_rate: float
    spo2: float
    bed_status: int  # 0=empty, 1=occupied

class HeartbeatRequest(BaseModel):
    device_id: str

class LoginRequest(BaseModel):
    username: str
    password: str

class PatientCreateRequest(BaseModel):
    name: str
    age: Optional[int] = None
    gender: Optional[str] = None
    condition: Optional[str] = None
    device_id: Optional[str] = None
    notes: Optional[str] = None

class PatientUpdateRequest(BaseModel):
    name: Optional[str] = None
    age: Optional[int] = None
    gender: Optional[str] = None
    condition: Optional[str] = None
    device_id: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None


# ============================================
# Auth Helpers
# ============================================
def create_jwt_token(user_id: int, username: str, role: str) -> str:
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def verify_jwt(authorization: str = Header(None)) -> dict:
    """Verify JWT token from Authorization header."""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = authorization.split(" ")[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


async def verify_api_key(x_api_key: str = Header(None), db: Session = Depends(get_db)) -> Device:
    """Validate device API key from x-api-key header."""
    if not x_api_key:
        raise HTTPException(status_code=401, detail="Missing API key")
    result = db.execute(select(Device).where(Device.api_key == x_api_key))
    device = result.scalar_one_or_none()
    if not device:
        logger.warning(f"Invalid API key attempt: {x_api_key[:8]}...")
        raise HTTPException(status_code=401, detail="Invalid API key")
    return device


# ============================================
# ROUTE: System
# ============================================
@app.get("/")
async def root():
    return RedirectResponse(url="/dashboard/")

@app.get("/api/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "Hospital IoT Backend",
        "version": "2.0.0",
        "timestamp": datetime.utcnow().isoformat(),
        "websocket_clients": len(ws_manager.active_connections),
    }


@app.get("/api/init_db")
def init_db_endpoint(reset: bool = False, db: Session = Depends(get_db)):
    """Database initialization / reset endpoint."""
    try:
        if reset:
            with engine.begin() as conn:
                Base.metadata.drop_all(conn)
            logger.info("All tables dropped (reset mode)")

        with engine.begin() as conn:
            Base.metadata.create_all(conn)
        logger.info("Database tables created/verified")

        result = db.execute(select(User).limit(1))
        if not result.scalar_one_or_none():
            admin = User(
                username="admin",
                password_hash=pwd_context.hash("admin123"),
                role="admin"
            )
            db.add(admin)
            db.commit()
            return {"status": "success", "message": "Database initialized. Admin: admin / admin123", "reset": reset}

        return {"status": "success", "message": "Database verified. Admin exists.", "reset": reset}
    except Exception as e:
        logger.error(f"Database init error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Database initialization failed: {str(e)}")


# ============================================
# ROUTE: Authentication
# ============================================
@app.post("/api/auth/login")
async def login(req: LoginRequest, db: Session = Depends(get_db)):
    result = db.execute(select(User).where(User.username == req.username))
    user = result.scalar_one_or_none()
    if not user or not pwd_context.verify(req.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_jwt_token(user.id, user.username, user.role)
    logger.info(f"User {req.username} logged in")
    return {"token": token, "username": user.username, "role": user.role}


@app.post("/api/auth/register")
async def register_user(req: LoginRequest, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")

    existing = db.execute(select(User).where(User.username == req.username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already exists")

    hashed = pwd_context.hash(req.password)
    user = User(username=req.username, password_hash=hashed, role="nurse")
    db.add(user)
    db.flush()
    db.add(AuditLog(user_id=int(auth["sub"]), action="user_registered", details=f"User {req.username} created"))
    return {"message": f"User {req.username} created", "user_id": user.id}


# ============================================
# ROUTE: Device Registration
# ============================================
@app.post("/api/device/register")
async def register_device(req: DeviceRegisterRequest, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    api_key = uuid.uuid4().hex + uuid.uuid4().hex[:32]  # 64 char key

    ward = req.ward
    bed_number = req.bed_number

    if not ward:
        all_devices = db.execute(select(Device))
        all_devs = all_devices.scalars().all()
        ward_counts = {}
        for d in all_devs:
            w = d.ward or 'Block A'
            ward_counts[w] = ward_counts.get(w, 0) + 1

        block_letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        assigned_ward = None
        for letter in block_letters:
            block_name = f'Block {letter}'
            count = ward_counts.get(block_name, 0)
            if count < 6:
                assigned_ward = block_name
                break
        ward = assigned_ward or 'Block A'

    if not bed_number:
        block_devices = db.execute(select(Device).where(Device.ward == ward))
        existing_beds = [d.bed_number for d in block_devices.scalars().all()]
        for num in range(1, 7):
            bn = f"{num:02d}"
            if bn not in existing_beds:
                bed_number = bn
                break
        if not bed_number:
            raise HTTPException(status_code=400, detail=f"{ward} is full (max 6 beds).")

    device_id = f"BED_{ward}_{bed_number}".upper().replace(" ", "_")

    existing = db.execute(select(Device).where(Device.device_id == device_id))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Device {device_id} already exists")

    device = Device(
        device_id=device_id, api_key=api_key, bed_number=bed_number,
        ward=ward, patient_name=req.patient_name, status="offline",
    )
    db.add(device)
    db.flush()

    # If patient name provided, also create patient record
    if req.patient_name:
        patient = Patient(name=req.patient_name, device_id=device_id, status="admitted")
        db.add(patient)

    db.add(AuditLog(user_id=int(auth["sub"]), action="device_registered", details=f"Device {device_id} in {ward}"))
    logger.info(f"Device registered: {device_id} in {ward}, bed {bed_number}")
    return {
        "device_id": device_id, "api_key": api_key, "bed_number": bed_number, "ward": ward,
        "message": f"Device registered in {ward}, Bed {bed_number}. Flash this API key to the ESP8266.",
    }


# ============================================
# ROUTE: Device Data Ingestion (from ESP8266)
# ============================================
@app.post("/api/device/data")
async def receive_device_data(req: DeviceDataRequest, db: Session = Depends(get_db), device: Device = Depends(verify_api_key)):
    if device.device_id != req.device_id:
        raise HTTPException(status_code=403, detail="API key does not match device_id")

    # Validate sensor readings — reject zeros (sensor failure)
    if req.heart_rate <= 0 or req.spo2 <= 0:
        # Create hardware failure alert instead of silently accepting bad data
        alert = Alert(
            device_id=req.device_id,
            alert_type="sensor_failure",
            severity="high",
            message=f"Sensor failure on {req.device_id}: HR={req.heart_rate}, SpO2={req.spo2}. Check wiring.",
        )
        db.add(alert)
        await ws_manager.broadcast({
            "type": "alert",
            "device_id": req.device_id,
            "alert_type": "sensor_failure",
            "severity": "high",
            "message": f"Sensor failure on {req.device_id}",
            "timestamp": datetime.utcnow().isoformat(),
        })
        return {"status": "error", "detail": "Invalid sensor readings. Alert created."}

    # Store sensor data
    sensor = SensorData(
        device_id=req.device_id, heart_rate=req.heart_rate,
        spo2=req.spo2, bed_status=req.bed_status,
    )
    db.add(sensor)

    # Update device status
    device.status = "online"
    device.last_seen = datetime.utcnow()

    # AI anomaly check
    ai_detector.add_reading(req.device_id, req.heart_rate, req.spo2)
    anomaly = ai_detector.detect_anomaly(req.device_id, req.heart_rate, req.spo2)

    if anomaly:
        alert = Alert(
            device_id=req.device_id, alert_type=anomaly["alert_type"],
            severity=anomaly["severity"], message=anomaly["message"],
        )
        db.add(alert)
        db.flush()

        await ws_manager.broadcast({
            "type": "alert",
            "device_id": req.device_id,
            "alert_type": anomaly["alert_type"],
            "severity": anomaly["severity"],
            "message": anomaly["message"],
            "timestamp": datetime.utcnow().isoformat(),
        })
        logger.warning(f"ALERT [{anomaly['severity']}] {req.device_id}: {anomaly['message']}")

    # Broadcast live data
    await ws_manager.broadcast({
        "type": "sensor_data",
        "device_id": req.device_id,
        "heart_rate": req.heart_rate,
        "spo2": req.spo2,
        "bed_status": req.bed_status,
        "timestamp": datetime.utcnow().isoformat(),
    })

    return {"status": "ok"}


# ============================================
# ROUTE: Heartbeat (from ESP8266)
# ============================================
@app.post("/api/device/heartbeat")
async def device_heartbeat(req: HeartbeatRequest, db: Session = Depends(get_db), device: Device = Depends(verify_api_key)):
    was_offline = device.status == "offline"
    device.status = "online"
    device.last_seen = datetime.utcnow()

    if was_offline:
        await ws_manager.broadcast({
            "type": "device_status",
            "device_id": device.device_id,
            "status": "online",
            "timestamp": datetime.utcnow().isoformat(),
        })
        logger.info(f"Device {device.device_id} came ONLINE")

    return {"status": "ok"}


# ============================================
# ROUTE: Dashboard — Device List
# ============================================
@app.get("/api/dashboard/devices")
async def get_devices(db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    result = db.execute(select(Device).order_by(Device.ward, Device.bed_number))
    devices = result.scalars().all()
    return [
        {
            "id": d.id, "device_id": d.device_id, "bed_number": d.bed_number,
            "ward": d.ward, "patient_name": d.patient_name, "status": d.status,
            "last_seen": d.last_seen.isoformat() if d.last_seen else None,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        }
        for d in devices
    ]


# ============================================
# ROUTE: Dashboard — Single Device Detail
# ============================================
@app.get("/api/dashboard/device/{device_id}")
async def get_device_detail(device_id: str, limit: int = Query(100, le=500), db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    result = db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    vitals_result = db.execute(
        select(SensorData).where(SensorData.device_id == device_id)
        .order_by(desc(SensorData.timestamp)).limit(limit)
    )
    vitals = vitals_result.scalars().all()

    alerts_result = db.execute(
        select(Alert).where(Alert.device_id == device_id)
        .order_by(desc(Alert.timestamp)).limit(20)
    )
    alerts = alerts_result.scalars().all()

    return {
        "device": {
            "id": device.id, "device_id": device.device_id, "bed_number": device.bed_number,
            "ward": device.ward, "patient_name": device.patient_name, "status": device.status,
            "last_seen": device.last_seen.isoformat() if device.last_seen else None,
        },
        "vitals": [
            {"heart_rate": v.heart_rate, "spo2": v.spo2, "bed_status": v.bed_status, "timestamp": v.timestamp.isoformat()}
            for v in reversed(vitals)
        ],
        "alerts": [
            {
                "id": a.id, "alert_type": a.alert_type, "severity": a.severity, "message": a.message,
                "escalation_status": a.escalation_status, "timestamp": a.timestamp.isoformat(),
            }
            for a in alerts
        ],
    }


# ============================================
# ROUTE: Dashboard — Stats Overview
# ============================================
@app.get("/api/dashboard/stats")
async def get_stats(db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    total = db.execute(select(func.count(Device.id))).scalar() or 0
    online = db.execute(select(func.count(Device.id)).where(Device.status == "online")).scalar() or 0

    occupied = 0
    if total > 0:
        device_ids = [d[0] for d in db.execute(select(Device.device_id)).all()]
        for did in device_ids:
            reading = db.execute(
                select(SensorData.bed_status).where(SensorData.device_id == did)
                .order_by(desc(SensorData.timestamp)).limit(1)
            ).scalar_one_or_none()
            if reading == 1:
                occupied += 1

    alert_count = db.execute(select(func.count(Alert.id)).where(Alert.escalation_status == "new")).scalar() or 0
    critical_count = db.execute(
        select(func.count(Alert.id)).where(Alert.escalation_status == "new", Alert.severity == "critical")
    ).scalar() or 0
    escalated_count = db.execute(
        select(func.count(Alert.id)).where(Alert.escalation_status == "escalated")
    ).scalar() or 0
    total_patients = db.execute(
        select(func.count(Patient.id)).where(Patient.status == "admitted")
    ).scalar() or 0

    return {
        "total_devices": total,
        "online_devices": online,
        "offline_devices": total - online,
        "occupied_beds": occupied,
        "occupancy_percent": round((occupied / total * 100), 1) if total > 0 else 0,
        "active_alerts": alert_count,
        "critical_alerts": critical_count,
        "escalated_alerts": escalated_count,
        "admitted_patients": total_patients,
    }


# ============================================
# ROUTE: Dashboard — Alerts
# ============================================
@app.get("/api/dashboard/alerts")
async def get_alerts(
    severity: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = Query(50, le=200),
    db: Session = Depends(get_db),
    auth: dict = Depends(verify_jwt),
):
    query = select(Alert).order_by(desc(Alert.timestamp)).limit(limit)
    if severity:
        query = query.where(Alert.severity == severity)
    if status:
        query = query.where(Alert.escalation_status == status)
    result = db.execute(query)
    alerts = result.scalars().all()
    return [
        {
            "id": a.id, "device_id": a.device_id, "alert_type": a.alert_type,
            "severity": a.severity, "message": a.message,
            "escalation_status": a.escalation_status, "timestamp": a.timestamp.isoformat(),
            "escalated_at": a.escalated_at.isoformat() if a.escalated_at else None,
            "acknowledged_by": a.acknowledged_by,
        }
        for a in alerts
    ]


# ============================================
# ROUTE: Acknowledge Alert
# ============================================
@app.put("/api/dashboard/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: int, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    result = db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.escalation_status = "acknowledged"
    alert.acknowledged_by = auth.get("username", "unknown")
    db.add(AuditLog(user_id=int(auth["sub"]), action="alert_acknowledged", details=f"Alert {alert_id} acknowledged"))
    return {"message": "Alert acknowledged"}


# ============================================
# ROUTE: Dashboard — Export CSV
# ============================================
@app.get("/api/dashboard/export/{device_id}")
async def export_vitals_csv(device_id: str, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    result = db.execute(
        select(SensorData).where(SensorData.device_id == device_id).order_by(SensorData.timestamp)
    )
    vitals = result.scalars().all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["timestamp", "heart_rate", "spo2", "bed_status"])
    for v in vitals:
        writer.writerow([v.timestamp.isoformat(), v.heart_rate, v.spo2, v.bed_status])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={device_id}_vitals.csv"},
    )


# ============================================
# ROUTE: Regenerate API Key
# ============================================
@app.post("/api/device/{device_id}/regenerate-key")
async def regenerate_api_key(device_id: str, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    result = db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    new_key = uuid.uuid4().hex + uuid.uuid4().hex[:32]
    device.api_key = new_key
    db.add(AuditLog(user_id=int(auth["sub"]), action="api_key_regenerated", details=f"Key regenerated for {device_id}"))
    return {"device_id": device_id, "new_api_key": new_key}


# ============================================
# ROUTE: Delete Device (cascades sensor_data & alerts)
# ============================================
@app.delete("/api/device/{device_id}")
async def delete_device(device_id: str, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    result = db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")

    # Also discharge any patient assigned to this device
    patients = db.execute(select(Patient).where(Patient.device_id == device_id, Patient.status == "admitted"))
    for p in patients.scalars().all():
        p.status = "discharged"
        p.discharge_date = datetime.utcnow()
        p.device_id = None

    db.delete(device)
    db.add(AuditLog(user_id=int(auth["sub"]), action="device_deleted", details=f"Device {device_id} deleted"))
    return {"message": f"Device {device_id} deleted"}


# ============================================
# ROUTE: Update Device (patient name)
# ============================================
@app.put("/api/device/{device_id}")
async def update_device(device_id: str, req: DeviceRegisterRequest, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    result = db.execute(select(Device).where(Device.device_id == device_id))
    device = result.scalar_one_or_none()
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    if req.patient_name is not None:
        device.patient_name = req.patient_name
    if req.ward is not None:
        device.ward = req.ward
    if req.bed_number is not None:
        device.bed_number = req.bed_number
    db.add(AuditLog(user_id=int(auth["sub"]), action="device_updated", details=f"Device {device_id} updated"))
    return {"message": f"Device {device_id} updated"}


# ============================================
# ROUTE: Patient Management
# ============================================
@app.get("/api/patients")
async def list_patients(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    auth: dict = Depends(verify_jwt),
):
    query = select(Patient).order_by(desc(Patient.admission_date))
    if status:
        query = query.where(Patient.status == status)
    result = db.execute(query)
    patients = result.scalars().all()
    return [
        {
            "id": p.id, "name": p.name, "age": p.age, "gender": p.gender,
            "condition": p.condition, "device_id": p.device_id,
            "admission_date": p.admission_date.isoformat() if p.admission_date else None,
            "discharge_date": p.discharge_date.isoformat() if p.discharge_date else None,
            "status": p.status, "notes": p.notes,
        }
        for p in patients
    ]


@app.post("/api/patients")
async def create_patient(req: PatientCreateRequest, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    patient = Patient(
        name=req.name, age=req.age, gender=req.gender,
        condition=req.condition, device_id=req.device_id, notes=req.notes,
        status="admitted",
    )
    db.add(patient)
    db.flush()

    # Update device's patient_name if device_id provided
    if req.device_id:
        dev = db.execute(select(Device).where(Device.device_id == req.device_id)).scalar_one_or_none()
        if dev:
            dev.patient_name = req.name

    db.add(AuditLog(user_id=int(auth["sub"]), action="patient_admitted", details=f"Patient {req.name} admitted"))
    return {"message": f"Patient {req.name} admitted", "patient_id": patient.id}


@app.get("/api/patients/{patient_id}")
async def get_patient(patient_id: int, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    result = db.execute(select(Patient).where(Patient.id == patient_id))
    p = result.scalar_one_or_none()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    return {
        "id": p.id, "name": p.name, "age": p.age, "gender": p.gender,
        "condition": p.condition, "device_id": p.device_id,
        "admission_date": p.admission_date.isoformat() if p.admission_date else None,
        "discharge_date": p.discharge_date.isoformat() if p.discharge_date else None,
        "status": p.status, "notes": p.notes,
    }


@app.put("/api/patients/{patient_id}")
async def update_patient(patient_id: int, req: PatientUpdateRequest, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    result = db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    if req.name is not None:
        patient.name = req.name
    if req.age is not None:
        patient.age = req.age
    if req.gender is not None:
        patient.gender = req.gender
    if req.condition is not None:
        patient.condition = req.condition
    if req.notes is not None:
        patient.notes = req.notes
    if req.device_id is not None:
        patient.device_id = req.device_id
        dev = db.execute(select(Device).where(Device.device_id == req.device_id)).scalar_one_or_none()
        if dev:
            dev.patient_name = patient.name
    if req.status is not None:
        patient.status = req.status
        if req.status == "discharged":
            patient.discharge_date = datetime.utcnow()
            if patient.device_id:
                dev = db.execute(select(Device).where(Device.device_id == patient.device_id)).scalar_one_or_none()
                if dev:
                    dev.patient_name = None
                patient.device_id = None

    db.add(AuditLog(user_id=int(auth["sub"]), action="patient_updated", details=f"Patient {patient_id} updated"))
    return {"message": f"Patient {patient_id} updated"}


@app.post("/api/patients/{patient_id}/discharge")
async def discharge_patient(patient_id: int, db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    result = db.execute(select(Patient).where(Patient.id == patient_id))
    patient = result.scalar_one_or_none()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    if patient.status == "discharged":
        raise HTTPException(status_code=400, detail="Patient already discharged")

    patient.status = "discharged"
    patient.discharge_date = datetime.utcnow()
    if patient.device_id:
        dev = db.execute(select(Device).where(Device.device_id == patient.device_id)).scalar_one_or_none()
        if dev:
            dev.patient_name = None
        patient.device_id = None

    db.add(AuditLog(user_id=int(auth["sub"]), action="patient_discharged", details=f"Patient {patient.name} discharged"))
    return {"message": f"Patient {patient.name} discharged"}


# ============================================
# ROUTE: Analytics Data
# ============================================
@app.get("/api/analytics/summary")
async def analytics_summary(db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    """Return aggregated analytics data for charts."""
    now = datetime.utcnow()
    last_24h = now - timedelta(hours=24)

    # Severity distribution
    severity_counts = {}
    for sev in ["critical", "high", "medium", "low"]:
        count = db.execute(
            select(func.count(Alert.id)).where(Alert.severity == sev, Alert.timestamp >= last_24h)
        ).scalar() or 0
        severity_counts[sev] = count

    # Hourly alert counts (last 24h)
    hourly = []
    for i in range(24):
        hour_start = now - timedelta(hours=24 - i)
        hour_end = now - timedelta(hours=23 - i)
        count = db.execute(
            select(func.count(Alert.id)).where(
                Alert.timestamp >= hour_start, Alert.timestamp < hour_end
            )
        ).scalar() or 0
        hourly.append({"hour": hour_start.strftime("%H:%M"), "count": count})

    # Alert type counts
    type_counts = {}
    for row in db.execute(
        select(Alert.alert_type, func.count(Alert.id))
        .where(Alert.timestamp >= last_24h)
        .group_by(Alert.alert_type)
    ).all():
        type_counts[row[0]] = row[1]

    # Device health summary
    total = db.execute(select(func.count(Device.id))).scalar() or 0
    online = db.execute(select(func.count(Device.id)).where(Device.status == "online")).scalar() or 0

    return {
        "severity_distribution": severity_counts,
        "hourly_alerts": hourly,
        "alert_types": type_counts,
        "device_health": {"total": total, "online": online, "offline": total - online},
    }


# ============================================
# ROUTE: Audit Log
# ============================================
@app.get("/api/audit-logs")
async def get_audit_logs(limit: int = Query(50, le=200), db: Session = Depends(get_db), auth: dict = Depends(verify_jwt)):
    if auth.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    result = db.execute(select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(limit))
    logs = result.scalars().all()
    return [
        {"id": l.id, "user_id": l.user_id, "action": l.action, "details": l.details,
         "timestamp": l.timestamp.isoformat() if l.timestamp else None}
        for l in logs
    ]


# ============================================
# WebSocket — Real-time Dashboard Feed
# ============================================
@app.websocket("/ws/live")
async def websocket_live(ws: WebSocket):
    await ws_manager.connect(ws)
    try:
        while True:
            data = await ws.receive_text()
            if data == "ping":
                await ws.send_json({"type": "pong"})
    except WebSocketDisconnect:
        ws_manager.disconnect(ws)
    except Exception:
        ws_manager.disconnect(ws)


# ============================================
# Run: uvicorn main:app --host 0.0.0.0 --port 8000 --reload
# ============================================
