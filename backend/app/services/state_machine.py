# services/state_machine.py — CENTRALISED state transition validator
# ALL state transitions MUST go through this module (backend.rule.md Section 4.1)
# domain.rule.md Section 3: Valid transitions

from fastapi import HTTPException, status


# ─── OrderDetail cooking_status transitions (domain.rule.md Section 3.2) ───
ORDER_DETAIL_TRANSITIONS: dict[str, dict[str, list[str]]] = {
    # from_status: { to_status: [allowed_actor_roles] }
    "pending": {
        "confirmed": ["staff", "manager", "admin"],
        "cancelled": ["customer", "staff", "manager", "admin"],  # auto-approved
    },
    "confirmed": {
        "cooking": ["kitchen"],
        "cancelled": ["staff", "manager", "admin"],  # staff-only approval
    },
    "cooking": {
        "done": ["kitchen"],
        "cancelled": ["manager", "admin"],  # BR-003: Manager mandatory
    },
    "done": {
        "served": ["kitchen", "staff", "manager", "admin"],
        # BR-008: done → cancelled is FORBIDDEN
    },
    "served": {
        # BR-008: served is terminal — no transitions allowed
    },
    "cancelled": {
        # Terminal state — no transitions
    },
}

# ─── Session status transitions (domain.rule.md Section 3.1) ───
SESSION_TRANSITIONS: dict[str, dict[str, list[str]]] = {
    "open": {
        "waiting_payment": ["customer", "staff", "manager", "admin"],
        "merged": ["manager", "admin"],
    },
    "waiting_payment": {
        "closed": ["cashier", "admin"],
    },
    "closed": {
        # Terminal — new session created via table reset, not reopened
    },
    "merged": {
        # Terminal
    },
}

# ─── Table status transitions (domain.rule.md Section 3.3) ───
TABLE_TRANSITIONS: dict[str, dict[str, list[str]]] = {
    "empty": {
        "occupied": ["system", "customer", "staff", "manager", "admin"],
    },
    "occupied": {
        "waiting_payment": ["customer", "staff", "manager", "admin"],
        "empty": ["staff", "manager", "admin"],  # session transferred out
    },
    "waiting_payment": {
        "empty": ["cashier", "admin"],  # session closed + reset
    },
}


def validate_order_detail_transition(
    current_status: str,
    target_status: str,
    actor_role: str,
) -> bool:
    """Validate OrderDetail cooking_status transition.
    Raises HTTPException if transition is invalid.
    """
    # BR-008: done/served → cancelled is FORBIDDEN
    if current_status in ("done", "served") and target_status == "cancelled":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "BUSINESS_RULE_VIOLATION",
                "message": f"Cannot cancel an item in '{current_status}' status. This is a terminal state.",
                "code": "BR-008",
            },
        )

    allowed = ORDER_DETAIL_TRANSITIONS.get(current_status, {})
    if target_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "INVALID_STATE_TRANSITION",
                "message": f"Transition from '{current_status}' to '{target_status}' is not permitted.",
            },
        )

    allowed_roles = allowed[target_status]
    if actor_role not in allowed_roles:
        # BR-003: cooking → cancelled requires Manager
        code = "BR-003" if current_status == "cooking" and target_status == "cancelled" else None
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "BUSINESS_RULE_VIOLATION",
                "message": f"Role '{actor_role}' cannot perform transition '{current_status}' → '{target_status}'.",
                "code": code,
            },
        )

    return True


def validate_session_transition(
    current_status: str,
    target_status: str,
    actor_role: str,
) -> bool:
    """Validate Session status transition.
    Raises HTTPException if transition is invalid.
    """
    allowed = SESSION_TRANSITIONS.get(current_status, {})
    if target_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "INVALID_STATE_TRANSITION",
                "message": f"Session transition from '{current_status}' to '{target_status}' is not permitted.",
            },
        )

    allowed_roles = allowed[target_status]
    if actor_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": f"Role '{actor_role}' cannot perform session transition '{current_status}' → '{target_status}'.",
            },
        )

    return True


def validate_table_transition(
    current_status: str,
    target_status: str,
    actor_role: str,
) -> bool:
    """Validate Table status transition.
    Raises HTTPException if transition is invalid.
    """
    allowed = TABLE_TRANSITIONS.get(current_status, {})
    if target_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "INVALID_STATE_TRANSITION",
                "message": f"Table transition from '{current_status}' to '{target_status}' is not permitted.",
            },
        )

    allowed_roles = allowed[target_status]
    if actor_role not in allowed_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "error": "FORBIDDEN",
                "message": f"Role '{actor_role}' cannot perform table transition '{current_status}' → '{target_status}'.",
            },
        )

    return True
