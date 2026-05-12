import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useCustomerStore } from '../store';
import { ShoppingBag, Plus, QrCode } from 'lucide-react';

interface MenuItem {
  id: number;
  category_id: number;
  name: string;
  description: string;
  price: string;
  image_url: string;
  is_available: boolean;
}

interface Category {
  id: number;
  name: string;
}

export default function Home() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  const navigate = useNavigate();
  const { sessionId, cart, addToCart, setSession, clearCart } = useCustomerStore();

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
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = (item: MenuItem) => {
    addToCart({
      item_id: item.id,
      name: item.name,
      price: parseFloat(item.price),
      quantity: 1
    });
  };

  if (loading) return <div style={{ padding: '20px', textAlign: 'center' }}>Loading menu...</div>;

  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <header className="glass" style={{ position: 'sticky', top: 0, zIndex: 10, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button 
            className="btn-icon" 
            style={{ width: '36px', height: '36px', background: 'transparent', border: 'none' }}
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
          <h2 style={{ margin: 0 }}>Thực đơn</h2>
        </div>
        <button className="btn-icon" style={{ position: 'relative' }} onClick={() => navigate('/cart')}>
          <ShoppingBag size={20} />
          {cartItemCount > 0 && (
            <span style={{ position: 'absolute', top: -5, right: -5, background: 'var(--accent-primary)', color: 'white', borderRadius: '50%', width: '20px', height: '20px', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
              {cartItemCount}
            </span>
          )}
        </button>
      </header>

      {/* Menu List */}
      <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        {categories.map(cat => {
          const catItems = items.filter(i => i.category_id === cat.id);
          if (catItems.length === 0) return null;
          
          return (
            <div key={cat.id}>
              <h3 className="text-gradient" style={{ marginBottom: '16px', borderBottom: '1px solid var(--glass-border)', paddingBottom: '8px' }}>
                {cat.name}
              </h3>
              <div style={{ display: 'grid', gap: '16px' }}>
                {catItems.map(item => (
                  <div key={item.id} className="glass" style={{ display: 'flex', padding: '12px', borderRadius: 'var(--border-radius-md)', gap: '12px' }}>
                    <div style={{ width: '80px', height: '80px', borderRadius: 'var(--border-radius-sm)', background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                      {item.image_url ? (
                        <img src={item.image_url} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      ) : (
                         <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)' }}>No Img</div>
                      )}
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                      <div>
                        <h4 style={{ fontWeight: 600, fontSize: '1.1rem' }}>{item.name}</h4>
                        <p style={{ fontSize: '0.85rem', marginBottom: '8px' }}>{item.description}</p>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', color: 'var(--accent-secondary)' }}>
                          {parseInt(item.price).toLocaleString()}đ
                        </span>
                        <button className="btn-icon" onClick={() => handleAdd(item)} style={{ width: '32px', height: '32px', background: 'var(--accent-primary)', border: 'none', color: 'white' }}>
                          <Plus size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
