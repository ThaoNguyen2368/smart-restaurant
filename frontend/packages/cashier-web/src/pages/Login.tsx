import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreditCard, Loader2, UserCircle } from "lucide-react";
import { api } from "../api";
import { useAuthStore } from "../store";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError("");
      const res = await api.post("/auth/login", { username, password });
      login(res.data.access_token);
      navigate("/");
    } catch (err: any) {
      setError(err.response?.data?.detail || "Sai tên đăng nhập hoặc mật khẩu");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card glass">
        <div className="auth-icon">
          <UserCircle size={44} />
        </div>
        <h2>Cashier Portal</h2>
        <p className="muted">Vui lòng đăng nhập để tiếp tục</p>

        <form onSubmit={handleLogin} className="auth-form">
          <label>
            <span>Tên đăng nhập</span>
            <input
              type="text"
              placeholder="cashier01"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </label>
          <label>
            <span>Mật khẩu</span>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="error-text">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? (
              <Loader2 className="animate-spin" />
            ) : (
              <>
                <CreditCard size={18} /> Đăng nhập
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
