from sqlalchemy import Column, Integer, BigInteger, String, Float, Text, DateTime, SmallInteger, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from database import Base


# ============================================
# 1. Device — Each ESP8266 unit
# ============================================
class Device(Base):
    __tablename__ = "devices"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(50), unique=True, nullable=False, index=True)
    api_key = Column(String(64), unique=True, nullable=False, index=True)
    bed_number = Column(String(20))
    ward = Column(String(50))
    patient_name = Column(String(100))
    status = Column(String(10), default="offline")
    last_seen = Column(DateTime)
    created_at = Column(DateTime, server_default=func.now())

    # Relationships
    sensor_data = relationship("SensorData", backref="device", cascade="all, delete-orphan",
                               foreign_keys="SensorData.device_id",
                               primaryjoin="Device.device_id == SensorData.device_id")
    alerts = relationship("Alert", backref="device", cascade="all, delete-orphan",
                          foreign_keys="Alert.device_id",
                          primaryjoin="Device.device_id == Alert.device_id")


# ============================================
# 2. SensorData — Vitals readings (high frequency)
# ============================================
class SensorData(Base):
    __tablename__ = "sensor_data"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    device_id = Column(String(50), ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False, index=True)
    heart_rate = Column(Float)
    spo2 = Column(Float)
    bed_status = Column(SmallInteger, default=0)  # 0=empty, 1=occupied
    timestamp = Column(DateTime, server_default=func.now(), index=True)


# ============================================
# 3. Alert — AI-generated & system alerts
# ============================================
class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(50), ForeignKey("devices.device_id", ondelete="CASCADE"), nullable=False, index=True)
    alert_type = Column(String(50))
    severity = Column(String(10), default="medium")
    message = Column(Text)
    escalation_status = Column(String(15), default="new")        # new -> acknowledged -> escalated
    escalated_at = Column(DateTime, nullable=True)                # When auto-escalated
    acknowledged_by = Column(String(50), nullable=True)           # Who acknowledged
    timestamp = Column(DateTime, server_default=func.now(), index=True)


# ============================================
# 4. Patient — Patient registry
# ============================================
class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    age = Column(Integer, nullable=True)
    gender = Column(String(10), nullable=True)
    condition = Column(String(200), nullable=True)
    device_id = Column(String(50), nullable=True, index=True)
    admission_date = Column(DateTime, server_default=func.now())
    discharge_date = Column(DateTime, nullable=True)
    status = Column(String(20), default="admitted")   # admitted, discharged
    notes = Column(Text, nullable=True)


# ============================================
# 5. User — Dashboard authentication
# ============================================
class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String(50), unique=True, nullable=False)
    password_hash = Column(String(256), nullable=False)
    role = Column(String(10), default="nurse")
    created_at = Column(DateTime, server_default=func.now())


# ============================================
# 6. AuditLog — Activity tracking
# ============================================
class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer)
    action = Column(String(100))
    details = Column(Text)
    timestamp = Column(DateTime, server_default=func.now())
