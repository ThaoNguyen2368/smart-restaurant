import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setSessionId } from '../api';
import { useCustomerStore } from '../store';
import { QrCode, Loader2, Camera } from 'lucide-react';
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
        const tbNum = decodedText.replace(/\D/g, '');
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

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', padding: '20px' }}>
      <div className="glass" style={{ padding: '40px 20px', borderRadius: 'var(--border-radius-lg)', textAlign: 'center', width: '100%', maxWidth: '360px' }}>
        
        {isScanning ? (
          <div>
            <h3 style={{ marginBottom: '16px' }}>Đưa mã QR vào khung hình</h3>
            <div id="qr-reader" style={{ width: '100%', marginBottom: '16px', borderRadius: 'var(--border-radius-md)', overflow: 'hidden' }}></div>
            <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => setIsScanning(false)}>
              Huỷ quét mã
            </button>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'center' }}>
              <div className="btn-icon" style={{ width: '80px', height: '80px', background: 'var(--accent-primary)', color: 'white', border: 'none', boxShadow: 'var(--shadow-glow)' }}>
                <QrCode size={40} />
              </div>
            </div>
            
            <h2>Smart Restaurant</h2>
            <p style={{ marginBottom: '32px', color: 'var(--text-secondary)' }}>Vui lòng quét mã QR trên bàn để bắt đầu.</p>
            
            <button 
              className="btn btn-primary" 
              style={{ width: '100%', marginBottom: '24px', padding: '16px', fontSize: '1.1rem' }} 
              onClick={() => setIsScanning(true)}
            >
              <Camera size={20} style={{ marginRight: '8px' }} />
              Quét mã QR (Camera)
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
              <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>hoặc nhập tay</span>
              <div style={{ flex: 1, height: '1px', background: 'var(--glass-border)' }}></div>
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <input 
                type="number" 
                placeholder="Số bàn (vd: 1)" 
                value={tableNumber}
                onChange={(e) => setTableNumber(e.target.value)}
                style={{ 
                  padding: '16px', 
                  borderRadius: 'var(--border-radius-md)', 
                  border: '1px solid var(--glass-border)', 
                  background: 'rgba(0,0,0,0.5)', 
                  color: 'white',
                  fontSize: '1.2rem',
                  textAlign: 'center'
                }}
              />
              {error && <p style={{ color: 'var(--accent-primary)', fontSize: '0.9rem' }}>{error}</p>}
              <button type="submit" className="btn btn-secondary" disabled={loading || !tableNumber}>
                {loading ? <Loader2 className="animate-spin" /> : 'Xác nhận Bàn'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
