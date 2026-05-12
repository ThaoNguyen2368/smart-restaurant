# frontend.rule.md — Smart Restaurant OS
# Frontend Engineering Rules

> **Tech Stack:** React.js + TypeScript · WebSocket · CSS (module or Tailwind)  
> **Read after:** `skill.md` → `domain.rule.md` → this file  
> **Applies to:** All frontend modules: customer-web, staff-web, cashier-web, kds, admin-portal

---

## 1. Module Directory Structure

```
frontend/
├── packages/
│   ├── customer-web/          # Guest QR interface (mobile-first)
│   ├── staff-web/             # Waiter interface
│   ├── cashier-web/           # Cashier payment interface
│   ├── kds/                   # Kitchen Display System
│   └── admin-portal/          # Admin / Manager portal
├── packages/shared/
│   ├── types/                 # Shared TypeScript interfaces (domain entities)
│   ├── hooks/                 # Shared hooks (useWebSocket, useAuth)
│   ├── constants/             # Status enums, event names
│   └── api/                   # Shared API client
```

---

## 2. TypeScript Domain Types (Mandatory — Use These Everywhere)

The following types MUST be defined in `packages/shared/types/` and used across all modules. Do not redefine locally.

```typescript
// Domain status enums — must match DB CHECK constraints exactly
type SessionStatus = 'open' | 'waiting_payment' | 'closed' | 'merged';
type TableStatus = 'empty' | 'occupied' | 'waiting_payment';
type CookingStatus = 'pending' | 'confirmed' | 'cooking' | 'done' | 'served' | 'cancelled';
type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';
type PaymentMethod = 'cash' | 'card' | 'transfer' | 'voucher';
type PaymentStatus = 'completed' | 'refunded';
type StaffRole = 'staff' | 'cashier' | 'manager' | 'admin' | 'kitchen';
type ActorType = 'customer' | 'staff' | 'cashier' | 'manager' | 'admin' | 'system';

// WebSocket event types — must match backend events.py
type WSEventName =
  | 'ORDER_UPDATED' | 'ITEM_STATUS_CHANGED' | 'MENU_ITEM_DISABLED' | 'SESSION_CLOSED'  // customer
  | 'NEW_ORDER' | 'PAYMENT_REQUESTED' | 'OUT_OF_STOCK' | 'CANCEL_REQUEST_PENDING' | 'TABLE_TRANSFERRED'  // staff
  | 'NEW_ORDER_CONFIRMED' | 'CANCEL_REQUEST' | 'BUSY_MODE_CHANGED'  // kitchen
  | 'SPLIT_BILL_UPDATED';  // cashier

interface WSEvent {
  event: WSEventName;
  payload: Record<string, unknown>;
  timestamp: string;  // ISO 8601 UTC
}
```

---

## 3. Role-Safe Rendering Rules

**Each module is rendered only for its designated role. Never conditionally render role-specific UI in a shared component based on user role.**

| Module | Permitted Roles | Forbidden in this Module |
|---|---|---|
| `customer-web` | Guest (session auth only) | No staff/admin UI ever |
| `staff-web` | staff, manager, admin | No payment processing UI |
| `cashier-web` | cashier, admin | No order management UI |
| `kds` | kitchen, admin | No payment, no staff UI |
| `admin-portal` | manager, admin | All features |

### RBAC Enforcement in Frontend

- Role check happens in `useAuth` hook.
- Protected routes use `<RequireRole roles={['cashier']} />` wrapper.
- If a user accesses a route without the required role → redirect to their designated module, NOT to a generic error page.

**Forbidden pattern:**
```tsx
// ❌ Never do this — mixing role concerns in one component
{user.role === 'cashier' ? <PaymentForm /> : <OrderConfirm />}
```

**Required pattern:**
```tsx
// ✓ Each module is fully separate. Routing enforces role at app entry.
// cashier-web/App.tsx → only cashier routes. No conditional branching by role inside.
```

---

## 4. State Management Rules

### 4.1 Domain State vs UI State

- **Domain state** (session, orders, tables, menu): managed in global store (Zustand or React Context).
- **UI state** (modal open, loading spinner, selected tab): managed in local component state.

