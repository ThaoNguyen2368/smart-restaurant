"""Seed script: Tạo dữ liệu mẫu cho testing."""
import sys
sys.path.insert(0, ".")

from app.core.database import SessionLocal
from app.core.security import get_password_hash
from app.models.staff_user import StaffUser
from app.models.category import Category
from app.models.menu_item import MenuItem
from app.models.table import Table
from app.models.tax_config import TaxConfig
from datetime import date

# pyrefly: ignore [missing-import]
from sqlalchemy import text

db = SessionLocal()

try:
    # 1. Xoá dữ liệu cũ (nếu có) bằng TRUNCATE CASCADE để tránh lỗi khoá ngoại
    db.execute(text("TRUNCATE TABLE audit_logs, payments, order_details, orders, sessions, tax_config, tables, menu_items, categories, staff_users RESTART IDENTITY CASCADE;"))
    db.commit()

    # 2. Tạo Staff Users
    users = [
        StaffUser(username="admin", password_hash=get_password_hash("admin123"), role="admin", display_name="Admin"),
        StaffUser(username="staff1", password_hash=get_password_hash("staff123"), role="staff", display_name="Nhân viên 1"),
        StaffUser(username="cashier1", password_hash=get_password_hash("cashier123"), role="cashier", display_name="Thu ngân 1"),
        StaffUser(username="kitchen1", password_hash=get_password_hash("kitchen123"), role="kitchen", display_name="Bếp trưởng"),
        StaffUser(username="manager1", password_hash=get_password_hash("manager123"), role="manager", display_name="Quản lý"),
    ]
    db.add_all(users)
    db.flush()

    # 3. Tạo Categories
    cats = [
        Category(name="Khai vị", display_order=1),
        Category(name="Món chính", display_order=2),
        Category(name="Đồ uống", display_order=3),
        Category(name="Tráng miệng", display_order=4),
    ]
    db.add_all(cats)
    db.flush()

    # 4. Tạo Menu Items
    items = [
        MenuItem(
            category_id=cats[0].id, 
            name="Gỏi cuốn", 
            price=45000, 
            display_order=1, 
            description="Gỏi cuốn tôm thịt", 
            image_url="/images/goi_cuon_tom_thit.jpg"
        ),
        MenuItem(
            category_id=cats[0].id, 
            name="Chả giò", 
            price=45000, 
            display_order=2, 
            description="Chả giò giòn rụm", 
            image_url="/images/cha_gio.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Phở bò", 
            price=65000, 
            display_order=1, 
            description="Phở bò tái nạm", 
            image_url="/images/pho_bo.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cơm tấm sườn", 
            price=55000, 
            display_order=2, 
            description="Cơm tấm sườn bì chả", 
            image_url="/images/com_tam_suon_bi_cha.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Bún chả", 
            price=55000, 
            display_order=3, 
            description="Bún chả Hà Nội", 
            image_url="/images/bun_cha.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Bạc xỉu", 
            price=30000, 
            display_order=1, 
            description="Bạc xỉu thơm béo", 
            image_url="/images/bac_xiu.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Cà phê sữa đá", 
            price=25000, 
            display_order=2, 
            description="Cà phê sữa đá truyền thống", 
            image_url="/images/ca_phe_sua.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Chè ba màu", 
            price=20000, 
            display_order=1, 
            description="Chè ba màu truyền thống", 
            image_url="/images/che_ba_mau.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Bánh flant", 
            price=20000, 
            display_order=2, 
            description="Bánh flant truyền thống", 
            image_url="/images/banh_flant.jpg"
        )
    ]
    db.add_all(items)

    # 5. Tạo Tables
    tables = [
        Table(table_number=i, qr_code_url=f"https://sr-os.local/qr/{i}", floor="Tầng 1")
        for i in range(1, 11)
    ]
    db.add_all(tables)

    # 6. Tạo Tax Config (VAT 8%, Service 5%)
    admin_user = db.query(StaffUser).filter(StaffUser.username == "admin").first()
    tax = TaxConfig(vat_rate=0.08, service_charge_rate=0.05, effective_from=date(2025, 1, 1), created_by=admin_user.id)
    db.add(tax)

    db.commit()
    print("✅ Seed data created successfully!")
    print(f"   - {len(users)} staff users")
    print(f"   - {len(cats)} categories")
    print(f"   - {len(items)} menu items")
    print(f"   - {len(tables)} tables")
    print(f"   - 1 tax config (VAT 8%, Service 5%)")

except Exception as e:
    db.rollback()
    print(f"❌ Error: {e}")
    raise
finally:
    db.close()