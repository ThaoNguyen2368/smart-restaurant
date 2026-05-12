FROM python:3.11-slim

# Không chạy container với quyền root (devops.rule.md Section 10)
RUN groupadd -r appuser && useradd -r -g appuser appuser

WORKDIR /app

# Cài dependencies trước để tận dụng Docker layer cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

# Đổi ownership cho non-root user
RUN chown -R appuser:appuser /app
USER appuser

# Expose port
EXPOSE 8000

# Chạy Alembic migration trước, sau đó khởi động uvicorn
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port 8000"]
