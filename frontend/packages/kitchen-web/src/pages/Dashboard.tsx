import { useEffect, useMemo, useState } from "react";
import { ChefHat, Flame, LogOut, RefreshCcw, CheckCircle2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuthStore } from "../store";

type KitchenStatus = "confirmed" | "cooking" | "done" | "served";

interface QueueItem {
  id: number;
  order_id: number;
  item_id: number;
  quantity: number;
  unit_price: number | string;
  note?: string | null;
  cooking_status: string;
  menu_item?: {
    name?: string;
  };
  order?: {
    session_id?: number;
    session?: {
      table_id?: number;
    };
  };
}

const getWsUrl = (token: string) => {
  const base = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  const wsBase = base.replace("http", "ws").replace(/\/api\/?$/, "");
  return `${wsBase}/ws/kitchen?token=${token}`;
};

const formatVnd = (value: number | string) => {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "0đ";
  return new Intl.NumberFormat("vi-VN").format(num) + "đ";
};

export default function Dashboard() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  const fetchQueue = async () => {
    try {
      setError("");
      const res = await api.get("/kitchen/queue");
      setQueue(res.data.data ?? []);
    } catch (err: any) {
      setError(err.response?.data?.detail || "Không thể tải hàng đợi bếp.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQueue();
    const interval = window.setInterval(fetchQueue, 5000);

    if (!token) {
      return () => {
        window.clearInterval(interval);
      };
    }

    const ws = new WebSocket(getWsUrl(token));
    ws.onmessage = () => {
      fetchQueue();
    };
    ws.onclose = () => {
      // Polling fallback is always active.
    };

    return () => {
      ws.close();
      window.clearInterval(interval);
    };
  }, [token]);

  const grouped = useMemo(() => {
    return {
      pending: [] as any[],
      confirmed: queue.filter((x) => x.cooking_status === "confirmed"),
      cooking: queue.filter((x) => x.cooking_status === "cooking"),
      done: queue.filter((x) => x.cooking_status === "done"),
    };
  }, [queue]);

  const updateStatus = async (detailId: number, status: KitchenStatus) => {
    try {
      setProcessingId(detailId);
      setError("");
      await api.patch(`/order-details/${detailId}/status`, {
        cooking_status: status,
      });
      await fetchQueue();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : detail?.message || "Không thể cập nhật trạng thái món.";
      setError(message);
    } finally {
      setProcessingId(null);
    }
  };

  const reportOutOfStock = async (itemId: number) => {
    try {
      setError("");
      await api.post(`/menu-items/${itemId}/out-of-stock`);
      await fetchQueue();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      const message =
        typeof detail === "string"
          ? detail
          : detail?.message || "Không thể báo hết món.";
      setError(message);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const renderCard = (item: QueueItem) => {
    const itemName = item.menu_item?.name || `Món #${item.item_id}`;
    const tableId = item.order?.session?.table_id || "?";

    return (
      <div className="queue-card" key={item.id}>
        <div className="queue-card-top">
          <div>
            <h4>{itemName}</h4>
            <p className="muted">
              Đơn #{item.order_id} • Bàn {tableId}
            </p>
          </div>
          <span className="qty">x{item.quantity}</span>
        </div>
        <p className="muted small">Giá: {formatVnd(item.unit_price)}</p>
        {item.note && <p className="note">Ghi chú: {item.note}</p>}

        <div className="actions">
          {item.cooking_status === "confirmed" && (
            <button
              className="btn btn-primary"
              disabled={processingId === item.id}
              onClick={() => updateStatus(item.id, "cooking")}
            >
              <Flame size={16} />
              Bắt đầu nấu
            </button>
          )}

          {item.cooking_status === "cooking" && (
            <button
              className="btn btn-success"
              disabled={processingId === item.id}
              onClick={() => updateStatus(item.id, "done")}
            >
              <CheckCircle2 size={16} />
              Đánh dấu xong
            </button>
          )}

          {item.cooking_status === "done" && (
            <button
              className="btn btn-success"
              disabled={processingId === item.id}
              onClick={() => updateStatus(item.id, "served")}
            >
              <CheckCircle2 size={16} />
              Phục vụ
            </button>
          )}

          <button
            className="btn btn-secondary"
            disabled={processingId === item.id}
            onClick={() => reportOutOfStock(item.item_id)}
          >
            Báo hết món
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="kitchen-layout">
      <aside className="sidebar">
        <div>
          <h2>Smart OS</h2>
          <p className="muted">Kitchen Portal • {user?.role === "kitchen" ? "Bếp trưởng" : user?.role}</p>
        </div>
        <div className="stats">
          <div className="stat">
            <span>Chờ nấu</span>
            <strong>{grouped.confirmed.length}</strong>
          </div>
          <div className="stat">
            <span>Đang nấu</span>
            <strong>{grouped.cooking.length}</strong>
          </div>
          <div className="stat">
            <span>Đã xong</span>
            <strong>{grouped.done.length}</strong>
          </div>
        </div>
        <button className="btn btn-secondary" onClick={fetchQueue}>
          <RefreshCcw size={16} />
          Tải lại
        </button>
        <button className="btn btn-danger" onClick={handleLogout}>
          <LogOut size={16} />
          Đăng xuất
        </button>
      </aside>

      <main className="content">
        <header className="content-header">
          <h1>
            <ChefHat size={26} />
            Hàng đợi bếp
          </h1>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="center">Đang tải dữ liệu...</div>
        ) : (
          <div className="columns">
            <section>
              <h3>Chờ nấu ({grouped.confirmed.length})</h3>
              <div className="list">
                {grouped.confirmed.length === 0 ? (
                  <p className="muted">Không có món chờ nấu.</p>
                ) : (
                  <>
                    {grouped.confirmed.map(renderCard)}
                  </>
                )}
              </div>
            </section>

            <section>
              <h3>Đang nấu ({grouped.cooking.length})</h3>
              <div className="list">
                {grouped.cooking.length === 0 ? (
                  <p className="muted">Không có món đang nấu.</p>
                ) : (
                  grouped.cooking.map(renderCard)
                )}
              </div>
            </section>

            <section>
              <h3>Đã xong ({grouped.done.length})</h3>
              <div className="list">
                {grouped.done.length === 0 ? (
                  <p className="muted">Không có món chờ phục vụ.</p>
                ) : (
                  grouped.done.map(renderCard)
                )}
              </div>
            </section>
          </div>
        )}
      </main>
    </div>
  );
}
