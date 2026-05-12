import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  LogOut,
  RefreshCcw,
  Search,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { PaymentMethod, WSEvent } from "@smart-restaurant-os/shared";
import { api } from "../api";
import { useAuthStore } from "../store";

interface InvoiceDetail {
  id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number | string;
  cooking_status: string;
}

interface PaymentRecord {
  id: number;
  amount: number | string;
  payment_method: PaymentMethod;
  status: string;
  split_label?: string | null;
  transaction_ref?: string | null;
  paid_at?: string;
}

interface InvoiceData {
  session_id: number;
  table_id: number;
  session_status?: string;
  table_status?: string | null;
  subtotal: number | string;
  tax_amount: number | string;
  service_charge: number | string;
  total: number | string;
  total_paid: number | string;
  remaining: number | string;
  details: InvoiceDetail[];
  payments: PaymentRecord[];
}

interface QueueItem {
  session_id: number;
  table_id: number;
  received_at: string;
}

interface ActiveSessionLookupResponse {
  table_number: number;
  table_id?: number;
  session_id: number | null;
  status: string;
}

const formatVnd = (value: number | string) => {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "0đ";
  return new Intl.NumberFormat("vi-VN").format(num) + "đ";
};

const getWsUrl = (token: string) => {
  const base = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  const wsBase = base.replace("http", "ws").replace(/\/api\/?$/, "");
  return `${wsBase}/ws/cashier?token=${token}`;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amount, setAmount] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [processing, setProcessing] = useState(false);

  const getErrorMessage = (err: any, fallback: string) => {
    const detail = err?.response?.data?.detail;
    if (!detail) return fallback;
    if (typeof detail === "string") return detail;
    if (typeof detail === "object") {
      const message = detail.message || detail.error;
      if (message) return message;
      try {
        return JSON.stringify(detail);
      } catch {
        return fallback;
      }
    }
    return fallback;
  };

  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<number | null>(null);

  const remaining = useMemo(() => {
    if (!invoice) return 0;
    const value =
      typeof invoice.remaining === "string"
        ? Number(invoice.remaining)
        : invoice.remaining;
    return Number.isNaN(value) ? 0 : value;
  }, [invoice]);

  const hasUnservedItems = useMemo(() => {
    if (!invoice) return false;
    return invoice.details.some(
      (detail) => !["served", "cancelled"].includes(detail.cooking_status),
    );
  }, [invoice]);

  const fetchInvoice = async (sessionId: string) => {
    if (!sessionId) return;
    try {
      setLoadingInvoice(true);
      setError("");
      const res = await api.get(`/sessions/${sessionId}/invoice`);
      const nextInvoice = res.data.data as InvoiceData;
      if (
        nextInvoice.session_status === "closed" ||
        nextInvoice.table_status === "empty"
      ) {
        setInvoice(null);
        setError("Phiên đã đóng và bàn đã được reset.");
        return;
      }
      setInvoice(nextInvoice);
    } catch (err: any) {
      setError(getErrorMessage(err, "Không thể tải hóa đơn."));
      setInvoice(null);
    } finally {
      setLoadingInvoice(false);
    }
  };

  const fetchWaitingQueue = async () => {
    try {
      const res = await api.get("/sessions/waiting-payment");
      const data = res.data.data as QueueItem[];
      setQueue(data);
    } catch {
      // Ignore
    }
  };

  useEffect(() => {
    if (!token) return;
    
    // Fetch initial queue
    fetchWaitingQueue();

    const ws = new WebSocket(getWsUrl(token));
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (!pollRef.current) {
        pollRef.current = window.setInterval(() => {
          if (selectedSessionId) {
            fetchInvoice(selectedSessionId);
          }
        }, 10000);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        if (data.event === "PAYMENT_REQUESTED") {
          const payload = data.payload as {
            session_id: number;
            table_id: number;
          };
          setQueue((prev) => {
            const exists = prev.some(
              (item) => item.session_id === payload.session_id,
            );
            if (exists) return prev;
            const next = [
              {
                session_id: payload.session_id,
                table_id: payload.table_id,
                received_at: new Date().toISOString(),
              },
              ...prev,
            ];
            if (!selectedSessionId) {
              setSelectedSessionId(String(payload.session_id));
            }
            return next;
          });
        } else if (data.event === "TABLE_STATUS_CHANGED") {
          // Clear invoice if its table was reset
          const payload = data.payload as { table_id: number; status: string };
          if (
            invoice &&
            invoice.table_id === payload.table_id &&
            payload.status === "empty"
          ) {
            setInvoice(null);
            setSelectedSessionId("");
            setQueue((prev) =>
              prev.filter((item) => item.table_id !== payload.table_id),
            );
          }
        }
      } catch {
        return;
      }
    };

    return () => {
      ws.close();
      if (pollRef.current) {
        window.clearInterval(pollRef.current);
      }
    };
  }, [token, selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId) {
      fetchInvoice(selectedSessionId);
    }
  }, [selectedSessionId]);

  useEffect(() => {
    if (invoice?.remaining !== undefined) {
      const nextAmount = String(remaining > 0 ? remaining : 0);
      setAmount(nextAmount);
    }
  }, [invoice, remaining]);

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId) return;
    setError("");
    const keyword = selectedSessionId.trim();
    if (!keyword) return;

    // UX: support lookup by table number first, fallback to session id.
    try {
      const tableRes = await api.get(`/tables/${keyword}/active-session`);
      const tableLookup = tableRes.data.data as ActiveSessionLookupResponse;
      if (tableLookup.session_id) {
        const resolvedSessionId = String(tableLookup.session_id);
        setSelectedSessionId(resolvedSessionId);
        await fetchInvoice(resolvedSessionId);
        return;
      }
      if (tableLookup.status === "no_active_session") {
        setInvoice(null);
        setError(`Bàn ${keyword} hiện không còn phiên hoạt động.`);
        return;
      }
    } catch {
      // Ignore and fallback to session lookup.
    }

    await fetchInvoice(keyword);
  };

  const handleCreatePayment = async () => {
    if (!invoice || remaining <= 0) return;
    try {
      setProcessing(true);
      setError("");
      await api.post("/payments", {
        session_id: invoice.session_id,
        amount: Number(amount || remaining),
        payment_method: method,
        transaction_ref:
          method === "card" || method === "transfer"
            ? transactionRef
            : undefined,
      });
      await fetchInvoice(String(invoice.session_id));
      setTransactionRef("");
    } catch (err: any) {
      setError(getErrorMessage(err, "Không thể ghi nhận thanh toán."));
    } finally {
      setProcessing(false);
    }
  };

  const handleCloseSession = async () => {
    if (!invoice) return;
    try {
      setProcessing(true);
      setError("");
      const response = await api.patch(`/sessions/${invoice.session_id}/close`);
      if (response.status === 200) {
        setQueue((prev) =>
          prev.filter((item) => item.session_id !== invoice.session_id),
        );
        setInvoice(null);
        setSelectedSessionId("");
        setAmount("");
        setTransactionRef("");
      }
    } catch (err: any) {
      setError(
        getErrorMessage(
          err,
          "Không thể đóng phiên. Vui lòng kiểm tra tất cả món đã phục vụ và thanh toán xong.",
        ),
      );
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintBill = () => {
    if (!invoice) return;
    window.print();
  };

  return (
    <div className="cashier-shell">
      <aside className="cashier-sidebar glass">
        <div className="brand">
          <div>
            <p className="brand-title">Smart OS</p>
            <p className="brand-sub">Cashier Portal • {user?.role}</p>
          </div>
          <button className="btn btn-secondary" onClick={handleLogout}>
            <LogOut size={18} /> Đăng xuất
          </button>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <span>Yêu cầu thanh toán</span>
            <span
              className={`status-pill ${wsConnected ? "online" : "offline"}`}
            >
              {wsConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {wsConnected ? "WS Online" : "WS Offline"}
            </span>
          </div>
          {queue.length === 0 ? (
            <div className="empty-state">
              <p>Chưa có yêu cầu mới.</p>
              <span className="muted">
                Bạn có thể nhập mã phiên để tra cứu nhanh.
              </span>
            </div>
          ) : (
            <div className="queue-list">
              {queue.map((item) => (
                <button
                  key={item.session_id}
                  className={`queue-item ${String(item.session_id) === selectedSessionId ? "active" : ""}`}
                  onClick={() => setSelectedSessionId(String(item.session_id))}
                >
                  <div>
                    <p>Phiên #{item.session_id}</p>
                    <span>Bàn {item.table_id}</span>
                  </div>
                  <span className="queue-time">
                    {new Date(item.received_at).toLocaleTimeString("vi-VN")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <main className="cashier-main">
        <header className="main-header">
          <div>
            <h1>Thanh toán &amp; Hoá đơn</h1>
            <p className="muted">
              Xác nhận thanh toán và đóng phiên nhanh chóng.
            </p>
          </div>
          <form className="lookup" onSubmit={handleLookup}>
            <div className="lookup-field">
              <Search size={16} />
              <input
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                placeholder="Nhập số bàn hoặc mã phiên..."
                inputMode="numeric"
              />
            </div>
            <button className="btn btn-secondary" type="submit">
              <RefreshCcw size={16} /> Tra cứu
            </button>
          </form>
        </header>

        {!wsConnected && (
          <div className="banner-warning">
            Mất kết nối thời gian thực. Hệ thống đang dùng polling 10s cho hoá
            đơn đang mở.
          </div>
        )}

        {error && <div className="banner-error">{error}</div>}

        {loadingInvoice ? (
          <div className="center">
            <Loader2 className="animate-spin" size={40} />
          </div>
        ) : (
          <div className="content-grid">
            <section className="card glass">
              <div className="card-header">
                <div>
                  <h3>Thông tin phiên</h3>
                  <p className="muted">Chi tiết món và tổng tiền</p>
                </div>
                {invoice && (
                  <div className="session-pill">
                    Phiên #{invoice.session_id} • Bàn {invoice.table_id}
                  </div>
                )}
              </div>

              {!invoice ? (
                <div className="empty-state">
                  <p>Chọn một phiên để xem hoá đơn.</p>
                  <span className="muted">
                    Bạn có thể chọn từ danh sách bên trái.
                  </span>
                </div>
              ) : (
                <div className="invoice-body">
                  <div className="line-items">
                    {invoice.details.map((detail) => (
                      <div key={detail.id} className="line-item">
                        <div>
                          <p>{detail.item_name}</p>
                          <span>
                            x{detail.quantity} • {formatVnd(detail.unit_price)}
                          </span>
                        </div>
                        <strong>
                          {formatVnd(
                            Number(detail.unit_price) * detail.quantity,
                          )}
                        </strong>
                      </div>
                    ))}
                  </div>

                  <div className="summary">
                    <div>
                      <span>Tiền món</span>
                      <strong>{formatVnd(invoice.subtotal)}</strong>
                    </div>
                    <div>
                      <span>VAT</span>
                      <strong>{formatVnd(invoice.tax_amount)}</strong>
                    </div>
                    <div>
                      <span>Phí phục vụ</span>
                      <strong>{formatVnd(invoice.service_charge)}</strong>
                    </div>
                    <div className="summary-total">
                      <span>Tổng cộng</span>
                      <strong>{formatVnd(invoice.total)}</strong>
                    </div>
                    <div className="summary-total">
                      <span>Đã thanh toán</span>
                      <strong>{formatVnd(invoice.total_paid)}</strong>
                    </div>
                    <div className="summary-total highlight">
                      <span>Còn lại</span>
                      <strong>{formatVnd(invoice.remaining)}</strong>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="card glass">
              <div className="card-header">
                <div>
                  <h3>Xác nhận thanh toán</h3>
                  <p className="muted">
                    Chọn phương thức và ghi nhận giao dịch
                  </p>
                </div>
                <div className="method-pill">
                  <CreditCard size={16} /> {method.toUpperCase()}
                </div>
              </div>

              <div className="payment-form">
                <label>
                  <span>Phương thức</span>
                  <select
                    value={method}
                    onChange={(e) => setMethod(e.target.value as PaymentMethod)}
                  >
                    <option value="cash">Tiền mặt</option>
                    <option value="card">Thẻ</option>
                    <option value="transfer">Chuyển khoản</option>
                    <option value="voucher">Voucher</option>
                  </select>
                </label>

                <label>
                  <span>Số tiền</span>
                  <input
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                  />
                </label>

                {(method === "card" || method === "transfer") && (
                  <label>
                    <span>Mã giao dịch</span>
                    <input
                      value={transactionRef}
                      onChange={(e) => setTransactionRef(e.target.value)}
                      placeholder="VD: VNP-2025-0001"
                    />
                  </label>
                )}

                <button
                  className="btn btn-primary"
                  onClick={handleCreatePayment}
                  disabled={!invoice || remaining <= 0 || processing}
                >
                  {processing ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <>
                      <Banknote size={18} /> Ghi nhận thanh toán
                    </>
                  )}
                </button>

                <button
                  className="btn btn-secondary"
                  onClick={handleCloseSession}
                  disabled={
                    !invoice || remaining > 0 || hasUnservedItems || processing
                  }
                >
                  <CheckCircle2 size={18} /> Đóng phiên &amp; Reset bàn
                </button>

                {hasUnservedItems && (
                  <p className="muted" style={{ fontSize: "0.85rem" }}>
                    Còn món chưa phục vụ, vui lòng hoàn tất trước khi đóng
                    phiên.
                  </p>
                )}

                <button
                  className="btn btn-secondary"
                  onClick={handlePrintBill}
                  disabled={!invoice}
                >
                  In hoá đơn
                </button>
              </div>

              {invoice && invoice.payments.length > 0 && (
                <div className="payments">
                  <h4>Lịch sử thanh toán</h4>
                  {invoice.payments.map((payment) => (
                    <div key={payment.id} className="payment-item">
                      <div>
                        <p>{payment.payment_method.toUpperCase()}</p>
                        <span>
                          {payment.transaction_ref || "Giao dịch nội bộ"}
                        </span>
                      </div>
                      <strong>{formatVnd(payment.amount)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>

      {invoice && (
        <div className="print-bill">
          <div className="print-header">
            <h2>Hoá đơn thanh toán</h2>
            <div>
              Phiên #{invoice.session_id} - Bàn {invoice.table_id}
            </div>
          </div>
          <div className="print-lines">
            {invoice.details.map((detail) => (
              <div key={detail.id} className="print-line">
                <span>{detail.item_name}</span>
                <span>
                  x{detail.quantity} · {formatVnd(detail.unit_price)}
                </span>
                <strong>
                  {formatVnd(Number(detail.unit_price) * detail.quantity)}
                </strong>
              </div>
            ))}
          </div>
          <div className="print-summary">
            <div>
              <span>Tiền món</span>
              <strong>{formatVnd(invoice.subtotal)}</strong>
            </div>
            <div>
              <span>VAT</span>
              <strong>{formatVnd(invoice.tax_amount)}</strong>
            </div>
            <div>
              <span>Phí phục vụ</span>
              <strong>{formatVnd(invoice.service_charge)}</strong>
            </div>
            <div className="print-total">
              <span>Tổng cộng</span>
              <strong>{formatVnd(invoice.total)}</strong>
            </div>
            <div>
              <span>Đã thanh toán</span>
              <strong>{formatVnd(invoice.total_paid)}</strong>
            </div>
            <div>
              <span>Còn lại</span>
              <strong>{formatVnd(invoice.remaining)}</strong>
            </div>
          </div>
          <div className="print-footer">Cảm ơn quý khách!</div>
        </div>
      )}
    </div>
  );
}
