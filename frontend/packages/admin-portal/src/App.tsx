import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Utensils,
  Table as TableIcon,
  BarChart3,
  Users,
  LogOut,
  Plus,
  Edit,
  Trash2,
  Loader2,
} from "lucide-react";
import { api } from "./api";
import { useAuthStore } from "./store";
import "./App.css";

// ─── Types ───
interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  price: string;
  is_available: boolean;
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
  const [loading, setLoading] = useState(false);

  // Auth State
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");

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
      <div className="login-container">
        <div className="glass login-card">
          <h2 style={{ textAlign: "center", marginBottom: "32px" }}>Admin Portal</h2>
          <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
            <input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            {authError && <p className="error-text">{authError}</p>}
            <button className="btn btn-primary" disabled={loading}>
              {loading ? <Loader2 className="animate-spin" /> : "Login"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-layout">
      <aside className="sidebar glass">
        <div className="sidebar-header">
          <h2>Smart OS</h2>
          <p>Admin Control</p>
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
            <Utensils size={18} /> Menu Items
          </button>
          <button
            className={`nav-item ${activeTab === "tables" ? "active" : ""}`}
            onClick={() => setActiveTab("tables")}
          >
            <TableIcon size={18} /> Tables
          </button>
          <button
            className={`nav-item ${activeTab === "reports" ? "active" : ""}`}
            onClick={() => setActiveTab("reports")}
          >
            <BarChart3 size={18} /> Reports
          </button>
          <button
            className={`nav-item ${activeTab === "staff" ? "active" : ""}`}
            onClick={() => setActiveTab("staff")}
          >
            <Users size={18} /> Staff
          </button>
        </nav>
        <button className="btn btn-secondary logout-btn" onClick={logout}>
          <LogOut size={18} /> Logout
        </button>
      </aside>

      <main className="admin-main">
        <header className="admin-header glass">
          <h1>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Management</h1>
          <div className="user-info">
            <span>{user?.role}</span>
            <div className="avatar">{user?.sub.charAt(0)}</div>
          </div>
        </header>

        <section className="admin-content">
          {activeTab === "dashboard" && <DashboardView />}
          {activeTab === "menu" && <MenuManager />}
          {activeTab === "tables" && <TableManager />}
          {activeTab === "reports" && <ReportsView />}
          {activeTab === "staff" && <StaffManager />}
        </section>
      </main>
    </div>
  );
}

// ─── Sub-Views ───

function DashboardView() {
  return (
    <div className="dashboard-grid">
      <div className="glass stat-card">
        <h3>Today Revenue</h3>
        <p className="stat-value">12,500,000đ</p>
        <span className="stat-change positive">+15% vs yesterday</span>
      </div>
      <div className="glass stat-card">
        <h3>Active Sessions</h3>
        <p className="stat-value">8</p>
        <span className="stat-change">4 tables waiting payment</span>
      </div>
      <div className="glass stat-card">
        <h3>Pending Orders</h3>
        <p className="stat-value">3</p>
        <span className="stat-change negative">Avg speed: 12 min</span>
      </div>
    </div>
  );
}

function MenuManager() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/menu-items").then((res) => {
      setItems(res.data.data);
      setLoading(false);
    });
  }, []);

  if (loading) return <Loader2 className="animate-spin" />;

  return (
    <div className="glass table-container">
      <div className="table-header">
        <h2>Menu Items</h2>
        <button className="btn btn-primary"><Plus size={16} /> Add Item</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>ID</th>
            <th>Name</th>
            <th>Price</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.id}</td>
              <td>{item.name}</td>
              <td>{Number(item.price).toLocaleString()}đ</td>
              <td>
                <span className={`badge ${item.is_available ? "success" : "danger"}`}>
                  {item.is_available ? "Available" : "Sold Out"}
                </span>
              </td>
              <td>
                <div className="actions">
                  <button className="btn-icon"><Edit size={14} /></button>
                  <button className="btn-icon danger"><Trash2 size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TableManager() {
  const [tables, setTables] = useState<Table[]>([]);

  useEffect(() => {
    api.get("/tables").then((res) => setTables(res.data.data));
  }, []);

  return (
    <div className="glass table-container">
      <div className="table-header">
        <h2>Tables</h2>
        <button className="btn btn-primary"><Plus size={16} /> Add Table</button>
      </div>
      <table>
        <thead>
          <tr>
            <th>Table #</th>
            <th>Floor</th>
            <th>Status</th>
            <th>QR Code</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {tables.map((t) => (
            <tr key={t.id}>
              <td>{t.table_number}</td>
              <td>{t.floor || "N/A"}</td>
              <td>{t.status}</td>
              <td><a href={t.qr_code_url} target="_blank" rel="noreferrer">View QR</a></td>
              <td>
                <div className="actions">
                  <button className="btn-icon"><Edit size={14} /></button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportsView() {
  return (
    <div className="reports-view">
      <div className="glass report-card">
        <h3>Revenue Report</h3>
        <div className="chart-placeholder">
          [Revenue Chart - Last 30 Days]
        </div>
      </div>
    </div>
  );
}

function StaffManager() {
  return (
    <div className="glass table-container">
      <div className="table-header">
        <h2>Staff Members</h2>
        <button className="btn btn-primary"><Plus size={16} /> New User</button>
      </div>
      <p style={{ padding: "20px", color: "var(--text-secondary)" }}>Feature coming soon...</p>
    </div>
  );
}
