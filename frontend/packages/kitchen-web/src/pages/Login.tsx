import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChefHat, Loader2 } from "lucide-react";
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
    <div className="animate-fade-in" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', minHeight: '100vh', padding: '20px',
      background: 'var(--bg)' // Dùng biến màu nền từ index.css
    }}>

      {/* Sử dụng class "glass" để lấy hiệu ứng bóng đổ và hover giống staff-web */}
      <div className="glass auth-card" style={{
        padding: '48px 40px', borderRadius: '24px',
        width: '100%', maxWidth: '420px',
        background: 'var(--surface)'
      }}>

        {/* Vòng tròn Icon */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div className="btn-icon" style={{
            width: '80px', height: '80px',
            background: 'var(--status-orange-light)', // Nền cam nhạt
            color: 'var(--status-orange)', // Icon cam đậm
            border: 'none', borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <ChefHat size={40} strokeWidth={2} />
          </div>
        </div>

        <h1 style={{ fontSize: '1.75rem', fontWeight: '700', color: 'var(--text-primary)', margin: '0 0 10px 0', textAlign: 'center' }}>
          Kitchen Portal
        </h1>
        <p className="muted" style={{ fontSize: '0.95rem', margin: '0 0 36px 0', textAlign: 'center' }}>
          Vui lòng đăng nhập để tiếp tục
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          <input
            type="text"
            placeholder="Tên đăng nhập"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            style={{
              padding: '14px 20px', borderRadius: '14px',
              border: '1px solid var(--border)', fontSize: '1rem',
              outlineColor: 'var(--status-orange)'
            }}
          />
          <input
            type="password"
            placeholder="Mật khẩu"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{
              padding: '14px 20px', borderRadius: '14px',
              border: '1px solid var(--border)', fontSize: '1rem',
              outlineColor: 'var(--status-orange)'
            }}
          />

          {error && <p style={{ color: 'var(--status-danger)', fontSize: '0.9rem', textAlign: 'center', margin: '0' }}>{error}</p>}

          {/* Dùng class "btn btn-primary" để tự động nhận hiệu ứng hover có sẵn */}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              width: '100%', padding: '14px', borderRadius: '999px',
              fontSize: '1.05rem', marginTop: '12px',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              boxShadow: '0 4px 10px rgba(249, 115, 22, 0.25)' // Thêm tí bóng đổ cho nút nổi lên
            }}
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : "Đăng Nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}