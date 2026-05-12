# services/session_service.py — Session lifecycle management
# domain.rule.md Section 3.1 + skill.md Session Lifecycle

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session as DBSession

from app.models.session import Session
from app.models.table import Table
from app.models.order import Order
from app.models.order_detail import OrderDetail
from app.models.payment import Payment
from app.services import state_machine, audit_service
from app.websocket.manager import ws_manager
from app.websocket.events import WSEvent


def get_or_create_session(db: DBSession, table_number: int) -> Session:
    """QR scan: get existing open session or create new one.
    BR-001: Only one open session per table at any time.
    """
    table = db.query(Table).filter(Table.table_number == table_number).first()
    if not table:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Table {table_number} not found",
        )

    # Check for existing active session (open OR waiting_payment).
    # This prevents duplicate active sessions for the same table when
    # customer rescans QR while table is waiting for payment.
    existing = db.query(Session).filter(
        Session.table_id == table.id,
        Session.status.in_(["open", "waiting_payment"]),
    ).order_by(Session.id.desc()).first()

    if existing:
        return existing

    # SELECT FOR UPDATE to prevent race condition (concurrent QR scans)
    table = db.query(Table).filter(Table.id == table.id).with_for_update().first()

    # Create new session
    session = Session(table_id=table.id, status="open")
    db.add(session)

    # Update table status
    table.status = "occupied"

    db.commit()
    db.refresh(session)
    return session


async def request_payment(db: DBSession, session_id: int) -> Session:
    """Customer requests payment → session moves to waiting_payment."""
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if session.status == "closed":
        table = db.query(Table).filter(Table.id == session.table_id).first()
        if table and table.status == "waiting_payment":
            state_machine.validate_table_transition(table.status, "empty", "cashier")
            table.status = "empty"
            db.commit()
            db.refresh(table)
        return session

    state_machine.validate_session_transition(session.status, "waiting_payment", "customer")

    before = {"status": session.status}
    session.status = "waiting_payment"

    # Update table status
    table = db.query(Table).filter(Table.id == session.table_id).first()
    if table:
        table.status = "waiting_payment"

    audit_service.write_audit_log(
        db=db,
        actor_id=None,
        actor_type="customer",
        action="request_payment",
        entity_type="session",
        entity_id=session_id,
        before_state=before,
        after_state={"status": "waiting_payment"},
    )

    db.commit()

    # Broadcast after commit (backend.rule.md Section 5.3)
    await ws_manager.broadcast("staff", WSEvent.create(
        event="PAYMENT_REQUESTED",
        payload={"session_id": session_id, "table_id": session.table_id},
    ))
    await ws_manager.broadcast("cashier", WSEvent.create(
        event="PAYMENT_REQUESTED",
        payload={"session_id": session_id, "table_id": session.table_id},
    ))

    db.refresh(session)
    return session


async def close_session(db: DBSession, session_id: int, actor_id: int) -> Session:
    """Cashier closes session after all payments completed.
    BR-010: Session closes only when all split payments are completed.
    """
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    if session.status == "closed":
        return session

    state_machine.validate_session_transition(session.status, "closed", "cashier")

    # BR-010: Verify total paid >= session total
    total_orders = (
        db.query(func.sum(Order.total_price))
        .filter(Order.session_id == session_id, Order.order_status != "cancelled")
        .scalar()
    ) or 0

    unserved_count = (
        db.query(OrderDetail)
        .join(Order, Order.id == OrderDetail.order_id)
        .filter(
            Order.session_id == session_id,
            OrderDetail.cooking_status.in_(
                ["pending", "confirmed", "cooking", "done"],
            ),
        )
        .count()
    )

    if unserved_count > 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "BUSINESS_RULE_VIOLATION",
                "message": "Không thể đóng phiên khi còn món chưa phục vụ.",
                "code": "BR-016",
            },
        )

    total_paid = (
        db.query(func.sum(Payment.amount))
        .filter(Payment.session_id == session_id, Payment.status == "completed")
        .scalar()
    ) or 0

    if total_paid < total_orders:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "BUSINESS_RULE_VIOLATION",
                "message": f"Total paid ({total_paid}) is less than session total ({total_orders}). Complete all payments first.",
                "code": "BR-010",
            },
        )

    before = {"status": session.status}
    session.status = "closed"
    session.closed_at = datetime.now(timezone.utc)

    table = db.query(Table).filter(Table.id == session.table_id).first()
    if table:
        # Always reset table to empty when session closes (regardless of current status)
        state_machine.validate_table_transition(table.status, "empty", "cashier")
        table.status = "empty"

    audit_service.write_audit_log(
        db=db,
        actor_id=actor_id,
        actor_type="cashier",
        action="close_session",
        entity_type="session",
        entity_id=session_id,
        before_state=before,
        after_state={"status": "closed"},
    )

    db.commit()

    # Broadcast session closed to customer
    await ws_manager.broadcast(f"orders:{session_id}", WSEvent.create(
        event="SESSION_CLOSED",
        payload={"session_id": session_id},
    ))
    
    # Broadcast table status change to staff & cashier
    if table:
        await ws_manager.broadcast("staff", WSEvent.create(
            event="TABLE_STATUS_CHANGED",
            payload={"table_id": table.id, "status": "empty"},
        ))
        await ws_manager.broadcast("cashier", WSEvent.create(
            event="TABLE_STATUS_CHANGED",
            payload={"table_id": table.id, "status": "empty"},
        ))

    db.refresh(session)
    return session


