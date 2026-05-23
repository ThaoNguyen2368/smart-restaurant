import { useEffect, useMemo, useState, useRef } from "react"; // Thêm useRef
import {
  ChefHat, Flame, LogOut, RefreshCcw, CheckCircle2,
  Clock, CookingPot, Bell, BellOff, Ban // Thêm BellOff
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

  // --- MỚI THÊM CHO ÂM BÁO ---
  const [soundEnabled, setSoundEnabled] = useState(false);
  const prevPendingCount = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Khởi tạo file âm thanh (dùng link tiếng chuông beep ngắn mặc định)
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
      return () => {
        window.clearInterval(interval);
      };
    }

    const ws = new WebSocket(getWsUrl(token));
    ws.onmessage = () => {
      fetchQueue();
    };
    ws.onclose = () => { };

    return () => {
      ws.close();
      window.clearInterval(interval);
    };
  }, [token]);

  const grouped = useMemo(() => {
    return {
      confirmed: queue.filter((x) => x.cooking_status === "confirmed"),
      cooking: queue.filter((x) => x.cooking_status === "cooking"),
      done: queue.filter((x) => x.cooking_status === "done"),
    };
  }, [queue]);

  // --- LOGIC PHÁT ÂM THANH KHI CÓ ĐƠN MỚI ---
  useEffect(() => {
    const currentPending = grouped.confirmed.length;

    // Nếu số đơn chờ nấu hiện tại lớn hơn số đơn cũ -> Có khách mới gọi món
    if (currentPending > prevPendingCount.current) {
      if (soundEnabled && audioRef.current) {
        // Trình duyệt có thể ném lỗi nếu mạng chậm, catch lại để không crash web
        audioRef.current.play().catch(err => console.log("Lỗi phát âm thanh:", err));
      }
    }
    // Cập nhật lại số lượng cũ để dành cho lần so sánh sau
    prevPendingCount.current = currentPending;
  }, [grouped.confirmed.length, soundEnabled]);

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
      setError(typeof detail === "string" ? detail : detail?.message || "Không thể cập nhật.");
    } finally {
      setProcessingId(null);
    }
  };

  // Thêm tham số detailId để biết chính xác tờ order nào cần hủy
  const reportOutOfStock = async (itemId: number) => {
    // Không cần truyền detailId nữa
    if (!window.confirm("Báo hết món này trên toàn hệ thống? (Nhân viên phục vụ sẽ liên hệ khách để xử lý đơn hiện tại)")) return;

    try {
      setError("");

      // Gọi ĐÚNG 1 API duy nhất theo BRD Mục 7.4
      await api.post(`/menu-items/${itemId}/out-of-stock`);

      // Tải lại dữ liệu (Lưu ý: Món này vẫn sẽ nằm trên màn hình KDS cho đến khi Staff xác nhận hủy/đổi món với khách)
      await fetchQueue();

      alert("Đã khóa món thành công! Vui lòng chờ Staff xử lý đổi/hủy với khách.");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(typeof detail === "string" ? detail : detail?.message || "Lỗi báo hết món.");
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
        <div className="card-meta">
          <span>Đơn #{item.order_id} • Bàn {tableId}</span>
          {/* Bạn có thể thêm timestamp ở đây nếu backend có trả về created_at */}
        </div>

        <div className="card-title-row">
          <h4>{itemName}</h4>
          <span className="qty">x{item.quantity}</span>
        </div>

        {item.note && <div className="note">Ghi chú: {item.note}</div>}

        <div className="actions">
          {item.cooking_status === "confirmed" && (
            <>
              <button className="btn btn-primary" disabled={processingId === item.id} onClick={() => updateStatus(item.id, "cooking")}>
                <Flame size={18} /> Bắt đầu nấu
              </button>
              <button className="btn btn-outline" onClick={() => reportOutOfStock(item.item_id)}>
                <Ban size={16} /> Báo hết món
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
      {/* Sidebar */}
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

      {/* Main Board */}
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

            {/* Cột 1: Chờ nấu */}
            <section className="kanban-col col-orange">
              <div className="col-header">
                <Clock size={24} />
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span>Chờ nấu ({grouped.confirmed.length})</span>
                </div>
              </div>
              <div className="list">
                {grouped.confirmed.length === 0 ? (
                  <div className="empty-state">
                    <Clock size={48} strokeWidth={1} style={{ marginBottom: "16px" }} />
                    <p>Không có món chờ nấu</p>
                  </div>
                ) : (
                  grouped.confirmed.map(item => renderCard(item))
                )}
              </div>
            </section>

            {/* Cột 2: Đang nấu */}
            <section className="kanban-col col-blue">
              <div className="col-header">
                <CookingPot size={24} />
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span>Đang nấu ({grouped.cooking.length})</span>
                </div>
              </div>
              <div className="list">
                {grouped.cooking.length === 0 ? (
                  <div className="empty-state">
                    <CookingPot size={48} strokeWidth={1} style={{ marginBottom: "16px" }} />
                    <p>Không có món đang nấu</p>
                  </div>
                ) : (
                  grouped.cooking.map(item => renderCard(item))
                )}
              </div>
            </section>

            {/* Cột 3: Đã xong */}
            <section className="kanban-col col-green">
              <div className="col-header">
                <CheckCircle2 size={24} />
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <span>Đã xong ({grouped.done.length})</span>
                </div>
              </div>
              <div className="list">
                {grouped.done.length === 0 ? (
                  <div className="empty-state">
                    <CheckCircle2 size={48} strokeWidth={1} style={{ marginBottom: "16px" }} />
                    <p>Không có món chờ phục vụ</p>
                  </div>
                ) : (
                  grouped.done.map(item => renderCard(item))
                )}
              </div>
            </section>

          </div>
        )}
      </main>
    </div>
  );
}