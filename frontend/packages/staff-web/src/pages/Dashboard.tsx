import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuthStore } from "../store";
import {
  LayoutGrid,
  ClipboardList,
  Info,
  Check,
  X,
  Plus,
  Minus,
  Clock,
  Users,
  Coffee,
  DollarSign,
  AlertCircle,
  ArrowLeftRight,
  Loader2,
  Trash2,
  Bell,
  Search,
  GitMerge,
  SlidersHorizontal,
  ChevronDown,
  LogOut,
  Wifi,
} from "lucide-react";

/* ================================================================
   TYPES
   ================================================================ */

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
  cooking_status: string;
  cancel_reason?: string;
}

interface Order {
  id: number;
  session_id: number;
  table_id: number;
  subtotal: number;
  tax_amount: number;
  service_charge: number;
  total_price: number;
  order_status: string;
  order_details: OrderDetail[];
}

interface MenuItem {
  id: number;
  name: string;
  price: string;
  description?: string;
  image_url?: string;
  is_available: boolean;
  category_id: number;
}

interface Toast {
  id: number;
  message: string;
  type: "success" | "warning" | "info" | "error";
}

/* ================================================================
   HELPERS
   ================================================================ */

const getTableCapacity = (tableNum: number) => {
  if (tableNum <= 4) return 2;
  if (tableNum <= 10) return 5;
  return 8;
};

const padNumber = (n: number) => String(n).padStart(2, "0");

