// Domain status enums — must match DB CHECK constraints exactly
export type SessionStatus = 'open' | 'waiting_payment' | 'closed' | 'merged';
export type TableStatus = 'empty' | 'occupied' | 'waiting_payment';
export type CookingStatus = 'pending' | 'confirmed' | 'cooking' | 'done' | 'served' | 'cancelled';
export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
export type PaymentMethod = 'cash' | 'card' | 'transfer' | 'voucher';
export type PaymentStatus = 'completed' | 'refunded';
export type StaffRole = 'staff' | 'cashier' | 'manager' | 'admin' | 'kitchen';
export type ActorType = 'customer' | 'staff' | 'cashier' | 'manager' | 'admin' | 'system';

// WebSocket event types — must match backend events.py
export type WSEventName =
  | 'ORDER_UPDATED' | 'ITEM_STATUS_CHANGED' | 'MENU_ITEM_DISABLED' | 'SESSION_CLOSED'  // customer
  | 'NEW_ORDER' | 'PAYMENT_REQUESTED' | 'OUT_OF_STOCK' | 'CANCEL_REQUEST_PENDING' | 'TABLE_TRANSFERRED' | 'TABLE_STATUS_CHANGED'  // staff
  | 'NEW_ORDER_CONFIRMED' | 'CANCEL_REQUEST' | 'BUSY_MODE_CHANGED'  // kitchen
  | 'SPLIT_BILL_UPDATED';  // cashier

export interface WSEvent {
  event: WSEventName;
  payload: Record<string, unknown>;
  timestamp: string;  // ISO 8601 UTC
}
