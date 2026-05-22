import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useCustomerStore } from '../store';
import { ShoppingBag, Plus, QrCode, Utensils, Search } from 'lucide-react';
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
  const { sessionId, cart, addToCart, setSession, clearCart } = useCustomerStore();

  // Khởi tạo Ref để lưu trữ vị trí (DOM Node) của từng danh mục
  const categoryRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  useEffect(() => {
    if (!sessionId) {
      navigate('/');
      return;
    }
    fetchMenu();
  }, [sessionId, navigate]);

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

  const handleAdd = (item: MenuItem) => {
    if (!item.is_available) return;
    addToCart({
      item_id: item.id,
      name: item.name,
      price: parseFloat(item.price),
      quantity: 1
    });
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

  if (loading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>
        Đang tải thực đơn...
      </div>
    );
  }

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotalPrice = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const normalizedSearch = removeVietnameseTones(searchTerm.toLowerCase());

  return (
    // Tăng paddingTop lên 190px vì Header giờ có thêm thanh Tabs
    <div className="animate-fade-in" style={{ paddingTop: '190px', paddingBottom: '90px', minHeight: '100vh', background: 'var(--bg-primary)' }}>

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
                        {/* Wrapper cho Tên món + Badges */}
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

      {/* ===== BOTTOM CART BAR ===== */}
      {cartItemCount > 0 && (
        <div
          className="glass animate-fade-in"
          style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, padding: '16px 20px',
            background: 'var(--bg-secondary)', zIndex: 50,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            borderTopLeftRadius: 'var(--border-radius-lg)', borderTopRightRadius: 'var(--border-radius-lg)',
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