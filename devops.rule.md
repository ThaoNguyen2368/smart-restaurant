# devops.rule.md — Smart Restaurant OS
# DevOps & Infrastructure Rules

> **Stack:** Docker · Docker Compose · PostgreSQL 15+ · Redis · FastAPI · React  
> **Read after:** `skill.md` → `domain.rule.md` → this file  
> **Applies to:** All infrastructure, CI/CD, deployment, monitoring configuration

---

## 1. Environment Structure

### 1.1 Environments

| Environment | Purpose | DB | Notes |
|---|---|---|---|
| `local` | Developer workstation | PostgreSQL (Docker) | Full stack via Docker Compose |
| `ci` | GitHub Actions / CI pipeline | PostgreSQL (Docker service) | Run tests, lint, build |
| `staging` | Pre-production validation | PostgreSQL (dedicated) | Mirror of production config |
| `production` | Live restaurant operations | PostgreSQL (managed/dedicated) | No debug endpoints |

> **Rule:** All environments use PostgreSQL 15+. SQLite is forbidden in any shared environment.

### 1.2 Environment-Specific Configuration

| Config Item | local | ci | staging | production |
|---|---|---|---|---|
| `DEBUG` mode | TRUE | FALSE | FALSE | FALSE |
| `HTTPS` enforcement | Optional | N/A | MANDATORY | MANDATORY |
| `CORS` origins | localhost:3000 | CI domain | Staging domain | Production domain only |
| Rate limiting | Relaxed | Standard | Standard | Standard |
| Log level | DEBUG | INFO | INFO | WARNING |
| Auto-confirm | Configurable | FALSE | FALSE | Admin-controlled |

---

## 2. Docker Compose Structure

```yaml
# docker-compose.yml (local dev)
version: "3.9"
services:
  backend:
    build: ./backend
    environment:
      - DATABASE_URL=postgresql://app_user:${DB_PASSWORD}@db:5432/smart_restaurant
      - REDIS_URL=redis://redis:6379/0
      - JWT_SECRET=${JWT_SECRET}
      - ENVIRONMENT=local
    depends_on:
      - db
      - redis
    ports:
      - "8000:8000"

  db:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: smart_restaurant
      POSTGRES_USER: app_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/init_db.sql:/docker-entrypoint-initdb.d/init.sql

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  customer-web:
    build: ./frontend/packages/customer-web
    ports:
      - "3001:80"

  staff-web:
    build: ./frontend/packages/staff-web
    ports:
      - "3002:80"

  cashier-web:
    build: ./frontend/packages/cashier-web
    ports:
      - "3003:80"

  kds:
    build: ./frontend/packages/kds
    ports:
      - "3004:80"

  admin-portal:
    build: ./frontend/packages/admin-portal
    ports:
      - "3005:80"

volumes:
  postgres_data:
```

> **Rule:** Each frontend module is a separate Docker service on a separate port. Never serve all frontends from one container — they serve different roles and devices.

---

## 3. Environment Variables & Secrets

### 3.1 Required Variables

```bash
# Backend — MUST be set in all environments
DATABASE_URL=postgresql://app_user:<password>@<host>:5432/smart_restaurant
REDIS_URL=redis://<host>:6379/0
JWT_SECRET=<256-bit random string>
JWT_REFRESH_SECRET=<256-bit random string, different from JWT_SECRET>
ENVIRONMENT=production|staging|ci|local
CORS_ORIGINS=https://your-domain.com,https://cashier.your-domain.com
```

### 3.2 Secrets Management Rules

- **Never hardcode secrets in code or Dockerfiles.**
- **Never commit `.env` files.** Only commit `.env.example` with placeholder values.
- Production secrets: use a secrets manager (HashiCorp Vault, AWS Secrets Manager, or equivalent).
- JWT_SECRET must be regenerated if any staff member leaves or is deactivated — this forces all active sessions to expire.
- DB password rotation: perform during maintenance window; update all service configs atomically.

### 3.3 Forbidden

```bash
# ❌ NEVER do any of these
JWT_SECRET=mysecret
DB_PASSWORD=password123
CORS_ORIGINS=*
DEBUG=True  # in production
```

---

## 4. HTTPS Enforcement

- **All traffic must be HTTPS in staging and production.** No HTTP in any client-facing route.
- WebSocket connections must use `wss://` (not `ws://`).
- Implement HTTPS at the reverse proxy level (Nginx / Caddy / Traefik).
- Use Let's Encrypt for certificate management in self-hosted scenarios.
- HSTS header: `Strict-Transport-Security: max-age=31536000; includeSubDomains`

```nginx
# Nginx — force HTTPS
server {
    listen 80;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    ssl_certificate /etc/ssl/certs/sr-os.crt;
    ssl_certificate_key /etc/ssl/private/sr-os.key;
    
    # WebSocket proxy
    location /ws/ {
        proxy_pass http://backend:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
    
    location /api/ {
        proxy_pass http://backend:8000;
    }
}
```

---

## 5. CI/CD Pipeline

### 5.1 Pipeline Stages (Required)

