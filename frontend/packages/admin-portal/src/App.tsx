import { useState, useEffect, useRef } from "react";
import {
  LayoutDashboard,
  Utensils,
  Table as TableIcon,
  BarChart3,
  Users,
  LogOut,
  Plus,
  Edit,
  Loader2,
  Percent,
  Clock,
  Activity,
  ShieldAlert,
  X,
  Eye,
  EyeOff,
  Trash2,
  Search,
  Filter,
  UserCircle,
  Bell,
  DollarSign,
  Calendar,
} from "lucide-react";
import { api } from "./api";
import { useAuthStore } from "./store";
import "./App.css";

// ─── Helpers ───
const getLocalDateStr = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ─── Types ───
interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description?: string;
  price: string;
  image_url?: string;
  is_available: boolean;
  display_order: number;
}

interface Category {
  id: number;
  name: string;
  display_order: number;
}

interface Table {
  id: number;
  table_number: number;
  status: string;
  floor?: string;
  qr_code_url: string;
}

export default function App() {
  const { token, user, login, logout } = useAuthStore();
  const [activeTab, setActiveTab] = useState("dashboard");
  const [reportsSubTab, setReportsSubTab] = useState<"revenue" | "top-items" | "service-speed">("revenue");
  const [loading, setLoading] = useState(false);

  // Auth State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

  // Toast Notification State
  interface Toast {
    id: number;
    message: string;
    type: "success" | "warning" | "info" | "error";
  }
  const [toasts, setToasts] = useState<Toast[]>([]);


  // --- BANNER ĐẾM NGưỢC HẾT MÓN 1:30 (Manager) ---
  interface OutOfStockBanner {
    id: number;
    item_id: number;
    item_name: string;
    secondsLeft: number;
    escalated: boolean;
  }
  const [outOfStockBanners, setOutOfStockBanners] = useState<OutOfStockBanner[]>([]);
  const bannerIdRef = useRef(0);

  // Countdown tick
  useEffect(() => {
    if (outOfStockBanners.length === 0) return;
    const tick = setInterval(() => {
      setOutOfStockBanners((prev) =>
        prev
          .map((b) => {
            const next = b.secondsLeft - 1;
            if (next <= 0 && !b.escalated) return { ...b, secondsLeft: 0, escalated: true };
            return { ...b, secondsLeft: Math.max(0, next) };
          })
          .filter((b) => b.secondsLeft > 0 || !b.escalated)
      );
    }, 1000);
    return () => clearInterval(tick);
  }, [outOfStockBanners.length]);

  // WebSocket for Urgent Notifications (OUT_OF_STOCK)
  useEffect(() => {
    if (!token) return;

    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      const base = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
      const wsBase = base.replace("http", "ws").replace(/\/api\/?$/, "");
      
      try {
        ws = new WebSocket(`${wsBase}/ws/staff?token=${token}`);

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === "OUT_OF_STOCK") {
              const payload = data.payload as { item_id: number; item_name: string };
              // Khởi động countdown banner 1:30 (BR-009b — Manager nhận thông báo escalate sau 1:30)
              const bannerId = bannerIdRef.current++;
              setOutOfStockBanners((prev) => [
                ...prev.filter((b) => b.item_id !== payload.item_id),
                { id: bannerId, item_id: payload.item_id, item_name: payload.item_name, secondsLeft: 90, escalated: false },
              ]);
              // Refresh menu list
              const customEvent = new CustomEvent("menu-item-out-of-stock", { detail: payload });
              window.dispatchEvent(customEvent);
            }
          } catch (err) {
            console.error("WS error parsing message:", err);
          }
        };

        ws.onerror = (err) => console.error("WS connection error:", err);
        ws.onclose = () => {
          // Auto-reconnect after 3 seconds
          reconnectTimeout = setTimeout(connectWs, 3000);
        };
      } catch (err) {
        console.error("WS initialization failed:", err);
        reconnectTimeout = setTimeout(connectWs, 3000);
      }
    };

    connectWs();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [token]);

  // Kiểm tra vai trò và điều chuyển tab nếu không hợp lệ
  useEffect(() => {
    if (user && user.role === "manager") {
      const allowed = ["dashboard", "reports", "menu"];
      if (!allowed.includes(activeTab)) {
        setActiveTab("dashboard");
      }
    }
  }, [user, activeTab]);

  if (!token) {
    const handleLogin = async (e: React.FormEvent) => {
      e.preventDefault();
      try {
        setLoading(true);
        setAuthError("");
        const res = await api.post("/auth/login", { username, password });
        login(res.data.access_token);
      } catch (err: any) {
        setAuthError(err.response?.data?.detail || "Đăng nhập thất bại");
      } finally {
        setLoading(false);
      }
    };

    return (
      <div className="login-container animate-fade-in">
        <div className="glass login-card">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
            <div className="auth-icon" style={{ width: '80px', height: '80px', borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(245, 158, 11, 0.2)', color: '#f59e0b' }}>
              <UserCircle size={40} />
            </div>
          </div>
          <h2 style={{ textAlign: "center", marginBottom: "8px", fontWeight: 800, color: "#000000" }}>Admin Portal</h2>
          <p style={{ textAlign: "center", marginBottom: "32px", color: "#374151", fontSize: "0.9rem", fontWeight: 500 }}>Vui lòng đăng nhập để tiếp tục</p>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{ color: "#000000" }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ color: "#000000" }}
              />
            </div>
            {authError && <p className="error-text">{authError}</p>}
            <button className="btn btn-primary" disabled={loading} style={{ justifyContent: "center", padding: "14px", background: "linear-gradient(135deg, #f59e0b, #f97316)", color: "#FFFFFF", border: "none", boxShadow: "0 4px 12px rgba(245, 158, 11, 0.25)" }}>
              {loading ? <Loader2 className="animate-spin" size={18} /> : "Đăng nhập"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  const isManager = user?.role === "manager";

  return (
    <div className="admin-layout animate-fade-in">
      <aside className="sidebar glass">
        <div className="sidebar-header">
          <h2 style={{ fontWeight: 800, color: "var(--accent-primary)" }}>Smart OS</h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Portal Quản trị & Báo cáo</p>
        </div>
        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveTab("dashboard")}
          >
            <LayoutDashboard size={18} /> Dashboard
          </button>
          
          <button
            className={`nav-item ${activeTab === "menu" ? "active" : ""}`}
            onClick={() => setActiveTab("menu")}
          >
            <Utensils size={18} /> Món ăn & Menu
          </button>

          {!isManager && (
            <button
              className={`nav-item ${activeTab === "tables" ? "active" : ""}`}
              onClick={() => setActiveTab("tables")}
            >
              <TableIcon size={18} /> Sơ đồ bàn
            </button>
          )}

          <div style={{ display: "flex", flexDirection: "column" }}>
            <button
              className={`nav-item ${activeTab === "reports" ? "active" : ""}`}
              onClick={() => { setActiveTab("reports"); }}
              style={{ width: "100%" }}
            >
              <BarChart3 size={18} /> Thống kê & Báo cáo
            </button>
            {activeTab === "reports" && (
              <div style={{ paddingLeft: "16px", display: "flex", flexDirection: "column", gap: "4px", marginTop: "4px", marginBottom: "8px" }}>
                <button
                  className={`nav-item ${reportsSubTab === "revenue" ? "active" : ""}`}
                  onClick={() => setReportsSubTab("revenue")}
                  style={{ padding: "8px 12px", fontSize: "0.82rem", height: "auto" }}
                >
                  Doanh thu
                </button>
                <button
                  className={`nav-item ${reportsSubTab === "top-items" ? "active" : ""}`}
                  onClick={() => setReportsSubTab("top-items")}
                  style={{ padding: "8px 12px", fontSize: "0.82rem", height: "auto" }}
                >
                  Top 10 món bán chạy nhất
                </button>
                <button
                  className={`nav-item ${reportsSubTab === "service-speed" ? "active" : ""}`}
                  onClick={() => setReportsSubTab("service-speed")}
                  style={{ padding: "8px 12px", fontSize: "0.82rem", height: "auto" }}
                >
                  Tốc độ chuẩn bị món tại Bếp
                </button>
              </div>
            )}
          </div>
          {!isManager && (
            <>
              <button
                className={`nav-item ${activeTab === "staff" ? "active" : ""}`}
                onClick={() => setActiveTab("staff")}
              >
                <Users size={18} /> Nhân sự
              </button>
              <button
                className={`nav-item ${activeTab === "tax-config" ? "active" : ""}`}
                onClick={() => setActiveTab("tax-config")}
              >
                <Percent size={18} /> Thuế & Phí dịch vụ
              </button>
              <button
                className={`nav-item ${activeTab === "audit-logs" ? "active" : ""}`}
                onClick={() => setActiveTab("audit-logs")}
              >
                <ShieldAlert size={18} /> Nhật ký hệ thống
              </button>
            </>
          )}
        </nav>
        <button className="btn btn-secondary logout-btn" onClick={logout}>
          <LogOut size={18} /> Đăng xuất
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-header glass">
          <h1 style={{ fontWeight: 700, fontSize: "1.35rem", color: "var(--text-primary)" }}>
            {activeTab === "dashboard" && "Dashboard Tổng quan"}
            {activeTab === "menu" && "Quản lý Menu Items"}
            {activeTab === "tables" && "Quản lý Sơ đồ bàn"}
            {activeTab === "reports" && "Thống kê & Báo cáo"}
            {activeTab === "staff" && "Quản lý Nhân sự"}
            {activeTab === "tax-config" && "Cấu hình Thuế & Phí"}
            {activeTab === "audit-logs" && "Nhật ký kiểm toán (Audit Logs)"}
          </h1>
          <div className="user-info">
            <div className="notification-container">
              <Bell size={18} />
              <span className="notification-badge">5</span>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 600, fontSize: "0.95rem" }}>{user?.sub}</div>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>
                {user?.role === "admin" ? "Quản trị viên (Admin)" : "Quản lý sảnh (Manager)"}
              </span>
            </div>
            <div className="avatar" style={{ fontWeight: 700 }}>
              {user?.sub.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        {/* ===== OUT-OF-STOCK COUNTDOWN BANNERS (Manager) ===== */}
        {outOfStockBanners.length > 0 && (
          <div style={{ padding: "0 24px", display: "flex", flexDirection: "column", gap: "8px", marginTop: "8px" }}>
            {outOfStockBanners.map((banner) => {
              const mins = Math.floor(banner.secondsLeft / 60);
              const secs = banner.secondsLeft % 60;
              const isUrgent = banner.secondsLeft <= 30;
              const isEscalated = banner.escalated;
              return (
                <div
                  key={banner.id}
                  className="glass"
                  style={{
                    padding: "12px 20px",
                    borderRadius: "10px",
                    borderLeft: `4px solid ${isEscalated ? "#ff2d55" : isUrgent ? "#ff9500" : "#ff4757"}`,
                    background: isEscalated ? "rgba(255,45,85,0.1)" : "rgba(255,71,87,0.07)",
                    display: "flex", alignItems: "center", justifyContent: "space-between", gap: "16px",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <strong style={{ color: isEscalated ? "#ff2d55" : "var(--text-primary)", fontSize: "0.9rem" }}>
                      {isEscalated
                        ? `⚠️ KHẨN [Manager]: Nhân viên chưa xử lý hết món “${banner.item_name}”`
                        : `🔴 Nhà bếp báo HẾT MÓN: “${banner.item_name}”`}
                    </strong>
                    <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {isEscalated
                        ? "Nhân viên chưa xử lý xong trong 1:30. Vui lòng kiểm tra và tắt món nếu cần."
                        : "Nhân viên đang liên hệ khách để xử lý. Bạn có thể tắt món ngay trong tab Quản lý Menu."}
                    </p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "12px", flexShrink: 0 }}>
                    {!isEscalated && (
                      <div style={{ fontFamily: "monospace", fontWeight: 800, fontSize: "1.3rem", color: isUrgent ? "#ff9500" : "#ff4757", letterSpacing: "2px" }}>
                        {mins}:{String(secs).padStart(2, "0")}
                      </div>
                    )}
                    <button
                      className="btn btn-primary"
                      style={{ padding: "6px 14px", fontSize: "0.8rem" }}
                      onClick={() => { setActiveTab("menu"); setOutOfStockBanners((prev) => prev.filter((b) => b.id !== banner.id)); }}
                    >
                      Tắt món
                    </button>
                    <button
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "4px" }}
                      onClick={() => setOutOfStockBanners((prev) => prev.filter((b) => b.id !== banner.id))}
                    >
                      ✕
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <section className="admin-content">
          {activeTab === "dashboard" && <DashboardView />}
          {activeTab === "menu" && <MenuManager />}
          {activeTab === "tables" && !isManager && <TableManager />}
          {activeTab === "reports" && <ReportsView subTab={reportsSubTab} setSubTab={setReportsSubTab} />}
          {activeTab === "staff" && !isManager && <StaffManager />}
          {activeTab === "tax-config" && !isManager && <TaxConfigView />}
          {activeTab === "audit-logs" && !isManager && <AuditLogsView />}
        </section>
      </main>

      {/* Toasts Container */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-card glass ${t.type} animate-slide-in`}>
            <div className="toast-content">
              {t.type === "error" && <ShieldAlert size={18} style={{ color: "var(--accent-danger)" }} />}
              {t.type === "warning" && <ShieldAlert size={18} style={{ color: "var(--accent-secondary)" }} />}
              <span className="toast-message">{t.message}</span>
            </div>
            <button className="toast-close-btn" onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}>
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sub-Views ───

// 1. Dashboard View
function DashboardView() {
  const [stats, setStats] = useState({
    todayRevenue: 0,
    activeSessions: 0,
    waitingPayment: 0,
    loading: true,
  });

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        const todayStr = getLocalDateStr(new Date());
        const [revRes, tableRes] = await Promise.all([
          api.get("/reports/revenue", { params: { start_date: todayStr, end_date: todayStr, group_by: "day" } }),
          api.get("/tables"),
        ]);

        const totalRevenue = parseFloat(revRes.data.data?.total_revenue || "0");
        const tables: Table[] = tableRes.data.data || [];
        const activeSessions = tables.filter((t) => t.status !== "empty").length;
        const waitingPayment = tables.filter((t) => t.status === "waiting_payment").length;

        setStats({
          todayRevenue: totalRevenue,
          activeSessions,
          waitingPayment,
          loading: false,
        });
      } catch (err) {
        console.error("Lỗi tải dashboard: ", err);
        setStats((prev) => ({ ...prev, loading: false }));
      }
    };
    loadDashboardData();
  }, []);

  if (stats.loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div className="dashboard-grid animate-fade-in">
      <div className="glass stat-card">
        <DollarSign className="stat-card-icon" size={24} />
        <h3 style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>Doanh thu hôm nay</h3>
        <p className="stat-value" style={{ color: "var(--text-primary)" }}>{stats.todayRevenue.toLocaleString()}đ</p>
        <span className="stat-change">Từ các hoá đơn đã thanh toán hoàn thành</span>
      </div>
      <div className="glass stat-card">
        <Utensils className="stat-card-icon" size={24} />
        <h3 style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>Bàn đang hoạt động</h3>
        <p className="stat-value" style={{ color: "var(--text-primary)" }}>{stats.activeSessions}</p>
        <span className="stat-change">{stats.waitingPayment} bàn đang chờ thanh toán</span>
      </div>
      <div className="glass stat-card">
        <Activity className="stat-card-icon" size={24} />
        <h3 style={{ fontSize: "0.9rem", color: "var(--text-secondary)", fontWeight: 500 }}>Trạng thái kết nối</h3>
        <p className="stat-value" style={{ fontSize: "1.5rem", marginTop: "16px", display: "flex", alignItems: "center", gap: "8px", color: "#10B981" }}>
          <Activity size={24} style={{ color: "#10B981" }} /> Ổn định
        </p>
        <span className="stat-change">Đồng bộ dữ liệu thời gian thực sảnh/bếp</span>
      </div>
    </div>
  );
}

// 2. Menu Manager (Admin Only) — Enhanced with toggle, search, filter, description
function MenuManager() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<number | null>(null);

  // Filter & Search State
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAvailability, setFilterAvailability] = useState<"all" | "available" | "hidden">("all");
  const [filterCategoryId, setFilterCategoryId] = useState<number | null>(null);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editItem, setEditItem] = useState<MenuItem | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemDescription, setItemDescription] = useState("");
  const [itemPrice, setItemPrice] = useState("");
  const [itemCategoryId, setItemCategoryId] = useState("");
  const [itemAvailable, setItemAvailable] = useState(true);
  const [itemDisplayOrder, setItemDisplayOrder] = useState("0");

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<MenuItem | null>(null);

  const fetchItems = () => {
    setLoading(true);
    Promise.all([api.get("/menu-items"), api.get("/categories")])
      .then(([itemRes, catRes]) => {
        setItems(itemRes.data.data);
        setCategories(catRes.data.data || []);
      })
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchItems();

    const handleOutOfStock = () => {
      fetchItems();
    };
    window.addEventListener("menu-item-out-of-stock", handleOutOfStock);
    return () => {
      window.removeEventListener("menu-item-out-of-stock", handleOutOfStock);
    };
  }, []);

  // Filtered items
  const filteredItems = items.filter((item) => {
    if (filterAvailability === "available" && !item.is_available) return false;
    if (filterAvailability === "hidden" && item.is_available) return false;
    if (filterCategoryId !== null && item.category_id !== filterCategoryId) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return item.name.toLowerCase().includes(q) || (item.description || "").toLowerCase().includes(q);
    }
    return true;
  });

  const availableCount = items.filter(i => i.is_available).length;
  const hiddenCount = items.filter(i => !i.is_available).length;

  const openAddModal = () => {
    setEditItem(null);
    setItemName("");
    setItemDescription("");
    setItemPrice("");
    setItemCategoryId(categories[0]?.id.toString() || "");
    setItemAvailable(true);
    setItemDisplayOrder("0");
    setShowModal(true);
  };

  const openEditModal = (item: MenuItem) => {
    setEditItem(item);
    setItemName(item.name);
    setItemDescription(item.description || "");
    setItemPrice(item.price);
    setItemCategoryId(item.category_id.toString());
    setItemAvailable(item.is_available);
    setItemDisplayOrder(item.display_order?.toString() || "0");
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        name: itemName,
        description: itemDescription || undefined,
        price: parseFloat(itemPrice),
        category_id: parseInt(itemCategoryId),
        is_available: itemAvailable,
        display_order: parseInt(itemDisplayOrder) || 0,
      };

      if (editItem) {
        await api.patch(`/menu-items/${editItem.id}`, payload);
      } else {
        await api.post("/menu-items", payload);
      }
      setShowModal(false);
      fetchItems();
    } catch (err: any) {
      alert("Lỗi khi lưu món ăn: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleToggleAvailability = async (item: MenuItem) => {
    try {
      setToggling(item.id);
      await api.patch(`/menu-items/${item.id}/toggle-availability`);
      fetchItems();
    } catch (err: any) {
      alert("Lỗi khi chuyển đổi trạng thái: " + (err.response?.data?.detail || err.message));
    } finally {
      setToggling(null);
    }
  };

  const handleSoftDelete = async () => {
    if (!deleteTarget) return;
    try {
      await api.patch(`/menu-items/${deleteTarget.id}`, { is_available: false });
      setDeleteTarget(null);
      fetchItems();
    } catch (err: any) {
      alert("Lỗi khi ẩn món ăn: " + (err.response?.data?.detail || err.message));
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Stats Cards */}
      <div className="menu-stats-row">
        <div className="menu-stat-card glass">
          <Utensils size={20} style={{ color: "var(--accent-primary)" }} />
          <div>
            <span className="menu-stat-label">Tổng cộng</span>
            <span className="menu-stat-value">{items.length} món</span>
          </div>
        </div>
        <div className="menu-stat-card glass">
          <Eye size={20} style={{ color: "var(--accent-secondary)" }} />
          <div>
            <span className="menu-stat-label">Đang bán</span>
            <span className="menu-stat-value" style={{ color: "var(--accent-secondary)" }}>{availableCount} món</span>
          </div>
        </div>
        <div className="menu-stat-card glass">
          <EyeOff size={20} style={{ color: "var(--accent-danger)" }} />
          <div>
            <span className="menu-stat-label">Đã ẩn</span>
            <span className="menu-stat-value" style={{ color: "var(--accent-danger)" }}>{hiddenCount} món</span>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="menu-toolbar glass">
        <div className="menu-search-box">
          <Search size={18} style={{ color: "var(--text-tertiary)" }} />
          <input
            type="text"
            placeholder="Tìm kiếm món ăn..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="menu-search-input"
          />
        </div>
        <div className="menu-filter-group">
          <Filter size={14} style={{ color: "var(--text-secondary)" }} />
          <button
            className={`menu-filter-btn ${filterAvailability === "all" ? "active" : ""}`}
            onClick={() => setFilterAvailability("all")}
          >
            Tất cả ({items.length})
          </button>
          <button
            className={`menu-filter-btn ${filterAvailability === "available" ? "active" : ""}`}
            onClick={() => setFilterAvailability("available")}
          >
            Đang bán ({availableCount})
          </button>
          <button
            className={`menu-filter-btn ${filterAvailability === "hidden" ? "active" : ""}`}
            onClick={() => setFilterAvailability("hidden")}
          >
            Đã ẩn ({hiddenCount})
          </button>
        </div>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} /> Thêm món mới
        </button>
      </div>

      {/* Category Filter Chips */}
      {categories.length > 0 && (
        <div className="menu-category-chips">
          <button
            className={`menu-chip ${filterCategoryId === null ? "active" : ""}`}
            onClick={() => setFilterCategoryId(null)}
          >
            Tất cả danh mục
          </button>
          {categories.map((c) => (
            <button
              key={c.id}
              className={`menu-chip ${filterCategoryId === c.id ? "active" : ""}`}
              onClick={() => setFilterCategoryId(filterCategoryId === c.id ? null : c.id)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Items Table */}
      <div className="glass table-container">
        <div className="table-header">
          <h2 style={{ fontWeight: 700 }}>Danh sách Món ăn</h2>
          <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
            Hiển thị {filteredItems.length} / {items.length} món
          </span>
        </div>
        <table>
          <thead>
            <tr>
              <th>Mã</th>
              <th>Tên món</th>
              <th>Danh mục</th>
              <th>Mô tả</th>
              <th>Đơn giá</th>
              <th>Trạng thái</th>
              <th style={{ textAlign: "center" }}>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.map((item) => {
              const cat = categories.find((c) => c.id === item.category_id);
              const isHidden = !item.is_available;
              return (
                <tr key={item.id} className={isHidden ? "row-hidden-item" : ""}>
                  <td style={{ fontWeight: 600, opacity: isHidden ? 0.5 : 1 }}>#{item.id}</td>
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontWeight: 600, opacity: isHidden ? 0.5 : 1 }}>{item.name}</span>
                      {isHidden && (
                        <span className="badge-hidden-tag">
                          <EyeOff size={10} /> Đã ẩn
                        </span>
                      )}
                    </div>
                  </td>
                  <td style={{ opacity: isHidden ? 0.5 : 1 }}>{cat ? cat.name : `#${item.category_id}`}</td>
                  <td style={{ opacity: isHidden ? 0.5 : 1, maxWidth: "200px" }}>
                    <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {item.description || "—"}
                    </span>
                  </td>
                  <td style={{ fontWeight: 600, opacity: isHidden ? 0.5 : 1 }}>
                    {Number(item.price).toLocaleString()}đ
                  </td>
                  <td>
                    <span className={`badge ${item.is_available ? "success" : "danger"}`}>
                      {item.is_available ? "Còn món" : "Hết món"}
                    </span>
                  </td>
                  <td>
                    <div className="actions" style={{ justifyContent: "center" }}>
                      <button
                        className="btn-icon"
                        onClick={() => handleToggleAvailability(item)}
                        disabled={toggling === item.id}
                        title={item.is_available ? "Ẩn khỏi menu (hết món)" : "Hiện lại trên menu (có món)"}
                        style={{ color: item.is_available ? "var(--accent-danger)" : "var(--accent-secondary)" }}
                      >
                        {toggling === item.id ? (
                          <Loader2 className="animate-spin" size={14} />
                        ) : item.is_available ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                      <button className="btn-icon" onClick={() => openEditModal(item)} title="Chỉnh sửa">
                        <Edit size={14} />
                      </button>
                      {item.is_available && (
                        <button
                          className="btn-icon danger"
                          onClick={() => setDeleteTarget(item)}
                          title="Ẩn món ăn (soft delete)"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredItems.length === 0 && (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", padding: "40px", color: "var(--text-secondary)" }}>
                  {searchQuery || filterAvailability !== "all" || filterCategoryId !== null
                    ? "Không tìm thấy món ăn phù hợp với bộ lọc."
                    : "Chưa có món ăn nào. Hãy thêm món mới!"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container glass animate-fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h3 style={{ margin: 0, fontWeight: 700 }}>{editItem ? "Chỉnh sửa món ăn" : "Thêm món ăn mới"}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Tên món ăn</label>
                <input
                  type="text"
                  value={itemName}
                  onChange={(e) => setItemName(e.target.value)}
                  placeholder="Ví dụ: Phở Bò, Cà phê sữa đá..."
                  required
                />
              </div>
              <div className="form-group">
                <label>Mô tả (tuỳ chọn)</label>
                <textarea
                  value={itemDescription}
                  onChange={(e) => setItemDescription(e.target.value)}
                  placeholder="Mô tả ngắn về món ăn, nguyên liệu, cách chế biến..."
                  rows={3}
                  className="menu-textarea"
                />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
                <div className="form-group">
                  <label>Đơn giá (VNĐ)</label>
                  <input
                    type="number"
                    value={itemPrice}
                    onChange={(e) => setItemPrice(e.target.value)}
                    placeholder="Ví dụ: 45000"
                    required
                    min="0"
                  />
                </div>
                <div className="form-group">
                  <label>Danh mục</label>
                  <select value={itemCategoryId} onChange={(e) => setItemCategoryId(e.target.value)} required>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Thứ tự hiển thị</label>
                <input
                  type="number"
                  value={itemDisplayOrder}
                  onChange={(e) => setItemDisplayOrder(e.target.value)}
                  placeholder="0"
                  min="0"
                />
              </div>
              <div className="form-group" style={{ flexDirection: "row", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                <input
                  type="checkbox"
                  id="menu_is_available"
                  checked={itemAvailable}
                  onChange={(e) => setItemAvailable(e.target.checked)}
                  style={{ width: "18px", height: "18px", margin: 0 }}
                />
                <label htmlFor="menu_is_available" style={{ cursor: "pointer", userSelect: "none" }}>Mở bán món ăn này</label>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "32px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Huỷ
                </button>
                <button type="submit" className="btn btn-primary">
                  {editItem ? "Cập nhật" : "Tạo món"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-container glass animate-fade-in" style={{ maxWidth: "420px", textAlign: "center" }}>
            <div className="delete-confirm-icon">
              <EyeOff size={32} />
            </div>
            <h3 style={{ marginBottom: "12px", fontWeight: 700 }}>Ẩn món "{deleteTarget.name}"?</h3>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginBottom: "28px", lineHeight: "1.6" }}>
              Món ăn sẽ bị ẩn khỏi menu khách hàng.<br />
              Bạn có thể bật lại bất cứ lúc nào bằng nút <strong>"Hiện"</strong>.
            </p>
            <div style={{ display: "flex", justifyContent: "center", gap: "12px" }}>
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Huỷ
              </button>
              <button
                className="btn"
                style={{ background: "var(--accent-danger)", color: "white" }}
                onClick={handleSoftDelete}
              >
                <EyeOff size={16} /> Xác nhận ẩn
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 3. Table Manager (Admin Only)
function TableManager() {
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editTable, setEditTable] = useState<Table | null>(null);
  const [tableNumber, setTableNumber] = useState("");
  const [tableFloor, setTableFloor] = useState("Tầng 1");
  const [qrCodeUrl, setQrCodeUrl] = useState("");

  const fetchTables = () => {
    setLoading(true);
    api.get("/tables")
      .then((res) => setTables(res.data.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchTables();
  }, []);

  const openAddModal = () => {
    setEditTable(null);
    setTableNumber("");
    setTableFloor("Tầng 1");
    setQrCodeUrl("");
    setShowModal(true);
  };

  const openEditModal = (t: Table) => {
    setEditTable(t);
    setTableNumber(t.table_number.toString());
    setTableFloor(t.floor || "Tầng 1");
    setQrCodeUrl(t.qr_code_url);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editTable) {
        await api.patch(`/tables/${editTable.id}`, {
          table_number: parseInt(tableNumber),
          floor: tableFloor,
          qr_code_url: qrCodeUrl,
        });
      } else {
        // Chú ý: create_table ở backend dùng Query Parameters
        const qr = qrCodeUrl || `http://localhost:3000/table/${tableNumber}`;
        await api.post("/tables", null, {
          params: {
            table_number: parseInt(tableNumber),
            floor: tableFloor,
            qr_code_url: qr,
          },
        });
      }
      setShowModal(false);
      fetchTables();
    } catch (err: any) {
      alert("Lỗi khi lưu bàn: " + (err.response?.data?.detail || err.message));
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div className="glass table-container animate-fade-in">
      <div className="table-header">
        <h2 style={{ fontWeight: 700 }}>Sơ đồ bàn nhà hàng</h2>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} /> Thêm bàn mới
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Số Bàn</th>
            <th>Vị trí (Tầng)</th>
            <th>Trạng thái</th>
            <th>Mã QR code</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((t) => (
            <tr key={t.id}>
              <td style={{ fontWeight: 600 }}>Bàn {t.table_number}</td>
              <td>{t.floor || "Tầng 1"}</td>
              <td>
                <span className={`badge ${t.status === "empty" ? "success" : t.status === "waiting_payment" ? "danger" : "info"}`}>
                  {t.status === "empty" ? "Trống" : t.status === "waiting_payment" ? "Chờ thanh toán" : "Có khách"}
                </span>
              </td>
              <td>
                <a href={t.qr_code_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-primary)", textDecoration: "none", fontWeight: 500 }}>
                  Xem QR Code
                </a>
              </td>
              <td>
                <div className="actions">
                  <button className="btn-icon" onClick={() => openEditModal(t)}>
                    <Edit size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal Form */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container glass animate-fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h3 style={{ margin: 0, fontWeight: 700 }}>{editTable ? "Chỉnh sửa bàn" : "Thêm bàn mới"}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Số bàn</label>
                <input
                  type="number"
                  value={tableNumber}
                  onChange={(e) => setTableNumber(e.target.value)}
                  placeholder="Ví dụ: 12"
                  required
                  disabled={!!editTable}
                />
              </div>
              <div className="form-group">
                <label>Vị trí (Tầng / Khu vực)</label>
                <input
                  type="text"
                  value={tableFloor}
                  onChange={(e) => setTableFloor(e.target.value)}
                  placeholder="Ví dụ: Tầng 1, Ban công..."
                  required
                />
              </div>
              <div className="form-group">
                <label>URL Mã QR (Tuỳ chọn)</label>
                <input
                  type="text"
                  value={qrCodeUrl}
                  onChange={(e) => setQrCodeUrl(e.target.value)}
                  placeholder="Tự động phát sinh nếu để trống"
                />
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "32px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Huỷ
                </button>
                <button type="submit" className="btn btn-primary">
                  {editTable ? "Cập nhật" : "Tạo bàn"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// 4. Reports View
function ReportsView({
  subTab,
  setSubTab,
}: {
  subTab: "revenue" | "top-items" | "service-speed";
  setSubTab: (tab: "revenue" | "top-items" | "service-speed") => void;
}) {
  const [loading, setLoading] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState(getLocalDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [endDate, setEndDate] = useState(getLocalDateStr(new Date()));
  const [groupBy, setGroupBy] = useState<"day" | "week" | "month">("day");

  // Data
  const [revReport, setRevReport] = useState<any>(null);
  const [topItems, setTopItems] = useState<any[]>([]);
  const [speedData, setSpeedData] = useState<any>(null);

  // Chart hover state
  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  const fetchRevenue = async () => {
    setLoading(true);
    try {
      const res = await api.get("/reports/revenue", {
        params: { start_date: startDate, end_date: endDate, group_by: groupBy },
      });
      setRevReport(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchTopItems = async () => {
    setLoading(true);
    try {
      const res = await api.get("/reports/top-items", { params: { limit: 10 } });
      setTopItems(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSpeed = async () => {
    setLoading(true);
    try {
      const res = await api.get("/reports/service-speed");
      setSpeedData(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (subTab === "revenue") {
      fetchRevenue();
    } else if (subTab === "top-items") {
      fetchTopItems();
    } else if (subTab === "service-speed") {
      fetchSpeed();
    }
  }, [subTab, startDate, endDate, groupBy]);

  // Tìm giá trị doanh thu lớn nhất để tính chiều cao cột
  const maxRevenue = revReport?.data?.length
    ? Math.max(...revReport.data.map((d: any) => parseFloat(d.revenue)))
    : 0;

  // Render modern SVG Line Chart
  const renderLineChart = () => {
    const data = revReport?.data || [];
    if (data.length === 0) {
      return (
        <div style={{ height: "240px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "0.9rem" }}>
          Chưa có dữ liệu giao dịch trong khoảng thời gian này.
        </div>
      );
    }

    const width = 800;
    const height = 240;
    const paddingLeft = 60;
    const paddingRight = 20;
    const paddingTop = 20;
    const paddingBottom = 40;

    const chartWidth = width - paddingLeft - paddingRight;
    const chartHeight = height - paddingTop - paddingBottom;
    const maxVal = maxRevenue > 0 ? maxRevenue : 10000;

    const points = data.map((d: any, i: number) => {
      const val = parseFloat(d.revenue) || 0;
      const x = paddingLeft + (i / Math.max(1, data.length - 1)) * chartWidth;
      const y = paddingTop + (1 - val / maxVal) * chartHeight;
      return { x, y, val, date: d.date };
    });

    let linePath = "";
    let areaPath = "";

    if (points.length > 0) {
      linePath = points.map((p: any, i: number) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
      areaPath = `${linePath} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;
    }

    const gridLines = [];
    const yTicksCount = 4;
    for (let i = 0; i <= yTicksCount; i++) {
      const yVal = (i / yTicksCount) * maxVal;
      const y = paddingTop + (1 - i / yTicksCount) * chartHeight;
      gridLines.push({ y, val: yVal });
    }

    return (
      <div className="chart-svg-container">
        {hoveredPoint && (
          <div
            className="chart-tooltip"
            style={{
              left: `${(hoveredPoint.x / width) * 100}%`,
              top: `${(hoveredPoint.y / height) * 100}%`,
              opacity: 1,
            }}
          >
            <div style={{ fontSize: "0.7rem", color: "#9CA3AF", marginBottom: "2px" }}>{hoveredPoint.date}</div>
            <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "#FFFFFF" }}>{hoveredPoint.val.toLocaleString()}đ</div>
          </div>
        )}

        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height="240px" style={{ overflow: "visible" }}>
          <defs>
            <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.2" />
              <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {gridLines.map((line, idx) => (
            <g key={idx}>
              <line
                x1={paddingLeft}
                y1={line.y}
                x2={width - paddingRight}
                y2={line.y}
                className="chart-grid-line"
              />
              <text
                x={paddingLeft - 12}
                y={line.y + 4}
                className="chart-label-y"
              >
                {line.val >= 1000000
                  ? `${(line.val / 1000000).toFixed(1)}M`
                  : line.val >= 1000
                    ? `${(line.val / 1000).toFixed(0)}k`
                    : line.val}
              </text>
            </g>
          ))}

          {/* Gradient area */}
          {areaPath && (
            <path
              d={areaPath}
              fill="url(#chart-area-grad)"
            />
          )}

          {/* Line Path */}
          {linePath && (
            <path
              d={linePath}
              className="chart-line-path"
            />
          )}

          {/* X Axis line */}
          <line
            x1={paddingLeft}
            y1={height - paddingBottom}
            x2={width - paddingRight}
            y2={height - paddingBottom}
            className="chart-axis-line"
          />

          {/* Dots */}
          {points.map((p: any, idx: number) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={hoveredPoint && hoveredPoint.date === p.date ? 6 : 4}
              className="chart-dot"
              onMouseEnter={() => setHoveredPoint(p)}
              onMouseLeave={() => setHoveredPoint(null)}
            />
          ))}

          {/* X Labels */}
          {points.map((p: any, idx: number) => {
            const showLabel = points.length < 12 || idx % Math.ceil(points.length / 8) === 0 || idx === points.length - 1;
            if (!showLabel) return null;
            return (
              <text
                key={idx}
                x={p.x}
                y={height - paddingBottom + 20}
                className="chart-label-text"
              >
                {p.date.substring(5)}
              </text>
            );
          })}
        </svg>
      </div>
    );
  };

  return (
    <div className="reports-view animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* Sub Tabs */}
      <div className="filter-bar" style={{ marginBottom: 0 }}>
        <button className={`filter-btn ${subTab === "revenue" ? "active" : ""}`} onClick={() => setSubTab("revenue")}>
          <BarChart3 size={14} /> Doanh thu
        </button>
        <button className={`filter-btn ${subTab === "top-items" ? "active" : ""}`} onClick={() => setSubTab("top-items")}>
          <Utensils size={14} /> Top 10 món ăn bán chạy nhất
        </button>
        <button className={`filter-btn ${subTab === "service-speed" ? "active" : ""}`} onClick={() => setSubTab("service-speed")}>
          <Clock size={14} /> Tốc độ chuẩn bị món ăn tại Bếp
        </button>
      </div>

      {loading && (
        <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
          <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
        </div>
      )}

      {!loading && subTab === "revenue" && (
        <div className="glass report-card animate-fade-in" style={{ padding: "24px", borderRadius: "16px" }}>
          <div className="report-filters">
            <div className="form-group" style={{ marginBottom: 0, position: "relative" }}>
              <label>Từ ngày</label>
              <div style={{ position: "relative" }}>
                <Calendar size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ paddingLeft: "36px" }} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0, position: "relative" }}>
              <label>Đến ngày</label>
              <div style={{ position: "relative" }}>
                <Calendar size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "var(--text-tertiary)", pointerEvents: "none" }} />
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} style={{ paddingLeft: "36px" }} />
              </div>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Nhóm theo</label>
              <select value={groupBy} onChange={(e) => setGroupBy(e.target.value as any)}>
                <option value="day">Theo ngày</option>
                <option value="week">Theo tuần</option>
                <option value="month">Theo tháng</option>
              </select>
            </div>
          </div>

          {/* Stats summary */}
          <div className="report-stats-grid">
            <div className="report-summary-card">
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>Tổng doanh thu thực tế</span>
              <p style={{ fontSize: "1.9rem", fontWeight: 800, margin: "8px 0 0 0", color: "var(--accent-secondary)", letterSpacing: "-0.02em" }}>
                {parseFloat(revReport?.total_revenue || "0").toLocaleString()}đ
              </p>
            </div>
            <div className="report-summary-card">
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>Tổng số lượt thanh toán</span>
              <p style={{ fontSize: "1.9rem", fontWeight: 800, margin: "8px 0 0 0", color: "var(--text-primary)", letterSpacing: "-0.02em" }}>
                {revReport?.transaction_count || 0} giao dịch
              </p>
            </div>
          </div>

          {/* SVG Chart */}
          <div className="chart-container">
            <h4 style={{ marginBottom: "16px", fontWeight: 700, fontSize: "0.95rem", color: "var(--text-primary)" }}>Biểu đồ tăng trưởng</h4>
            {renderLineChart()}
          </div>

          {/* Detail Table */}
          <div className="glass table-container" style={{ marginTop: "24px" }}>
            <div className="table-header">
              <h4 style={{ margin: 0, fontWeight: 700 }}>Chi tiết báo cáo</h4>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Thời gian</th>
                  <th style={{ textAlign: "right" }}>Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {revReport?.data?.slice().reverse().map((d: any) => (
                  <tr key={d.date}>
                    <td>{d.date}</td>
                    <td style={{ textAlign: "right", fontWeight: 600 }}>{parseFloat(d.revenue).toLocaleString()}đ</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && subTab === "top-items" && (
        <div className="glass report-card animate-fade-in" style={{ padding: "24px", borderRadius: "16px" }}>
          <h3 style={{ marginBottom: "20px", fontWeight: 700 }}>Top 10 món ăn bán chạy nhất</h3>
          <div className="glass table-container">
            <table>
              <thead>
                <tr>
                  <th>Thứ hạng</th>
                  <th>Tên món ăn</th>
                  <th style={{ textAlign: "right" }}>Số lượng đã bán</th>
                </tr>
              </thead>
              <tbody>
                {topItems.map((item, index) => (
                  <tr key={item.item_id}>
                    <td>
                      <span
                        className={`badge`}
                        style={{
                          background: index === 0 ? "rgba(245, 158, 11, 0.2)" : index === 1 ? "rgba(161, 161, 170, 0.2)" : index === 2 ? "rgba(180, 83, 9, 0.15)" : "rgba(255,255,255,0.03)",
                          color: index === 0 ? "#f59e0b" : index === 1 ? "#a1a1aa" : index === 2 ? "#b45309" : "var(--text-primary)",
                          padding: "6px 12px",
                          borderRadius: "50%",
                        }}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                    <td style={{ textAlign: "right", fontWeight: 700, color: "var(--accent-primary)" }}>{item.total_sold} phần</td>
                  </tr>
                ))}
                {topItems.length === 0 && (
                  <tr>
                    <td colSpan={3} style={{ textAlign: "center", color: "var(--text-secondary)", padding: "20px" }}>
                      Chưa ghi nhận món ăn nào đã bán thành công.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && subTab === "service-speed" && (
        <div className="glass report-card animate-fade-in" style={{ padding: "24px", borderRadius: "16px" }}>
          <h3 style={{ marginBottom: "20px", fontWeight: 700 }}>Tốc độ chuẩn bị món ăn tại Bếp</h3>
          <div className="report-stats-grid">
            <div className="report-summary-card" style={{ borderLeft: "4px solid var(--accent-primary)" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Thời gian phục vụ trung bình</span>
              <p style={{ fontSize: "2.4rem", fontWeight: 800, margin: "8px 0 0 0", color: "var(--accent-primary)" }}>
                {speedData?.average_service_time_minutes || 0} phút
              </p>
            </div>
            <div className="report-summary-card">
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>Kích thước mẫu kiểm tra</span>
              <p style={{ fontSize: "1.8rem", fontWeight: 700, margin: "8px 0 0 0" }}>
                {speedData?.sample_size || 0} món
              </p>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "block", marginTop: "4px" }}>
                Số món hoàn thành gần nhất
              </span>
            </div>
          </div>
          <div style={{ marginTop: "24px", padding: "16px", borderRadius: "8px", background: "rgba(255,255,255,0.01)", border: "1px solid var(--glass-border)", fontSize: "0.9rem", lineHeight: "1.6", color: "var(--text-secondary)" }}>
            💡 <strong style={{ color: "var(--text-primary)" }}>Lưu ý:</strong> Tốc độ phục vụ được tính từ thời điểm khách hàng/phục vụ gửi đơn đặt bếp cho đến khi món ăn được bấm "Phục vụ" tại sảnh. Số liệu trung bình lý tưởng của nhà hàng là <span style={{ color: "var(--accent-secondary)", fontWeight: 600 }}>10-15 phút</span>.
          </div>
        </div>
      )}
    </div>
  );
}

// 5. Staff Manager (Admin Only)
function StaffManager() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [editUser, setEditUser] = useState<any | null>(null);
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("staff");
  const [isActive, setIsActive] = useState(true);

  const fetchUsers = () => {
    setLoading(true);
    api.get("/staff-users")
      .then((res) => setUsers(res.data.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openAddModal = () => {
    setEditUser(null);
    setUsername("");
    setDisplayName("");
    setPassword("");
    setRole("staff");
    setIsActive(true);
    setShowModal(true);
  };

  const openEditModal = (u: any) => {
    setEditUser(u);
    setUsername(u.username);
    setDisplayName(u.display_name);
    setPassword(""); // Để trống nếu không muốn đổi mật khẩu
    setRole(u.role);
    setIsActive(u.is_active);
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (editUser) {
        const payload: any = {
          display_name: displayName,
          role: role,
          is_active: isActive,
        };
        if (password) {
          if (password.length < 8) {
            alert("Mật khẩu mới phải dài tối thiểu 8 ký tự!");
            return;
          }
          payload.password = password;
        }
        await api.patch(`/staff-users/${editUser.id}`, payload);
      } else {
        if (password.length < 8) {
          alert("Mật khẩu phải dài tối thiểu 8 ký tự!");
          return;
        }
        await api.post("/staff-users", {
          username,
          display_name: displayName,
          password,
          role,
        });
      }
      setShowModal(false);
      fetchUsers();
    } catch (err: any) {
      alert("Lỗi lưu nhân sự: " + (err.response?.data?.detail || err.message));
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div className="glass table-container animate-fade-in">
      <div className="table-header">
        <h2 style={{ fontWeight: 700 }}>Quản lý Nhân sự</h2>
        <button className="btn btn-primary" onClick={openAddModal}>
          <Plus size={16} /> Thêm nhân viên
        </button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Tên Đăng nhập</th>
            <th>Tên hiển thị</th>
            <th>Vai trò</th>
            <th>Trạng thái hoạt động</th>
            <th>Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td style={{ fontWeight: 600 }}>{u.username}</td>
              <td>{u.display_name}</td>
              <td>
                <span style={{ fontSize: "0.8rem", textTransform: "capitalize", background: "rgba(255,255,255,0.04)", padding: "4px 8px", borderRadius: "4px" }}>
                  {u.role}
                </span>
              </td>
              <td>
                <span className={`badge ${u.is_active ? "success" : "danger"}`}>
                  {u.is_active ? "Đang mở khoá" : "Đã khoá"}
                </span>
              </td>
              <td>
                <div className="actions">
                  <button className="btn-icon" onClick={() => openEditModal(u)}>
                    <Edit size={14} />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Modal form */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-container glass animate-fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
              <h3 style={{ margin: 0, fontWeight: 700 }}>{editUser ? "Sửa tài khoản nhân sự" : "Tạo tài khoản nhân sự"}</h3>
              <button className="btn-icon" onClick={() => setShowModal(false)}>
                <X size={16} />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Ví dụ: staff_loc"
                  required
                  disabled={!!editUser}
                />
              </div>
              <div className="form-group">
                <label>Tên hiển thị</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Văn Lộc"
                  required
                />
              </div>
              <div className="form-group">
                <label>{editUser ? "Mật khẩu mới (Bỏ trống nếu không đổi)" : "Mật khẩu"}</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editUser ? "Tối thiểu 8 ký tự" : "Tối thiểu 8 ký tự"}
                  required={!editUser}
                />
              </div>
              <div className="form-group">
                <label>Vai trò</label>
                <select value={role} onChange={(e) => setRole(e.target.value)} required>
                  <option value="staff">Waiter (Phục vụ)</option>
                  <option value="cashier">Cashier (Thu ngân)</option>
                  <option value="manager">Manager (Quản lý)</option>
                  <option value="kitchen">Kitchen (Đầu bếp)</option>
                  <option value="admin">Admin (Cấp cao nhất)</option>
                </select>
              </div>
              {editUser && (
                <div className="form-group" style={{ flexDirection: "row", alignItems: "center", gap: "10px", marginTop: "10px" }}>
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={isActive}
                    onChange={(e) => setIsActive(e.target.checked)}
                    style={{ width: "18px", height: "18px", margin: 0 }}
                  />
                  <label htmlFor="is_active" style={{ cursor: "pointer", userSelect: "none" }}>Kích hoạt tài khoản</label>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "32px" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Huỷ
                </button>
                <button type="submit" className="btn btn-primary">
                  {editUser ? "Lưu thay đổi" : "Tạo tài khoản"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// 6. Tax Config View (Admin Only)
function TaxConfigView() {
  const [configs, setConfigs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Form State
  const [vatRate, setVatRate] = useState("0.08");
  const [serviceChargeRate, setServiceChargeRate] = useState("0.05");
  const [effectiveFrom, setEffectiveFrom] = useState(getLocalDateStr(new Date()));

  const fetchConfigs = () => {
    setLoading(true);
    api.get("/tax-config")
      .then((res) => setConfigs(res.data.data))
      .catch((err) => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchConfigs();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Gọi POST /api/tax-config sử dụng Query Parameters
      await api.post("/tax-config", null, {
        params: {
          vat_rate: parseFloat(vatRate),
          service_charge_rate: parseFloat(serviceChargeRate),
          effective_from: effectiveFrom,
        },
      });
      alert("Đã lưu cấu hình thuế phí mới thành công!");
      fetchConfigs();
    } catch (err: any) {
      alert("Lỗi lưu cấu hình: " + (err.response?.data?.detail || err.message));
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div className="animate-fade-in" style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "24px" }}>
      {/* Form Cấu hình */}
      <div className="glass" style={{ padding: "24px", borderRadius: "16px", height: "fit-content" }}>
        <h3 style={{ marginBottom: "20px", fontWeight: 700 }}>Thiết lập Thuế & Phí mới</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Thuế giá trị gia tăng - VAT (Tỉ lệ, VD: 0.08 = 8%)</label>
            <input
              type="number"
              step="0.01"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
              placeholder="VD: 0.08"
              required
            />
          </div>
          <div className="form-group">
            <label>Phí phục vụ - Service Charge (Tỉ lệ, VD: 0.05 = 5%)</label>
            <input
              type="number"
              step="0.01"
              value={serviceChargeRate}
              onChange={(e) => setServiceChargeRate(e.target.value)}
              placeholder="VD: 0.05"
              required
            />
          </div>
          <div className="form-group">
            <label>Ngày bắt đầu hiệu lực</label>
            <input
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: "16px", width: "100%", justifyContent: "center" }}>
            Lưu và Áp dụng
          </button>
        </form>
      </div>

      {/* Lịch sử cấu hình */}
      <div className="glass table-container">
        <div className="table-header">
          <h3 style={{ margin: 0, fontWeight: 700 }}>Lịch sử Cấu hình Thuế phí</h3>
        </div>
        <table>
          <thead>
            <tr>
              <th>Ngày hiệu lực</th>
              <th>Thuế VAT</th>
              <th>Phí dịch vụ</th>
            </tr>
          </thead>
          <tbody>
            {configs.map((c) => (
              <tr key={c.id}>
                <td style={{ fontWeight: 600 }}>{c.effective_from}</td>
                <td>{parseFloat(c.vat_rate) * 100}%</td>
                <td>{parseFloat(c.service_charge_rate) * 100}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 7. Audit Logs View (Admin Only)
function AuditLogsView() {
  const [logs, setLogs] = useState<any[]>([]);

  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const fetchLogs = (cursorVal: number | null, isMore = false) => {
    if (isMore) setLoadingMore(true);
    else setLoading(true);

    api.get("/audit-logs", { params: cursorVal ? { cursor: cursorVal } : {} })
      .then((res) => {
        const payload = res.data.data;
        if (isMore) {
          setLogs((prev) => [...prev, ...payload.logs]);
        } else {
          setLogs(payload.logs);
        }
        setNextCursor(payload.next_cursor);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        setLoading(false);
        setLoadingMore(false);
      });
  };

  useEffect(() => {
    fetchLogs(null);
  }, []);

  const handleLoadMore = () => {
    if (nextCursor) {
      fetchLogs(nextCursor, true);
    }
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div className="glass table-container animate-fade-in">
      <div className="table-header">
        <h2 style={{ fontWeight: 700 }}>Nhật ký hoạt động hệ thống</h2>
      </div>
      <table>
        <thead>
          <tr>
            <th>Thời gian</th>
            <th>Đối tượng</th>
            <th>Hành động</th>
            <th>Thao tác chi tiết</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => {
            const date = new Date(log.created_at).toLocaleString("vi-VN");
            return (
              <tr key={log.id}>
                <td style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>{date}</td>
                <td>
                  <span style={{ fontSize: "0.78rem", background: "rgba(255,255,255,0.03)", padding: "3px 6px", borderRadius: "4px" }}>
                    {log.actor_type.toUpperCase()}
                  </span>
                </td>
                <td style={{ fontWeight: 600 }}>{log.action}</td>
                <td>
                  <div style={{ fontSize: "0.85rem" }}>
                    Chỉnh sửa {log.entity_type} #{log.entity_id}
                  </div>
                  {log.reason && (
                    <div className="log-row-details">
                      Lý do: <span style={{ fontStyle: "italic", color: "var(--accent-danger)" }}>"{log.reason}"</span>
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {nextCursor && (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px" }}>
          <button className="btn btn-secondary" onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? <Loader2 className="animate-spin" size={16} /> : "Tải thêm lịch sử"}
          </button>
        </div>
      )}
    </div>
  );
}
