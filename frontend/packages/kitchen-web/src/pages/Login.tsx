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
      setError(err.response?.data?.detail || "Sai ten dang nhap hoac mat khau");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="auth-icon">
          <ChefHat size={40} />
        </div>
        <h2>Kitchen Portal</h2>
        <p className="muted">Dang nhap de quan ly hang doi bep</p>

        <form className="auth-form" onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="kitchen1"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p className="error-text">{error}</p>}
          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? <Loader2 className="spin" /> : "Dang nhap"}
          </button>
        </form>
      </div>
    </div>
  );
}
