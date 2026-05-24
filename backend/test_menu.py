import sys
import os
sys.path.insert(0, ".")

from app.core.database import SessionLocal
from app.models.menu_item import MenuItem
from app.models.category import Category
from app.models.order import Order
from app.models.order_detail import OrderDetail
from sqlalchemy import func
import datetime

db = SessionLocal()

start_dt = datetime.datetime.now() - datetime.timedelta(days=30)
end_dt = datetime.datetime.now()

items_stats = db.query(
    MenuItem.id,
    func.sum(OrderDetail.quantity).label("order_count"),
    func.sum(OrderDetail.quantity * OrderDetail.unit_price).label("total_revenue")
).outerjoin(OrderDetail, OrderDetail.item_id == MenuItem.id)\
 .outerjoin(Order, Order.id == OrderDetail.order_id)\
 .filter(MenuItem.is_available == True)\
 .group_by(MenuItem.id).all()

total_menu_items = len(items_stats)
print("Total menu items:", total_menu_items)

total_order_count_all_items = max(sum(int(item.order_count or 0) for item in items_stats), 1)
total_revenue_all_items = max(sum(float(item.total_revenue or 0) for item in items_stats), 1)

print("Total orders:", total_order_count_all_items)
print("Total revenue:", total_revenue_all_items)

avg_popularity = (total_order_count_all_items / total_menu_items) / total_order_count_all_items if total_order_count_all_items else 1
avg_revenue_contribution = (total_revenue_all_items / total_menu_items) / total_revenue_all_items if total_revenue_all_items else 1

print("Avg popularity:", avg_popularity)
print("Avg revenue contribution:", avg_revenue_contribution)

for row in items_stats:
    if not row.order_count: continue
    order_count = int(row.order_count or 0)
    total_revenue = float(row.total_revenue or 0)
    
    pop = (order_count / total_order_count_all_items) / avg_popularity
    rev = (total_revenue / total_revenue_all_items)
    print(f"Item {row.id}: pop={pop}, rev={rev*100}%")

db.close()