/* Simple chair/table SVG icon matching the screenshot */
const TableSvgIcon = ({ size = 28 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 8C4 6.89543 4.89543 6 6 6H18C19.1046 6 20 6.89543 20 8V10H4V8Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="3" y="10" width="18" height="3" rx="1" stroke="currentColor" strokeWidth="1.5"/>
    <line x1="6" y1="13" x2="6" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="18" y1="13" x2="18" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="4" y1="18" x2="8" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    <line x1="16" y1="18" x2="20" y2="18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

/* ================================================================
   MAIN COMPONENT
   ================================================================ */

export default function Dashboard() {
  /* ---- State ---- */
  const [activeTab, setActiveTab] = useState<"tables" | "orders" | "details" | "cancellations">("tables");
  const [tables, setTables] = useState<Table[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  const [menuItemMap, setMenuItemMap] = useState<Record<number, string>>({});
  const [tableActiveInvoices, setTableActiveInvoices] = useState<Record<number, any>>({});
  const [authError, setAuthError] = useState(false);
  const [wsState, setWsState] = useState<"connected" | "connecting" | "disconnected">("connecting");
  const [isMerging, setIsMerging] = useState(false);
  const [pendingCancelRequests, setPendingCancelRequests] = useState<any[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("pending_cancel_requests") || "[]");
    } catch {
      return [];
    }
  });

  // --- BANNER ĐẾM NGƯỢC HẾT MÓN (1:30) ---
  interface OutOfStockBanner {
    id: number;          // unique id để dismiss
    item_id: number;
    item_name: string;
    secondsLeft: number; // đếm ngược từ 90
    escalated: boolean;  // đã escalate lên Manager chưa
  }
  const [outOfStockBanners, setOutOfStockBanners] = useState<OutOfStockBanner[]>([]);
  const bannerIdRef = useRef(0);
  
  // State phục vụ việc Đổi món (Substitute)
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [substitutingDetail, setSubstitutingDetail] = useState<any | null>(null);

  useEffect(() => {
    localStorage.setItem("pending_cancel_requests", JSON.stringify(pendingCancelRequests));
  }, [pendingCancelRequests]);

  /* Filters */
  const [capacityFilter, setCapacityFilter] = useState<"all" | number>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [itemFilterQuery, setItemFilterQuery] = useState("");

  /* Side panel */
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);

  /* Toasts */
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);

  /* Clock */
  const [currentTime, setCurrentTime] = useState(new Date());

  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  /* ---- Countdown tick cho out-of-stock banners ---- */
  useEffect(() => {
    if (outOfStockBanners.length === 0) return;
    const tick = setInterval(() => {
      setOutOfStockBanners((prev) =>
        prev
          .map((b) => {
            const next = b.secondsLeft - 1;
            // Khi hết 1:30 và chưa escalate → đánh dấu escalated
            if (next <= 0 && !b.escalated) {
              return { ...b, secondsLeft: 0, escalated: true };
            }
            return { ...b, secondsLeft: Math.max(0, next) };
          })
          // Xóa banner hoàn toàn sau thêm 5 giây kể từ khi escalate
          .filter((b) => b.secondsLeft > 0 || !b.escalated)
      );
    }, 1000);
    return () => clearInterval(tick);
  }, [outOfStockBanners.length]);

  /* ---- Clock tick ---- */
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  /* ---- Click outside user dropdown ---- */
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setShowUserDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  /* ---- Toast helper ---- */
  const addToast = (message: string, type: Toast["type"] = "info") => {
    const id = nextToastId.current++;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  /* ---- WebSocket + Polling ---- */
  useEffect(() => {
    fetchData();
    fetchMenu();
    const interval = setInterval(fetchData, 8000);

    const token = localStorage.getItem("staff_token");
    let ws: WebSocket | null = null;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      if (!token) return;

      const base = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
      const wsBase = base.replace("http", "ws").replace(/\/api\/?$/, "");
      
      ws = new WebSocket(`${wsBase}/ws/staff?token=${token}`);

      ws.onopen = () => setWsState("connected");
      ws.onclose = () => {
        setWsState("disconnected");
        // Auto-reconnect after 3 seconds
        reconnectTimeout = setTimeout(connectWs, 3000);
      };
      ws.onerror = () => setWsState("disconnected");

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "TABLE_STATUS_CHANGED") {
            const payload = data.payload as { table_id: number; status: string };
            setTables((prev) =>
              prev.map((table) =>
                table.id === payload.table_id ? { ...table, status: payload.status } : table
              )
            );
            fetchData();
          } else if (data.event === "PAYMENT_REQUESTED") {
            const payload = data.payload as { session_id: number; table_id: number };
            addToast(`Bàn ${payload.table_id} vừa yêu cầu Thanh toán!`, "warning");
            fetchData();
          } else if (data.event === "CANCEL_REQUEST_PENDING") {
            const payload = data.payload as { order_detail_id: number; item_name?: string; table_number?: number; requested_by_name?: string; reason: string };
            const displayName = payload.item_name ? `Món "${payload.item_name}" (Bàn ${payload.table_number})` : `Món #${payload.order_detail_id}`;
            addToast(`${displayName} yêu cầu huỷ: "${payload.reason}"`, "warning");
            
            if (user?.role === "manager" || user?.role === "admin") {
              setPendingCancelRequests((prev) => [
                ...prev.filter((r) => r.order_detail_id !== payload.order_detail_id),
                payload,
              ]);
            }
            fetchData();
          } else if (data.event === "NEW_ORDER") {
            addToast(`Nhận đơn hàng mới từ bàn ${data.payload.table_id}!`, "info");
            fetchData();
          } else if (data.event === "OUT_OF_STOCK") {
            const payload = data.payload as { item_id: number; item_name: string };
            // Thêm countdown banner 1:30 (BR-009 v2.1)
            const bannerId = bannerIdRef.current++;
            setOutOfStockBanners((prev) => [
              ...prev.filter((b) => b.item_id !== payload.item_id), // Tránh duplicate
              { id: bannerId, item_id: payload.item_id, item_name: payload.item_name, secondsLeft: 90, escalated: false },
            ]);
            fetchData();
          }
        } catch {
          return;
        }
      };
    };

    connectWs();

    return () => {
      clearInterval(interval);
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      ws?.close();
    };
  }, [user]);

  /* ---- Data fetching ---- */
  const fetchData = async () => {
    try {
      const [tRes, oRes] = await Promise.all([api.get("/tables"), api.get("/orders/pending")]);
      const fetchedTables = tRes.data.data as Table[];
      setTables(fetchedTables);
      setPendingOrders(oRes.data.data);

      fetchedTables.forEach((t) => {
        if (t.status === "occupied" || t.status === "waiting_payment") {
          loadTableProgress(t.id, t.table_number);
        }
      });
    } catch (err: any) {
      if (err?.response?.status === 401) setAuthError(true);
      console.error(err);
    }
  };

  const fetchMenu = async () => {
    try {
      const res = await api.get("/menu");
      const items: MenuItem[] = res.data.data?.items || [];
      setMenuItems(items);
      const map = Object.fromEntries(items.map((item) => [item.id, item.name]));
      setMenuItemMap(map);
    } catch (err: any) {
      if (err?.response?.status === 401) setAuthError(true);
      console.error(err);
    }
  };

  const loadTableProgress = async (tableId: number, tableNumber: number) => {
    try {
      const sessionRes = await api.get(`/tables/${tableNumber}/session`);
      if (sessionRes.data.data && sessionRes.data.data.session_id) {
        const sessionId = sessionRes.data.data.session_id;
        const invRes = await api.get("/invoice", { headers: { "X-Session-ID": String(sessionId) } });
        const invoiceData = invRes.data.data;
        setTableActiveInvoices((prev) => ({ ...prev, [tableId]: invoiceData }));

        // Đối chiếu để tự động xoá các yêu cầu huỷ đã được xử lý trên máy khác
        if (invoiceData && invoiceData.details) {
          const details: any[] = invoiceData.details;
          setPendingCancelRequests((prev) => {
            return prev.filter((req) => {
              const matched = details.find((d) => d.id === req.order_detail_id);
              if (!matched || matched.cooking_status !== "cooking") {
                return false;
              }
              return true;
            });
          });
        }
      }
    } catch {}
  };

  /* ---- Order actions ---- */
  const confirmOrder = async (orderId: number) => {
    const order = pendingOrders.find((o) => o.id === orderId);
    if (!order) return;
    try {
      if (order.order_details.length === 0) {
        await rejectOrder(orderId);
        return;
      }
      const payload = {
        items: order.order_details.map((d) => ({ item_id: d.item_id, quantity: d.quantity, note: d.note || "" })),
      };
      await api.patch(`/orders/${orderId}/update-details`, payload);
      await api.patch(`/orders/${orderId}/confirm`);
      addToast(`Đã duyệt thành công đơn hàng #${orderId}`, "success");
      fetchData();
    } catch (err: any) {
      alert("Lỗi xác nhận đơn hàng: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleUpdatePendingItemQty = (orderId: number, itemId: number, newQty: number) => {
    setPendingOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        const updatedDetails = order.order_details
          .map((d) => (d.item_id !== itemId ? d : { ...d, quantity: newQty }))
          .filter((d) => d.quantity > 0);
        const subtotal = updatedDetails.reduce((sum, d) => sum + Number(d.unit_price) * d.quantity, 0);
        const vatRatio = order.subtotal > 0 ? Number(order.tax_amount) / Number(order.subtotal) : 0.08;
        const svcRatio = order.subtotal > 0 ? Number(order.service_charge) / Number(order.subtotal) : 0.05;
        const tax_amount = subtotal * vatRatio;
        const service_charge = subtotal * svcRatio;
        const total_price = subtotal + tax_amount + service_charge;
        return { ...order, subtotal, tax_amount, service_charge, total_price, order_details: updatedDetails };
      })
    );
  };

  const handleUpdatePendingItemNote = (orderId: number, itemId: number, note: string) => {
    setPendingOrders((prev) =>
      prev.map((order) => {
        if (order.id !== orderId) return order;
        return { ...order, order_details: order.order_details.map((d) => (d.item_id === itemId ? { ...d, note } : d)) };
      })
    );
  };

  const handleDeletePendingItem = (orderId: number, itemId: number) => {
    if (confirm("Bạn có chắc muốn xoá món này khỏi đơn hàng?")) {
      handleUpdatePendingItemQty(orderId, itemId, 0);
    }
  };

  const rejectOrder = async (orderId: number) => {
    try {
      await api.patch(`/orders/${orderId}/reject`);
      addToast(`Đã từ chối đơn hàng #${orderId}`, "error");
      fetchData();
    } catch {
      alert("Lỗi từ chối order");
    }
  };

  const handleMarkServed = async (detailId: number, tableId: number, tableNumber: number) => {
    try {
      await api.patch(`/order-details/${detailId}/served`);
      addToast("Món đã được phục vụ!", "success");
      await loadTableProgress(tableId, tableNumber);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Lỗi giao món");
    }
  };

  const handleCancelDetail = async (detailId: number, status: string, tableId: number, tableNumber: number) => {
    // BR-003 v2.1: Chỉ cho phép huỷ khi status = pending hoặc confirmed
    if (!['pending', 'confirmed'].includes(status)) {
      alert(`Không thể huỷ món đang ở trạng thái "${status}". Chỉ được huỷ khi món ở trạng thái Chờ xử lý hoặc Đã nhận.`);
      return;
    }
    const reason = prompt("Nhập lý do huỷ món:");
    if (reason === null) return;
    if (!reason.trim()) { alert("Lý do huỷ không được trống."); return; }
    try {
      await api.patch(`/order-details/${detailId}/cancel`, { cancel_reason: reason });
      addToast("Món đã được huỷ bỏ!", "success");
      await loadTableProgress(tableId, tableNumber);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || err.response?.data?.detail || "Lỗi thao tác huỷ món");
    }
  };

  const handleSubstituteDetail = async (detailId: number, newItemId: number, tableId: number, tableNumber: number) => {
    try {
      await api.patch(`/order-details/${detailId}/substitute`, { new_item_id: newItemId });
      addToast("Đổi món thành công!", "success");
      setSubstitutingDetail(null);
      await loadTableProgress(tableId, tableNumber);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || err.response?.data?.detail || "Lỗi thao tác đổi món");
    }
  };

  const handleOpenTable = async (table: Table) => {
    try {
      await api.get(`/tables/${table.table_number}/session`);
      addToast(`Bàn ${table.table_number} đã được mở thành công!`, "success");
      setSelectedTable({ ...table, status: "occupied" });
      fetchData();
    } catch {
      alert("Không thể mở bàn");
    }
  };

  const handleTransferTable = async (sessionId: number, destTableId: number, destTableNumber: number) => {
    if (!confirm(`Bạn có chắc muốn chuyển đơn sang Bàn ${destTableNumber}?`)) return;
    try {
      await api.patch(`/sessions/${sessionId}/transfer-table`, { destination_table_id: destTableId });
      addToast(`Đã chuyển bàn thành công sang Bàn ${destTableNumber}!`, "success");
      setIsTransferring(false);
      setSelectedTable(null);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Lỗi chuyển bàn");
    }
  };

  const handleMergeSessions = async (sourceSessionId: number, targetSessionId: number, targetTableNumber: number) => {
    if (!confirm(`Bạn có chắc muốn gộp hoá đơn bàn này vào Bàn ${targetTableNumber}?`)) return;
    try {
      await api.post("/sessions/merge", {
        source_session_id: sourceSessionId,
        master_session_id: targetSessionId
      });
      addToast(`Đã gộp bàn thành công vào Bàn ${targetTableNumber}!`, "success");
      setIsMerging(false);
      setSelectedTable(null);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || err.response?.data?.detail || "Lỗi gộp bàn");
    }
  };

  const handleApproveCancel = async (detailId: number, approved: boolean, reason?: string) => {
    try {
      if (approved) {
        await api.patch(`/order-details/${detailId}/approve-cancel`, { approved: true, reason });
        addToast(`Đã phê duyệt huỷ món #${detailId}!`, "success");
      } else {
        await api.patch(`/order-details/${detailId}/approve-cancel`, { approved: false });
        addToast(`Đã từ chối huỷ món #${detailId}.`, "info");
      }
      setPendingCancelRequests(prev => prev.filter(r => r.order_detail_id !== detailId));
      fetchData();
      if (selectedTable) {
        await loadTableProgress(selectedTable.id, selectedTable.table_number);
      }
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || err.response?.data?.detail || "Lỗi xử lý duyệt huỷ");
      setPendingCancelRequests(prev => prev.filter(r => r.order_detail_id !== detailId));
    }
  };

  /* ---- Computed data ---- */
  const filteredTables = useMemo(() => {
    return tables.filter((t) => {
      if (capacityFilter !== "all" && getTableCapacity(t.table_number) !== capacityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const num = String(t.table_number);
        if (!num.includes(q) && !`bàn ${num}`.includes(q)) return false;
      }
      return true;
    });
  }, [tables, capacityFilter, searchQuery]);

  const tableStats = useMemo(() => {
    const empty = filteredTables.filter((t) => t.status === "empty").length;
    const occupied = filteredTables.filter((t) => t.status !== "empty").length;
    return { empty, occupied };
  }, [filteredTables]);

  const detailedTables = useMemo(() => {
    return tables
      .filter((t) => t.status !== "empty")
      .map((t) => {
        const invoice = tableActiveInvoices[t.id];
        const activeDetails = invoice?.details?.filter((d: any) => d.cooking_status !== "cancelled") || [];
        return { table: t, invoice, activeDetails };
      });
  }, [tables, tableActiveInvoices]);

  const filteredDetailedTables = useMemo(() => {
    if (!itemFilterQuery.trim()) return detailedTables;
    const query = itemFilterQuery.toLowerCase().trim();
    return detailedTables.filter((dt) =>
      dt.activeDetails.some((d: any) =>
        d.item_name?.toLowerCase().includes(query)
      )
    );
  }, [detailedTables, itemFilterQuery]);

  const getTableServedStats = (tableId: number) => {
    const invoiceData = tableActiveInvoices[tableId];
    if (!invoiceData || !invoiceData.details || invoiceData.details.length === 0) return null;
    const details = invoiceData.details as OrderDetail[];
    const activeDetails = details.filter((d) => d.cooking_status !== "cancelled");
    const servedDetails = activeDetails.filter((d) => d.cooking_status === "served");
    return {
      served: servedDetails.reduce((sum, d) => sum + d.quantity, 0),
      total: activeDetails.reduce((sum, d) => sum + d.quantity, 0),
    };
  };

  /* Format clock */
  const timeStr = currentTime.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit", hour12: true }).toUpperCase();
  const dateStr = currentTime.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric" });

  /* ---- Loading state ---- */
  if (tables.length === 0) {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: "var(--bg-primary)" }}>
        <div style={{ textAlign: "center" }}>
          <Loader2 className="animate-spin" size={40} style={{ color: "var(--accent-primary)", margin: "0 auto" }} />
          <p style={{ marginTop: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>Đang tải sơ đồ bàn...</p>
        </div>
      </div>
    );
  }

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="dashboard-layout animate-fade-in">

      {/* ===== SIDEBAR ===== */}
      <aside className="sidebar">
        {/* Logo */}
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M3 11L12 2L21 11" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 9.5V19C5 19.5523 5.44772 20 6 20H18C18.5523 20 19 19.5523 19 19V9.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="9" y="14" width="6" height="6" rx="1" stroke="white" strokeWidth="1.5"/>
            </svg>
          </div>
          <div className="sidebar-logo-text">
            <h2>Smart<br/>Restaurant</h2>
            <span>Staff Web</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="sidebar-nav">
          <button
            className={`sidebar-nav-item ${activeTab === "tables" ? "active" : ""}`}
            onClick={() => setActiveTab("tables")}
          >
            <LayoutGrid size={18} /> Sơ đồ bàn
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === "orders" ? "active" : ""}`}
            onClick={() => setActiveTab("orders")}
          >
            <ClipboardList size={18} /> Đơn chờ duyệt
            {pendingOrders.length > 0 && (
              <span className="nav-badge">{pendingOrders.length}</span>
            )}
          </button>

          <button
            className={`sidebar-nav-item ${activeTab === "details" ? "active" : ""}`}
            onClick={() => setActiveTab("details")}
          >
            <Info size={18} /> Thông tin chi tiết<br/>các bàn
          </button>

          {(user?.role === "manager" || user?.role === "admin") && (
            <button
              className={`sidebar-nav-item ${activeTab === "cancellations" ? "active" : ""}`}
              onClick={() => setActiveTab("cancellations")}
            >
              <Trash2 size={18} /> Yêu cầu huỷ món
              {pendingCancelRequests.length > 0 && (
                <span className="nav-badge" style={{ background: "var(--accent-danger)" }}>{pendingCancelRequests.length}</span>
              )}
            </button>
          )}
        </nav>

        {/* User profile */}
        <div className="sidebar-user-container" ref={userDropdownRef}>
          <div
            className="sidebar-user"
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            title="Đăng xuất"
          >
            <div className="sidebar-user-avatar">
              {user?.display_name?.charAt(0).toUpperCase() || user?.sub?.charAt(0).toUpperCase() || "S"}
            </div>
            <div className="sidebar-user-info">
              <div className="name">{user?.display_name || user?.sub || "Staff"}</div>
              <div className="role">Nhân viên phục vụ</div>
            </div>
            <ChevronDown
              size={16}
              style={{
                color: "var(--sidebar-text)",
                flexShrink: 0,
                transform: showUserDropdown ? "rotate(180deg)" : "none",
                transition: "transform 0.2s",
              }}
            />
          </div>

          {showUserDropdown && (
            <div className="sidebar-user-dropdown animate-fade-in">
              <button className="dropdown-item" onClick={handleLogout}>
                <LogOut size={14} /> Đăng xuất
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* ===== MAIN CONTENT ===== */}
      <main className="main-content">

        {/* Header */}
        <header className="main-header">
          <div className="main-header-left">
            <h1>{activeTab === "tables" ? "Sơ đồ bàn" : activeTab === "orders" ? "Đơn chờ duyệt" : activeTab === "cancellations" ? "Yêu cầu huỷ món" : "Thông tin chi tiết các bàn"}</h1>
            <p>
              {activeTab === "tables"
                ? "Quản lý và theo dõi trạng thái các bàn trong nhà hàng"
                : activeTab === "orders"
                ? "Duyệt hoặc từ chối đơn hàng đang chờ xử lý"
                : activeTab === "cancellations"
                ? "Manager phê duyệt hoặc từ chối yêu cầu huỷ món đang nấu"
                : "Xem thông tin chi tiết hoạt động của từng bàn"}
            </p>
          </div>

          <div className="main-header-right">
            {/* Online status */}
            <div className={`header-status ${wsState === "connected" ? "" : wsState === "connecting" ? "connecting" : "disconnected"}`}>
              <div className="status-wifi-circle">
                <Wifi size={16} />
              </div>
              <div className="status-text">
                <div className="status-title">
                  {wsState === "connected" ? "Online" : wsState === "connecting" ? "Đang kết nối" : "Ngoại tuyến"}
                </div>
                <div className="status-desc">
                  {wsState === "connected" ? "Kết nối tốt" : wsState === "connecting" ? "Đang thử..." : "Mất kết nối"}
                </div>
              </div>
            </div>

            {/* Notification bell */}
            <div className="header-notification" onClick={() => {
              if ((user?.role === "manager" || user?.role === "admin") && pendingCancelRequests.length > 0) {
                setActiveTab("cancellations");
              } else {
                setActiveTab("orders");
              }
            }}>
              <Bell size={18} />
              {(pendingOrders.length + ((user?.role === "manager" || user?.role === "admin") ? pendingCancelRequests.length : 0)) > 0 && (
                <span className="notif-badge">
                  {pendingOrders.length + ((user?.role === "manager" || user?.role === "admin") ? pendingCancelRequests.length : 0)}
                </span>
              )}
            </div>

            {/* Clock */}
            <div className="header-clock">
              <div className="time">{timeStr}</div>
              <div className="date">{dateStr}</div>
            </div>
          </div>
        </header>

        {/* Auth error banner */}
        {authError && (
          <div className="glass animate-fade-in" style={{ padding: "16px 20px", borderRadius: "var(--border-radius-md)", marginBottom: "20px", borderLeft: "4px solid var(--accent-danger)", background: "rgba(255, 71, 87, 0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ color: "var(--accent-danger)" }}>Phiên đăng nhập đã hết hạn!</strong>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>Vui lòng đăng nhập lại để tiếp tục quản lý nhà hàng.</p>
              </div>
              <button className="btn btn-primary" onClick={handleLogout}>Đăng nhập lại</button>
            </div>
          </div>
        )}

        {/* ========== OUT-OF-STOCK COUNTDOWN BANNERS (BR-009 v2.1) ========== */}
        {outOfStockBanners.map((banner) => {
          const mins = Math.floor(banner.secondsLeft / 60);
          const secs = banner.secondsLeft % 60;
          const countdownStr = `${mins}:${String(secs).padStart(2, "0")}`;
          const isUrgent = banner.secondsLeft <= 30;
          const isEscalated = banner.escalated;
          return (
            <div
              key={banner.id}
              className="glass animate-fade-in"
              style={{
                padding: "14px 20px",
                borderRadius: "var(--border-radius-md)",
                marginBottom: "10px",
                borderLeft: `4px solid ${isEscalated ? "#ff2d55" : isUrgent ? "#ff9500" : "#ff4757"}`,
                background: isEscalated ? "rgba(255,45,85,0.1)" : isUrgent ? "rgba(255,149,0,0.08)" : "rgba(255,71,87,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "16px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "12px", flex: 1 }}>
                <AlertCircle size={20} style={{ color: isEscalated ? "#ff2d55" : "#ff4757", flexShrink: 0 }} />
                <div>
                  <strong style={{ color: isEscalated ? "#ff2d55" : "var(--text-primary)", fontSize: "0.95rem" }}>
                    {isEscalated
                      ? `⚠️ KHẨN: Chưa xử lý hết món "${banner.item_name}" — Đã báo lên Manager`
                      : `🔴 Nhà bếp báo HẾT MÓN: "${banner.item_name}"`}
                  </strong>
                  <p style={{ margin: 0, fontSize: "0.82rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                    {isEscalated
                      ? "Vui lòng liên hệ Manager để xử lý."
                      : "Vui lòng liên hệ khách tại bàn có món này và xử lý (đổi/huỷ)."}
                  </p>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "16px", flexShrink: 0 }}>
                {!isEscalated && (
                  <div style={{
                    fontFamily: "monospace",
                    fontWeight: 800,
                    fontSize: "1.4rem",
                    color: isUrgent ? "#ff9500" : "#ff4757",
                    minWidth: "56px",
                    textAlign: "center",
                    letterSpacing: "2px",
                  }}>
                    {countdownStr}
                  </div>
                )}
                <button
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: "4px" }}
                  onClick={() => setOutOfStockBanners((prev) => prev.filter((b) => b.id !== banner.id))}
                  title="Đóng thông báo"
                >
                  ✕
                </button>
              </div>
            </div>
          );
        })}

        {/* ========== TAB: TABLES ========== */}
        {activeTab === "tables" && (
          <div className="animate-fade-in">
            {/* Filter bar */}
            <div className="filter-bar">
              <button className={`filter-btn ${capacityFilter === "all" ? "active" : ""}`} onClick={() => setCapacityFilter("all")}>
                Tất cả bàn
              </button>
              <button className={`filter-btn ${capacityFilter === 2 ? "active" : ""}`} onClick={() => setCapacityFilter(2)}>
                <Users size={14} /> Bàn 2 người
              </button>
              <button className={`filter-btn ${capacityFilter === 5 ? "active" : ""}`} onClick={() => setCapacityFilter(5)}>
                <Users size={14} /> Bàn 5 người
              </button>
              <button className={`filter-btn ${capacityFilter === 8 ? "active" : ""}`} onClick={() => setCapacityFilter(8)}>
                <Users size={14} /> Bàn 8 người
              </button>

              {/* Search */}
              <div className="filter-search">
                <Search size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Tìm kiếm số bàn..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <button className="filter-icon-btn">
                <SlidersHorizontal size={16} />
              </button>
            </div>

            {/* Floor header + Legend */}
            <div className="floor-header">
              <div className="floor-title">
                <LayoutGrid size={18} />
                Tầng 1
              </div>
              <div className="floor-legend">
                <div className="legend-item">
                  <span className="legend-dot empty" />
                  Trống
                  <span className="legend-count">{tableStats.empty}</span>
                </div>
                <div className="legend-item">
                  <span className="legend-dot occupied" />
                  Có khách
                  <span className="legend-count">{tableStats.occupied}</span>
                </div>
              </div>
            </div>

            {/* Table Grid */}
            <div className="table-grid">
              {filteredTables.map((table) => {
                const stats = getTableServedStats(table.id);
                const capacity = getTableCapacity(table.table_number);
                const isOccupied = table.status !== "empty";

                return (
                  <div
                    key={table.id}
                    className={`table-card ${table.status}`}
                    onClick={() => setSelectedTable(table)}
                  >
                    {/* Icon */}
                    <div className="table-icon">
                      <TableSvgIcon size={28} />
                    </div>

                    {/* Number */}
                    <div className="table-card-number">{padNumber(table.table_number)}</div>

                    {/* Capacity */}
                    <div className="table-capacity">
                      <Users size={13} /> {capacity} người
                    </div>

                    {/* Progress bar (occupied only) */}
                    {isOccupied && stats && (
                      <div className="table-progress-container">
                        <div className="table-progress-label">
                          <span>Tiến độ lên món</span>
                          <span>{stats.served}/{stats.total}</span>
                        </div>
                        <div className="table-progress-bar-bg">
                          <div
                            className="table-progress-bar-fill"
                            style={{ width: `${stats.total > 0 ? (stats.served / stats.total) * 100 : 0}%` }}
                          />
                        </div>
                      </div>
                    )}

                    {isOccupied && !stats && (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={12} /> Chưa đặt món
                      </div>
                    )}

                    {/* Status */}
                    <div className={`table-status ${table.status}`}>
                      <span className="table-status-dot" />
                      {table.status === "empty" ? "Trống" : table.status === "occupied" ? "Có khách" : "Chờ thanh toán"}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="dashboard-footer">
              <span className="footer-dot" />
              Dữ liệu được cập nhật theo thời gian thực
            </div>
          </div>
        )}

        {/* ========== TAB: ORDERS ========== */}
        {activeTab === "orders" && (
          <div className="animate-fade-in" style={{ maxWidth: "800px" }}>
            {pendingOrders.length === 0 ? (
              <div className="glass" style={{ padding: "60px 20px", textAlign: "center", borderRadius: "var(--border-radius-lg)" }}>
                <Coffee size={48} style={{ color: "var(--accent-primary)", opacity: 0.5, marginBottom: "16px" }} />
                <h3 style={{ margin: 0, fontWeight: 600 }}>Tất cả đều sạch sẽ!</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "4px" }}>
                  Chưa có đơn hàng nào cần xác nhận duyệt lúc này.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {pendingOrders.map((order) => {
                  const tableNum = tables.find((t) => t.id === order.table_id)?.table_number || "?";
                  return (
                    <div key={order.id} className="glass animate-fade-in" style={{ padding: "20px", borderRadius: "var(--border-radius-lg)", borderLeft: "4px solid var(--accent-primary)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "12px", borderBottom: "1px dashed var(--glass-border)", marginBottom: "16px" }}>
                        <div>
                          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>Đơn hàng #{order.id} • Bàn {tableNum}</h3>
                          <span style={{ fontSize: "0.95rem", color: "var(--accent-primary)", fontWeight: 700, display: "block", marginTop: "4px" }}>
                            Tạm tính: {order.total_price.toLocaleString()}đ
                          </span>
                        </div>
                        <div style={{ display: "flex", gap: "8px" }}>
                          <button className="btn btn-danger" style={{ padding: "8px 16px", borderRadius: "var(--border-radius-pill)", fontSize: "0.85rem" }} onClick={() => rejectOrder(order.id)}>
                            <X size={16} /> Từ chối
                          </button>
                          <button className="btn btn-primary" style={{ padding: "8px 16px", borderRadius: "var(--border-radius-pill)", fontSize: "0.85rem" }} onClick={() => confirmOrder(order.id)}>
                            <Check size={16} /> Duyệt đơn
                          </button>
                        </div>
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                        <h4 style={{ fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 600, margin: 0 }}>Chi tiết món ăn đặt bếp:</h4>
                        {order.order_details?.map((detail) => (
                          <div key={detail.id} style={{ display: "flex", flexDirection: "column", gap: "6px", padding: "12px", background: "var(--bg-primary)", borderRadius: "var(--border-radius-md)", border: "1px solid var(--glass-border)" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                <span style={{ fontSize: "0.9rem", fontWeight: 600 }}>
                                  {detail.item_name || menuItemMap[detail.item_id] || `Món #${detail.item_id}`}
                                </span>
                                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)" }}>
                                  ({Number(detail.unit_price).toLocaleString()}đ)
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center" }}>
                                <div className="stepper" style={{ marginRight: "12px", padding: "2px 6px" }}>
                                  <button className="stepper-btn" style={{ width: "22px", height: "22px" }} onClick={() => handleUpdatePendingItemQty(order.id, detail.item_id, detail.quantity - 1)}>
                                    <Minus size={10} />
                                  </button>
                                  <span className="stepper-value" style={{ fontSize: "0.82rem", minWidth: "16px" }}>{detail.quantity}</span>
                                  <button className="stepper-btn" style={{ width: "22px", height: "22px" }} onClick={() => handleUpdatePendingItemQty(order.id, detail.item_id, detail.quantity + 1)}>
                                    <Plus size={10} />
                                  </button>
                                </div>
                                <button
                                  className="btn-icon"
                                  style={{ width: "26px", height: "26px", background: "rgba(255, 71, 87, 0.1)", border: "none", color: "var(--accent-danger)" }}
                                  onClick={() => handleDeletePendingItem(order.id, detail.item_id)}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>💡 Ghi chú:</span>
                              <input
                                type="text"
                                placeholder="Ghi chú nhanh (Không hành, thêm cay...)"
                                value={detail.note || ""}
                                onChange={(e) => handleUpdatePendingItemNote(order.id, detail.item_id, e.target.value)}
                                style={{ padding: "4px 8px", fontSize: "0.78rem", borderRadius: "4px", background: "var(--bg-secondary)", boxShadow: "none", border: "1px solid var(--glass-border)", height: "26px", flex: 1 }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ========== TAB: DETAILS ========== */}
        {activeTab === "details" && (
          <div className="animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            {/* Top Toolbar */}
            <div className="glass" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "16px", padding: "16px 24px", borderRadius: "var(--border-radius-md)" }}>
              <div>
                <h3 style={{ margin: 0, fontWeight: 700, fontSize: "1.1rem" }}>Thông tin chi tiết các bàn đang hoạt động</h3>
                <p style={{ margin: "2px 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                  Xem nhanh toàn bộ thực đơn đã đặt và lọc nhanh các bàn theo món ăn bị hết nguyên liệu.
                </p>
              </div>
              <div className="filter-search" style={{ margin: 0, width: "320px" }}>
                <Search size={15} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
                <input
                  type="text"
                  placeholder="Lọc nhanh bàn theo tên món..."
                  value={itemFilterQuery}
                  onChange={(e) => setItemFilterQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Tables details list */}
            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              {filteredDetailedTables.map((dt) => {
                const isWaitingPayment = dt.table.status === "waiting_payment";
                return (
                  <div
                    key={dt.table.id}
                    className="glass table-detail-row animate-fade-in"
                    onClick={() => setSelectedTable(dt.table)}
                    style={{
                      padding: "20px",
                      borderRadius: "var(--border-radius-md)",
                      display: "grid",
                      gridTemplateColumns: "220px 1fr",
                      gap: "24px",
                      alignItems: "center",
                      cursor: "pointer",
                      transition: "transform 0.2s, box-shadow 0.2s",
                      borderLeft: `4px solid ${isWaitingPayment ? "var(--accent-warning)" : "var(--accent-primary)"}`,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "translateY(-2px)";
                      e.currentTarget.style.boxShadow = "var(--shadow-card-hover)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "none";
                      e.currentTarget.style.boxShadow = "var(--shadow-card)";
                    }}
                  >
                    {/* Table Info Column */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        Bàn phục vụ
                      </span>
                      <h2 style={{ margin: 0, fontSize: "1.8rem", fontWeight: 700, color: "var(--accent-primary)", lineHeight: 1.1 }}>
                        Bàn {dt.table.table_number.toString().padStart(2, "0")}
                      </h2>
                      <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                        {dt.table.floor || "Tầng 1"} • Bàn {getTableCapacity(dt.table.table_number)} người
                      </span>
                      <div style={{ marginTop: "4px" }}>
                        <span className={`badge ${isWaitingPayment ? "danger" : "success"}`} style={{ fontSize: "0.75rem", padding: "4px 10px", borderRadius: "var(--border-radius-sm)", fontWeight: 700 }}>
                          {isWaitingPayment ? "Chờ thanh toán" : "Đang phục vụ"}
                        </span>
                      </div>
                    </div>

                    {/* Ordered Items Column */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <h4 style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-secondary)", fontWeight: 700, textTransform: "uppercase" }}>
                          Danh sách món đã đặt ({dt.activeDetails.reduce((sum: number, d: any) => sum + d.quantity, 0)} món)
                        </h4>
                        <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          Tổng bill: <strong style={{ color: "var(--accent-primary)" }}>{dt.invoice?.total?.toLocaleString() || "0"}đ</strong>
                        </span>
                      </div>
                      
                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                        {dt.activeDetails.map((detail: any) => {
                          const matchesQuery = itemFilterQuery.trim() && detail.item_name?.toLowerCase().includes(itemFilterQuery.toLowerCase().trim());
                          return (
                            <div
                              key={detail.id}
                              style={{
                                padding: "6px 12px",
                                borderRadius: "8px",
                                background: matchesQuery 
                                  ? "rgba(232, 99, 43, 0.15)" 
                                  : detail.cooking_status === "served" 
                                    ? "rgba(32, 201, 151, 0.05)" 
                                    : "rgba(0, 0, 0, 0.02)",
                                border: matchesQuery 
                                  ? "1px solid var(--accent-primary)" 
                                  : "1px solid var(--glass-border)",
                                boxShadow: matchesQuery ? "0 2px 8px rgba(232, 99, 43, 0.15)" : "none",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                transition: "all 0.2s",
                              }}
                            >
                              <span style={{ fontSize: "0.84rem", fontWeight: 700, color: "var(--accent-primary)" }}>
                                x{detail.quantity}
                              </span>
                              <span style={{ fontSize: "0.84rem", fontWeight: 600, color: matchesQuery ? "var(--accent-primary)" : "var(--text-primary)" }}>
                                {detail.item_name}
                              </span>
                              <span style={{
                                fontSize: "0.68rem",
                                fontWeight: 700,
                                padding: "2px 6px",
                                borderRadius: "4px",
                                background: detail.cooking_status === "served" ? "rgba(32, 201, 151, 0.12)" : detail.cooking_status === "done" ? "rgba(32, 201, 151, 0.15)" : "rgba(255, 159, 67, 0.1)",
                                color: detail.cooking_status === "served" || detail.cooking_status === "done" ? "var(--accent-secondary)" : "var(--accent-primary)"
                              }}>
                                {detail.cooking_status === "pending" ? "Chờ duyệt" : detail.cooking_status === "confirmed" ? "Đã nhận" : detail.cooking_status === "cooking" ? "Đang nấu" : detail.cooking_status === "done" ? "Chờ phục vụ" : "Phục vụ"}
                              </span>
                            </div>
                          );
                        })}
                        {dt.activeDetails.length === 0 && (
                          <span style={{ fontSize: "0.85rem", color: "var(--text-tertiary)", fontStyle: "italic" }}>
                            Bàn chưa đặt món ăn nào.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}

              {filteredDetailedTables.length === 0 && (
                <div className="glass" style={{ padding: "60px 20px", textAlign: "center", borderRadius: "var(--border-radius-lg)" }}>
                  <Search size={48} style={{ color: "var(--accent-primary)", opacity: 0.4, marginBottom: "16px" }} />
                  <h3 style={{ margin: 0, fontWeight: 700 }}>Không tìm thấy bàn nào</h3>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "6px" }}>
                    {itemFilterQuery.trim() 
                      ? `Không có bàn nào đang hoạt động gọi món ăn phù hợp với từ khóa "${itemFilterQuery}"`
                      : "Hiện tại không có bàn nào đang phục vụ hoặc chờ thanh toán."}
                  </p>
                  {itemFilterQuery.trim() && (
                    <button className="btn btn-secondary" style={{ marginTop: "16px" }} onClick={() => setItemFilterQuery("")}>
                      Xóa bộ lọc tìm kiếm
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ========== TAB: CANCELLATIONS ========== */}
        {activeTab === "cancellations" && (
          <div className="animate-fade-in" style={{ maxWidth: "800px" }}>
            {pendingCancelRequests.length === 0 ? (
              <div className="glass" style={{ padding: "60px 20px", textAlign: "center", borderRadius: "var(--border-radius-lg)" }}>
                <Check size={48} style={{ color: "var(--accent-secondary)", opacity: 0.5, marginBottom: "16px" }} />
                <h3 style={{ margin: 0, fontWeight: 600 }}>Không có yêu cầu huỷ món</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "4px" }}>
                  Hiện tại không có đề xuất huỷ món nào cần phê duyệt.
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {pendingCancelRequests.map((req) => (
                  <div key={req.order_detail_id} className="glass animate-fade-in" style={{ padding: "20px", borderRadius: "var(--border-radius-lg)", borderLeft: "4px solid var(--accent-danger)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "12px", borderBottom: "1px dashed var(--glass-border)", marginBottom: "16px" }}>
                      <div>
                        <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
                          Bàn {req.table_number} • Món: {req.item_name || `Mã chi tiết #${req.order_detail_id}`}
                        </h3>
                        <span style={{ fontSize: "0.85rem", color: "var(--text-secondary)", display: "block", marginTop: "4px" }}>
                          Yêu cầu bởi: {req.requested_by_name || "Nhân viên"}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button className="btn btn-secondary" style={{ padding: "8px 16px", borderRadius: "var(--border-radius-pill)", fontSize: "0.85rem" }} onClick={() => handleApproveCancel(req.order_detail_id, false)}>
                          <X size={16} /> Từ chối
                        </button>
                        <button className="btn btn-danger" style={{ padding: "8px 16px", borderRadius: "var(--border-radius-pill)", fontSize: "0.85rem" }} onClick={() => handleApproveCancel(req.order_detail_id, true, req.reason)}>
                          <Check size={16} /> Phê duyệt huỷ
                        </button>
                      </div>
                    </div>
                    <div style={{ padding: "12px", background: "rgba(255, 71, 87, 0.05)", borderRadius: "var(--border-radius-md)", border: "1px solid rgba(255, 71, 87, 0.1)" }}>
                      <span style={{ fontSize: "0.85rem", color: "var(--accent-danger)", fontWeight: 600, display: "block", marginBottom: "4px" }}>Lý do yêu cầu hủy:</span>
                      <p style={{ fontSize: "0.9rem", color: "var(--text-primary)", margin: 0, fontStyle: "italic" }}>
                        "{req.reason}"
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* ===== SIDE PANEL ===== */}
      {selectedTable && (
        <>
          <div className="side-panel-backdrop" onClick={() => setSelectedTable(null)} />
          <div className="side-panel">
            <div className="side-panel-header">
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>Bàn {selectedTable.table_number}</h3>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "block", marginTop: "2px" }}>
                  Khu vực {selectedTable.floor || "Mặt đất"} • Bàn {getTableCapacity(selectedTable.table_number)} người
                </span>
              </div>
              <button className="btn-icon" onClick={() => setSelectedTable(null)}>
                <X size={20} />
              </button>
            </div>

            {selectedTable.status === "empty" ? (
              <div className="side-panel-content" style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                <Coffee size={64} style={{ color: "var(--accent-primary)", opacity: 0.4, marginBottom: "16px" }} />
                <h3 style={{ margin: 0, fontWeight: 700 }}>Bàn đang trống</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginTop: "4px", maxWidth: "260px" }}>
                  Bàn này hiện chưa có khách sử dụng. Hãy mở bàn để bắt đầu gọi món.
                </p>
                <button className="btn btn-primary" style={{ marginTop: "24px", width: "80%" }} onClick={() => handleOpenTable(selectedTable)}>
                  Mở bàn phục vụ
                </button>
              </div>
            ) : (
              <div className="side-panel-content">
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Danh sách món ăn đã gọi</h4>
                    {tableActiveInvoices[selectedTable.id] && (
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          className="btn btn-secondary"
                          style={{ padding: "6px 12px", fontSize: "0.78rem", borderRadius: "var(--border-radius-pill)", display: "flex", alignItems: "center", gap: "4px" }}
                          onClick={() => setIsTransferring(true)}
                        >
                          <ArrowLeftRight size={12} /> Đổi bàn
                        </button>
                        {(user?.role === "manager" || user?.role === "admin") && (
                          <button
                            className="btn btn-secondary"
                            style={{ padding: "6px 12px", fontSize: "0.78rem", borderRadius: "var(--border-radius-pill)", display: "flex", alignItems: "center", gap: "4px", background: "rgba(255, 87, 34, 0.1)", border: "1px solid var(--accent-primary)", color: "var(--accent-primary)" }}
                            onClick={() => setIsMerging(true)}
                          >
                            <GitMerge size={12} /> Gộp bàn
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  {tableActiveInvoices[selectedTable.id] && tableActiveInvoices[selectedTable.id].details && tableActiveInvoices[selectedTable.id].details.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {tableActiveInvoices[selectedTable.id].details
                        .filter((d: any) => d.cooking_status !== "cancelled")
                        .map((detail: any) => (
                          <div
                            key={detail.id}
                            style={{ padding: "12px", background: "var(--bg-primary)", borderRadius: "var(--border-radius-md)", border: "1px solid var(--glass-border)", display: "flex", flexDirection: "column", gap: "8px" }}
                          >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div>
                                <div style={{ fontWeight: 600, fontSize: "0.9rem", display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{ color: "var(--accent-primary)" }}>x{detail.quantity}</span>
                                  <span>{detail.item_name}</span>
                                </div>
                                {detail.note && (
                                  <span style={{ fontSize: "0.78rem", color: "var(--accent-warning)", fontStyle: "italic", display: "block", marginTop: "2px" }}>
                                    Ghi chú: {detail.note}
                                  </span>
                                )}
                                {(() => {
                                  const cancelReq = pendingCancelRequests.find(r => r.order_detail_id === detail.id);
                                  if (cancelReq) {
                                    return (
                                      <span style={{ fontSize: "0.78rem", color: "var(--accent-danger)", fontWeight: 500, display: "block", marginTop: "2px" }}>
                                        Yêu cầu huỷ: "{cancelReq.reason}" {cancelReq.requested_by_name ? `bởi ${cancelReq.requested_by_name}` : ""}
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span style={{
                                  fontSize: "0.72rem", fontWeight: 700, padding: "3px 8px", borderRadius: "4px",
                                  background: detail.cooking_status === "served" ? "rgba(32, 201, 151, 0.12)" : detail.cooking_status === "done" ? "rgba(32, 201, 151, 0.15)" : "rgba(255, 159, 67, 0.1)",
                                  color: detail.cooking_status === "served" || detail.cooking_status === "done" ? "var(--accent-secondary)" : "var(--accent-primary)"
                                }}>
                                  {detail.cooking_status === "pending" ? "Chờ duyệt" : detail.cooking_status === "confirmed" ? "Đã nhận" : detail.cooking_status === "cooking" ? "Đang nấu" : detail.cooking_status === "done" ? "Chờ phục vụ" : "Phục vụ"}
                                </span>
                                {detail.cooking_status === "done" && (
                                  <button
                                    className="btn-icon"
                                    style={{ width: "24px", height: "24px", background: "var(--accent-secondary)", border: "none", color: "white" }}
                                    onClick={() => handleMarkServed(detail.id, selectedTable.id, selectedTable.table_number)}
                                  >
                                    <Check size={14} />
                                  </button>
                                )}
                                {(() => {
                                  const cancelReq = pendingCancelRequests.find(r => r.order_detail_id === detail.id);
                                  if (cancelReq) {
                                    if (user?.role === "manager" || user?.role === "admin") {
                                      return (
                                        <div style={{ display: "flex", gap: "6px" }}>
                                          <button
                                            className="btn-icon"
                                            title="Từ chối huỷ"
                                            style={{ width: "24px", height: "24px", background: "var(--bg-secondary)", border: "1px solid var(--glass-border)", color: "var(--text-secondary)" }}
                                            onClick={() => handleApproveCancel(detail.id, false)}
                                          >
                                            <X size={14} />
                                          </button>
                                          <button
                                            className="btn-icon"
                                            title="Duyệt huỷ"
                                            style={{ width: "24px", height: "24px", background: "var(--accent-secondary)", border: "none", color: "white" }}
                                            onClick={() => handleApproveCancel(detail.id, true, cancelReq.reason)}
                                          >
                                            <Check size={14} />
                                          </button>
                                        </div>
                                      );
                                    } else {
                                      return (
                                        <span style={{ fontSize: "0.7rem", color: "var(--accent-warning)", fontWeight: 600 }}>
                                          Chờ QL duyệt
                                        </span>
                                      );
                                    }
                                  }
                                  {/* BR-003 v2.1: Chỉ hiện nút huỷ và thay thế khi pending hoặc confirmed */}
                                  if (["pending", "confirmed"].includes(detail.cooking_status)) {
                                    return (
                                      <div style={{ display: "flex", gap: "6px" }}>
                                        <button
                                          className="btn-icon"
                                          title="Đổi sang món khác"
                                          style={{ width: "24px", height: "24px", background: "rgba(32, 201, 151, 0.1)", border: "none", color: "var(--accent-secondary)" }}
                                          onClick={() => setSubstitutingDetail(detail)}
                                        >
                                          <ArrowLeftRight size={12} />
                                        </button>
                                        <button
                                          className="btn-icon"
                                          title="Huỷ món"
                                          style={{ width: "24px", height: "24px", background: "rgba(255, 71, 87, 0.1)", border: "none", color: "var(--accent-danger)" }}
                                          onClick={() => handleCancelDetail(detail.id, detail.cooking_status, selectedTable.id, selectedTable.table_number)}
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            </div>
                          </div>
                        ))}
                    </div>
                  ) : (
                    <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-secondary)", fontSize: "0.85rem" }}>
                      Bàn chưa gọi món ăn nào.
                    </div>
                  )}

                  {/* Bill summary */}
                  {tableActiveInvoices[selectedTable.id] && (
                    <div style={{ padding: "16px", background: "var(--bg-primary)", borderRadius: "var(--border-radius-md)", border: "1px solid var(--glass-border)", display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.85rem", marginTop: "12px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                        <span>Tiền món:</span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{tableActiveInvoices[selectedTable.id].subtotal?.toLocaleString()}đ</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                        <span>VAT (8%):</span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{tableActiveInvoices[selectedTable.id].tax_amount?.toLocaleString()}đ</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                        <span>Phí phục vụ (5%):</span>
                        <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{tableActiveInvoices[selectedTable.id].service_charge?.toLocaleString()}đ</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1.05rem", fontWeight: 700, borderTop: "1px dashed var(--glass-border)", paddingTop: "8px", marginTop: "4px" }}>
                        <span>Tổng tiền:</span>
                        <span style={{ color: "var(--accent-primary)" }}>{tableActiveInvoices[selectedTable.id].total?.toLocaleString()}đ</span>
                      </div>
                      {selectedTable.status === "waiting_payment" && (
                        <div style={{ marginTop: "16px", padding: "12px", borderRadius: "var(--border-radius-sm)", background: "rgba(245, 158, 11, 0.1)", border: "1px solid rgba(245, 158, 11, 0.2)", color: "var(--accent-warning)", display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontWeight: 600, fontSize: "0.85rem" }}>
                          <DollarSign size={16} /> Khách đang chờ thanh toán
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Transfer table modal */}
          {isTransferring && (
            <div className="modal-overlay" style={{ zIndex: 1000 }}>
              <div className="modal-container">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Chuyển bàn phục vụ</h3>
                  <button className="btn-icon" onClick={() => setIsTransferring(false)} style={{ width: "32px", height: "32px" }}>
                    <X size={16} />
                  </button>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                  Chọn bàn trống cần chuyển session của Bàn {selectedTable.table_number} sang:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "250px", overflowY: "auto", paddingRight: "4px" }} className="hide-scrollbar">
                  {tables.filter((t) => t.status === "empty").map((emptyTable) => (
                    <button
                      key={emptyTable.id}
                      className="btn btn-secondary"
                      style={{ justifyContent: "space-between", padding: "12px 18px", width: "100%", borderRadius: "var(--border-radius-md)" }}
                      onClick={() => {
                        const sessionId = tableActiveInvoices[selectedTable.id]?.session_id;
                        if (sessionId) handleTransferTable(sessionId, emptyTable.id, emptyTable.table_number);
                      }}
                    >
                      <strong>Bàn {emptyTable.table_number}</strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Khu {emptyTable.floor} • Bàn {getTableCapacity(emptyTable.table_number)} người
                      </span>
                    </button>
                  ))}
                  {tables.filter((t) => t.status === "empty").length === 0 && (
                    <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)", padding: "10px 0" }}>
                      Không có bàn trống nào khả dụng.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Merge table modal */}
          {isMerging && (
            <div className="modal-overlay" style={{ zIndex: 1000 }}>
              <div className="modal-container">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Gộp bàn phục vụ</h3>
                  <button className="btn-icon" onClick={() => setIsMerging(false)} style={{ width: "32px", height: "32px" }}>
                    <X size={16} />
                  </button>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                  Chọn bàn đích có khách để gộp session của Bàn {selectedTable.table_number} vào:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "250px", overflowY: "auto", paddingRight: "4px" }} className="hide-scrollbar">
                  {tables
                    .filter((t) => t.id !== selectedTable.id && (t.status === "occupied" || t.status === "waiting_payment"))
                    .map((targetTable) => (
                      <button
                        key={targetTable.id}
                        className="btn btn-secondary"
                        style={{ justifyContent: "space-between", padding: "12px 18px", width: "100%", borderRadius: "var(--border-radius-md)" }}
                        onClick={() => {
                          const sourceSessionId = tableActiveInvoices[selectedTable.id]?.session_id;
                          const targetSessionId = tableActiveInvoices[targetTable.id]?.session_id;
                          if (sourceSessionId && targetSessionId) {
                            handleMergeSessions(sourceSessionId, targetSessionId, targetTable.table_number);
                          } else {
                            alert("Không tìm thấy session ID của bàn đích hoặc bàn nguồn!");
                          }
                        }}
                      >
                        <strong>Bàn {targetTable.table_number}</strong>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {targetTable.status === "waiting_payment" ? "Đang chờ thanh toán" : "Có khách"} • {getTableCapacity(targetTable.table_number)} người
                        </span>
                      </button>
                    ))}
                  {tables.filter((t) => t.id !== selectedTable.id && (t.status === "occupied" || t.status === "waiting_payment")).length === 0 && (
                    <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)", padding: "10px 0" }}>
                      Không có bàn có khách nào khác khả dụng để gộp.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Substitute item modal */}
          {substitutingDetail && (
            <div className="modal-overlay" style={{ zIndex: 1000 }}>
              <div className="modal-container" style={{ maxWidth: "450px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
                  <h3 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 700 }}>Đổi sang món khác</h3>
                  <button className="btn-icon" onClick={() => setSubstitutingDetail(null)} style={{ width: "32px", height: "32px" }}>
                    <X size={16} />
                  </button>
                </div>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "16px" }}>
                  Chọn món ăn thay thế cho món <strong>"{substitutingDetail.item_name}"</strong>:
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxHeight: "300px", overflowY: "auto", paddingRight: "4px" }} className="hide-scrollbar">
                  {menuItems
                    .filter((item) => item.is_available && item.id !== substitutingDetail.item_id)
                    .map((item) => (
                      <button
                        key={item.id}
                        className="btn btn-secondary"
                        style={{ justifyContent: "space-between", padding: "12px 18px", width: "100%", borderRadius: "var(--border-radius-md)" }}
                        onClick={() => handleSubstituteDetail(substitutingDetail.id, item.id, selectedTable.id, selectedTable.table_number)}
                      >
                        <strong>{item.name}</strong>
                        <span style={{ fontSize: "0.82rem", color: "var(--accent-primary)", fontWeight: 700 }}>
                          {Number(item.price).toLocaleString()}đ
                        </span>
                      </button>
                    ))}
                  {menuItems.filter((item) => item.is_available && item.id !== substitutingDetail.item_id).length === 0 && (
                    <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)", padding: "10px 0" }}>
                      Không có món ăn nào khả dụng để đổi.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== TOAST NOTIFICATIONS ===== */}
      <div className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}`}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <AlertCircle size={18} style={{ marginTop: "2px", flexShrink: 0, color: t.type === "success" ? "var(--accent-secondary)" : t.type === "warning" ? "var(--accent-warning)" : t.type === "error" ? "var(--accent-danger)" : "var(--accent-primary)" }} />
              <div>
                <strong style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {t.type === "success" ? "Thành công" : t.type === "warning" ? "Cảnh báo" : t.type === "error" ? "Lỗi" : "Thông báo"}
                </strong>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>{t.message}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
