import { useEffect, useState, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useAuthStore } from "../store";
import {
  LayoutDashboard,
  CheckSquare,
  LogOut,
  Check,
  X,
  Plus,
  Minus,
  Clock,
  User,
  Coffee,
  DollarSign,
  AlertCircle,
  ArrowLeftRight,
  Sparkles,
  Loader2,
  Trash2
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

// Preset notes deleted since order creation tab was removed

const getTableCapacity = (tableNum: number) => {
  if (tableNum <= 4) return 2;
  if (tableNum <= 10) return 5;
  return 8;
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"tables" | "orders">("tables");
  const [tables, setTables] = useState<Table[]>([]);
  const [pendingOrders, setPendingOrders] = useState<Order[]>([]);
  
  // Full Menu Items & Categories
  const [menuItemMap, setMenuItemMap] = useState<Record<number, string>>({});
  
  // Real-time table progress/invoices map
  const [tableActiveInvoices, setTableActiveInvoices] = useState<Record<number, any>>({});
  
  const [authError, setAuthError] = useState(false);
  const [wsState, setWsState] = useState<"connected" | "connecting" | "disconnected">("connecting");
  
  // Filtering & Search
  const [floorFilter, setFloorFilter] = useState<string>("All");
  
  // Slide-over side panel states
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [isTransferring, setIsTransferring] = useState(false);
  
  // Toast notifications state
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextToastId = useRef(0);

  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  // Toast Helpers
  const addToast = (message: string, type: Toast["type"] = "info") => {
    const id = nextToastId.current++;
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // WebSocket Connection
  useEffect(() => {
    fetchData();
    fetchMenu();
    
    // Safety net polling
    const interval = setInterval(fetchData, 8000);

    const token = localStorage.getItem("staff_token");
    let ws: WebSocket | null = null;
    if (token) {
      const base = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
      const wsBase = base.replace("http", "ws").replace(/\/api\/?$/, "");
      ws = new WebSocket(`${wsBase}/ws/staff?token=${token}`);

      ws.onopen = () => {
        setWsState("connected");
      };

      ws.onclose = () => {
        setWsState("disconnected");
      };

      ws.onerror = () => {
        setWsState("disconnected");
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.event === "TABLE_STATUS_CHANGED") {
            const payload = data.payload as { table_id: number; status: string };
            setTables(prev =>
              prev.map(table =>
                table.id === payload.table_id
                  ? { ...table, status: payload.status }
                  : table
              )
            );
            fetchData(); // reload progress bars
          } else if (data.event === "PAYMENT_REQUESTED") {
            const payload = data.payload as { session_id: number; table_id: number };
            addToast(`Bàn ${payload.table_id} vừa yêu cầu Thanh toán!`, "warning");
            fetchData();
          } else if (data.event === "CANCEL_REQUEST_PENDING") {
            const payload = data.payload as { order_detail_id: number; reason: string };
            addToast(`Món #${payload.order_detail_id} yêu cầu huỷ: "${payload.reason}"`, "warning");
            fetchData();
          } else if (data.event === "NEW_ORDER") {
            addToast(`Nhận đơn hàng mới từ bàn ${data.payload.table_id}!`, "info");
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

  // Fetch Table & Active Progress Invoice Data
  const fetchData = async () => {
    try {
      const [tRes, oRes] = await Promise.all([
        api.get("/tables"),
        api.get("/orders/pending"),
      ]);
      const fetchedTables = tRes.data.data as Table[];
      setTables(fetchedTables);
      setPendingOrders(oRes.data.data);

      // Load progress invoice details for occupied/waiting tables
      fetchedTables.forEach(t => {
        if (t.status === "occupied" || t.status === "waiting_payment") {
          loadTableProgress(t.id, t.table_number);
        }
      });
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) {
        setAuthError(true);
      }
      console.error(err);
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

  const loadTableProgress = async (tableId: number, tableNumber: number) => {
    try {
      const sessionRes = await api.get(`/tables/${tableNumber}/session`);
      if (sessionRes.data.data && sessionRes.data.data.session_id) {
        const sessionId = sessionRes.data.data.session_id;
        const invRes = await api.get('/invoice', {
          headers: { 'X-Session-ID': String(sessionId) }
        });
        setTableActiveInvoices(prev => ({
          ...prev,
          [tableId]: invRes.data.data
        }));
      }
    } catch {}
  };

  const confirmOrder = async (orderId: number) => {
    const order = pendingOrders.find(o => o.id === orderId);
    if (!order) return;

    try {
      if (order.order_details.length === 0) {
        await rejectOrder(orderId);
        return;
      }

      // 1. Send the updated items to backend first
      const payload = {
        items: order.order_details.map(d => ({
          item_id: d.item_id,
          quantity: d.quantity,
          note: d.note || ""
        }))
      };
      await api.patch(`/orders/${orderId}/update-details`, payload);

      // 2. Confirm order
      await api.patch(`/orders/${orderId}/confirm`);
      addToast(`Đã duyệt thành công đơn hàng #${orderId}`, "success");
      fetchData();
    } catch (err: any) {
      alert("Lỗi xác nhận đơn hàng: " + (err.response?.data?.detail || err.message));
    }
  };

  const handleUpdatePendingItemQty = (orderId: number, itemId: number, newQty: number) => {
    setPendingOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;

      const updatedDetails = order.order_details.map(d => {
        if (d.item_id !== itemId) return d;
        return { ...d, quantity: newQty };
      }).filter(d => d.quantity > 0);

      // Re-calculate pricing fields locally
      const subtotal = updatedDetails.reduce((sum, d) => sum + Number(d.unit_price) * d.quantity, 0);
      const vatRatio = order.subtotal > 0 ? (Number(order.tax_amount) / Number(order.subtotal)) : 0.08;
      const svcRatio = order.subtotal > 0 ? (Number(order.service_charge) / Number(order.subtotal)) : 0.05;

      const tax_amount = subtotal * vatRatio;
      const service_charge = subtotal * svcRatio;
      const total_price = subtotal + tax_amount + service_charge;

      return {
        ...order,
        subtotal,
        tax_amount,
        service_charge,
        total_price,
        order_details: updatedDetails
      };
    }));
  };

  const handleUpdatePendingItemNote = (orderId: number, itemId: number, note: string) => {
    setPendingOrders(prev => prev.map(order => {
      if (order.id !== orderId) return order;
      return {
        ...order,
        order_details: order.order_details.map(d => d.item_id === itemId ? { ...d, note } : d)
      };
    }));
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
    } catch (err: any) {
      alert("Lỗi từ chối order");
    }
  };

  // Serve & Cancel item actions inside details panel
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
    const reason = prompt("Nhập lý do huỷ món:");
    if (reason === null) return;
    if (!reason.trim()) {
      alert("Lý do huỷ không được trống.");
      return;
    }

    try {
      if (status === "cooking") {
        await api.post(`/order-details/${detailId}/cancel-request`, { cancel_reason: reason });
        addToast("Đã gửi đề xuất huỷ lên Quản lý!", "info");
      } else {
        await api.patch(`/order-details/${detailId}/cancel`, { cancel_reason: reason });
        addToast("Món đã được huỷ bỏ!", "success");
      }
      await loadTableProgress(tableId, tableNumber);
      fetchData();
    } catch (err: any) {
      alert(err.response?.data?.detail?.message || "Lỗi thao tác huỷ món");
    }
  };

  // Create new session & order placement for tables
  const handleOpenTable = async (table: Table) => {
    try {
      await api.get(`/tables/${table.table_number}/session`);
      addToast(`Bàn ${table.table_number} đã được mở thành công!`, "success");
      setSelectedTable({ ...table, status: "occupied" });
      fetchData();
    } catch {
      alert("Không thể mở bàn");
    }
  };// Payment request function removed as requested (only customer triggers payment request)

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

  // Group tables by Floor
  const floors = useMemo(() => {
    const list = ["All"];
    tables.forEach(t => {
      if (t.floor && !list.includes(t.floor)) {
        list.push(t.floor);
      }
    });
    return list;
  }, [tables]);

  const filteredTables = useMemo(() => {
    return tables.filter(t => floorFilter === "All" || t.floor === floorFilter);
  }, [tables, floorFilter]);

  // Table statistics helper (Served / Total)
  const getTableServedStats = (tableId: number) => {
    const invoiceData = tableActiveInvoices[tableId];
    if (!invoiceData || !invoiceData.details || invoiceData.details.length === 0) {
      return null;
    }
    const details = invoiceData.details as OrderDetail[];
    const activeDetails = details.filter(d => d.cooking_status !== "cancelled");
    const servedDetails = activeDetails.filter(d => d.cooking_status === "served");
    return {
      served: servedDetails.reduce((sum, d) => sum + d.quantity, 0),
      total: activeDetails.reduce((sum, d) => sum + d.quantity, 0)
    };
  };

  if (tables.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100vh",
          background: "var(--bg-primary)"
        }}
      >
        <div style={{ textAlign: "center" }}>
          <Loader2 className="animate-spin" size={40} style={{ color: "var(--accent-primary)", margin: "0 auto" }} />
          <p style={{ marginTop: "12px", color: "var(--text-secondary)", fontWeight: 500 }}>Đang tải sơ đồ POS...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-layout animate-fade-in">
      
      {/* ===== SIDEBAR NAV ===== */}
      <aside className="sidebar glass">
        <div style={{ paddingBottom: "12px", borderBottom: "1px solid var(--glass-border)" }}>
          <h2 style={{ color: "var(--accent-primary)", display: "flex", alignItems: "center", gap: "8px", fontSize: "1.4rem", fontWeight: 700 }}>
            <Sparkles size={20} /> Smart OS
          </h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", marginTop: "4px" }}>
            Staff Portal • {user?.sub}
          </p>
        </div>

        <nav style={{ display: "flex", flexDirection: "column", gap: "8px", flex: 1, marginTop: "12px" }}>
          <button
            className={`btn ${activeTab === "tables" ? "btn-primary" : "btn-secondary"}`}
            style={{ justifyContent: "flex-start" }}
            onClick={() => setActiveTab("tables")}
          >
            <LayoutDashboard size={18} /> Sơ đồ Bàn
          </button>
          
          <button
            className={`btn ${activeTab === "orders" ? "btn-primary" : "btn-secondary"}`}
            style={{ justifyContent: "flex-start", position: "relative" }}
            onClick={() => setActiveTab("orders")}
          >
            <CheckSquare size={18} /> Đơn chờ duyệt
            {pendingOrders.length > 0 && (
              <span style={{
                position: "absolute", right: "12px",
                background: "var(--accent-danger)", color: "white",
                borderRadius: "var(--border-radius-pill)", padding: "2px 8px",
                fontSize: "0.75rem", fontWeight: "bold"
              }}>
                {pendingOrders.length}
              </span>
            )}
          </button>
        </nav>

        <button
          className="btn btn-danger"
          style={{ justifyContent: "flex-start" }}
          onClick={handleLogout}
        >
          <LogOut size={18} /> Đăng xuất
        </button>
      </aside>

      {/* ===== MAIN DASHBOARD CONTENT ===== */}
      <main className="main-content">
        
        {/* Header bar */}
        <header className="main-header">
          <div>
            <h1 style={{ fontSize: "1.65rem", fontWeight: 700 }}>
              {activeTab === "tables" ? "Bảng sơ đồ phục vụ" : "Đơn hàng đang chờ xử lý"}
            </h1>
            <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem" }}>
              Xin chào, {user?.role.toUpperCase()}
            </p>
          </div>

          {/* WebSocket real-time connection state indicator */}
          <div className="glass" style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 16px", borderRadius: "var(--border-radius-pill)" }}>
            <span 
              className="pulse-indicator" 
              style={{ 
                color: wsState === "connected" ? "var(--accent-secondary)" : wsState === "connecting" ? "var(--accent-warning)" : "var(--accent-danger)"
              }} 
            />
            <span style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)" }}>
              {wsState === "connected" ? "POS Online" : wsState === "connecting" ? "Đồng bộ..." : "Ngoại tuyến"}
            </span>
          </div>
        </header>

        {authError && (
          <div className="glass animate-fade-in" style={{ padding: "16px 20px", borderRadius: "var(--border-radius-md)", marginBottom: "24px", borderLeft: "4px solid var(--accent-danger)", background: "rgba(255, 71, 87, 0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ color: "var(--accent-danger)" }}>Phiên đăng nhập đã hết hạn!</strong>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>Vui lòng đăng nhập lại để tiếp tục quản lý nhà hàng.</p>
              </div>
              <button className="btn btn-primary" onClick={handleLogout}>Đăng nhập lại</button>
            </div>
          </div>
        )}

        {/* Tab 1: TABLES MAP GRID */}
        {activeTab === "tables" && (
          <div className="animate-fade-in">
            {/* Floor selection filters */}
            <div className="floor-filter-tabs">
              {floors.map(floor => (
                <button
                  key={floor}
                  className={`floor-tab ${floorFilter === floor ? "active" : ""}`}
                  onClick={() => setFloorFilter(floor)}
                >
                  {floor === "All" ? "Tất cả các khu" : `Khu vực: ${floor}`}
                </button>
              ))}
            </div>

            {/* Grid of Table Cards */}
            <div className="table-grid">
              {filteredTables.map(table => {
                const stats = getTableServedStats(table.id);
                const capacity = getTableCapacity(table.table_number);
                
                return (
                  <div
                    key={table.id}
                    className={`table-card ${table.status}`}
                    onClick={() => {
                      setSelectedTable(table);
                    }}
                  >
                    <div className="table-card-header">
                      <span className="table-capacity-badge">
                        <User size={10} /> Bàn {capacity} người
                      </span>
                      <span className={`table-status-pill ${table.status}`}>
                        {table.status === "empty" ? "Trống" : table.status === "occupied" ? "Có khách" : "Chờ TT"}
                      </span>
                    </div>

                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                      <div className="table-card-number">{table.table_number}</div>
                      {table.floor && (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                          Khu {table.floor}
                        </span>
                      )}
                    </div>

                    {/* Progress tracking indicator of served items */}
                    {stats ? (
                      <div className="table-progress-container">
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          <span>Tiến độ món</span>
                          <span>{stats.served}/{stats.total}</span>
                        </div>
                        <div className="table-progress-bar-bg">
                          <div
                            className="table-progress-bar-fill"
                            style={{ width: `${(stats.served / stats.total) * 100}%` }}
                          />
                        </div>
                      </div>
                    ) : (
                      table.status !== "empty" && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "4px" }}>
                          <Clock size={12} /> Chưa đặt món
                        </div>
                      )
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab 2: PENDING ORDERS TABLE LIST */}
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
                {pendingOrders.map(order => {
                  const tableNum = tables.find(t => t.id === order.table_id)?.table_number || "?";
                  return (
                    <div key={order.id} className="glass animate-fade-in" style={{ padding: "20px", borderRadius: "var(--border-radius-lg)", borderLeft: "4px solid var(--accent-primary)" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", paddingBottom: "12px", borderBottom: "1px dashed var(--glass-border)", marginBottom: "16px" }}>
                        <div>
                          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
                            Đơn hàng #{order.id} • Bàn {tableNum}
                          </h3>
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
                        {order.order_details?.map(detail => (
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
                                {/* Quantity Stepper */}
                                <div className="stepper" style={{ marginRight: "12px", padding: "2px 6px" }}>
                                  <button className="stepper-btn" style={{ width: "22px", height: "22px" }} onClick={() => handleUpdatePendingItemQty(order.id, detail.item_id, detail.quantity - 1)}>
                                    <Minus size={10} />
                                  </button>
                                  <span className="stepper-value" style={{ fontSize: "0.82rem", minWidth: "16px" }}>{detail.quantity}</span>
                                  <button className="stepper-btn" style={{ width: "22px", height: "22px" }} onClick={() => handleUpdatePendingItemQty(order.id, detail.item_id, detail.quantity + 1)}>
                                    <Plus size={10} />
                                  </button>
                                </div>

                                {/* Delete button */}
                                <button
                                  className="btn-icon"
                                  style={{ width: "26px", height: "26px", background: "rgba(255, 71, 87, 0.1)", border: "none", color: "var(--accent-danger)" }}
                                  onClick={() => handleDeletePendingItem(order.id, detail.item_id)}
                                >
                                  <Trash2 size={12} />
                                </button>
                              </div>
                            </div>

                            {/* Note Editor */}
                            <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>💡 Ghi chú:</span>
                              <input
                                type="text"
                                placeholder="Ghi chú nhanh (Không hành, thêm cay...)"
                                value={detail.note || ""}
                                onChange={(e) => handleUpdatePendingItemNote(order.id, detail.item_id, e.target.value)}
                                style={{
                                  padding: "4px 8px",
                                  fontSize: "0.78rem",
                                  borderRadius: "4px",
                                  background: "var(--bg-secondary)",
                                  boxShadow: "none",
                                  border: "1px solid var(--glass-border)",
                                  height: "26px",
                                  flex: 1
                                }}
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
      </main>

      {/* ===== SLIDE-OVER TABLE ORDER PANEL ===== */}
      {selectedTable && (
        <>
          {/* Backdrop blur overlay */}
          <div className="side-panel-backdrop" onClick={() => setSelectedTable(null)} />

          <div className="side-panel">
            <div className="side-panel-header">
              <div>
                <h3 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
                  Bàn {selectedTable.table_number}
                </h3>
                <span style={{ fontSize: "0.78rem", color: "var(--text-secondary)", display: "block", marginTop: "2px" }}>
                  Khu vực {selectedTable.floor || "Mặt đất"} • Bàn {getTableCapacity(selectedTable.table_number)} người
                </span>
              </div>
              
              <button className="btn-icon" onClick={() => setSelectedTable(null)}>
                <X size={20} />
              </button>
            </div>

            {selectedTable.status === "empty" ? (
              /* EMPTY TABLE PANEL STATE */
              <div className="side-panel-content" style={{ justifyContent: "center", alignItems: "center", textAlign: "center" }}>
                <Coffee size={64} style={{ color: "var(--accent-primary)", opacity: 0.4, marginBottom: "16px" }} />
                <h3 style={{ margin: 0, fontWeight: 700 }}>Bàn đang trống</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "0.88rem", marginTop: "4px", maxWidth: "260px" }}>
                  Bàn này hiện chưa có khách sử dụng. Hãy mở bàn để bắt đầu gọi món.
                </p>
                <button
                  className="btn btn-primary"
                  style={{ marginTop: "24px", width: "80%" }}
                  onClick={() => handleOpenTable(selectedTable)}
                >
                  Mở bàn phục vụ
                </button>
              </div>
            ) : (
              /* ACTIVE TABLE PANEL STATE */
              <div className="side-panel-content">
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                  
                  {/* Active Order Details list */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 700 }}>Danh sách món ăn đã gọi</h4>
                    
                    {/* Quick switch table button */}
                    {tableActiveInvoices[selectedTable.id] && (
                      <button
                        className="btn btn-secondary"
                        style={{ padding: "6px 12px", fontSize: "0.78rem", borderRadius: "var(--border-radius-pill)", display: "flex", alignItems: "center", gap: "4px" }}
                        onClick={() => setIsTransferring(true)}
                      >
                        <ArrowLeftRight size={12} /> Đổi bàn
                      </button>
                    )}
                  </div>

                  {tableActiveInvoices[selectedTable.id] && tableActiveInvoices[selectedTable.id].details && tableActiveInvoices[selectedTable.id].details.length > 0 ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      {tableActiveInvoices[selectedTable.id].details.filter((d: any) => d.cooking_status !== "cancelled").map((detail: any) => (
                        <div
                          key={detail.id}
                          style={{
                            padding: "12px",
                            background: "var(--bg-primary)",
                            borderRadius: "var(--border-radius-md)",
                            border: "1px solid var(--glass-border)",
                            display: "flex",
                            flexDirection: "column",
                            gap: "8px"
                          }}
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
                            </div>

                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{
                                fontSize: "0.72rem",
                                fontWeight: 700,
                                padding: "3px 8px",
                                borderRadius: "4px",
                                background: detail.cooking_status === "served" ? "rgba(32, 201, 151, 0.12)" : detail.cooking_status === "done" ? "rgba(32, 201, 151, 0.15)" : "rgba(255, 159, 67, 0.1)",
                                color: detail.cooking_status === "served" ? "var(--accent-secondary)" : detail.cooking_status === "done" ? "var(--accent-secondary)" : "var(--accent-primary)"
                              }}>
                                {detail.cooking_status === "pending" ? "Chờ duyệt" : detail.cooking_status === "confirmed" ? "Đã nhận" : detail.cooking_status === "cooking" ? "Đang nấu" : detail.cooking_status === "done" ? "Chờ phục vụ" : "Phục vụ"}
                              </span>

                              {/* Serve item click checkmark */}
                              {detail.cooking_status === "done" && (
                                <button
                                  className="btn-icon"
                                  style={{ width: "24px", height: "24px", background: "var(--accent-secondary)", border: "none", color: "white" }}
                                  onClick={() => handleMarkServed(detail.id, selectedTable.id, selectedTable.table_number)}
                                >
                                  <Check size={14} />
                                </button>
                              )}

                              {/* Cancel item actions */}
                              {["pending", "confirmed", "cooking"].includes(detail.cooking_status) && (
                                <button
                                  className="btn-icon"
                                  style={{ width: "24px", height: "24px", background: "rgba(255, 71, 87, 0.1)", border: "none", color: "var(--accent-danger)" }}
                                  onClick={() => handleCancelDetail(detail.id, detail.cooking_status, selectedTable.id, selectedTable.table_number)}
                                >
                                  <X size={14} />
                                </button>
                              )}
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

                  {/* BILL SUMMARY DISPLAY */}
                  {tableActiveInvoices[selectedTable.id] && (
                    <div style={{
                      padding: "16px",
                      background: "var(--bg-primary)",
                      borderRadius: "var(--border-radius-md)",
                      border: "1px solid var(--glass-border)",
                      display: "flex",
                      flexDirection: "column",
                      gap: "6px",
                      fontSize: "0.85rem",
                      marginTop: "12px"
                    }}>
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
                      <div style={{
                        display: "flex", justifyContent: "space-between",
                        fontSize: "1.05rem", fontWeight: 700,
                        borderTop: "1px dashed var(--glass-border)", paddingTop: "8px", marginTop: "4px"
                      }}>
                        <span>Tổng tiền:</span>
                        <span style={{ color: "var(--accent-primary)" }}>{tableActiveInvoices[selectedTable.id].total?.toLocaleString()}đ</span>
                      </div>

                      {selectedTable.status === "waiting_payment" && (
                        <div style={{
                          marginTop: "16px",
                          padding: "12px",
                          borderRadius: "var(--border-radius-sm)",
                          background: "rgba(245, 158, 11, 0.1)",
                          border: "1px solid rgba(245, 158, 11, 0.2)",
                          color: "var(--accent-warning)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          fontWeight: 600,
                          fontSize: "0.85rem"
                        }}>
                          <DollarSign size={16} />
                          Khách đang chờ thanh toán
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* TRANSFER TABLE OVERLAY MODAL LIST */}
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
                  {tables.filter(t => t.status === "empty").map(emptyTable => (
                    <button
                      key={emptyTable.id}
                      className="btn btn-secondary"
                      style={{ justifyContent: "space-between", padding: "12px 18px", width: "100%", borderRadius: "var(--border-radius-md)" }}
                      onClick={() => {
                        const sessionId = tableActiveInvoices[selectedTable.id]?.session_id;
                        if (sessionId) {
                          handleTransferTable(sessionId, emptyTable.id, emptyTable.table_number);
                        }
                      }}
                    >
                      <strong>Bàn {emptyTable.table_number}</strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        Khu {emptyTable.floor} • Bàn {getTableCapacity(emptyTable.table_number)} người
                      </span>
                    </button>
                  ))}
                  {tables.filter(t => t.status === "empty").length === 0 && (
                    <p style={{ textAlign: "center", fontSize: "0.85rem", color: "var(--text-secondary)", padding: "10px 0" }}>
                      Không có bàn trống nào khả dụng.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ===== REAL-TIME TOAST NOTIFICATIONS POPUPS CONTAINER ===== */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type}`}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <AlertCircle size={18} style={{ marginTop: "2px", flexShrink: 0, color: t.type === "success" ? "var(--accent-secondary)" : t.type === "warning" ? "var(--accent-warning)" : "var(--accent-primary)" }} />
              <div>
                <strong style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  {t.type === "success" ? "Thành công" : t.type === "warning" ? "Cảnh báo" : "Thông báo"}
                </strong>
                <p style={{ fontSize: "0.8rem", color: "var(--text-secondary)", margin: "2px 0 0 0" }}>
                  {t.message}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

    </div>
  );
}
