import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useAuthStore } from '../store';
import { Loader2, UserCircle } from 'lucide-react';

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const login = useAuthStore((state) => state.login);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      const res = await api.post('/auth/login', { username, password });
      login(res.data.access_token);
      navigate('/');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Sai tên đăng nhập hoặc mật khẩu');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
      <div className="glass" style={{ padding: '40px 32px', borderRadius: 'var(--border-radius-lg)', width: '100%', maxWidth: '400px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
          <div className="btn-icon" style={{ width: '80px', height: '80px', background: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-primary)', border: 'none' }}>
            <UserCircle size={40} />
          </div>
        </div>
        
        <h2 style={{ textAlign: 'center', marginBottom: '8px' }}>Staff Portal</h2>
        <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: '32px' }}>Vui lòng đăng nhập để tiếp tục</p>
        
        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <input 
              type="text" 
              placeholder="Tên đăng nhập" 
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>
          <div>
            <input 
              type="password" 
              placeholder="Mật khẩu" 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          
          {error && <p style={{ color: 'var(--accent-danger)', fontSize: '0.9rem', textAlign: 'center' }}>{error}</p>}
          
          <button type="submit" className="btn btn-primary" style={{ padding: '16px', marginTop: '8px' }} disabled={loading}>
            {loading ? <Loader2 className="animate-spin" /> : 'Đăng Nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
