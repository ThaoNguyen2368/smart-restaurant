import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useCustomerStore } from "../store";
import { ArrowLeft, CheckCircle2, CreditCard, X, Loader2 } from "lucide-react";

interface InvoiceDetail {
  id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number;
  cooking_status: string;
}

interface InvoiceData {
  session_id: number;
  table_id: number;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  total: number;
  details: InvoiceDetail[];
}

export default function OrderTracker() {
  const navigate = useNavigate();
  const sessionId = useCustomerStore((state) => state.sessionId);
  const sessionStatus = useCustomerStore((state) => state.status);
  const setSession = useCustomerStore((state) => state.setSession);
  const tableId = useCustomerStore((state) => state.tableId);

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionClosed, setSessionClosed] = useState(false);

  const fetchInvoice = async () => {
    if (!sessionId) return;
    try {
      const res = await api.get(`/invoice`);
      setInvoice(res.data.data);
    } catch (err: any) {
      const status = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (status === 401 || detail === "Invalid or closed session") {
        setSessionClosed(true);
        if (tableId) {
          setSession(sessionId, tableId, "closed");
        }
      } else {
        console.error(err);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!sessionId) {
      navigate("/");
      return;
    }

    fetchInvoice();

    // 1. WebSocket Integration
    const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
    const wsBase = apiBase.replace("http", "ws").replace(/\/api\/?$/, "");
    const wsUrl = `${wsBase}/ws/orders/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (
          data.event === "ORDER_UPDATED" ||
          data.event === "ITEM_STATUS_CHANGED"
        ) {
          // Refresh invoice when order updates
          fetchInvoice();
        }
        if (data.event === "SESSION_CLOSED") {
          setSessionClosed(true);
          if (tableId) {
            setSession(sessionId, tableId, "closed");
          }
        }
      } catch {}
    };

    return () => {
      ws.close();
    };
  }, [sessionId, navigate]);

  // 2. Cancellation
  const handleCancelItem = async (detailId: number) => {
    if (!confirm("Bạn có chắc muốn huỷ món này?")) return;
    try {
      await api.patch(`/order-details/${detailId}/cancel`);
      fetchInvoice();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Lỗi huỷ món");
    }
  };

  // 3. Request Payment
  const requestPayment = async () => {
    try {
      await api.post(`/sessions/${sessionId}/payment-request`);
      setSession(
        sessionId!,
        useCustomerStore.getState().tableId!,
        "waiting_payment",
      );
      alert("Đã yêu cầu thanh toán. Vui lòng chờ nhân viên.");
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "pending":
        return "Đang chờ xác nhận";
      case "confirmed":
        return "Đang chuẩn bị";
      case "cooking":
        return "Đang nấu";
      case "done":
        return "Sắp được phục vụ";
      case "served":
        return "Đã được phục vụ ✓";
      case "cancelled":
        return "Đã huỷ";
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    if (status === "cancelled") return "var(--accent-danger)";
    if (status === "served") return "var(--accent-secondary)";
    if (status === "pending") return "var(--accent-warning)";
    return "var(--accent-primary)";
  };

  if (loading)
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
        }}
      >
        <Loader2 className="animate-spin" size={40} />
      </div>
    );

  const details = invoice?.details ?? [];

  if (sessionClosed || sessionStatus === "closed") {
    return (
      <div
        className="animate-fade-in"
        style={{ padding: "20px", paddingBottom: "100px" }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "16px",
            marginBottom: "24px",
          }}
        >
          <button className="btn-icon" onClick={() => navigate("/")}>
            <ArrowLeft size={20} />
          </button>
          <h2 style={{ margin: 0 }}>Trạng thái Đơn</h2>
        </header>

        <div
          className="glass"
          style={{
            padding: "24px 20px",
            borderRadius: "var(--border-radius-lg)",
            textAlign: "center",
          }}
        >
          <h3 style={{ marginBottom: "8px" }}>Phiên đã kết thúc</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
            Bàn đã được thanh toán và reset. Vui lòng quét lại mã QR để tạo
            phiên mới.
          </p>
          <button
            className="btn btn-primary"
            style={{ marginTop: "16px", width: "100%" }}
            onClick={() => navigate("/")}
          >
            Quét lại mã QR
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="animate-fade-in"
      style={{ padding: "20px", paddingBottom: "100px" }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "16px",
          marginBottom: "24px",
        }}
      >
        <button className="btn-icon" onClick={() => navigate("/menu")}>
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ margin: 0 }}>Trạng thái Đơn</h2>
      </header>

      <div
        className="glass"
        style={{
          padding: "24px 20px",
          borderRadius: "var(--border-radius-lg)",
          textAlign: "center",
          marginBottom: "24px",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "12px",
          }}
        >
          <div
            className="btn-icon"
            style={{
              width: "48px",
              height: "48px",
              background: "var(--glass-bg)",
              color: "var(--accent-secondary)",
            }}
          >
            <CheckCircle2 size={24} />
          </div>
        </div>
        <h3 style={{ marginBottom: "8px" }}>Đơn hàng đã được ghi nhận</h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Bạn có thể tiếp tục gọi thêm món nếu muốn.
        </p>
        <button
          className="btn btn-secondary"
          style={{ marginTop: "16px", width: "100%" }}
          onClick={() => navigate("/menu")}
        >
          Tiếp tục gọi món
        </button>
      </div>

      <h3 style={{ marginBottom: "16px" }}>Chi tiết các món đã gọi</h3>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "12px",
          marginBottom: "24px",
        }}
      >
        {details.map((detail) => (
          <div
            key={detail.id}
            className="glass"
            style={{ padding: "16px", borderRadius: "var(--border-radius-md)" }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: "8px",
              }}
            >
              <div style={{ fontWeight: 600 }}>
                <span
                  style={{ color: "var(--accent-primary)", marginRight: "8px" }}
                >
                  x{detail.quantity}
                </span>
                {detail.item_name}
              </div>
              <div style={{ fontWeight: 600 }}>
                {(detail.unit_price * detail.quantity).toLocaleString()}đ
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <span
                style={{
                  fontSize: "0.85rem",
                  color: getStatusColor(detail.cooking_status),
                  fontWeight: 600,
                }}
              >
                {getStatusText(detail.cooking_status)}
              </span>

              {detail.cooking_status === "pending" && (
                <button
                  onClick={() => handleCancelItem(detail.id)}
                  style={{
                    background: "transparent",
                    border: "1px solid var(--accent-danger)",
                    color: "var(--accent-danger)",
                    padding: "4px 12px",
                    borderRadius: "12px",
                    fontSize: "0.8rem",
                    cursor: "pointer",
                  }}
                >
                  <X
                    size={12}
                    style={{
                      display: "inline",
                      verticalAlign: "middle",
                      marginRight: "4px",
                    }}
                  />
                  Huỷ
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {invoice && details.length > 0 && (
        <div
          className="glass"
          style={{
            padding: "24px",
            borderRadius: "var(--border-radius-lg)",
            display: "flex",
            flexDirection: "column",
            gap: "16px",
          }}
        >
          <h3>Hoá đơn tạm tính</h3>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.9rem",
              color: "var(--text-secondary)",
            }}
          >
            <span>Tiền món (Subtotal):</span>
            <span>{invoice.subtotal.toLocaleString()}đ</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.9rem",
              color: "var(--text-secondary)",
            }}
          >
            <span>VAT (8%):</span>
            <span>{invoice.tax_amount.toLocaleString()}đ</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.9rem",
              color: "var(--text-secondary)",
            }}
          >
            <span>Phí phục vụ (5%):</span>
            <span>{invoice.service_charge.toLocaleString()}đ</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "1.2rem",
              fontWeight: "bold",
              paddingTop: "12px",
              borderTop: "1px solid var(--glass-border)",
            }}
          >
            <span>Tổng cộng:</span>
            <span style={{ color: "var(--accent-secondary)" }}>
              {invoice.total.toLocaleString()}đ
            </span>
          </div>

          <button
            className="btn btn-primary"
            style={{
              width: "100%",
              marginTop: "16px",
              background:
                sessionStatus === "waiting_payment"
                  ? "var(--bg-tertiary)"
                  : undefined,
            }}
            onClick={requestPayment}
            disabled={sessionStatus === "waiting_payment"}
          >
            <CreditCard size={18} />
            {sessionStatus === "waiting_payment"
              ? "Đang chờ Thu ngân..."
              : "Yêu cầu Thanh toán"}
          </button>
        </div>
      )}
    </div>
  );
}
