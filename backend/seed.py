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
            category_id=cats[0].id, 
            name="Bánh bao chiên", 
            price=45000, 
            display_order=3, 
            description="Bánh bao chiên nóng hổi", 
            image_url="/images/banh_bao_chien.jpg"
        ),
        MenuItem(
            category_id=cats[0].id, 
            name="Bánh mì bơ tỏi", 
            price=35000, 
            display_order=4, 
            description="Bánh mì bơ tỏi nóng giòn", 
            image_url="/images/banh_mi_bo_toi.jpg"
        ),
        MenuItem(
            category_id=cats[0].id, 
            name="Khoai lang chiên", 
            price=30000, 
            display_order=5, 
            description="Khoai lang chiên giòn rụm", 
            image_url="/images/khoai_lang_chien.jpg"
        ),
        MenuItem(
            category_id=cats[0].id, 
            name="Khoai tây chiên", 
            price=30000, 
            display_order=6, 
            description="Khoai tây chiên giòn rụm", 
            image_url="/images/khoai_tay_chien.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Phở bò", 
            price=60000, 
            display_order=1, 
            description="Phở bò tái nạm", 
            image_url="/images/pho_bo.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cơm tấm sườn", 
            price=50000, 
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
            category_id=cats[1].id, 
            name="Bánh xèo", 
            price=55000, 
            display_order=4, 
            description="Bánh xèo miền Tây", 
            image_url="/images/banh_xeo.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Bún bò Huế", 
            price=55000, 
            display_order=5, 
            description="Bún bò Huế", 
            image_url="/images/bun_bo_hue.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Bánh canh cua", 
            price=55000, 
            display_order=6, 
            description="Bánh canh cua", 
            image_url="/images/banh_canh_cua.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cơm chiên dương châu", 
            price=55000, 
            display_order=7, 
            description="Cơm chiên dương châu", 
            image_url="/images/com_chien_duong_chau.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cơm chiên hải sản", 
            price=60000, 
            display_order=8, 
            description="Cơm chiên hải sản", 
            image_url="/images/com_chien_hai_san.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cơm gà xối mỡ", 
            price=55000, 
            display_order=9, 
            description="Cơm gà xối mỡ", 
            image_url="/images/com_ga_xoi_mo.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cơm niêu cá kho tộ", 
            price=70000, 
            display_order=10, 
            description="Cơm niêu cá kho tộ", 
            image_url="/images/com_nieu_ca_kho_to.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Bò kho bánh mì", 
            price=65000, 
            display_order=11, 
            description="Bò kho bánh mì", 
            image_url="/images/bo_kho_banh_mi.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Bò lúc lắc", 
            price=65000, 
            display_order=12, 
            description="Bò lúc lắc", 
            image_url="/images/bo_luc_lac.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Bò né", 
            price=65000, 
            display_order=13, 
            description="Bò né", 
            image_url="/images/bo_ne.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cá hồi nướng", 
            price=65000, 
            display_order=14, 
            description="Cá hồi nướng", 
            image_url="/images/ca_hoi_nuong.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cá hồi nướng sốt chanh dây", 
            price=70000, 
            display_order=15, 
            description="Cá hồi nướng sốt chanh dây", 
            image_url="/images/ca_hoi_nuong_sot_chanh_day.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cà ri gà", 
            price=65000, 
            display_order=16, 
            description="Cà ri gà", 
            image_url="/images/ca_ri_ga.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Mì ý sốt cà chua", 
            price=55000, 
            display_order=17, 
            description="Mì ý sốt cà chua", 
            image_url="/images/mi_y_sot_ca_chua.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Mì ý sốt kem", 
            price=60000, 
            display_order=18, 
            description="Mì ý sốt kem", 
            image_url="/images/mi_y_sot_kem.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Gà chiên nước mắm", 
            price=70000, 
            display_order=19, 
            description="Gà chiên nước mắm", 
            image_url="/images/ga_chien_nuoc_mam.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Gà nướng muối ớt", 
            price=90000, 
            display_order=20, 
            description="Gà nướng muối ớt", 
            image_url="/images/ga_nuong_muoi_ot.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Bạch tuộc nướng", 
            price=70000, 
            display_order=21, 
            description="Bạch tuộc nướng ớt", 
            image_url="/images/bach_tuoc_nuong.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Mực nướng sa tế", 
            price=70000, 
            display_order=22, 
            description="Mực nướng sa tế", 
            image_url="/images/muc_nuong_sa_te.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Hàu nướng phô mai", 
            price=55000, 
            display_order=24, 
            description="Hàu nướng phô mai", 
            image_url="/images/hau_nuong_pho_mai.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Đậu hũ chiên sả ớt", 
            price=35000, 
            display_order=23, 
            description="Đậu hũ chiên sả ớt", 
            image_url="/images/dau_hu_chien_sa_ot.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Gỏi tai heo", 
            price=45000, 
            display_order=25, 
            description="Gỏi tai heo", 
            image_url="/images/goi_tai_heo.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Salad trộn", 
            price=50000, 
            display_order=26, 
            description="Salad trộn", 
            image_url="/images/salad_tron.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Rau muống xào tỏi", 
            price=30000, 
            display_order=27, 
            description="Rau muống xào tỏi", 
            image_url="/images/rau_muong_xao_toi.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cải thìa xào dầu hào", 
            price=30000, 
            display_order=28, 
            description="Cải thìa xào dầu hào", 
            image_url="/images/cai_thia_xao_dau_hao.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cá diêu hồng chiên xù", 
            price=150000, 
            display_order=29, 
            description="Cá diêu hồng chiên xù", 
            image_url="/images/ca_dieu_hong_chien_xu.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Cải thìa xào dầu hào", 
            price=30000, 
            display_order=28, 
            description="Cải thìa xào dầu hào", 
            image_url="/images/cai_thia_xao_dau_hao.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Canh chua cá", 
            price=45000, 
            display_order=30, 
            description="Canh chua cá", 
            image_url="/images/canh_chua_ca.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Canh rong biển", 
            price=30000, 
            display_order=31, 
            description="Canh rong biển", 
            image_url="/images/canh_rong_bien.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Lẩu Thái", 
            price=150000, 
            display_order=32, 
            description="Lẩu Thái", 
            image_url="/images/lau_thai.jpg"
        ),
        MenuItem(
            category_id=cats[1].id, 
            name="Lẩu gà lá é", 
            price=180000, 
            display_order=33, 
            description="Lẩu gà lá é", 
            image_url="/images/lau_ga_la_e.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Cà phê đen đá", 
            price=22000, 
            display_order=1, 
            description="Cà phê đen đá truyền thống", 
            image_url="/images/ca_phe_den_da.jpg"
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
            category_id=cats[2].id, 
            name="Bạc xỉu", 
            price=30000, 
            display_order=3, 
            description="Bạc xỉu thơm béo", 
            image_url="/images/bac_xiu.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Cà phê muối", 
            price=30000, 
            display_order=4, 
            description="Cà phê muối thơm béo", 
            image_url="/images/ca_phe_muoi.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Latte", 
            price=30000, 
            display_order=5, 
            description="Latte thơm béo", 
            image_url="/images/latte.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Trà sữa trân trâu", 
            price=30000, 
            display_order=6, 
            description="Trà sữa trân trâu thơm ngon", 
            image_url="/images/tra_sua_tran_chau.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Trà sữa socola", 
            price=35000, 
            display_order=7, 
            description="Trà sữa socola thơm ngon", 
            image_url="/images/tra_sua_socola.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Trà sữa matcha", 
            price=35000, 
            display_order=8, 
            description="Trà sữa matcha thơm ngon", 
            image_url="/images/tra_sua_matcha.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Nước ép cà rốt", 
            price=25000, 
            display_order=9, 
            description="Nước ép cà rốt thơm ngon", 
            image_url="/images/nuoc_ep_ca_rot.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Nước ép dứa", 
            price=25000, 
            display_order=10, 
            description="Nước ép dứa thơm ngon", 
            image_url="/images/nuoc_ep_dua.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Nước ép ổi", 
            price=25000, 
            display_order=11, 
            description="Nước ép ổi thơm ngon", 
            image_url="/images/nuoc_ep_oi.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Trà chanh", 
            price=25000, 
            display_order=12, 
            description="Trà chanh thơm ngon", 
            image_url="/images/tra_chanh.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Trà đào", 
            price=25000, 
            display_order=13, 
            description="Trà đào thơm ngon", 
            image_url="/images/tra_dao.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Trà tắc", 
            price=25000, 
            display_order=14, 
            description="Trà tắc", 
            image_url="/images/tra_tac.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Soda chanh", 
            price=25000, 
            display_order=15, 
            description="Soda chanh", 
            image_url="/images/soda_chanh.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Soda việt quất", 
            price=25000, 
            display_order=16, 
            description="Soda việt quất", 
            image_url="/images/soda_viet_quat.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Coca Cola", 
            price=15000, 
            display_order=17, 
            description="Coca Cola", 
            image_url="/images/coca_cola.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Pepsi", 
            price=15000, 
            display_order=18, 
            description="Pepsi", 
            image_url="/images/pepsi_lon.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Sprite", 
            price=15000, 
            display_order=19, 
            description="Sprite", 
            image_url="/images/sprite_lon.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Bia Heineken", 
            price=35000, 
            display_order=20, 
            description="Bia Heineken", 
            image_url="/images/bia_heineken_lon.jpg"
        ),
        MenuItem(
            category_id=cats[2].id, 
            name="Bia Tiger", 
            price=35000, 
            display_order=21, 
            description="Bia Tiger", 
            image_url="/images/bia_tiger_lon.jpg"
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
            name="Chè khoai môn", 
            price=20000, 
            display_order=2, 
            description="Chè khoai môn", 
            image_url="/images/che_khoai_mon.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Chè khúc bạch", 
            price=15000, 
            display_order=3, 
            description="Chè khúc bạch", 
            image_url="/images/che_khuc_bach.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Bánh flan", 
            price=20000, 
            display_order=2, 
            description="Bánh flan truyền thống", 
            image_url="/images/banh_flan.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Bánh gato", 
            price=100000, 
            display_order=4, 
            description="Bánh gato", 
            image_url="/images/banh_gato.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Bánh mochi", 
            price=20000, 
            display_order=5, 
            description="Bánh mochi", 
            image_url="/images/banh_mochi.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Bánh tiramisu", 
            price=25000, 
            display_order=6, 
            description="Bánh tiramisu", 
            image_url="/images/banh_tiramisu.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Kem vani", 
            price=20000, 
            display_order=7, 
            description="Kem vani", 
            image_url="/images/kem_vani.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Kem socola", 
            price=20000, 
            display_order=8, 
            description="Kem socola", 
            image_url="/images/kem_socola.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Sinh tố bơ", 
            price=25000, 
            display_order=9, 
            description="Sinh tố bơ", 
            image_url="/images/sinh_to_bo.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Sinh tố dâu", 
            price=25000, 
            display_order=10, 
            description="Sinh tố dâu", 
            image_url="/images/sinh_to_bo.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Sinh tố xoài", 
            price=25000, 
            display_order=11, 
            description="Sinh tố xoài", 
            image_url="/images/sinh_to_bo.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Pudding", 
            price=25000, 
            display_order=12, 
            description="Pudding", 
            image_url="/images/pudding.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Sữa chua trái cây", 
            price=25000, 
            display_order=13, 
            description="Sữa chua trái cây", 
            image_url="/images/sua_chua.jpg"
        ),
        MenuItem(
            category_id=cats[3].id, 
            name="Trái cây thập cẩm", 
            price=35000, 
            display_order=14, 
            description="Trái cây thập cẩm", 
            image_url="/images/trai_cay_thap_cam.jpg"
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