import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api, setSessionId } from '../api';
import { useCustomerStore } from '../store';
import { Loader2, Camera, ArrowRight } from 'lucide-react'; // Đã thêm ArrowRight
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function ScanQR() {
  const [tableNumber, setTableNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [defaultTableNumber, setDefaultTableNumber] = useState('1');
  const [tablesList, setTablesList] = useState<{ table_number: number; status: string }[]>([]);

  const navigate = useNavigate();
  const { tableNumber: pathTableNumber } = useParams();
  const [searchParams] = useSearchParams();
  const queryTableNumber = searchParams.get('table') || searchParams.get('table_number');

  const setSession = useCustomerStore((state) => state.setSession);

  // Lấy trạng thái bàn từ API: Bắt đầu từ bàn 1, nếu bàn 1 có khách (occupied/waiting_payment)
  // thì chuyển sang kiểm tra bàn 2, tiếp tục đến hết. Chọn bàn đầu tiên còn trống (status === 'empty').
  useEffect(() => {
    const fetchTables = async () => {
      try {
        const res = await api.get('/tables/status');
        const tables = res.data.data;
        if (Array.isArray(tables) && tables.length > 0) {
          setTablesList(tables);
          // Sắp xếp các bàn theo số thứ tự tăng dần từ bàn 1
          const sortedTables = [...tables].sort((a, b) => a.table_number - b.table_number);
          // Tìm bàn đầu tiên có trạng thái TRỐNG ('empty')
          const firstEmptyTable = sortedTables.find(t => t.status === 'empty');
          if (firstEmptyTable) {
            setDefaultTableNumber(firstEmptyTable.table_number.toString());
          } else {
            // Nếu tất cả các bàn đều có khách, mặc định dùng bàn đầu tiên trong danh sách
            setDefaultTableNumber(sortedTables[0].table_number.toString());
          }
        }
      } catch (err) {
        console.error('Lỗi khi tải trạng thái bàn:', err);
      }
    };
    fetchTables();
  }, []);

  // Hàm xử lý kết nối phiên bàn
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

  // Tự động xử lý nếu có thông tin bàn từ URL (đường dẫn hoặc query param)
  useEffect(() => {
    const detectedTable = pathTableNumber || queryTableNumber;
    if (detectedTable) {
      setTableNumber(detectedTable);
      processTableSession(detectedTable);
    }
  }, [pathTableNumber, queryTableNumber]);

  const scannerRef = React.useRef<Html5QrcodeScanner | null>(null);
  const tablesListRef = React.useRef(tablesList);

  useEffect(() => {
    tablesListRef.current = tablesList;
  }, [tablesList]);

  useEffect(() => {
    if (isScanning) {
      const scanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        false
      );
      scannerRef.current = scanner;

      scanner.render((decodedText) => {
        let tbNum = '';

        try {
          // Ưu tiên 1: Phân tích QR chuẩn URL (Vd: http://localhost:3001/?table=5 hoặc https://sr-os.local/qr/5)
          const url = new URL(decodedText);
          tbNum = url.searchParams.get("table") || url.searchParams.get("table_number") || '';
          
          if (!tbNum) {
            // Kiểm tra khớp đường dẫn dạng /qr/5 hoặc /tables/5
            const pathParts = url.pathname.split('/');
            const qrIndex = pathParts.indexOf('qr');
            if (qrIndex !== -1 && pathParts[qrIndex + 1]) {
              tbNum = pathParts[qrIndex + 1];
            } else {
              const tablesIndex = pathParts.indexOf('tables');
              if (tablesIndex !== -1 && pathParts[tablesIndex + 1]) {
                tbNum = pathParts[tablesIndex + 1];
              }
            }
          }
          
          if (!tbNum) {
            const match = url.pathname.match(/\/(\d+)\/?$/);
            if (match) {
              tbNum = match[1];
            }
          }
        } catch (error) {
          // Ưu tiên 2: Phương án dự phòng (Fallback)
          // Nếu QR quét được không phải là link (bị lỗi parse), dùng regex lấy số
          tbNum = decodedText.replace(/\D/g, '');
        }

        if (tbNum) {
          const currentTablesList = tablesListRef.current;
          const exists = currentTablesList.some(t => t.table_number.toString() === tbNum);
          if (currentTablesList.length > 0 && !exists) {
            setError(`Bàn số ${tbNum} từ mã QR không tồn tại trong hệ thống.`);
            if (scannerRef.current) {
              scannerRef.current.clear().catch(console.error);
              scannerRef.current = null;
            }
            setIsScanning(false);
            return;
          }
          setTableNumber(tbNum);
          if (scannerRef.current) {
            scannerRef.current.clear().catch(console.error);
            scannerRef.current = null;
          }
          setIsScanning(false);
          processTableSession(tbNum); // Tự động xử lý khi quét thành công
        }
      }, undefined);
    }

    return () => {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [isScanning]);

  const isInputValid = !tableNumber || (tablesList.length === 0 || tablesList.some(t => t.table_number.toString() === tableNumber));

  const activeQRTable = (tableNumber && tablesList.some(t => t.table_number.toString() === tableNumber))
    ? tableNumber
    : defaultTableNumber;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tableNumber || !isInputValid) return;
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
            <button
              className="btn btn-secondary"
              style={{ width: '100%', padding: '14px' }}
              onClick={() => {
                if (scannerRef.current) {
                  scannerRef.current.clear().catch(console.error);
                  scannerRef.current = null;
                }
                setIsScanning(false);
              }}
            >
              Huỷ quét mã
            </button>
          </div>
        ) : (
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

            {/* Mã QR thực tế động */}
            <div 
              onClick={() => processTableSession(activeQRTable)}
              title="Click để mô phỏng quét nhanh bàn này"
              style={{
                padding: '12px',
                background: 'white',
                borderRadius: 'var(--border-radius-md)',
                boxShadow: '0 10px 30px rgba(0,0,0,0.06)',
                cursor: 'pointer',
                marginBottom: '20px',
                transition: 'all 0.2s ease',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '8px',
                border: '1px solid var(--glass-border)'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'scale(1.05)';
                e.currentTarget.style.boxShadow = '0 12px 36px rgba(255, 71, 87, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'scale(1)';
                e.currentTarget.style.boxShadow = '0 10px 30px rgba(0,0,0,0.06)';
              }}
            >
              <img 
                src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(window.location.origin + '?table=' + activeQRTable)}`}
                alt="QR Code Table"
                style={{ width: '160px', height: '160px', borderRadius: '4px' }}
              />
              <span style={{ fontSize: '0.8rem', color: '#666', fontWeight: 600 }}>
                Mã QR Bàn {activeQRTable} (Click để quét nhanh)
              </span>
            </div>

            <h1 style={{ fontSize: '1.6rem', marginBottom: '8px', color: 'var(--text-primary)' }}>Smart Restaurant</h1>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px', textAlign: 'center', fontSize: '0.95rem' }}>
              Quét mã QR trên bằng điện thoại hoặc click vào mã để vào bàn.
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

              {!isInputValid && (
                <p style={{ color: 'var(--accent-primary)', fontSize: '0.85rem', textAlign: 'center', margin: '-8px 0 0 0' }}>
                  Bàn số {tableNumber} không tồn tại trong hệ thống.
                </p>
              )}

              {error && <p style={{ color: 'var(--accent-primary)', fontSize: '0.9rem', textAlign: 'center', margin: 0 }}>{error}</p>}

              <button
                type="submit"
                className="btn btn-secondary"
                style={{
                  width: '100%', padding: '14px', fontSize: '1rem',
                  background: (tableNumber && isInputValid) ? 'var(--bg-secondary)' : 'rgba(0,0,0,0.02)',
                  opacity: (loading || !tableNumber || !isInputValid) ? 0.6 : 1,
                  cursor: (loading || !tableNumber || !isInputValid) ? 'not-allowed' : 'pointer',
                  border: (tableNumber && isInputValid) ? '1px solid var(--glass-border)' : '1px solid transparent'
                }}
                disabled={loading || !tableNumber || !isInputValid}
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