"""
Hospital IoT — Database Migration & Admin Seeding Script
Run: python3 migrate.py [--reset]
"""

import sys
import os

# Ensure backend directory is in path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine, Base, SessionLocal
from models import Device, SensorData, Alert, Patient, User, AuditLog
from passlib.context import CryptContext
from sqlalchemy import select, text

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def migrate(reset=False):
    print("=" * 50)
    print("Hospital IoT — Database Migration")
    print("=" * 50)

    if reset:
        print("\n⚠️  RESET MODE: Dropping all tables...")
        with engine.begin() as conn:
            Base.metadata.drop_all(conn)
        print("✅ All tables dropped")

    print("\n📦 Creating tables...")
    with engine.begin() as conn:
        Base.metadata.create_all(conn)

    tables = ["devices", "sensor_data", "alerts", "patients", "users", "audit_logs"]
    print(f"✅ {len(tables)} tables created/verified:")
    for t in tables:
        print(f"   • {t}")

    # Seed admin user
    print("\n👤 Checking admin user...")
    with SessionLocal() as session:
        result = session.execute(select(User).where(User.username == "admin"))
        admin = result.scalar_one_or_none()

        if admin:
            print("   Admin user already exists")
        else:
            admin = User(
                username="admin",
                password_hash=pwd_context.hash("admin123"),
                role="admin",
            )
            session.add(admin)
            session.commit()
            print("   ✅ Admin user created (admin / admin123)")

    print("\n" + "=" * 50)
    print("Migration complete!")
    print("Run: cd backend && uvicorn main:app --host 0.0.0.0 --port 8000 --reload")
    print("Dashboard: http://localhost:8000/dashboard/")
    print("=" * 50)


if __name__ == "__main__":
    reset_flag = "--reset" in sys.argv
    migrate(reset=reset_flag)
