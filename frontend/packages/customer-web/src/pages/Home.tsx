import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useCustomerStore } from '../store';
import { ShoppingBag, Plus, QrCode, Utensils, Search, ChevronUp, ChevronDown, Clock, CheckCircle, Check, X } from 'lucide-react';
import type { MenuItem, Category } from '../../../shared/types';

// Hàm tiện ích: Loại bỏ dấu Tiếng Việt để tìm kiếm chính xác
const removeVietnameseTones = (str: string) => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D');
};

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<number | null>(null);

  const navigate = useNavigate();
  const { sessionId, status, cart, addToCart, setSession, clearCart } = useCustomerStore();

  const [invoice, setInvoice] = useState<any>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [sessionClosed, setSessionClosed] = useState(false);

  // Khởi tạo Ref để lưu trữ vị trí (DOM Node) của từng danh mục
  const categoryRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  const fetchMenu = async () => {
    try {
      const res = await api.get('/menu');
      setCategories(res.data.data.categories);
      setItems(res.data.data.items);
      if (res.data.data.categories.length > 0) {
        setActiveTab(res.data.data.categories[0].id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchInvoice = async () => {
    if (!sessionId) return;
    try {
      const res = await api.get('/invoice');
      setInvoice(res.data.data);
    } catch (err: any) {
      const statusRes = err?.response?.status;
      const detail = err?.response?.data?.detail;
      if (statusRes === 401 || detail === 'Invalid or closed session') {
        setSessionClosed(true);
        setSession(sessionId, useCustomerStore.getState().tableId!, 'closed');
      }
    }
  };

  useEffect(() => {
    if (!sessionId) {
      navigate('/');
      return;
    }
    fetchMenu();
    fetchInvoice();

    // Thiết lập kết nối WebSocket đồng bộ realtime
    const apiBase = import.meta.env.VITE_API_URL || 'http://localhost:8000/api';
    const wsBase = apiBase.replace('http', 'ws').replace(/\/api\/?$/, '');
    const wsUrl = `${wsBase}/ws/orders/${sessionId}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === 'ORDER_UPDATED' || data.event === 'ITEM_STATUS_CHANGED') {
          fetchInvoice();
        }
        if (data.event === 'SESSION_CLOSED') {
          setSessionClosed(true);
          setSession(sessionId, useCustomerStore.getState().tableId!, 'closed');
        }
      } catch { }
    };

    return () => {
      ws.close();
    };
  }, [sessionId, navigate]);

  const handleAdd = (item: MenuItem) => {
    if (!item.is_available) return;
    addToCart({
      item_id: item.id,
      name: item.name,
      price: parseFloat(item.price),
      quantity: 1
    });
  };

  const handleRequestPayment = async () => {
    try {
      await api.post(`/sessions/${sessionId}/payment-request`);
      setSession(sessionId!, useCustomerStore.getState().tableId!, 'waiting_payment');
      alert('Đã gửi yêu cầu thanh toán thành công! Vui lòng chờ nhân viên.');
    } catch (err) {
      console.error(err);
      alert('Không thể gửi yêu cầu thanh toán. Vui lòng thử lại.');
    }
  };

  // Hàm xử lý sự kiện cuộn tới danh mục
  const scrollToCategory = (categoryId: number) => {
    setActiveTab(categoryId);
    const element = categoryRefs.current[categoryId];
    if (element) {
      // Lấy vị trí phần tử, trừ đi độ cao của Fixed Header (~190px)
      const y = element.getBoundingClientRect().top + window.scrollY - 190;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  const getStatusText = (cookingStatus: string) => {
    switch (cookingStatus) {
      case 'pending': return 'Đã gửi';
      case 'confirmed': return 'Nhận đơn';
      case 'cooking': return 'Đang nấu';
      case 'done': return 'Hoàn thành';
      case 'served': return 'Đã phục vụ';
      case 'cancelled': return 'Đã huỷ';
      default: return cookingStatus;
    }
  };

  const getStatusIcon = (cookingStatus: string) => {
    switch (cookingStatus) {
      case 'pending': return <Clock size={14} color="var(--accent-warning)" />;
      case 'confirmed': return <CheckCircle size={14} color="var(--accent-info)" />;
      case 'cooking': return <Utensils size={14} color="var(--accent-primary)" />;
      case 'done': return <CheckCircle size={14} color="var(--accent-secondary)" />;
      case 'served': return <Check size={14} color="var(--accent-secondary)" />;
      case 'cancelled': return <X size={14} color="var(--accent-primary)" />;
      default: return null;
    }
  };

  const getStatusColor = (cookingStatus: string) => {
    switch (cookingStatus) {
      case 'pending': return 'rgba(255, 193, 7, 0.1)';
      case 'confirmed': return 'rgba(51, 154, 240, 0.1)';
      case 'cooking': return 'rgba(255, 71, 87, 0.1)';
      case 'done': return 'rgba(32, 201, 151, 0.1)';
      case 'served': return 'rgba(32, 201, 151, 0.2)';
      case 'cancelled': return 'rgba(255, 71, 87, 0.2)';
      default: return 'var(--bg-tertiary)';
    }
  };

  const getStatusTextColor = (cookingStatus: string) => {
    switch (cookingStatus) {
      case 'pending': return 'var(--accent-warning)';
      case 'confirmed': return 'var(--accent-info)';
      case 'cooking': return 'var(--accent-primary)';
      case 'done': return 'var(--accent-secondary)';
      case 'served': return 'var(--accent-secondary)';
      case 'cancelled': return 'var(--accent-primary)';
      default: return 'var(--text-secondary)';
    }
  };

  const getStatusStepIndex = (cookingStatus: string) => {
    switch (cookingStatus) {
      case 'pending': return 0;
      case 'confirmed': return 1;
      case 'cooking': return 2;
      case 'done': return 3;
      case 'served': return 4;
      default: return -1;
    }
  };

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        Đang tải thực đơn...
      </div>
    );
  }

  if (sessionClosed || status === 'closed') {
    return (
      <div className="animate-fade-in" style={{ padding: '20px', paddingTop: '100px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: 'var(--bg-primary)' }}>
        <div className="glass" style={{ padding: '32px 24px', borderRadius: 'var(--border-radius-lg)', textAlign: 'center', maxWidth: '400px' }}>
          <h3 style={{ marginBottom: '12px', color: 'var(--accent-primary)' }}>Phiên đã kết thúc</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem', marginBottom: '24px' }}>
            Bàn đã được thanh toán và reset. Vui lòng quét lại mã QR để tạo phiên mới.
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => { clearCart(); navigate('/'); }}>
            Quét lại mã QR
          </button>
        </div>
      </div>
    );
  }

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const normalizedSearch = removeVietnameseTones(searchTerm.toLowerCase());

  const hasOrderedItems = invoice && invoice.details && invoice.details.length > 0;
  const bottomOffset = cartItemCount > 0 ? '85px' : '0px';

  return (
    <div className="animate-fade-in" style={{ paddingTop: '190px', paddingBottom: hasOrderedItems ? '160px' : '90px', minHeight: '100vh', background: 'var(--bg-primary)' }}>

      {/* ===== KHU VỰC FIXED HEADER TỔNG HỢP ===== */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'var(--bg-primary)',
        borderBottom: '1px solid var(--glass-border)',
        boxShadow: 'var(--shadow-card)'
      }}>
        {/* 1. Header Top */}
        <header style={{ padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <button
              className="btn-icon"
              style={{ width: '40px', height: '40px', background: 'var(--glass-bg)', color: 'var(--text-primary)' }}
              onClick={() => {
                if (confirm('Bạn muốn thoát bàn này và quét mã QR khác? (Giỏ hàng sẽ bị xoá)')) {
                  setSession(null as any, null as any, null as any);
                  clearCart();
                  navigate('/');
                }
              }}
            >
              <QrCode size={20} />
            </button>
            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>Thực đơn</h2>
          </div>
        </header>

        {/* 2. Thanh tìm kiếm */}
        <div style={{ padding: '0 20px 12px 20px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', background: 'var(--bg-secondary)',
            border: '1px solid var(--glass-border)', borderRadius: 'var(--border-radius-pill)',
            padding: '10px 16px', gap: '8px'
          }}>
            <Search size={18} color="var(--text-secondary)" />
            <input
              type="text"
              placeholder="Tìm món ăn..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%', fontSize: '0.95rem' }}
            />
          </div>
        </div>

        {/* 3. Thanh Danh Mục Cuộn Ngang (Horizontal Scroll Tabs) */}
        <div style={{
          display: 'flex', overflowX: 'auto', gap: '12px', padding: '0 20px 12px 20px',
          scrollbarWidth: 'none', // Ẩn scrollbar trên Firefox
          msOverflowStyle: 'none', // Ẩn scrollbar trên IE/Edge
        }} className="hide-scrollbar">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => scrollToCategory(cat.id)}
              style={{
                whiteSpace: 'nowrap',
                padding: '8px 16px',
                borderRadius: 'var(--border-radius-pill)',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                transition: 'var(--transition-fast)',
                background: activeTab === cat.id ? 'var(--accent-primary)' : 'var(--bg-secondary)',
                color: activeTab === cat.id ? 'white' : 'var(--text-secondary)',
                boxShadow: activeTab === cat.id ? 'var(--shadow-glow)' : 'none',
                cursor: 'pointer'
              }}
            >
              {cat.name}
            </button>
          ))}
        </div>
      </div>
      {/* ========================================= */}

      {/* ===== MENU LIST ===== */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {categories.map(cat => {
          // Lọc theo danh mục & từ khóa không dấu
          const catItems = items.filter(i =>
            i.category_id === cat.id &&
            removeVietnameseTones(i.name.toLowerCase()).includes(normalizedSearch)
          );

          if (catItems.length === 0) return null;

          return (
            <div key={cat.id} ref={(el) => { categoryRefs.current[cat.id] = el; }}>
              <h3 style={{ marginBottom: '16px', fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {cat.name}
              </h3>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {catItems.map(item => (
                  <div
                    key={item.id}
                    className="glass"
                    style={{
                      display: 'flex', padding: '12px', borderRadius: 'var(--border-radius-md)', gap: '16px',
                      opacity: item.is_available ? 1 : 0.5, transition: 'var(--transition-fast)'
                    }}
                  >
                    {/* Ảnh món ăn */}
                    <div style={{
                      width: '90px', height: '90px', borderRadius: 'var(--border-radius-sm)',
                      background: 'var(--bg-tertiary)', overflow: 'hidden', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                        <Utensils size={32} color="var(--text-secondary)" opacity={0.5} />
                      )}
                    </div>

                    {/* Thông tin món ăn */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: '4px 0' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <h4 style={{ margin: 0, fontWeight: 600, fontSize: '1.05rem', color: 'var(--text-primary)', lineHeight: 1.3 }}>
                            {item.name}
                          </h4>

                          {/* Badge: Best Seller */}
                          {item.id === 1 && (
                            <span style={{
                              background: 'linear-gradient(135deg, #ff9f43, #ff6b6b)', color: 'white',
                              fontSize: '0.65rem', fontWeight: 'bold', padding: '3px 8px', borderRadius: 'var(--border-radius-pill)',
                              textTransform: 'uppercase', letterSpacing: '0.5px'
                            }}>
                              Best Seller
                            </span>
                          )}

                          {/* Badge: Tạm hết */}
                          {!item.is_available && (
                            <span style={{
                              background: 'rgba(255, 71, 87, 0.1)', color: 'var(--accent-primary)',
                              fontSize: '0.7rem', fontWeight: 'bold', padding: '4px 8px', borderRadius: '4px', whiteSpace: 'nowrap'
                            }}>
                              Tạm hết
                            </span>
                          )}
                        </div>

                        <p style={{ margin: '6px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {item.description}
                        </p>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '12px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent-secondary)', fontSize: '1rem' }}>
                          {parseInt(item.price).toLocaleString('vi-VN')}đ
                        </span>

                        {item.is_available && (
                          <button
                            className="btn-action-hover"
                            onClick={() => handleAdd(item)}
                            style={{
                              width: '36px', height: '36px', background: 'var(--bg-tertiary)',
                              border: 'none', borderRadius: '50%', color: 'var(--accent-primary)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center'
                            }}
                          >
                            <Plus size={20} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== REALTIME ACTIVE ORDERS BOTTOM DRAWER ===== */}
      {hasOrderedItems && (
        <div
          className="glass animate-fade-in"
          style={{
            position: 'fixed',
            bottom: bottomOffset,
            left: 0,
            right: 0,
            zIndex: 45,
            maxWidth: '480px',
            margin: '0 auto',
            borderTopLeftRadius: 'var(--border-radius-lg)',
            borderTopRightRadius: 'var(--border-radius-lg)',
            boxShadow: '0 -8px 24px rgba(0, 0, 0, 0.08)',
            background: 'var(--bg-secondary)',
            borderTop: '1px solid var(--glass-border)',
            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            maxHeight: isDrawerOpen ? '80vh' : '56px',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Collapsed view header */}
          <div
            onClick={() => setIsDrawerOpen(!isDrawerOpen)}
            style={{
              padding: '16px 20px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none',
              borderBottom: isDrawerOpen ? '1px solid var(--glass-border)' : 'none',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{
                width: '10px', height: '10px', borderRadius: '50%',
                background: 'var(--accent-secondary)',
                animation: 'pulse-glow 2.0s infinite'
              }} />
              <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                Đơn đã gọi ({invoice.details.length} món)
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '1.05rem' }}>
                {invoice.total.toLocaleString()}đ
              </span>
              {isDrawerOpen ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
            </div>
          </div>

          {/* Expanded timeline & tracking details */}
          {isDrawerOpen && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }} className="hide-scrollbar">
              <h4 style={{ margin: '0 20px 16px 20px', fontSize: '1rem', fontWeight: 700 }}>Tiến trình chế biến món ăn</h4>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '0 20px' }}>
                {invoice.details.map((detail: any) => {
                  const stepIdx = getStatusStepIndex(detail.cooking_status);
                  const updateTime = detail.updated_at ? new Date(detail.updated_at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : null;

                  return (
                    <div
                      key={detail.id}
                      style={{
                        padding: '14px',
                        background: 'var(--bg-primary)',
                        borderRadius: 'var(--border-radius-md)',
                        border: '1px solid var(--glass-border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '10px'
                      }}
                    >
                      {/* Item header */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ color: 'var(--accent-primary)' }}>x{detail.quantity}</span>
                            <span>{detail.item_name}</span>
                          </div>
                          {detail.note && (
                            <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontStyle: 'italic', display: 'block', marginTop: '2px' }}>
                              Ghi chú: {detail.note}
                            </span>
                          )}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: getStatusColor(detail.cooking_status),
                            color: getStatusTextColor(detail.cooking_status)
                          }}>
                            {getStatusIcon(detail.cooking_status)}
                            {getStatusText(detail.cooking_status)}
                          </span>
                          {updateTime && (
                            <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
                              Cập nhật: {updateTime}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* horizontal timeline */}
                      {detail.cooking_status !== 'cancelled' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '6px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', padding: '0 8px' }}>
                            {/* Line grey */}
                            <div style={{
                              position: 'absolute', top: '50%', left: '16px', right: '16px', height: '2px',
                              background: 'var(--glass-border)', zIndex: 1, transform: 'translateY(-50%)'
                            }} />
                            {/* Active Line orange */}
                            {stepIdx > 0 && (
                              <div style={{
                                position: 'absolute', top: '50%', left: '16px',
                                width: `${(stepIdx / 4) * 100}%`,
                                maxWidth: 'calc(100% - 32px)',
                                height: '2px',
                                background: 'var(--accent-secondary)', zIndex: 2, transform: 'translateY(-50%)',
                                transition: 'width 0.4s ease'
                              }} />
                            )}
                            {/* Steps */}
                            {["Đã gửi", "Đã nhận", "Nấu nướng", "Xong", "Phục vụ"].map((stepName, idx) => {
                              const isCompleted = idx <= stepIdx;
                              const isCurrent = idx === stepIdx;
                              return (
                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 3, position: 'relative' }}>
                                  <div style={{
                                    width: '10px', height: '10px', borderRadius: '50%',
                                    background: isCompleted ? 'var(--accent-secondary)' : 'var(--bg-primary)',
                                    border: `2px solid ${isCompleted ? 'var(--accent-secondary)' : 'var(--glass-border)'}`,
                                    boxShadow: isCurrent ? '0 0 6px var(--accent-secondary)' : 'none',
                                    transition: 'all 0.3s ease'
                                  }} />
                                  <span style={{
                                    fontSize: '0.6rem', marginTop: '4px',
                                    fontWeight: isCurrent ? 600 : 500,
                                    color: isCurrent ? 'var(--text-primary)' : 'var(--text-secondary)',
                                  }}>
                                    {stepName}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', fontWeight: 500, background: 'rgba(255, 71, 87, 0.05)', padding: '6px 10px', borderRadius: '4px' }}>
                          Món ăn đã bị huỷ. Lý do: {detail.cancel_reason || "Thay đổi thực đơn"}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Running bill detailed breakdown */}
              <div style={{
                padding: '16px 20px',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--border-radius-md)',
                margin: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                fontSize: '0.9rem',
                border: '1px solid var(--glass-border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Số món đã gọi:</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{invoice.details.length} món</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Tạm tính (Subtotal):</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{invoice.subtotal.toLocaleString()}đ</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Thuế VAT (8%):</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{invoice.tax_amount.toLocaleString()}đ</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
                  <span>Phí phục vụ (5%):</span>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{invoice.service_charge.toLocaleString()}đ</span>
                </div>
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: '1.1rem', fontWeight: 700,
                  borderTop: '1px dashed var(--glass-border)', paddingTop: '8px', marginTop: '4px'
                }}>
                  <span>Tổng cộng:</span>
                  <span style={{ color: 'var(--accent-secondary)' }}>{invoice.total.toLocaleString()}đ</span>
                </div>
              </div>

              {/* Payment request buttons */}
              <div style={{ padding: '0 20px 4px 20px' }}>
                <button
                  className="btn btn-primary"
                  style={{
                    width: '100%',
                    padding: '14px',
                    borderRadius: 'var(--border-radius-pill)',
                    fontWeight: 700,
                    fontSize: '1rem',
                    background: status === 'waiting_payment' ? 'var(--bg-tertiary)' : undefined,
                    color: status === 'waiting_payment' ? 'var(--text-secondary)' : undefined,
                    boxShadow: status === 'waiting_payment' ? 'none' : undefined,
                  }}
                  onClick={handleRequestPayment}
                  disabled={status === 'waiting_payment'}
                >
                  {status === 'waiting_payment' ? 'Đang chờ Thu ngân...' : 'Yêu cầu thanh toán'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== BOTTOM CART BAR ===== */}
      {cartItemCount > 0 && (
        <div
          className="glass animate-fade-in"
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px 20px',
            background: 'var(--bg-secondary)', zIndex: 50,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTopLeftRadius: 'var(--border-radius-lg)', borderTopRightRadius: 'var(--border-radius-lg)',
            boxShadow: '0 -4px 16px rgba(0,0,0,0.05)',
            maxWidth: '480px',
            margin: '0 auto',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Giỏ hàng ({cartItemCount} món)
            </span>
            <span style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--accent-primary)' }}>
              {cartTotalPrice.toLocaleString('vi-VN')}đ
            </span>
          </div>

          <button
            className="btn btn-primary"
            onClick={() => navigate('/cart')}
            style={{
              border: 'none', padding: '12px 24px', borderRadius: 'var(--border-radius-pill)',
              fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '8px'
            }}
          >
            <ShoppingBag size={18} />
            Xem giỏ hàng
          </button>
        </div>
      )}
    </div>
  );
}