### 4.2 WebSocket State Sync (Critical)

- All WebSocket events MUST update the local domain state store — do not rely solely on re-fetching.
- Implement polling fallback every 10 seconds when WebSocket is disconnected.
- Display a banner when polling fallback is active (`FR-C09`).

```typescript
// hooks/useWebSocket.ts
const useWebSocket = (channel: string, sessionId?: number) => {
  // 1. Connect to WS channel
  // 2. On event → dispatch to domain store
  // 3. On disconnect → start polling fallback (10s interval)
  // 4. On reconnect → sync state from API, stop polling, restore WS
  // 5. Display disconnected banner when polling is active
};
```

### 4.3 State Mapping: Cooking Status → UI Display

| `cooking_status` | Customer Display | Staff Display | KDS Display |
|---|---|---|---|
| `pending` | "Đang chờ xác nhận" | "Chờ xác nhận" (action button) | Not shown |
| `confirmed` | "Đang chuẩn bị" | "Đã xác nhận" | "Chờ nấu" |
| `cooking` | "Đang nấu" | "Đang nấu" | "Đang nấu" (highlight) |
| `done` | "Sắp được phục vụ" | "Sẵn sàng phục vụ" (serve button) | "Xong" |
| `served` | "Đã được phục vụ ✓" | "Đã phục vụ" | "Đã phục vụ" |
| `cancelled` | "Đã huỷ" | "Đã huỷ" | "Đã huỷ" |

> **Rule:** Use these exact display strings. Do not invent your own status labels.

### 4.4 Price Display

- All prices displayed as VND with thousands separator: `150.000đ` or `150,000 VND`.
- Never display raw floating point: `150000.0` is a UI defect.
- Prices are read-only in Customer Web. Never allow editing prices in frontend.

---

## 5. Customer Web — Specific Rules

### 5.1 Menu Display

- Only render items where `is_available = true`.
- When `MENU_ITEM_DISABLED` WS event arrives: hide/grey-out item immediately. Do not wait for page refresh.
- Categories are displayed in `display_order` ascending order.
- Items within categories are displayed in `display_order` ascending order.

### 5.2 Cart & Order Submission

- Cart is local UI state only — it is NOT persisted to backend until "Submit Order" is pressed.
- On submit: POST `/api/orders` — never trust/send client-calculated totals. Backend calculates all prices.
- Show order confirmation screen before submission (`FR-C04`).
- After submission: clear cart, show order tracking screen.

### 5.3 Order Cancellation (Customer)

- Customer can cancel an item only when `cooking_status = 'pending'`.
- If `cooking_status ≠ 'pending'`: hide or disable the cancel button. Never show it greyed-out with a tooltip that says "contact staff" — this confuses guests. Just hide the cancel option.
- After cancellation: total must update in real-time (`BR-002`).

### 5.4 Payment Request

- "Request Payment" button appears only when session is `open`.
- After pressing: session transitions to `waiting_payment` — disable the button and show "Waiting for cashier".
- Display running total invoice before confirmation.

---

## 6. Staff Web — Specific Rules

### 6.1 Table Map

- Tables are displayed with visual status: `empty` (grey), `occupied` (green), `waiting_payment` (yellow/amber).
- Table map updates in real-time via `/ws/staff` events.
- Clicking an occupied table opens session detail (orders, items, status).

### 6.2 Order Confirmation Flow

- New order arrival: audio/visual notification via `NEW_ORDER` WS event.
- Confirm: PATCH `/api/orders/{id}/confirm`.
- Reject: PATCH `/api/orders/{id}/reject` — must provide a reason.
- Timer display: show elapsed time since order submission. Turn orange at 2.5 min, red at 3 min.

### 6.3 Cancellation UI

- Item in `pending` or `confirmed`: show "Cancel" button directly.
- Item in `cooking`: show "Request Cancel" button — this sends a cancel-request to Manager (not immediate).
- Item in `done` or `served`: show no cancel option at all. Do not show disabled button.

### 6.4 Table Transfer

- Destination table must show `empty` status. Do not allow selection of `occupied` or `waiting_payment` tables in the transfer UI.
- After transfer: both tables update in real-time via WS.

