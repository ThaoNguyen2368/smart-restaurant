# services/menu_service.py — Menu + Category business logic

from typing import Optional

from fastapi import HTTPException, status
from sqlalchemy.orm import Session as DBSession

from app.models.category import Category
from app.models.menu_item import MenuItem
from app.schemas.menu import (
    CategoryCreate, CategoryUpdate,
    MenuItemCreate, MenuItemUpdate,
)
from app.websocket.manager import ws_manager
from app.websocket.events import WSEvent


def get_menu(db: DBSession) -> dict:
    """Get full menu: only available items grouped by category."""
    categories = db.query(Category).order_by(Category.display_order).all()
    items = (
        db.query(MenuItem)
        .filter(MenuItem.is_available == True)
        .order_by(MenuItem.display_order)
        .all()
    )
    return {
        "categories": [
            {"id": c.id, "name": c.name, "display_order": c.display_order}
            for c in categories
        ],
        "items": [
            {
                "id": i.id, "category_id": i.category_id, "name": i.name,
                "description": i.description, "price": str(i.price),
                "image_url": i.image_url, "is_available": i.is_available,
                "display_order": i.display_order,
            }
            for i in items
        ],
    }


def get_all_menu_items(db: DBSession) -> list[MenuItem]:
    """Admin: get all items including unavailable."""
    return db.query(MenuItem).order_by(MenuItem.display_order).all()


# ─── Category CRUD ───
def create_category(db: DBSession, data: CategoryCreate) -> Category:
    category = Category(**data.model_dump())
    db.add(category)
    db.commit()
    db.refresh(category)
    return category


def update_category(db: DBSession, category_id: int, data: CategoryUpdate) -> Category:
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(category, field, value)
    db.commit()
    db.refresh(category)
    return category


def delete_category(db: DBSession, category_id: int) -> None:
    """Hard delete allowed ONLY if no menu_items exist (database.rule.md Section 5)."""
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    items_count = db.query(MenuItem).filter(MenuItem.category_id == category_id).count()
    if items_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot delete category with existing menu items. Remove items first.",
        )
    db.delete(category)
    db.commit()


# ─── MenuItem CRUD ───
def create_menu_item(db: DBSession, data: MenuItemCreate) -> MenuItem:
    # Verify category exists
    category = db.query(Category).filter(Category.id == data.category_id).first()
    if not category:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Category not found")
    item = MenuItem(**data.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


def update_menu_item(db: DBSession, item_id: int, data: MenuItemUpdate) -> MenuItem:
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    db.commit()
    db.refresh(item)
    return item



async def notify_out_of_stock(db: DBSession, item_id: int) -> MenuItem:
    """Kitchen báo hết nguyên liệu (BR-009 v2.1).
    CHỈ gửi WebSocket thông báo — KHÔNG thay đổi is_available trong DB.
    Manager mới có quyền thực sự tắt món.
    """
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    # Broadcast tới Staff & Manager với thông tin đủ để hiển thị countdown 1:30
    event = WSEvent.create(
        event="OUT_OF_STOCK",
        payload={"item_id": item_id, "item_name": item.name},
    )
    await ws_manager.broadcast("staff", event)

    return item


async def disable_menu_item(db: DBSession, item_id: int) -> MenuItem:
    """Manager/Admin tắt món (BR-009c).
    Cập nhật is_available = FALSE và broadcast MENU_ITEM_DISABLED tới tất cả khách hàng.
    """
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    item.is_available = False
    db.commit()
    db.refresh(item)

    # Broadcast tới tất cả Customer Web sessions
    event = WSEvent.create(
        event="MENU_ITEM_DISABLED",
        payload={"item_id": item_id, "item_name": item.name},
    )
    await ws_manager.broadcast_to_prefix("orders:", event)

    # Thông báo xác nhận cho Staff
    await ws_manager.broadcast("staff", WSEvent.create(
        event="MENU_ITEM_DISABLED",
        payload={"item_id": item_id, "item_name": item.name},
    ))

    return item


async def enable_menu_item(db: DBSession, item_id: int) -> MenuItem:
    """Manager/Admin bật lại món (BR-009c).
    Cập nhật is_available = TRUE và broadcast MENU_ITEM_ENABLED tới tất cả khách hàng.
    """
    item = db.query(MenuItem).filter(MenuItem.id == item_id).first()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    item.is_available = True
    db.commit()
    db.refresh(item)

    # Broadcast tới tất cả Customer Web sessions
    event = WSEvent.create(
        event="MENU_ITEM_ENABLED",
        payload={"item_id": item_id, "item_name": item.name},
    )
    await ws_manager.broadcast_to_prefix("orders:", event)

    return item