```yaml
# .github/workflows/ci.yml
stages:
  - lint          # ruff (Python), ESLint (TypeScript)
  - type-check    # mypy (Python), tsc (TypeScript)
  - test-unit     # pytest unit tests (SQLite OK here)
  - test-integration  # pytest with PostgreSQL Docker service
  - build         # Docker image build
  - security-scan # Trivy or Snyk
  - deploy-staging    # On main branch merge
  - deploy-prod       # On tagged release only (manual approval gate)
```

### 5.2 Required Checks Before Merge

- [ ] All lint checks pass (ruff, ESLint)
- [ ] All type checks pass (mypy strict, tsc noImplicitAny)
- [ ] All unit tests pass
- [ ] All integration tests pass (PostgreSQL)
- [ ] All business rule tests pass (`@pytest.mark.regression`)
- [ ] No new secrets detected in code (secret scanner)
- [ ] Docker build succeeds

### 5.3 Deployment Gate

- `staging` deploys automatically on merge to `main`.
- `production` deploys only on tagged releases (`v*.*.*`) with explicit manual approval.
- No hotfixes directly to production without CI passing.

---

## 6. Database Migrations in Deployment

```bash
# Alembic migration — run BEFORE deploying new application code
alembic upgrade head

# Deployment order:
# 1. Run DB migrations
# 2. Deploy new backend containers
# 3. Deploy new frontend containers (after backend health check passes)
```

**Rules:**
- Migrations run before app deployment, not after.
- Every deployment must be tested against staging DB first.
- Dangerous migrations (DROP COLUMN, ALTER TYPE) require manual DBA sign-off.
- Rollback plan: every migration must have a valid `downgrade()` function tested.

---

## 7. Monitoring & Alerting

### 7.1 Required Metrics

| Metric | Threshold Alert |
|---|---|
| API p95 response time | > 300ms → warning; > 1000ms → critical |
| WebSocket error rate | > 5% → warning |
| DB query time (hot path) | > 50ms → warning |
| Failed login attempts | > 10/min from same IP → alert |
| Audit log write failures | ANY → critical (stops financial compliance) |
| PostgreSQL connection pool exhaustion | > 80% used → warning |
| Redis memory usage | > 80% → warning |

### 7.2 Required Logs

All log entries must include:
- `timestamp` (ISO 8601 UTC)
- `request_id` (trace ID for correlation)
- `user_id` or `session_id`
- `action` performed
- `status_code` or `result`

**NEVER log:**
- JWT tokens or refresh tokens
- Passwords or password hashes
- Customer personal data (if any is added in future)
- Full payment transaction references

### 7.3 Health Check Endpoints

```
GET /health          → {"status": "ok", "db": "ok", "redis": "ok"}
GET /health/ready    → 200 if migrations are applied and DB is reachable
```

---

## 8. Rollback Strategy

### 8.1 Application Rollback

- Docker image tags: use git SHA, not `latest`.
- Keep previous 3 image versions available for rollback.
- Rollback: `docker compose up -d --image <previous_tag>`.

### 8.2 Database Rollback

- Run `alembic downgrade -1` before rolling back application.
- If the migration includes data changes (not just schema), a data snapshot is required before running the migration in production.
- Cannot roll back after: dropping a column (data is gone), or after significant data is written in the new schema.

---

## 9. Restaurant Operating Hours Consideration

- Maintenance windows: schedule outside operating hours (e.g., 03:00–05:00 local time).
- Uptime SLA: 99.5% during restaurant operating hours (typically 10:00–22:00).
- Deploy during maintenance windows when possible.
- If emergency deploy is needed during service hours: zero-downtime deployment required (rolling update with health checks).

---

## 10. Security Hardening Checklist

- [ ] PostgreSQL: `app_user` has no SUPERUSER privileges
- [ ] PostgreSQL: `app_user` has REVOKE UPDATE, DELETE on `audit_logs`
- [ ] Redis: password authentication enabled
- [ ] Docker: containers run as non-root user
- [ ] Nginx: server tokens disabled (`server_tokens off`)
- [ ] All images: based on alpine (minimal attack surface)
- [ ] Dependency scanning: run on every CI build

---

## 11. Agent Behavior Guidance

### For GitHub Copilot
- Do not accept Docker Compose suggestions that expose PostgreSQL port 5432 publicly in staging/production.
- Validate that generated environment variable files do not contain real secrets.

### For Cursor
- When editing `docker-compose.yml`, do not merge frontend services into a single container.
- Do not add out-of-scope service containers (e.g., a delivery tracking service).

### For Claude Code / Continue
- Generate `docker-compose.yml` with all 7 services (backend, db, redis, 4 frontends + admin).
- Generated health check endpoints must verify both DB and Redis connectivity.

### For Antigravity / OpenHands
- CI pipeline must include the PostgreSQL Docker service for integration tests — not SQLite.
- Deployment stages must maintain the migration-first order (Section 6).

### For Windsurf / Roo Code
- Generated Nginx configs must include WebSocket proxy headers.
- All generated secrets must be placeholder values only — never real credentials in generated files.
