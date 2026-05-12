# Smart Restaurant OS Docker Handoff

This package is prepared for a local team handoff using Docker Compose.

## Services

| Service | URL |
|---|---|
| Backend API | http://localhost:8000 |
| Customer Web | http://localhost:3001 |
| Staff Web | http://localhost:3002 |
| Cashier Web | http://localhost:3003 |
| Kitchen Web | http://localhost:3004 |
| Admin Portal | http://localhost:3005 |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

`kitchen-web` is the active kitchen/KDS implementation in this codebase. The `packages/kds` folder is still the default scaffold and is not wired as a separate runtime service.

## First Run

1. Copy the environment template:

```powershell
Copy-Item .env.example .env
```

2. Edit `.env` and replace `JWT_SECRET`, `JWT_REFRESH_SECRET`, and `DB_PASSWORD` before sharing outside local development.

3. Build and start all services:

```powershell
docker compose up --build -d
```

4. Check health:

```powershell
docker compose ps
Invoke-WebRequest http://localhost:8000/health
```

5. Seed local demo data when the database is empty:

```powershell
docker compose --profile tools run --rm seed
```

## Demo Accounts

After seeding:

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `admin123` |
| Staff | `staff1` | `staff123` |
| Cashier | `cashier1` | `cashier123` |
| Kitchen | `kitchen1` | `kitchen123` |
| Manager | `manager1` | `manager123` |

## Useful Commands

```powershell
docker compose logs -f backend
docker compose down
docker compose down -v
docker compose build --no-cache
```

Use `docker compose down -v` only when you want to delete the local PostgreSQL volume.

## Deployment Notes

- PostgreSQL 15+ is required. Do not switch to SQLite for shared environments.
- Frontends are separate containers and ports by role, matching the DevOps rule.
- `PUBLIC_API_URL` is baked into frontend builds. For staging/production, set it to the public HTTPS API URL before `docker compose build`.
- Do not ship `.env` with real secrets. Share `.env.example` and pass secrets via the target environment or a secrets manager.
- Run Alembic migrations before app startup. The backend container does this automatically.
