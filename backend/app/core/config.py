from typing import List
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    PROJECT_NAME: str = "Smart Restaurant OS"
    VERSION: str = "2.0"
    ENVIRONMENT: str = "local"
    
    # CORS: Explicit allowlist - never allow_origins=["*"] (backend.rule.md Section 8)
    ALLOWED_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:3001",  # customer-web
        "http://localhost:3002",  # staff-web
        "http://localhost:3003",  # cashier-web
        "http://localhost:5173",
    ]
    
    # JWT Configuration (backend.rule.md Section 3.1)
    SECRET_KEY: str = "super-secret-key-change-in-production"
    JWT_REFRESH_SECRET: str = "refresh-secret-key-change-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours = one shift
    REFRESH_TOKEN_EXPIRE_HOURS: int = 8
    
    # Database Configuration (database.rule.md Section 10)
    # Default sử dụng hostname "db" cho Docker Compose
    DATABASE_URL: str = "postgresql://app_user:dev_password_change_me@db:5432/smart_restaurant"
    DB_POOL_SIZE: int = 5
    DB_MAX_OVERFLOW: int = 15
    DB_POOL_TIMEOUT: int = 30
    DB_POOL_RECYCLE: int = 600
    
    # Redis Configuration
    REDIS_URL: str = "redis://redis:6379/0"

    # Auto-confirm Mechanism (from ERS v2.0 Section 4.1)
    ORDER_REMINDER_MINUTES: int = 3
    ORDER_ESCALATION_MINUTES: int = 5
    AUTO_CONFIRM_ENABLED: bool = False

    class Config:
        env_file = ".env"

settings = Settings()