async def reset_table(db: DBSession, table_id: int) -> Table:
    """Reset table to empty after session is closed."""
    table = db.query(Table).filter(Table.id == table_id).with_for_update().first()
    if not table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Table not found")

    active_session = (
        db.query(Session)
        .filter(Session.table_id == table_id, Session.status.in_(["open", "waiting_payment"]))
        .first()
    )
    if active_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "BUSINESS_RULE_VIOLATION",
                "message": "Bàn vẫn còn phiên đang hoạt động, không thể reset.",
                "code": "BR-017",
            },
        )

    table.status = "empty"
    db.commit()
    db.refresh(table)
    return table


async def transfer_table(
    db: DBSession,
    session_id: int,
    destination_table_id: int,
    actor_id: int,
    actor_role: str,
) -> Session:
    """Transfer session to another table.
    BR-011: Blocked if destination table is occupied.
    """
    session = db.query(Session).filter(Session.id == session_id).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Can only transfer open sessions")

    # Lock both tables
    old_table = db.query(Table).filter(Table.id == session.table_id).with_for_update().first()
    new_table = db.query(Table).filter(Table.id == destination_table_id).with_for_update().first()

    if not new_table:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Destination table not found")

    # BR-011: Reject if destination is occupied
    if new_table.status != "empty":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "BUSINESS_RULE_VIOLATION",
                "message": "Cannot transfer to an occupied table.",
                "code": "BR-011",
            },
        )

    before = {"table_id": session.table_id}
    session.table_id = destination_table_id

    old_table.status = "empty"
    new_table.status = "occupied"

    audit_service.write_audit_log(
        db=db,
        actor_id=actor_id,
        actor_type=actor_role,
        action="transfer_table",
        entity_type="session",
        entity_id=session_id,
        before_state=before,
        after_state={"table_id": destination_table_id},
    )

    db.commit()

    await ws_manager.broadcast("staff", WSEvent.create(
        event="TABLE_TRANSFERRED",
        payload={
            "session_id": session_id,
            "from_table_id": before["table_id"],
            "to_table_id": destination_table_id,
        },
    ))
    await ws_manager.broadcast(f"orders:{session_id}", WSEvent.create(
        event="TABLE_TRANSFERRED",
        payload={
            "session_id": session_id,
            "from_table_id": before["table_id"],
            "to_table_id": destination_table_id,
        },
    ))

    db.refresh(session)
    return session


async def merge_sessions(
    db: DBSession,
    source_session_id: int,
    master_session_id: int,
    actor_id: int,
) -> Session:
    """Merge source session into master session (Manager only)."""
    source = db.query(Session).filter(Session.id == source_session_id).first()
    master = db.query(Session).filter(Session.id == master_session_id).first()

    if not source or not master:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if source.status != "open" or master.status != "open":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Both sessions must be open")

    # Re-assign all orders from source to master
    orders = db.query(Order).filter(Order.session_id == source_session_id).all()
    for order in orders:
        order.session_id = master_session_id

    # Mark source as merged
    source.status = "merged"
    source.merged_into_session_id = master_session_id

    # Free up source table
    source_table = db.query(Table).filter(Table.id == source.table_id).first()
    if source_table:
        source_table.status = "empty"

    audit_service.write_audit_log(
        db=db,
        actor_id=actor_id,
        actor_type="manager",
        action="merge_session",
        entity_type="session",
        entity_id=source_session_id,
        before_state={"status": "open", "session_id": source_session_id},
        after_state={"status": "merged", "merged_into": master_session_id},
    )

    db.commit()
    db.refresh(master)
    return master


def get_today_sessions_for_table(db: DBSession, table_id: int) -> list[Session]:
    """Get all sessions for a specific table opened today (FR-S10)."""
    today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
    return (
        db.query(Session)
        .filter(Session.table_id == table_id, Session.opened_at >= today_start)
        .order_by(Session.opened_at.desc())
        .all()
    )
