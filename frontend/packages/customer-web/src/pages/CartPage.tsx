import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useCustomerStore } from "../store";
import { ArrowLeft, Trash2, Plus, Minus, Loader2 } from "lucide-react";

export default function CartPage() {
  const navigate = useNavigate();
  const { cart, removeFromCart, updateQuantity, clearCart } =
    useCustomerStore();
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
    <div className="animate-fade-in" style={{ paddingBottom: "260px" }}>
      <header
        className="glass"
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          padding: "16px 20px",
          display: "flex",
          alignItems: "center",
          gap: "16px",
        }}
      >
        <button className="btn-icon" onClick={() => navigate(-1)}>
          <ArrowLeft size={20} />
        </button>
        <h2 style={{ margin: 0 }}>Giỏ hàng</h2>
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
              padding: "40px 20px",
              color: "var(--text-secondary)",
            }}
          >
            <p>Giỏ hàng đang trống</p>
            <button
              className="btn btn-primary"
              style={{ marginTop: "20px" }}
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
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: "12px",
                  }}
                >
                  <h4 style={{ fontSize: "1.1rem", fontWeight: 600 }}>
                    {item.name}
                  </h4>
                  <button
                    className="btn-icon"
                    style={{
                      width: "32px",
                      height: "32px",
                      background: "transparent",
                      border: "none",
                      color: "var(--accent-primary)",
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
                      fontWeight: "bold",
                      color: "var(--text-secondary)",
                    }}
                  >
                    {item.price.toLocaleString()}đ
                  </span>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      background: "rgba(0,0,0,0.5)",
                      padding: "4px",
                      borderRadius: "var(--border-radius-pill)",
                    }}
                  >
                    <button
                      className="btn-icon"
                      style={{ width: "28px", height: "28px", border: "none" }}
                      onClick={() =>
                        updateQuantity(
                          item.item_id,
                          Math.max(1, item.quantity - 1),
                        )
                      }
                    >
                      <Minus size={14} />
                    </button>
                    <span
                      style={{
                        fontWeight: 600,
                        minWidth: "20px",
                        textAlign: "center",
                      }}
                    >
                      {item.quantity}
                    </span>
                    <button
                      className="btn-icon"
                      style={{ width: "28px", height: "28px", border: "none" }}
                      onClick={() =>
                        updateQuantity(item.item_id, item.quantity + 1)
                      }
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {error && (
              <p
                style={{ color: "var(--accent-primary)", textAlign: "center" }}
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
            display: "flex",
            flexDirection: "column",
            gap: "10px",
            maxWidth: "480px",
            margin: "0 auto",
            zIndex: 20,
            boxShadow: "0 -12px 30px rgba(0, 0, 0, 0.35)",
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
            <span>{subtotal.toLocaleString()}đ</span>
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
            <span>{vatAmount.toLocaleString()}đ</span>
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
            <span>{serviceCharge.toLocaleString()}đ</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "1.2rem",
              fontWeight: 700,
              paddingTop: "8px",
              borderTop: "1px solid var(--glass-border)",
            }}
          >
            <span>Tổng cộng:</span>
            <span style={{ color: "var(--accent-secondary)" }}>
              {totalEstimate.toLocaleString()}đ
            </span>
          </div>
          <button
            className="btn btn-primary"
            style={{ width: "100%", padding: "16px" }}
            onClick={handleSubmit}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              "Xác nhận Đặt món"
            )}
          </button>
        </div>
      )}
    </div>
  );
}
