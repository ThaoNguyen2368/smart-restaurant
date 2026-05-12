# core/redis.py — Redis client for caching + WebSocket Pub/Sub
# backend.rule.md Section 6.3

import redis.asyncio as aioredis

from app.core.config import settings

redis_client: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    """Get or create async Redis connection."""
    global redis_client
    if redis_client is None:
        redis_client = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
        )
    return redis_client


async def close_redis() -> None:
    """Close Redis connection on shutdown."""
    global redis_client
    if redis_client is not None:
        await redis_client.close()
        redis_client = None
