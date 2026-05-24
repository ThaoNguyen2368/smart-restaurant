# routers/report_menu_performance.py — Menu Engineering Matrix
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from app.core.database import get_db
from app.middleware.auth import get_current_user
from app.middleware.rbac import require_roles
from app.models.staff_user import StaffUser
from app.models.order import Order
from app.models.order_detail import OrderDetail
from app.models.menu_item import MenuItem
from app.models.category import Category
from app.schemas.common import api_response

router = APIRouter(prefix="/api/reports/menu-performance", tags=["Reports"])

def get_base_item_stats(db: DBSession, start_dt: datetime, end_dt: datetime, category_id: Optional[int] = None):
    base_query = db.query(
        OrderDetail.item_id,
        MenuItem.name.label("item_name"),
        MenuItem.category_id,
        Category.name.label("category_name"),
        MenuItem.is_available,
        MenuItem.created_at.label("item_created_at"),
        func.sum(OrderDetail.quantity).label("order_count"),
        func.sum(OrderDetail.quantity * OrderDetail.unit_price).label("total_revenue")
    ).join(MenuItem, OrderDetail.item_id == MenuItem.id)\
     .join(Category, MenuItem.category_id == Category.id)\
     .join(Order, OrderDetail.order_id == Order.id)\
     .filter(
         OrderDetail.cooking_status != "cancelled",
         Order.created_at >= start_dt,
         Order.created_at <= end_dt
     )

    if category_id is not None:
        base_query = base_query.filter(MenuItem.category_id == category_id)

    return base_query.group_by(
        OrderDetail.item_id,
        MenuItem.name,
        MenuItem.category_id,
        Category.name,
        MenuItem.is_available,
        MenuItem.created_at
    ).all()