---

## 7. Cashier Web — Specific Rules

### 7.1 Invoice Display

- Always fetch invoice from `GET /api/sessions/{id}/invoice` — never calculate totals client-side.
- Display breakdown: subtotal, VAT amount, service charge, total.
- Display each OrderDetail with quantity, item name, unit_price (snapshot), line total.

### 7.2 Split Bill UI

- Split bill assigns each OrderDetail to a named guest (split_label).
- Show running sub-total per guest as assignments are made.
- All items must be assigned before split bill can be submitted.
- Individual payment records are created per guest.
- Session close button becomes available only when all split payments are `completed`.

### 7.3 Payment Confirmation

- Payment method: Cash / Card / Bank Transfer / Voucher (dropdown, not free text).
- `transaction_ref` is shown only when method = Card or Transfer.
- After payment confirmation: Session → `closed`, Table → `empty`.

---

## 8. KDS — Specific Rules

### 8.1 Queue Display

- Items displayed in FIFO order by `confirmed_at` timestamp.
- Items waiting > 10 minutes: highlight in orange.
- Items waiting > 15 minutes: highlight in red + audio alert.
- Audio alert on new confirmed order.

### 8.2 Status Actions (KDS only)

- Button "Start Cooking" → `cooking_status`: `confirmed → cooking`
- Button "Done" → `cooking_status`: `cooking → done`
- No other status changes are permitted from the KDS interface.

### 8.3 Out-of-Stock

- "Report Out of Stock" button on each item.
- Confirmation modal before submission (prevent accidental taps).
- After report: item disappears from KDS queue for future orders.

### 8.4 Kitchen Busy Mode

- Toggle switch in KDS header.
- When ON: new orders are paused, Staff Web receives `BUSY_MODE_CHANGED` notification.
- Visual indicator (red banner) when Busy Mode is active.

---

## 9. Admin Portal — Specific Rules

### 9.1 Menu Management

- Price changes on `menu_items` do NOT retroactively change existing orders (unit_price is snapshotted).
- Display a warning: "Changing price will not affect existing orders" when admin edits price.
- Soft-delete only: deactivate via `is_available = FALSE`, not by removing records.

### 9.2 Audit Log View

- Audit log is READ-ONLY. No edit, delete, or export manipulation allowed.
- Filter by: date range, actor, action type, entity type.
- Cursor-based pagination (infinite scroll or "Load More").

### 9.3 Reports

- Revenue reports are admin/manager only. Do not render these routes for other roles.
- All timestamps display in restaurant-configured timezone.

---

## 10. UX Constraints

- **No offline ordering.** If WebSocket is down, show polling banner. If API is unreachable, show maintenance message. Do not fake a local cart submission.
- **No client-side price calculation.** Cart total in customer-web is display-only estimate until server confirms.
- **No destructive actions without confirmation.** Cancel order, transfer table, merge session, close session: all require confirmation modal.
- **No empty states without instruction.** If order queue is empty, show a helpful message — not a blank screen.
- **Loading states are mandatory.** All API calls must show a loading indicator. Never show stale data without indication.

---

## 11. Agent Behavior Guidance

### For GitHub Copilot
- When generating form components, never add price input fields to order submission forms (price is server-side only).
- Validate that auto-completed TypeScript types match the canonical types in Section 2.

### For Cursor
- When refactoring components, do not merge module-specific components into shared components if they carry role-specific UI logic.
- Do not move cashier-web components into staff-web or vice versa — role separation is architectural.

### For Claude Code / Continue
- Generate `packages/shared/types/index.ts` first with all domain types from Section 2.
- Every generated component that reads `cooking_status` must use the display mapping in Section 4.3.

### For Windsurf / Antigravity / OpenHands
- Do not generate loyalty points, discount fields, or delivery address fields in any frontend form.
- The Customer Web has no login screen — authentication is via session_id from QR scan only.

### For Roo Code
- KDS module must not have access to payment or revenue data. Keep module boundaries clean.
- Admin portal reports are not accessible to cashier or staff roles — enforce in routing config.
