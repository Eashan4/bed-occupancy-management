import os
from dotenv import load_dotenv

load_dotenv()

# ============================================
# Database Configuration
# ============================================
DB_USER = os.getenv("DB_USER", "ej")
DB_PASS = os.getenv("DB_PASS", "ej")
DB_HOST = os.getenv("DB_HOST", "127.0.0.1")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_NAME = os.getenv("DB_NAME", "hospital_iot")

# ============================================
# JWT Authentication
# ============================================
JWT_SECRET = os.getenv("JWT_SECRET", "change-this-in-production")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRY_HOURS = int(os.getenv("JWT_EXPIRY_HOURS", "24"))

# ============================================
# Device Timing (seconds)
# ============================================
HEARTBEAT_TIMEOUT = int(os.getenv("HEARTBEAT_TIMEOUT", "20"))
OFFLINE_CHECK_INTERVAL = int(os.getenv("OFFLINE_CHECK_INTERVAL", "10"))

# ============================================
# Alert Escalation
# ============================================
ESCALATION_TIMEOUT = int(os.getenv("ESCALATION_TIMEOUT", "300"))  # 5 minutes

# ============================================
# AI Alert Thresholds
# ============================================
HEART_RATE_LOW = int(os.getenv("HEART_RATE_LOW", "50"))
HEART_RATE_HIGH = int(os.getenv("HEART_RATE_HIGH", "120"))
SPO2_CRITICAL = int(os.getenv("SPO2_CRITICAL", "90"))
SPO2_WARNING = int(os.getenv("SPO2_WARNING", "94"))
ANOMALY_THRESHOLD = float(os.getenv("ANOMALY_THRESHOLD", "0.85"))
PREDICTION_WINDOW = int(os.getenv("PREDICTION_WINDOW", "20"))
