import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSessionId } from '../api';
import { useCustomerStore } from '../store';
import { QrCode, Loader2, Camera, ArrowRight } from 'lucide-react'; // Đã thêm ArrowRight
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function ScanQR() {
  const [tableNumber, setTableNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const navigate = useNavigate();
  const setSession = useCustomerStore((state) => state.setSession);

  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;

    if (isScanning) {
      scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );

      scanner.render((decodedText) => {
        let tbNum = '';

        try {
          // Ưu tiên 1: Phân tích QR chuẩn URL (Vd: http://localhost:3001/?table=5)
          const url = new URL(decodedText);
          tbNum = url.searchParams.get("table") || '';
        } catch (error) {
          // Ưu tiên 2: Phương án dự phòng (Fallback)
          // Nếu QR quét được không phải là link (bị lỗi parse), dùng regex lấy số
          tbNum = decodedText.replace(/\D/g, '');
        }

        if (tbNum) {
          setTableNumber(tbNum);
          setIsScanning(false);
          scanner?.clear();
        }
      }, undefined);
    }

    return () => {
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [isScanning]);

  const processTableSession = async (tbNum: string) => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/tables/${tbNum}/session`);
      const { session_id, table_id, status } = res.data.data;

      setSession(session_id.toString(), table_id, status);
      setSessionId(session_id.toString());

      navigate('/menu');
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Lỗi kết nối tới bàn. Vui lòng thử lại.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber) return;
    processTableSession(tableNumber);
  };

  // UI: Đã được nâng cấp lên giao diện Light Theme hiện đại
  return (
    <div className="animate-fade-in" style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: '20px', background: 'var(--bg-primary)'
    }}>
      <div className="glass" style={{
        padding: '48px 32px', borderRadius: 'var(--border-radius-lg)',
        width: '100%', maxWidth: '400px', background: 'var(--bg-secondary)',
        boxShadow: '0 24px 48px rgba(0,0,0,0.06)', // Đổ bóng mềm
        display: 'flex', flexDirection: 'column', alignItems: 'center'
      }}>

        {isScanning ? (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-primary)' }}>Đưa mã QR vào khung hình</h3>
            <div
              id="qr-reader"
              style={{ width: '100%', marginBottom: '24px', borderRadius: 'var(--border-radius-md)', overflow: 'hidden', border: 'none' }}
            ></div>
            <button className="btn btn-secondary" style={{ width: '100%', padding: '14px' }} onClick={() => setIsScanning(false)}>
              Huỷ quét mã
            </button>
          </div>
        ) : (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Icon QR với hiệu ứng Glow đỏ */}
            <div style={{
              width: '88px', height: '88px', borderRadius: '50%',
              background: 'rgba(255, 71, 87, 0.08)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--accent-primary)', marginBottom: '24px',
              boxShadow: '0 0 40px rgba(255, 71, 87, 0.15)'
            }}>
              <QrCode size={44} strokeWidth={1.5} />
            </div>

            <h1 style={{ fontSize: '1.6rem', marginBottom: '8px', color: 'var(--text-primary)' }}>Smart Restaurant</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '36px', textAlign: 'center', fontSize: '0.95rem' }}>
              Vui lòng quét mã QR trên bàn để bắt đầu.
            </p>

            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '16px', fontSize: '1.05rem', justifyContent: 'center' }}
              onClick={() => setIsScanning(true)}
            >
              <Camera size={20} />
              Quét mã QR (Camera)
            </button>

            {/* Divider ngăn cách */}
            <div style={{ display: 'flex', alignItems: 'center', width: '100%', margin: '28px 0' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
              <span style={{ padding: '0 16px', color: 'var(--text-secondary)', fontSize: '0.85rem', fontWeight: 500 }}>HOẶC NHẬP TAY</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
            </div>

            <form onSubmit={handleSubmit} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input
                type="number"
                placeholder="Số bàn (vd: 1)"
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                style={{
                  width: '100%', padding: '14px 16px',
                  borderRadius: 'var(--border-radius-md)',
                  border: '1px solid var(--glass-border)',
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  fontSize: '1.05rem',
                  textAlign: 'center',
                  outline: 'none',
                  transition: 'var(--transition-fast)'
                }}
                // Hiệu ứng tương tác khi focus vào ô nhập
                onFocus={(e) => {
                  e.target.style.borderColor = 'var(--accent-primary)';
                  e.target.style.background = 'var(--bg-secondary)';
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = 'var(--glass-border)';
                  e.target.style.background = 'var(--bg-tertiary)';
                }}
              />

              {error && <p style={{ color: 'var(--accent-primary)', fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>{error}</p>}

              <button
                type="submit"
                className="btn btn-secondary"
                style={{
                  width: '100%', padding: '14px', fontSize: '1rem',
                  background: tableNumber ? 'var(--bg-secondary)' : 'rgba(0,0,0,0.02)',
                  opacity: (loading || !tableNumber) ? 0.6 : 1,
                  cursor: (loading || !tableNumber) ? 'not-allowed' : 'pointer',
                  border: tableNumber ? '1px solid var(--glass-border)' : '1px solid transparent'
                }}
                disabled={loading || !tableNumber}
              >
                {loading ? <Loader2 className="animate-spin" /> : (
                  <>
                    Xác nhận Bàn
                    <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}