@router.get("")
def get_menu_matrix_data(
    date_from: str = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to: str = Query(..., description="End date (YYYY-MM-DD)"),
    category_id: Optional[int] = Query(None, description="Filter by category"),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    """Lấy dữ liệu cho Menu Engineering Matrix."""
    require_roles("admin", "manager")(current_user)
    try:
        start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    items_stats = get_base_item_stats(db, start_dt, end_dt, category_id)

    total_order_count_all_items = sum([getattr(row, "order_count") or 0 for row in items_stats]) or 1
    total_revenue_all_items = sum([getattr(row, "total_revenue") or 0 for row in items_stats]) or 1
    total_menu_items = len(items_stats) or 1
    
    avg_popularity = 1.0 / total_menu_items
    avg_revenue_contribution = 1.0 / total_menu_items

    stars = []
    puzzles = []
    plowhorses = []
    dogs = []
    
    now = datetime.now(timezone.utc)

    for row in items_stats:
        item_id = row.item_id
        item_name = row.item_name
        cat_name = row.category_name
        order_count = int(row.order_count or 0)
        total_revenue = float(row.total_revenue or 0)
        is_available = row.is_available
        item_created_at = row.item_created_at

        # Check new item
        days_since_created = (now - item_created_at).days if item_created_at else 100
        is_new = days_since_created < 7

        popularity_index = (order_count / total_order_count_all_items) / avg_popularity
        revenue_contribution_pct = (total_revenue / total_revenue_all_items)
        
        is_high_popularity = popularity_index > 1.0
        is_high_contribution = revenue_contribution_pct > avg_revenue_contribution
        
        quadrant = "NEW"
        recommendation = "Món mới, cần thêm thời gian để phân tích."
        
        if not is_new:
            if is_high_popularity and is_high_contribution:
                quadrant = "STAR"
                recommendation = "Giữ nguyên chất lượng. Đặt vị trí đầu menu."
            elif not is_high_popularity and is_high_contribution:
                quadrant = "PUZZLE"
                recommendation = "Cân nhắc tăng marketing. Thử đặt ảnh nổi bật hơn trong menu."
            elif is_high_popularity and not is_high_contribution:
                quadrant = "PLOWHORSE"
                recommendation = "Xem xét tăng giá nhẹ 5-10%. Hoặc bundle với món có margin cao hơn."
            else:
                quadrant = "DOG"
                recommendation = "Xem xét xoá khỏi menu hoặc cải tiến công thức. Tham khảo ý kiến bếp."

        item_data = {
            "item_id": item_id,
            "item_name": item_name,
            "category": cat_name,
            "order_count": order_count,
            "total_revenue": total_revenue,
            "avg_revenue_per_order": round(total_revenue / order_count, 2) if order_count else 0,
            "popularity_index": round(popularity_index, 2),
            "revenue_contribution_pct": round(revenue_contribution_pct * 100, 2),
            "quadrant": quadrant,
            "recommendation": recommendation,
            "is_available": is_available,
            "is_new": is_new
        }

        if quadrant == "STAR":
            stars.append(item_data)
        elif quadrant == "PUZZLE":
            puzzles.append(item_data)
        elif quadrant == "PLOWHORSE":
            plowhorses.append(item_data)
        elif quadrant == "DOG":
            dogs.append(item_data)

    return api_response({
        "period": {"from": date_from, "to": date_to},
        "total_items_analyzed": total_menu_items,
        "matrix": {
            "stars": stars,
            "puzzles": puzzles,
            "plowhorses": plowhorses,
            "dogs": dogs
        },
        "summary": {
            "star_count": len(stars),
            "puzzle_count": len(puzzles),
            "plowhorse_count": len(plowhorses),
            "dog_count": len(dogs),
            "top_star": sorted(stars, key=lambda x: x["total_revenue"], reverse=True)[0] if stars else None,
            "top_dog": sorted(dogs, key=lambda x: x["order_count"])[0] if dogs else None
        }
    })

@router.get("/{item_id}/trend")
def get_item_trend(
    item_id: int,
    date_from: str = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to: str = Query(..., description="End date (YYYY-MM-DD)"),
    granularity: str = Query("day", description="day or week"),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    require_roles("admin", "manager")(current_user)
    try:
        start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    results = db.query(
        Order.created_at,
        OrderDetail.quantity,
        OrderDetail.unit_price
    ).join(Order, OrderDetail.order_id == Order.id)\
     .filter(
         OrderDetail.item_id == item_id,
         OrderDetail.cooking_status != "cancelled",
         Order.created_at >= start_dt,
         Order.created_at <= end_dt
     ).all()

    grouped = {}
    for row in results:
        dt = row.created_at
        if granularity == "week":
            key = f"{dt.isocalendar()[0]}-W{dt.isocalendar()[1]:02d}"
        else:
            key = dt.strftime("%Y-%m-%d")
        
        if key not in grouped:
            grouped[key] = {"order_count": 0, "revenue": Decimal("0")}
        grouped[key]["order_count"] += row.quantity
        grouped[key]["revenue"] += Decimal(str(row.quantity * row.unit_price))
        
    trend_list = []
    for k in sorted(grouped.keys()):
        trend_list.append({
            "date": k,
            "order_count": grouped[k]["order_count"],
            "revenue": float(grouped[k]["revenue"])
        })
        
    return api_response(trend_list)

@router.get("/by-category")
def get_category_summary(
    date_from: str = Query(..., description="Start date (YYYY-MM-DD)"),
    date_to: str = Query(..., description="End date (YYYY-MM-DD)"),
    current_user: StaffUser = Depends(get_current_user),
    db: DBSession = Depends(get_db)
):
    require_roles("admin", "manager")(current_user)
    try:
        start_dt = datetime.fromisoformat(date_from).replace(tzinfo=timezone.utc)
        end_dt = datetime.fromisoformat(date_to).replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format")

    items_stats = get_base_item_stats(db, start_dt, end_dt)
    
    total_order_count_all_items = sum([getattr(row, "order_count") or 0 for row in items_stats]) or 1
    total_revenue_all_items = sum([getattr(row, "total_revenue") or 0 for row in items_stats]) or 1
    total_menu_items = len(items_stats) or 1
    
    avg_popularity = 1.0 / total_menu_items
    avg_revenue_contribution = 1.0 / total_menu_items

    now = datetime.now(timezone.utc)
    
    category_summary = {}

    for row in items_stats:
        cat_id = row.category_id
        cat_name = row.category_name
        
        if cat_id not in category_summary:
            category_summary[cat_id] = {
                "category_id": cat_id,
                "category_name": cat_name,
                "stars": 0,
                "puzzles": 0,
                "plowhorses": 0,
                "dogs": 0,
                "new_items": 0
            }
            
        item_created_at = row.item_created_at
        days_since_created = (now - item_created_at).days if item_created_at else 100
        if days_since_created < 7:
            category_summary[cat_id]["new_items"] += 1
            continue

        order_count = int(row.order_count or 0)
        total_revenue = float(row.total_revenue or 0)
        
        popularity_index = (order_count / total_order_count_all_items) / avg_popularity
        revenue_contribution_pct = (total_revenue / total_revenue_all_items)
        
        is_high_popularity = popularity_index > 1.0
        is_high_contribution = revenue_contribution_pct > avg_revenue_contribution
        
        if is_high_popularity and is_high_contribution:
            category_summary[cat_id]["stars"] += 1
        elif not is_high_popularity and is_high_contribution:
            category_summary[cat_id]["puzzles"] += 1
        elif is_high_popularity and not is_high_contribution:
            category_summary[cat_id]["plowhorses"] += 1
        else:
            category_summary[cat_id]["dogs"] += 1

    return api_response(list(category_summary.values()))
