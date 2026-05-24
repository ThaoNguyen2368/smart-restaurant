import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Home from './pages/Home';
import CartPage from './pages/CartPage';
import OrderTracker from './pages/OrderTracker';
import ScanQR from './pages/ScanQR';

function App() {
  return (
    <div className="app-container">
      <BrowserRouter>
        <Routes>
          {/* Default entry without session requires QR scan */}
          <Route path="/" element={<ScanQR />} />
          <Route path="/qr/:tableNumber" element={<ScanQR />} />
          <Route path="/menu" element={<Home />} />
          <Route path="/cart" element={<CartPage />} />
          <Route path="/tracking" element={<OrderTracker />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;
