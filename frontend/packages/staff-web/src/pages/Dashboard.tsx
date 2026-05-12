import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuthStore } from "../store";
import {
  LayoutDashboard,
  CheckSquare,
  LogOut,
  Loader2,
  Check,
  X,
} from "lucide-react";

interface Table {
  id: number;
  table_number: number;
  status: string;
  floor: string;
}

interface OrderDetail {
  id: number;
  item_id: number;
  item_name?: string;
  quantity: number;
  unit_price: number;
  note?: string;
}

interface Order {
  id: number;
  session_id: number;
  table_id: number;
  total_price: number;
  order_status: string;
  order_details: OrderDetail[];
}

interface MenuItem {
  id: number;
  name: string;
}

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"tables" | "orders">("tables");
  const [tables, setTables] = useState<Table[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [menuItemMap, setMenuItemMap] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(false);

  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  useEffect(() => {
    fetchData();
    fetchMenu();
    // Always keep polling as safety net if websocket misses events.
    const interval = setInterval(fetchData, 5000);

    // Setup WebSocket for real-time updates
    const token = localStorage.getItem("staff_token");
    let ws: WebSocket | null = null;
    if (token) {
      const base = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
      const wsBase = base.replace("http", "ws").replace(/\/api\/?$/, "");
      ws = new WebSocket(`${wsBase}/ws/staff?token=${token}`);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "TABLE_STATUS_CHANGED") {
            // Update table status in real-time
            const payload = data.payload as {
              table_id: number;
              status: string;
            };
            setTables((prev) =>
              prev.map((table) =>
                table.id === payload.table_id
                  ? { ...table, status: payload.status }
                  : table,
              ),
            );
          } else if (data.event === "PAYMENT_REQUESTED") {
            // Refresh orders when payment is requested
            fetchData();
          }
        } catch {
          return;
        }
      };
    }

    return () => {
      clearInterval(interval);
      ws?.close();
    };
  }, []);

  const fetchData = async () => {
    try {
      const [tRes, oRes] = await Promise.all([
        api.get("/tables"),
        api.get("/orders/pending"),
      ]);
      setTables(tRes.data.data);
      setPendingOrders(oRes.data.data);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setAuthError(true);
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchMenu = async () => {
    try {
      const res = await api.get("/menu");
      const items: MenuItem[] = res.data.data?.items || [];
      const map = Object.fromEntries(items.map((item) => [item.id, item.name]));
      setMenuItemMap(map);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setAuthError(true);
      }
      console.error(err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const confirmOrder = async (orderId: number) => {
    try {
      await api.patch(`/orders/${orderId}/confirm`);
      fetchData();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setAuthError(true);
      }
      console.error(err);
      alert("Lỗi xác nhận order");
    }
  };

  const rejectOrder = async (orderId: number) => {
    try {
      await api.patch(`/orders/${orderId}/reject`);
      fetchData();
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setAuthError(true);
      }
      console.error(err);
      alert("Lỗi từ chối order");
    }
  };

  const getTableColor = (status: string) => {
    if (status === "empty") return "var(--glass-bg)";
    if (status === "occupied") return "rgba(16, 185, 129, 0.2)"; // Green
    if (status === "waiting_payment") return "rgba(245, 158, 11, 0.2)"; // Yellow
    return "var(--glass-bg)";
  };

  const getTableBorder = (status: string) => {
    if (status === "empty") return "var(--glass-border)";
    if (status === "occupied") return "rgba(16, 185, 129, 0.5)";
    if (status === "waiting_payment") return "rgba(245, 158, 11, 0.5)";
    return "var(--glass-border)";
  };

  if (loading && tables.length === 0) {
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
  }

  return (
    <div className="dashboard-layout animate-fade-in">
      <aside className="sidebar glass">
        <div>
          <h2 style={{ color: "var(--accent-primary)", marginBottom: "4px" }}>
            Smart OS
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Staff Portal • {user?.role}
          </p>
        </div>

        <nav
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginTop: "24px",
            flex: 1,
          }}
        >
          <button
            className={`btn ${activeTab === "tables" ? "btn-primary" : "btn-secondary"}`}
            style={{
              justifyContent: "flex-start",
              border: activeTab === "tables" ? "none" : undefined,
            }}
            onClick={() => setActiveTab("tables")}
          >
            <LayoutDashboard size={18} />
            Sơ đồ Bàn
          </button>
          <button
            className={`btn ${activeTab === "orders" ? "btn-primary" : "btn-secondary"}`}
            style={{
              justifyContent: "flex-start",
              position: "relative",
              border: activeTab === "orders" ? "none" : undefined,
            }}
            onClick={() => setActiveTab("orders")}
          >
            <CheckSquare size={18} />
            Đơn chờ duyệt
            {pendingOrders.length > 0 && (
              <span
                style={{
                  position: "absolute",
                  right: "12px",
                  background: "var(--accent-danger)",
                  color: "white",
                  borderRadius: "12px",
                  padding: "2px 8px",
                  fontSize: "0.75rem",
                  fontWeight: "bold",
                }}
              >
                {pendingOrders.length}
              </span>
            )}
          </button>
        </nav>

        <button
          className="btn btn-secondary"
          style={{
            justifyContent: "flex-start",
            color: "var(--accent-danger)",
            borderColor: "rgba(239, 68, 68, 0.2)",
          }}
          onClick={handleLogout}
        >
          <LogOut size={18} />
          Đăng xuất
        </button>
      </aside>

      <main className="main-content">
        {authError && (
          <div
            className="glass"
            style={{
              padding: "16px 20px",
              borderRadius: "var(--border-radius-md)",
              marginBottom: "20px",
              border: "1px solid rgba(239, 68, 68, 0.4)",
              background: "rgba(239, 68, 68, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <strong style={{ color: "#fca5a5" }}>
                Phiên đăng nhập đã hết hạn.
              </strong>
              <div
                style={{ color: "var(--text-secondary)", fontSize: "0.9rem" }}
              >
                Vui lòng đăng nhập lại để tiếp tục thao tác.
              </div>
            </div>
            <button className="btn btn-secondary" onClick={handleLogout}>
              Đăng nhập lại
            </button>
          </div>
        )}
        {activeTab === "tables" && (
          <div className="animate-fade-in">
            <h2 style={{ marginBottom: "24px" }}>
              Sơ đồ Bàn ({tables.length})
            </h2>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
                gap: "20px",
              }}
            >
              {tables.map((table) => (
                <div
                  key={table.id}
                  className="glass"
                  style={{
                    padding: "24px",
                    borderRadius: "var(--border-radius-md)",
                    textAlign: "center",
                    background: getTableColor(table.status),
                    border: `1px solid ${getTableBorder(table.status)}`,
                    cursor: "pointer",
                    transition: "var(--transition-fast)",
                  }}
                >
                  <h1 style={{ margin: 0, fontSize: "2.5rem" }}>
                    {table.table_number}
                  </h1>
                  <p
                    style={{
                      fontSize: "0.85rem",
                      fontWeight: 600,
                      color:
                        table.status === "occupied"
                          ? "var(--accent-secondary)"
                          : table.status === "waiting_payment"
                            ? "var(--accent-warning)"
                            : "var(--text-secondary)",
                    }}
                  >
                    {table.status === "empty"
                      ? "Trống"
                      : table.status === "occupied"
                        ? "Có khách"
                        : "Chờ TT"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "orders" && (
          <div className="animate-fade-in">
            <h2 style={{ marginBottom: "24px" }}>Đơn hàng chờ duyệt</h2>
            {pendingOrders.length === 0 ? (
              <div
                className="glass"
                style={{
                  padding: "40px",
                  textAlign: "center",
                  borderRadius: "var(--border-radius-lg)",
                }}
              >
                <p style={{ color: "var(--text-secondary)" }}>
                  Không có đơn hàng nào đang chờ.
                </p>
              </div>
            ) : (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "16px",
                }}
              >
                {pendingOrders.map((order) => (
                  <div
                    key={order.id}
                    className="glass"
                    style={{
                      padding: "20px",
                      borderRadius: "var(--border-radius-md)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        borderBottom: "1px solid var(--glass-border)",
                        paddingBottom: "12px",
                      }}
                    >
                      <div>
                        <h3 style={{ marginBottom: "4px" }}>
                          Đơn #{order.id} - Bàn{" "}
                          {tables.find((t) => t.id === order.table_id)
                            ?.table_number || "?"}
                        </h3>
                        <p
                          style={{
                            fontSize: "0.9rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Tổng tiền:{" "}
                          <strong style={{ color: "var(--text-primary)" }}>
                            {order.total_price.toLocaleString()}đ
                          </strong>
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "12px" }}>
                        <button
                          className="btn btn-secondary"
                          style={{
                            color: "var(--accent-danger)",
                            borderColor: "rgba(239, 68, 68, 0.3)",
                          }}
                          onClick={() => rejectOrder(order.id)}
                        >
                          <X size={18} /> Từ chối
                        </button>
                        <button
                          className="btn btn-primary"
                          onClick={() => confirmOrder(order.id)}
                        >
                          <Check size={18} /> Xác nhận
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "8px",
                      }}
                    >
                      <h4
                        style={{
                          fontSize: "0.95rem",
                          color: "var(--text-secondary)",
                        }}
                      >
                        Chi tiết món:
                      </h4>
                      {order.order_details?.map((detail) => (
                        <div
                          key={detail.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            padding: "8px 12px",
                            background: "rgba(255,255,255,0.02)",
                            borderRadius: "8px",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "12px",
                              alignItems: "baseline",
                            }}
                          >
                            <span
                              style={{
                                fontWeight: "bold",
                                color: "var(--accent-primary)",
                              }}
                            >
                              x{detail.quantity}
                            </span>
                            <div>
                              <span>
                                {detail.item_name ||
                                  menuItemMap[detail.item_id] ||
                                  `Món #${detail.item_id}`}
                              </span>
                              {detail.note && (
                                <div
                                  style={{
                                    fontSize: "0.85rem",
                                    color: "var(--accent-warning)",
                                    marginTop: "4px",
                                  }}
                                >
                                  Ghi chú: {detail.note}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
