import { useEffect, useMemo, useState, useRef } from "react";
import {
  ChefHat, Flame, LogOut, RefreshCcw, CheckCircle2,
  Clock, CookingPot, Bell, BellOff, Ban, AlertTriangle
} from "lucide-react";
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

export default function Dashboard() {
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  // --- ÂM BÁO ---
  const [soundEnabled, setSoundEnabled] = useState(false);
  const prevPendingCount = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- TRẠNG THÁI BÁO HẾT MÓN (item_id → true nếu đang chờ staff xử lý) ---
  const [outOfStockItemIds, setOutOfStockItemIds] = useState<Set<number>>(new Set());
  const [notifyingItemId, setNotifyingItemId] = useState<number | null>(null);

  useEffect(() => {
    audioRef.current = new Audio("https://actions.google.com/sounds/v1/alarms/beep_short.ogg");
  }, []);

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
      return () => { window.clearInterval(interval); };
    }

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      ws = new WebSocket(getWsUrl(token));
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.event === "ITEM_CANCELLED") {
            // BR-010: Xóa món khỏi hàng đợi ngay lập tức
            const { order_detail_id } = data.payload as { order_detail_id: number };
            setQueue((prev) => prev.filter((item) => item.id !== order_detail_id));
          } else if (data.event === "ITEM_SUBSTITUTED") {
            // Món đổi sang món mới: xóa trạng thái đỏ cho old_item_id
            const { old_item_id } = data.payload as { old_item_id: number; new_item_id: number };
            setOutOfStockItemIds((prev) => {
              const next = new Set(prev);
              next.delete(old_item_id);
              return next;
            });
            fetchQueue();
          } else {
            fetchQueue();
          }
        } catch { /* ignore parse errors */ }
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connectWs, 3000);
      };
      
      ws.onerror = () => {
        // ws.close() will trigger onclose
      };
    };

    connectWs();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
      window.clearInterval(interval);
    };
  }, [token]);

  const grouped = useMemo(() => ({
    confirmed: queue.filter((x) => x.cooking_status === "confirmed"),
    cooking: queue.filter((x) => x.cooking_status === "cooking"),
    done: queue.filter((x) => x.cooking_status === "done"),
  }), [queue]);

  // --- LOGIC PHÁT ÂM THANH ---
  useEffect(() => {
    const currentPending = grouped.confirmed.length;
    if (currentPending > prevPendingCount.current) {
      if (soundEnabled && audioRef.current) {
        audioRef.current.play().catch(err => console.log("Lỗi phát âm thanh:", err));
      }
    }
    prevPendingCount.current = currentPending;
  }, [grouped.confirmed.length, soundEnabled]);

  const updateStatus = async (detailId: number, status: KitchenStatus) => {
    try {
      setProcessingId(detailId);
      setError("");
      await api.patch(`/order-details/${detailId}/status`, { cooking_status: status });
      await fetchQueue();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : detail?.message || "Không thể cập nhật.");
    } finally {
      setProcessingId(null);
    }
  };

  /**
   * Báo hết nguyên liệu — CHỈ gửi thông báo WS tới Staff/Manager.
   * KHÔNG tắt món trên hệ thống (Manager mới có quyền đó).
   * Món chuyển màu đỏ trên KDS, nút bị vô hiệu hóa cho đến khi được xử lý.
   */
  const reportOutOfStock = async (itemId: number) => {
    if (!window.confirm(
      "Báo hết nguyên liệu cho món này?\n\n" +
      "• Nhân viên phục vụ sẽ được thông báo ngay.\n" +
      "• Món sẽ chuyển màu đỏ và chờ nhân viên xử lý với khách.\n" +
      "• Manager mới có thể tắt món hoàn toàn trên hệ thống."
    )) return;

    try {
      setNotifyingItemId(itemId);
      setError("");
      await api.post(`/menu-items/${itemId}/out-of-stock`);
      // Đánh dấu item này đang chờ xử lý → hiển thị màu đỏ
      setOutOfStockItemIds((prev) => new Set([...prev, itemId]));
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : detail?.message || "Lỗi báo hết món.");
    } finally {
      setNotifyingItemId(null);
    }
  };

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  const renderCard = (item: QueueItem) => {
    const itemName = item.menu_item?.name || `Món #${item.item_id}`;
    const tableId = item.order?.session?.table_id || "?";
    const isOutOfStock = outOfStockItemIds.has(item.item_id);

    return (
      <div
        className="queue-card"
        key={item.id}
        style={isOutOfStock ? {
          borderColor: "#ff4757",
          boxShadow: "0 0 0 2px rgba(255,71,87,0.25)",
          background: "rgba(255,71,87,0.07)"
        } : {}}
      >
        {isOutOfStock && (
          <div style={{
            display: "flex", alignItems: "center", gap: "6px",
            color: "#ff4757", fontWeight: 700, fontSize: "0.8rem",
            marginBottom: "8px", padding: "4px 8px",
            background: "rgba(255,71,87,0.1)", borderRadius: "6px",
          }}>
            <AlertTriangle size={14} />
            HẾT NGUYÊN LIỆU — Đang chờ Staff xử lý với khách
          </div>
        )}

        <div className="card-meta">
          <span>Đơn #{item.order_id} • Bàn {tableId}</span>
        </div>

        <div className="card-title-row">
          <h4 style={isOutOfStock ? { color: "#ff4757" } : {}}>{itemName}</h4>
          <span className="qty">x{item.quantity}</span>
        </div>

        {item.note && <div className="note">Ghi chú: {item.note}</div>}

        <div className="actions">
          {item.cooking_status === "confirmed" && (
            <>
              <button
                className="btn btn-primary"
                disabled={processingId === item.id || isOutOfStock}
                onClick={() => updateStatus(item.id, "cooking")}
                title={isOutOfStock ? "Đang chờ Staff xử lý hết nguyên liệu" : ""}
              >
                <Flame size={18} /> Bắt đầu nấu
              </button>
              <button
                className="btn btn-outline"
                onClick={() => reportOutOfStock(item.item_id)}
                disabled={isOutOfStock || notifyingItemId === item.item_id}
                title={isOutOfStock ? "Đã báo hết — đang chờ Staff xử lý" : "Báo hết nguyên liệu"}
                style={isOutOfStock ? { opacity: 0.5, cursor: "not-allowed" } : {}}
              >
                <Ban size={16} />
                {isOutOfStock ? "Đã báo hết" : "Báo hết món"}
              </button>
            </>
          )}

          {item.cooking_status === "cooking" && (
            <button className="btn btn-blue" disabled={processingId === item.id} onClick={() => updateStatus(item.id, "done")}>
              <CheckCircle2 size={18} /> Đã nấu xong
            </button>
          )}

          {item.cooking_status === "done" && (
            <button className="btn btn-success" disabled={processingId === item.id} onClick={() => updateStatus(item.id, "served")}>
              <CheckCircle2 size={18} /> Đã phục vụ
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="kitchen-layout">
      <aside className="sidebar">
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <ChefHat size={32} color="var(--status-orange)" />
          <div>
            <h2>Smart OS</h2>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>Kitchen Portal • {user?.role === "kitchen" ? "Bếp trưởng" : user?.role}</p>
          </div>
        </div>

        <div className="stats">
          <div className="stat stat-orange">
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><Clock size={20} /> Chờ nấu</span>
            <strong>{grouped.confirmed.length}</strong>
          </div>
          <div className="stat stat-blue">
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><CookingPot size={20} /> Đang nấu</span>
            <strong>{grouped.cooking.length}</strong>
          </div>
          <div className="stat stat-green">
            <span style={{ display: "flex", alignItems: "center", gap: "8px" }}><CheckCircle2 size={20} /> Đã xong</span>
            <strong>{grouped.done.length}</strong>
          </div>
          {outOfStockItemIds.size > 0 && (
            <div className="stat" style={{ background: "rgba(255,71,87,0.15)", borderLeft: "3px solid #ff4757" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "8px", color: "#ff4757" }}>
                <AlertTriangle size={20} /> Hết NL
              </span>
              <strong style={{ color: "#ff4757" }}>{outOfStockItemIds.size}</strong>
            </div>
          )}
        </div>

        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "12px" }}>
          <button className="btn btn-outline" onClick={fetchQueue}>
            <RefreshCcw size={18} /> Tải lại dữ liệu
          </button>
          <button className="btn btn-danger-outline" onClick={handleLogout} style={{ border: "none" }}>
            <LogOut size={18} /> Đăng xuất
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="content-header">
          <div>
            <h1>Hàng đợi bếp</h1>
            <p className="muted" style={{ margin: "4px 0 0 0" }}>Quản lý và theo dõi các đơn hàng trong bếp</p>
          </div>
          <button
            className={`btn ${soundEnabled ? 'btn-primary' : 'btn-outline'}`}
            style={{ borderRadius: "99px", padding: "10px 20px" }}
            onClick={() => setSoundEnabled(!soundEnabled)}
          >
            {soundEnabled ? <Bell size={18} /> : <BellOff size={18} />}
            {soundEnabled ? "Đang bật âm báo" : "Bật âm báo"}
          </button>
        </header>

        {error && <div className="error-banner">{error}</div>}

        {loading ? (
          <div className="center">Đang tải dữ liệu...</div>
        ) : (
          <div className="columns">

            <section className="kanban-col col-orange">
              <div className="col-header">
                <Clock size={24} />
                <span>Chờ nấu ({grouped.confirmed.length})</span>
              </div>
              <div className="list">
                {grouped.confirmed.length === 0 ? (
                  <div className="empty-state">
                    <Clock size={48} strokeWidth={1} style={{ marginBottom: "16px" }} />
                    <p>Không có món chờ nấu</p>
                  </div>
                ) : grouped.confirmed.map(item => renderCard(item))}
              </div>
            </section>

            <section className="kanban-col col-blue">
              <div className="col-header">
                <CookingPot size={24} />
                <span>Đang nấu ({grouped.cooking.length})</span>
              </div>
              <div className="list">
                {grouped.cooking.length === 0 ? (
                  <div className="empty-state">
                    <CookingPot size={48} strokeWidth={1} style={{ marginBottom: "16px" }} />
                    <p>Không có món đang nấu</p>
                  </div>
                ) : grouped.cooking.map(item => renderCard(item))}
              </div>
            </section>

            <section className="kanban-col col-green">
              <div className="col-header">
                <CheckCircle2 size={24} />
                <span>Đã xong ({grouped.done.length})</span>
              </div>
              <div className="list">
                {grouped.done.length === 0 ? (
                  <div className="empty-state">
                    <CheckCircle2 size={48} strokeWidth={1} style={{ marginBottom: "16px" }} />
                    <p>Không có món chờ phục vụ</p>
                  </div>
                ) : grouped.done.map(item => renderCard(item))}
              </div>
            </section>

          </div>
        )}
      </main>
    </div>
  );
}