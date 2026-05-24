import json
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session as DBSession

from app.core.redis import get_redis
from app.routers.report_menu_performance import get_base_item_stats

logger = logging.getLogger(__name__)

async def update_best_sellers_cache(db: DBSession):
    """
    Background task to calculate and cache the Top 5 STAR menu items 
    based on the last 30 days of performance.
    """
    try:
        now = datetime.now(timezone.utc)
        start_dt = now - timedelta(days=30)
        end_dt = now

        items_stats = get_base_item_stats(db, start_dt, end_dt)

        if not items_stats:
            logger.info("No orders in the last 30 days. Clearing best sellers cache.")
            redis = await get_redis()
            await redis.delete("best_sellers:top5")
            return

        total_order_count_all_items = sum([int(getattr(row, "order_count") or 0) for row in items_stats]) or 1
        total_revenue_all_items = sum([float(getattr(row, "total_revenue") or 0) for row in items_stats]) or 1.0
        total_menu_items = len(items_stats) or 1
        
        avg_popularity = 1.0 / total_menu_items
        avg_revenue_contribution = 1.0 / total_menu_items

        stars = []

        for row in items_stats:
            item_id = row.item_id
            order_count = int(row.order_count or 0)
            total_revenue = float(row.total_revenue or 0)

            popularity_index = (order_count / total_order_count_all_items) / avg_popularity
            revenue_contribution_pct = (total_revenue / total_revenue_all_items)
            
            is_high_popularity = popularity_index > 1.0
            is_high_contribution = revenue_contribution_pct > avg_revenue_contribution
            
            if is_high_popularity and is_high_contribution:
                stars.append({
                    "item_id": item_id,
                    "total_revenue": total_revenue
                })

        # Sort stars by revenue descending and take top 5
        stars.sort(key=lambda x: x["total_revenue"], reverse=True)
        top_5_star_ids = [item["item_id"] for item in stars[:5]]

        # Cache the result in Redis
        redis = await get_redis()
        await redis.set("best_sellers:top5", json.dumps(top_5_star_ids))
        
        logger.info(f"Updated best sellers cache with items: {top_5_star_ids}")

    except Exception as e:
        logger.error(f"Error updating best sellers cache: {e}")

async def get_best_seller_ids() -> list[int]:
    """Retrieve the cached list of best seller item IDs from Redis."""
    try:
        redis = await get_redis()
        cached = await redis.get("best_sellers:top5")
        if cached:
            return json.loads(cached)
    except Exception as e:
        logger.error(f"Error fetching best sellers from cache: {e}")
    return []
