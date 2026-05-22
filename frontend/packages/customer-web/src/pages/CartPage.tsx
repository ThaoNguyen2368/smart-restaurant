import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useCustomerStore } from "../store";
import { ArrowLeft, Trash2, Plus, Minus, Loader2 } from "lucide-react";

export default function CartPage() {
  const navigate = useNavigate();
  const { cart, removeFromCart, updateQuantity, clearCart } = useCustomerStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const subtotal = cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const vatAmount = subtotal * 0.08;
  const serviceCharge = subtotal * 0.05;
  const totalEstimate = subtotal + vatAmount + serviceCharge;

  const handleSubmit = async () => {
    if (cart.length === 0) return;
    try {
      setLoading(true);
      setError("");

      const payload = {
        items: cart.map((item) => ({
          item_id: item.item_id,
          quantity: item.quantity,
          note: item.note || undefined,
        })),
      };

      await api.post("/orders", payload);
      clearCart();
      navigate("/tracking");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail === "Invalid or closed session") {
        setError("Phiên đã hết hạn. Vui lòng quét lại mã QR để tạo phiên mới.");
        return;
      }
      setError(detail || "Lỗi khi đặt món. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  };

  return (
    // THÊM paddingTop: 80px để đẩy nội dung xuống dưới Header
    <div className="animate-fade-in" style={{ paddingTop: "80px", paddingBottom: "260px", minHeight: "100vh", background: "var(--bg-primary)" }}>
      <header
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
          background: "var(--bg-primary)", // Nền solid để không bị trong suốt khi scroll
          borderBottom: "1px solid var(--glass-border)",
        }}
      >
        <button
          className="btn-icon"
          onClick={() => navigate(-1)}
          style={{
            width: '40px', height: '40px',
            background: 'var(--glass-bg)', border: '1px solid var(--glass-border)',
            borderRadius: 'var(--border-radius-pill)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-primary)'
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 600 }}>Giỏ hàng</h2>
      </header>

      <div
        style={{
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          maxWidth: "480px",
          margin: "0 auto",
        }}
      >
        {cart.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              color: "var(--text-secondary)",
              background: "var(--glass-bg)",
              borderRadius: "var(--border-radius-md)",
              border: "1px solid var(--glass-border)",
            }}
          >
            <p style={{ fontSize: "1.1rem", marginBottom: "20px" }}>Giỏ hàng đang trống</p>
            <button
              className="btn btn-primary"
              style={{ padding: "12px 24px", borderRadius: "var(--border-radius-pill)", fontWeight: 600 }}
              onClick={() => navigate("/menu")}
            >
              Xem thực đơn
            </button>
          </div>
        ) : (
          <>
            {cart.map((item) => (
              <div
                key={item.item_id}
                className="glass"
                style={{
                  padding: "16px",
                  borderRadius: "var(--border-radius-md)",
                  border: "1px solid var(--glass-border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "16px",
                    alignItems: "flex-start"
                  }}
                >
                  <h4 style={{ fontSize: "1.05rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                    {item.name}
                  </h4>
                  <button
                    className="btn-delete-hover" // CẬP NHẬT class hover xóa
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "4px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center"
                    }}
                    onClick={() => removeFromCart(item.item_id)}
                  >
                    <Trash2 size={18} />
                  </button>
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
                      fontWeight: 700,
                      color: "var(--text-primary)",
                      fontSize: "1rem"
                    }}
                  >
                    {item.price.toLocaleString("vi-VN")}đ
                  </span>

                  {/* THIẾT KẾ LẠI BỘ ĐẾM SỐ LƯỢNG */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      background: "var(--glass-bg)",
                      border: "1px solid var(--glass-border)",
                      padding: "4px 6px",
                      borderRadius: "var(--border-radius-pill)",
                    }}
                  >
                    <button
                      className="btn-action-hover"
                      style={{
                        width: "30px", height: "30px",
                        border: "none", borderRadius: "50%",
                        background: "rgba(255,255,255,0.05)",
                        color: "var(--text-primary)",
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}
                      onClick={() =>
                        updateQuantity(
                          item.item_id,
                          Math.max(1, item.quantity - 1),
                        )
                      }
                    >
                      <Minus size={16} />
                    </button>
                    <span
                      style={{
                        fontWeight: 700,
                        minWidth: "24px",
                        textAlign: "center",
                        color: "var(--text-primary)"
                      }}
                    >
                      {item.quantity}
                    </span>
                    <button
                      className="btn-action-hover"
                      style={{
                        width: "30px", height: "30px",
                        border: "none", borderRadius: "50%",
                        background: "rgba(255,255,255,0.05)",
                        color: "var(--text-primary)",
                        display: "flex", alignItems: "center", justifyContent: "center"
                      }}
                      onClick={() =>
                        updateQuantity(item.item_id, item.quantity + 1)
                      }
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {error && (
              <p
                style={{
                  color: "var(--accent-primary)",
                  textAlign: "center",
                  background: "rgba(255, 71, 87, 0.1)",
                  padding: "12px",
                  borderRadius: "var(--border-radius-md)",
                  fontWeight: 500
                }}
              >
                {error}
              </p>
            )}
          </>
        )}
      </div>

      {cart.length > 0 && (
        <div
          className="glass"
          style={{
            position: "fixed",
            bottom: 0,
            left: 0,
            right: 0,
            padding: "20px",
            borderTopLeftRadius: "var(--border-radius-lg)",
            borderTopRightRadius: "var(--border-radius-lg)",
            borderTop: "1px solid var(--glass-border)",
            background: "var(--bg-secondary)",
            display: "flex",
            flexDirection: "column",
            gap: "12px",
            maxWidth: "480px",
            margin: "0 auto",
            zIndex: 20,
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.95rem",
              color: "var(--text-secondary)",
            }}
          >
            <span>Tiền món (Subtotal):</span>
            <span>{subtotal.toLocaleString("vi-VN")}đ</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.95rem",
              color: "var(--text-secondary)",
            }}
          >
            <span>VAT (8%):</span>
            <span>{vatAmount.toLocaleString("vi-VN")}đ</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "0.95rem",
              color: "var(--text-secondary)",
            }}
          >
            <span>Phí phục vụ (5%):</span>
            <span>{serviceCharge.toLocaleString("vi-VN")}đ</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "1.2rem",
              fontWeight: 700,
              paddingTop: "12px",
              borderTop: "1px solid var(--glass-border)",
              color: "var(--text-primary)"
            }}
          >
            <span>Tổng cộng:</span>
            <span style={{ color: "var(--accent-secondary)" }}>
              {totalEstimate.toLocaleString("vi-VN")}đ
            </span>
          </div>
          <button
            className="btn btn-primary"
            style={{
              width: "100%",
              padding: "16px",
              borderRadius: "var(--border-radius-pill)",
              fontWeight: 700,
              fontSize: "1.05rem",
              marginTop: "4px",
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              boxShadow: "var(--shadow-glow)"
            }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              "Xác nhận Đặt món"
            )}
          </button>
        </div>
      )}
    </div>
  );
}