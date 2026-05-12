-- init_db.sql — Smart Restaurant OS
-- Chạy tự động khi PostgreSQL container khởi tạo lần đầu
-- (mount vào /docker-entrypoint-initdb.d/)

-- Thiết lập audit log security (database.rule.md Section 7)
-- BR-007: audit_logs là INSERT-only, không được UPDATE hoặc DELETE

-- Lưu ý: Khi chạy lần đầu, bảng audit_logs chưa tồn tại
-- vì Alembic migration chạy sau. Script này chỉ thiết lập
-- các cấu hình ban đầu cho database.

-- Thiết lập timezone mặc định là UTC (skill.md BR-014)
ALTER DATABASE smart_restaurant SET timezone TO 'UTC';
