# services/audit_service.py — Audit Log helper
# backend.rule.md Section 4.3: Mandatory signature
# INV-AL01: INSERT-only. INV-AL02: Every mutation produces exactly one entry.

from typing import Optional

from sqlalchemy.orm import Session as DBSession

from app.models.audit_log import AuditLog


def write_audit_log(
    db: DBSession,
    actor_id: Optional[int],
    actor_type: str,       # customer|staff|cashier|manager|admin|system
    action: str,           # cancel_item|approve_cancel|confirm_order|process_payment|transfer_table|merge_session|...
    entity_type: str,      # order_detail|order|session|payment
    entity_id: int,
    before_state: dict,
    after_state: dict,
    reason: Optional[str] = None,
) -> AuditLog:
    """Write an audit log entry within the same DB transaction as the state change.
    
    MUST be called within the same transaction — if it rolls back, this entry rolls back too.
    
    Args:
        db: Current database session (same transaction)
        actor_id: staff_users.id or None for customer
        actor_type: Role of the actor
        action: Action performed
        entity_type: Type of entity affected
        entity_id: ID of the entity affected
        before_state: JSON snapshot before change
        after_state: JSON snapshot after change
        reason: Mandatory for cancel_item from cooking (INV-AL03)
    """
    audit_entry = AuditLog(
        actor_id=actor_id,
        actor_type=actor_type,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        before_state=before_state,
        after_state=after_state,
        reason=reason,
    )
    db.add(audit_entry)
    return audit_entry
