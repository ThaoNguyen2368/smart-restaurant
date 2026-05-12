# middleware/rate_limiter.py — Rate limiting for customer endpoints
# backend.rule.md Section 7: POST /api/orders max 10 req/min/session_id
# BR-015: Rate limit keyed on session_id

from fastapi import HTTPException, Request, status

from app.core.redis import get_redis


async def rate_limit_orders(request: Request, session_id: int) -> None:
    """Sliding window rate limiter: max 10 POST /api/orders per minute per session_id.
    Uses Redis for distributed rate limiting.
    Returns 429 Too Many Requests with Retry-After header.
    """
    redis = await get_redis()
    key = f"rate_limit:orders:{session_id}"

    current_count = await redis.get(key)
    if current_count and int(current_count) >= 10:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many order requests. Max 10 per minute.",
            headers={"Retry-After": "60"},
        )

    pipe = redis.pipeline()
    pipe.incr(key)
    pipe.expire(key, 60)  # 60 second window
    await pipe.execute()
