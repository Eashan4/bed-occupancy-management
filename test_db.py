import sys
import logging
sys.path.append('./backend')
from backend.database import SessionLocal, engine
from backend.models import User
from sqlalchemy import select
from passlib.context import CryptContext

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
try:
    with SessionLocal() as session:
        user = session.execute(select(User).where(User.username == "admin")).scalar_one_or_none()
        if user:
            print(f"Found user: {user.username}")
            user.password_hash = pwd_context.hash("admin123")
            session.commit()
            print("Password updated to admin123")
        else:
            print("Admin user not found, creating...")
            admin = User(
                username="admin",
                password_hash=pwd_context.hash("admin123"),
                role="admin",
            )
            session.add(admin)
            session.commit()
            print("Admin user created")
except Exception as e:
    print(f"DB Error: {str(e)}")
