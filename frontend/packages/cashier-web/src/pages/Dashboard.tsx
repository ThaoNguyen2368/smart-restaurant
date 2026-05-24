import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Banknote,
  CheckCircle2,
  CreditCard,
  Loader2,
  LogOut,
  RefreshCcw,
  Search,
  Wifi,
  WifiOff,
  Receipt,
  QrCode,
  X,
  TicketPercent,
  Printer,
  Filter,
  Wallet
} from "lucide-react";
import type { PaymentMethod, WSEvent } from "@smart-restaurant-os/shared";
import { api } from "../api";
import { useAuthStore } from "../store";

interface InvoiceDetail {
  id: number;
  item_id: number;
  item_name: string;
  quantity: number;
  unit_price: number | string;
  cooking_status: string;
  note?: string | null;
  split_label?: string | null; // Bổ sung trường này để nhận dữ liệu từ Backend
}

interface PaymentRecord {
  id: number;
  amount: number | string;
  payment_method: PaymentMethod;
  status: string;
  split_label?: string | null;
  transaction_ref?: string | null;
  paid_at?: string;
}

interface InvoiceData {
  session_id: number;
  table_id: number;
  session_status?: string;
  table_status?: string | null;
  subtotal: number | string;
  tax_amount: number | string;
  service_charge: number | string;
  total: number | string;
  total_paid: number | string;
  remaining: number | string;
  details: InvoiceDetail[];
  split_groups?: Record<string, {
    subtotal: number | string;
    total: number | string;
    paid: number | string;
    remaining: number | string;
    tax_amount?: number | string;
    service_charge?: number | string;
    total_paid?: number | string;
  }>;
  payments: PaymentRecord[];
}

interface QueueItem {
  session_id: number;
  table_id: number;
  received_at: string;
}

const formatVnd = (value: number | string) => {
  const num = typeof value === "string" ? Number(value) : value;
  if (Number.isNaN(num)) return "0 đ";
  return new Intl.NumberFormat("vi-VN").format(num) + " đ";
};

const getWsUrl = (token: string) => {
  const base = import.meta.env.VITE_API_URL || "http://localhost:8000/api";
  const wsBase = base.replace("http", "ws").replace(/\/api\/?$/, "");
  return `${wsBase}/ws/cashier?token=${token}`;
};

export default function Dashboard() {
  const navigate = useNavigate();
  const logout = useAuthStore((state) => state.logout);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [searchInput, setSearchInput] = useState<string>("");
  const [selectedSessionId, setSelectedSessionId] = useState<string>("");

  const [invoice, setInvoice] = useState<InvoiceData | null>(null);
  const [loadingInvoice, setLoadingInvoice] = useState(false);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);

  const [paymentStep, setPaymentStep] = useState<'menu' | 'cash' | 'transfer' | 'card' | 'voucher'>("menu");
  const [amountInput, setAmountInput] = useState("");
  const [transactionRef, setTransactionRef] = useState("");
  const [processing, setProcessing] = useState(false);
  const [tempDiscount, setTempDiscount] = useState<number>(0);
  const [qrKey, setQrKey] = useState<number>(Date.now());

  const [filterMethod, setFilterMethod] = useState<string>("all");
  const [shiftSummary, setShiftSummary] = useState<any>(null);

  const [showEndShiftModal, setShowEndShiftModal] = useState(false);
  const [actualCash, setActualCash] = useState("");
  const [lastChangeAmount, setLastChangeAmount] = useState<number>(0);

  // States Tách hóa đơn
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitAssignments, setSplitAssignments] = useState<{ [detailId: number]: string }>({});
  const [selectedSplitGroup, setSelectedSplitGroup] = useState<string>("Unassigned");

  const groupedPayments = useMemo(() => {
    if (!shiftSummary || !shiftSummary.payments) return [];

    const groups = shiftSummary.payments.reduce((acc: any, p: any) => {
      const isRounding = p.payment_method === 'voucher' && p.transaction_ref?.toLowerCase().includes('làm tròn');
      if (isRounding) return acc;

      if (!acc[p.session_id]) {
        acc[p.session_id] = {
          session_id: p.session_id,
          latest_time: p.paid_at,
          methods: [p.payment_method],
          transactions: [{ id: p.id, ref: p.transaction_ref, amount: p.amount, method: p.payment_method }],
          total_amount: p.payment_method !== "voucher" ? Number(p.amount) : 0
        };
      } else {
        if (!acc[p.session_id].methods.includes(p.payment_method)) {
          acc[p.session_id].methods.push(p.payment_method);
        }
        acc[p.session_id].transactions.push({ id: p.id, ref: p.transaction_ref, amount: p.amount, method: p.payment_method });
        if (p.payment_method !== "voucher") {
          acc[p.session_id].total_amount += Number(p.amount);
        }

        if (new Date(p.paid_at) > new Date(acc[p.session_id].latest_time)) {
          acc[p.session_id].latest_time = p.paid_at;
        }
      }
      return acc;
    }, {});

    return Object.values(groups).sort((a: any, b: any) => new Date(b.latest_time).getTime() - new Date(a.latest_time).getTime());
  }, [shiftSummary]);

  const displayedPayments = useMemo(() => {
    if (filterMethod === "all") return groupedPayments;
    return groupedPayments.filter((group: any) => group.methods.includes(filterMethod));
  }, [groupedPayments, filterMethod]);

  const getErrorMessage = (err: any, fallback: string) => {
    const detail = err?.response?.data?.detail;
    if (!detail) return fallback;
    if (typeof detail === "string") return detail;
    return detail.message || fallback;
  };

  const wsRef = useRef<WebSocket | null>(null);
  const pollRef = useRef<number | null>(null);

  // Lấy số tiền Remaining theo Nhóm đang được chọn
  const remaining = useMemo(() => {
    if (!invoice) return 0;

    if (invoice.split_groups && Object.keys(invoice.split_groups).length > 0) {
      const groupData = invoice.split_groups[selectedSplitGroup];
      if (groupData) {
        const val = typeof groupData.remaining === "string" ? Number(groupData.remaining) : groupData.remaining;
        return Math.max(0, Number.isNaN(val) ? 0 : val);
      }
    }

    const value = typeof invoice.remaining === "string" ? Number(invoice.remaining) : invoice.remaining;
    const num = Number.isNaN(value) ? 0 : value;
    return Math.max(0, num);
  }, [invoice, selectedSplitGroup]);

  const getRoundedAmount = (amount: number) => {
    const r = amount % 1000;
    if (r >= 500) return amount + (1000 - r);
    return amount - r;
  };

  const roundedRemaining = useMemo(() => {
    if (paymentStep !== 'cash') return remaining;
    return getRoundedAmount(remaining);
  }, [paymentStep, remaining]);

  const changeAmount = useMemo(() => {
    const tendered = Number(amountInput) || 0;
    const required = paymentStep === 'cash' ? roundedRemaining : remaining;
    if (tendered <= required || required <= 0) return 0;
    return tendered - required;
  }, [amountInput, remaining, roundedRemaining, paymentStep]);

  const hasUnservedItems = useMemo(() => {
    if (!invoice) return false;
    return invoice.details.some((detail) => !["served", "cancelled"].includes(detail.cooking_status));
  }, [invoice]);

  useEffect(() => {
    setPaymentStep("menu");
    setTempDiscount(0);
    setAmountInput("");
    setTransactionRef("");
  }, [selectedSessionId]);

  useEffect(() => {
    if (paymentStep === 'cash' && remaining > 0) {
      setAmountInput(String(getRoundedAmount(remaining)));
    } else if (paymentStep !== 'menu' && remaining > 0) {
      setAmountInput(String(remaining));
    } else {
      setAmountInput("");
    }
    setTempDiscount(0);
    setTransactionRef("");
    if (paymentStep === 'transfer') {
      setQrKey(Date.now());
    }
  }, [paymentStep, remaining]);

  const fetchInvoice = async (sessionId: string) => {
    if (!sessionId) return;
    try {
      setLoadingInvoice(true);
      setError("");
      const res = await api.get(`/sessions/${sessionId}/invoice`);
      const nextInvoice = res.data.data as InvoiceData;
      setInvoice(nextInvoice);
      if (nextInvoice.session_status === "closed") {
        setError("Lưu ý: Phiên giao dịch này đã đóng.");
      }
      const currentRemaining = typeof nextInvoice.remaining === "string" ? Number(nextInvoice.remaining) : nextInvoice.remaining;
      if (currentRemaining <= 0) {
        setPaymentStep("menu");
      }

      // Auto switch nhóm split
      const s_labels = [...new Set(nextInvoice.details.map(d => d.split_label || "Unassigned"))];
      if (s_labels.length > 0 && !s_labels.includes(selectedSplitGroup)) {
        setSelectedSplitGroup(s_labels[0]);
      }
    } catch (err: any) {
      setError(getErrorMessage(err, "Không thể tải hóa đơn. Vui lòng kiểm tra lại mã phiên."));
      setInvoice(null);
    } finally {
      setLoadingInvoice(false);
    }
  };

  const openSplitModal = () => {
    if (!invoice) return;
    const initialAssignments: { [id: number]: string } = {};
    invoice.details.forEach(d => {
      initialAssignments[d.id] = d.split_label || "Unassigned";
    });
    setSplitAssignments(initialAssignments);
    setShowSplitModal(true);
  };

  const handleCloseShift = async () => {
    if (!actualCash || isNaN(Number(actualCash))) {
      setError("Vui lòng nhập số tiền hợp lệ");
      return;
    }
    setProcessing(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL || "http://localhost:8000/api"}/shift-summary/close`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ actual_cash: Number(actualCash) })
      });
      if (!res.ok) throw new Error("Lỗi khi kết thúc ca");
      setShowEndShiftModal(false);
      logout();
      navigate("/login");
    } catch (err: any) {
      setError(getErrorMessage(err, "Không thể kết thúc ca"));
    } finally {
      setProcessing(false);
    }
  };

  const handleSplitBill = async () => {
    if (!selectedSessionId || !invoice) return;
    try {
      setProcessing(true);
      const items = Object.entries(splitAssignments).map(([id, label]) => ({
        order_detail_id: Number(id),
        split_label: label || "Unassigned"
      }));

      await api.post(`/sessions/${selectedSessionId}/split-bill`, { items });
      setShowSplitModal(false);
      fetchInvoice(selectedSessionId);
    } catch (err: any) {
      setError(getErrorMessage(err, "Lỗi khi tách hóa đơn"));
    } finally {
      setProcessing(false);
    }
  };

  const fetchWaitingQueue = async () => {
    try {
      const res = await api.get("/sessions/waiting-payment");
      setQueue(res.data.data as QueueItem[]);
    } catch { }
  };

  const fetchShiftSummary = async () => {
    try {
      const res = await api.get("/shift-summary");
      setShiftSummary(res.data.data);
    } catch { }
  };

  useEffect(() => {
    if (!token) return;
    fetchWaitingQueue();
    fetchShiftSummary();

    const ws = new WebSocket(getWsUrl(token));
    wsRef.current = ws;

    ws.onopen = () => {
      setWsConnected(true);
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    };

    ws.onclose = () => {
      setWsConnected(false);
      if (!pollRef.current) {
        pollRef.current = window.setInterval(() => {
          if (selectedSessionId) fetchInvoice(selectedSessionId);
        }, 10000);
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WSEvent;
        if (data.event === "PAYMENT_REQUESTED") {
          const payload = data.payload as any;
          setQueue((prev) => {
            if (prev.some((item) => item.session_id === payload.session_id)) return prev;
            if (!selectedSessionId) setSelectedSessionId(String(payload.session_id));
            return [{ session_id: payload.session_id, table_id: payload.table_id, received_at: new Date().toISOString() }, ...prev];
          });
        } else if (data.event === "TABLE_STATUS_CHANGED") {
          const payload = data.payload as any;
          if (invoice && invoice.table_id === payload.table_id && payload.status === "empty") {
            setInvoice(null);
            setSelectedSessionId("");
            setSearchInput("");
            setQueue((prev) => prev.filter((item) => item.table_id !== payload.table_id));
          }
        }
      } catch { }
    };

    return () => {
      ws.close();
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [token, selectedSessionId]);

  useEffect(() => {
    if (selectedSessionId) fetchInvoice(selectedSessionId);
  }, [selectedSessionId]);

  const handleLookup = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetSessionId = searchInput.trim();
    if (!targetSessionId) return;
    setError("");
    setSelectedSessionId(targetSessionId);
  };

  const handleResetWorkspace = () => {
    setInvoice(null);
    setSelectedSessionId("");
    setSearchInput("");
    setPaymentStep("menu");
    setAmountInput("");
    setTransactionRef("");
    setError("");
    setSelectedSplitGroup("Unassigned");
  };

  const handleCreatePayment = async () => {
    if (!invoice || remaining <= 0) return;

    let payloadAmount = 0;
    let payloadRef: string | undefined = undefined;

    if (paymentStep === 'voucher') {
      // Nếu tách bill, giảm giá sẽ tính theo tổng của NHÓM đó, chứ không phải tổng toàn bill
      const groupTotal = (invoice.split_groups && Object.keys(invoice.split_groups).length > 0) 
        ? (invoice.split_groups[selectedSplitGroup]?.total || 0) 
        : invoice.total;
      const discountAmount = Math.round((Number(groupTotal) * tempDiscount) / 100);
      payloadAmount = Math.min(discountAmount, remaining);
      payloadRef = `VOUCHER-${tempDiscount}%`;
      setLastChangeAmount(0);
    } else if (paymentStep === 'cash') {
      const entered = Number(amountInput) || 0;
      payloadAmount = Math.min(entered, roundedRemaining);
      setLastChangeAmount(changeAmount);
    } else if (paymentStep === 'card') {
      payloadAmount = remaining;
      payloadRef = transactionRef;
      setLastChangeAmount(0);
    } else if (paymentStep === 'transfer') {
      payloadAmount = remaining;
      setLastChangeAmount(0);
    }

    if (payloadAmount <= 0) return;

    try {
      setProcessing(true);
      setError("");

      const payload = {
        session_id: Number(selectedSessionId),
        amount: payloadAmount,
        payment_method: paymentStep,
        transaction_ref: payloadRef || undefined,
        split_label: selectedSplitGroup === "Unassigned" ? undefined : selectedSplitGroup
      };

      await api.post("/payments", payload);

      // Bù phần chênh lệch do làm tròn
      if (paymentStep === 'cash' && payloadAmount === roundedRemaining && roundedRemaining < remaining) {
        const diff = remaining - roundedRemaining;
        await api.post("/payments", {
          session_id: invoice.session_id,
          amount: diff,
          payment_method: "voucher",
          transaction_ref: "Làm tròn giảm",
          split_label: selectedSplitGroup === "Unassigned" ? undefined : selectedSplitGroup
        });
      }

      setPaymentStep("menu");
      await fetchInvoice(String(invoice.session_id));
      await fetchShiftSummary();
    } catch (err: any) {
      setError(getErrorMessage(err, "Không thể ghi nhận thanh toán."));
    } finally {
      setProcessing(false);
    }
  };

  const handleCloseSession = async () => {
    if (!invoice) return;
    try {
      setProcessing(true);
      setError("");
      const response = await api.patch(`/sessions/${invoice.session_id}/close`);
      if (response.status === 200) {
        setQueue((prev) => prev.filter((item) => item.session_id !== invoice.session_id));
        handleResetWorkspace();
        await fetchShiftSummary();
      }
    } catch (err: any) {
      setError(getErrorMessage(err, "Không thể đóng phiên. Vui lòng kiểm tra các món chưa phục vụ."));
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintBill = () => {
    if (!invoice) return;
    window.print();
  };

  const handleReprintHistory = async (sessionId: number) => {
    try {
      setProcessing(true);
      const res = await api.get(`/sessions/${sessionId}/invoice`);
      setInvoice(res.data.data as InvoiceData);
      setSelectedSessionId(String(sessionId));
      
      setTimeout(() => {
        window.print();
      }, 500);
    } catch (err: any) {
      setError(getErrorMessage(err, "Không thể tải hóa đơn để in."));
    } finally {
      setProcessing(false);
    }
  };

  const handlePrintQR = () => {
    const qrUrl = `https://img.vietqr.io/image/970415-0335831571-compact2.png?amount=${remaining}&addInfo=Thanh toan don ${invoice?.session_id}&accountName=QUAN AN SMART OS&time=${qrKey}`;
    const printWindow = window.open('', '_blank', 'width=450,height=550');
    if (printWindow) {
      printWindow.document.write(`
            <html>
                <head>
                    <title>In Mã QR</title>
                    <style>
                        body { text-align: center; font-family: sans-serif; padding: 20px; }
                        h2 { margin: 0 0 5px 0; color: #333; }
                        p { margin: 0 0 20px 0; color: #666; font-size: 14px; }
                        h1 { margin: 0 0 20px 0; color: #1e40af; font-size: 32px; }
                        .qr-box { display: flex; justify-content: center; min-height: 260px; margin-bottom: 20px; }
                        img { width: 250px; height: 250px; border: 1px solid #ccc; border-radius: 8px; padding: 10px; }
                    </style>
                </head>
                <body>
                    <h2>Quét mã thanh toán</h2>
                    <p>Phiên giao dịch #${invoice?.session_id} - Bàn ${invoice?.table_id}</p>
                    
                    <h1>${formatVnd(remaining)}</h1>
                    
                    <div class="qr-box">
                        <img id="qr-img" src="${qrUrl}" alt="Mã VietQR" />
                    </div>
                    
                    <p style="margin: 0;">Cảm ơn quý khách!</p>
                    
                    <script>
                        var img = document.getElementById('qr-img');
                        img.onload = function() {
                            window.print();
                            setTimeout(function() { window.close(); }, 300);
                        };
                        img.onerror = function() {
                            window.print(); 
                            setTimeout(function() { window.close(); }, 300);
                        };
                    </script>
                </body>
            </html>
        `);
      printWindow.document.close();
    }
  };

  return (
    <div className="cashier-shell">
      {/* Sidebar */}
      <aside className="cashier-sidebar">
        <div className="brand">
          <div>
            <p className="brand-title">Smart OS</p>
            <p className="brand-sub">Cashier Portal • {user?.role}</p>
          </div>
          <button className="btn btn-secondary" onClick={() => { logout(); navigate("/login"); }}>
            <LogOut size={18} /> Đăng xuất
          </button>
        </div>

        <div className="sidebar-section">
          <div className="section-header">
            <span>Yêu cầu thanh toán</span>
            <span className={`status-pill ${wsConnected ? "online" : "offline"}`}>
              {wsConnected ? <Wifi size={14} /> : <WifiOff size={14} />}
              {wsConnected ? "WS Online" : "WS Offline"}
            </span>
          </div>
          {queue.length === 0 ? (
            <div className="empty-state muted" style={{ fontSize: '0.85rem' }}>
              Chưa có yêu cầu mới. Bạn có thể nhập mã phiên để tra cứu.
            </div>
          ) : (
            <div className="queue-list">
              {queue.map((item) => (
                <button
                  key={item.session_id}
                  className={`queue-item ${String(item.session_id) === selectedSessionId ? "active" : ""}`}
                  onClick={() => setSelectedSessionId(String(item.session_id))}
                >
                  <div>
                    <p style={{ fontWeight: 600 }}>Phiên #{item.session_id}</p>
                    <span>Bàn {item.table_id}</span>
                  </div>
                  <span className="queue-time">{new Date(item.received_at).toLocaleTimeString("vi-VN")}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="cashier-main">
        <header className="main-header">
          <div>
            <h1><Receipt size={32} color="var(--accent-primary)" /> Thanh toán &amp; Hoá đơn</h1>
            <p className="muted" style={{ marginTop: '4px' }}>Xác nhận thanh toán và đóng phiên nhanh chóng.</p>
          </div>
          <div className="lookup">
            <form onSubmit={handleLookup} style={{ display: 'flex', gap: '10px' }}>
              <div className="lookup-field">
                <Search size={18} color="var(--text-secondary)" />
                <input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Nhập mã phiên..."
                  inputMode="numeric"
                />
              </div>
              <button className="btn btn-secondary" type="submit">
                <RefreshCcw size={16} /> Tra cứu
              </button>
            </form>
          </div>
        </header>

        {error && (
          <div className="banner-error">
            <span>{error}</span>
            <button onClick={() => setError("")} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={18} color="var(--accent-danger)" /></button>
          </div>
        )}

        {loadingInvoice ? (
          <div className="center"><Loader2 className="animate-spin" size={40} color="var(--accent-primary)" /></div>
        ) : (
          <div className="content-grid">

            {/* Cột Trái: Thông tin phiên */}
            <section className="card">
              <div className="card-header">
                <div>
                  <h3><Receipt size={20} /> Thông tin phiên</h3>
                  <p className="muted" style={{ fontSize: '0.85rem', marginTop: '4px' }}>Chi tiết món và tổng tiền</p>
                </div>
              </div>

              {!invoice ? (
                <div className="center muted" style={{ minHeight: '200px', flexDirection: 'column', gap: '12px' }}>
                  <Receipt size={48} opacity={0.2} />
                  <span>Chưa chọn phiên giao dịch nào.</span>
                </div>
              ) : (
                <div className="invoice-body">
                  <div style={{ display: 'flex', gap: '12px', fontSize: '0.9rem', fontWeight: 600, paddingBottom: '12px', borderBottom: '1px solid var(--glass-border)', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <span>Phiên #{invoice.session_id}</span> •
                      <span style={{ color: 'var(--accent-primary)', marginLeft: '4px' }}>Bàn {invoice.table_id}</span>
                    </div>
                    {Number(invoice.remaining) > 0 && (
                      <button onClick={openSplitModal} className="btn" style={{ padding: '6px 10px', fontSize: '0.8rem', background: '#e0e7ff', color: '#4338ca', border: '1px solid #c7d2fe' }}>
                        Tách hóa đơn
                      </button>
                    )}
                  </div>

                  <table className="invoice-table">
                    <thead>
                      <tr>
                        <th style={{ width: '10%' }}>STT</th>
                        <th style={{ width: '60%' }}>Tên món</th>
                        <th style={{ width: '30%', textAlign: 'right' }}>Số lượng</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoice.details.map((detail, idx) => (
                        <tr key={detail.id}>
                          <td className="muted">{idx + 1}</td>
                          <td>
                            <div style={{ fontWeight: 500 }}>
                              {detail.item_name}
                              {/* Hiển thị thẻ Split Label nếu có nhóm khác Unassigned */}
                              {detail.split_label && detail.split_label !== 'Unassigned' && (
                                <span style={{ marginLeft: '8px', fontSize: '0.7rem', padding: '2px 6px', background: '#e0e7ff', color: '#4f46e5', borderRadius: '4px' }}>
                                  {detail.split_label}
                                </span>
                              )}
                            </div>
                            <div className="muted" style={{ fontSize: '0.8rem' }}>{formatVnd(detail.unit_price)}</div>
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{detail.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="summary-box">
                    <div><span className="muted">Tổng món</span><strong>{invoice.details.reduce((acc, curr) => acc + curr.quantity, 0)}</strong></div>

                    {invoice.payments && invoice.payments.filter(p => p.payment_method === 'voucher').map((p, idx) => (
                      <div key={`uv-${p.id || idx}`} style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#ea580c' }}>
                          Voucher giảm giá
                          {p.split_label && p.split_label !== 'Unassigned' && ` (${p.split_label})`}
                        </span>
                        <strong style={{ color: '#c2410c' }}>- {formatVnd(p.amount)}</strong>
                      </div>
                    ))}

                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed var(--glass-border)', paddingTop: '10px', marginTop: '10px' }}>
                      <span className="muted">Tạm tính</span>
                      <strong>{formatVnd(invoice.subtotal)}</strong>
                    </div>

                    {Number(invoice.service_charge) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                        <span className="muted">Phí phục vụ</span>
                        <strong>{formatVnd(invoice.service_charge)}</strong>
                      </div>
                    )}

                    {Number(invoice.tax_amount) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
                        <span className="muted">Thuế VAT</span>
                        <strong>{formatVnd(invoice.tax_amount)}</strong>
                      </div>
                    )}

                    <div className="summary-total" style={{ paddingTop: '10px' }}>
                      <span className="muted" style={{ fontWeight: 500, fontSize: '0.95rem' }}>Tổng hóa đơn</span>
                      <strong style={{ fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        {formatVnd(
                          Number(invoice.total) -
                          (invoice.payments ? invoice.payments.filter(p => p.payment_method === 'voucher').reduce((acc, p) => acc + Number(p.amount), 0) : 0)
                        )}
                      </strong>
                    </div>
                    {invoice.payments && invoice.payments.filter(p => p.payment_method !== 'voucher').length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px dashed var(--glass-border)', paddingTop: '10px' }}>
                        {invoice.payments.filter(p => p.payment_method !== 'voucher').map((p) => (
                          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                            <span style={{ color: '#16a34a' }}>
                              Đã thu ({p.payment_method})
                              {p.split_label && p.split_label !== 'Unassigned' && ` - ${p.split_label}`}
                            </span>
                            <strong style={{ color: '#15803d' }}>- {formatVnd(p.amount)}</strong>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="summary-total" style={{ borderTop: '1px solid var(--glass-border)' }}>
                      <span>Còn phải thu</span>
                      <strong style={{ color: 'var(--accent-danger)', fontSize: '1.25rem' }}>
                        {formatVnd(Math.max(0, Number(invoice.remaining) || 0))}
                      </strong>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Cột Phải: Xác nhận thanh toán */}
            <section className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              {!invoice ? (
                <div className="center muted" style={{ minHeight: '300px', flexDirection: 'column', gap: '12px' }}>
                  <Wallet size={48} opacity={0.2} />
                  <span>Chờ thông tin thanh toán.</span>
                </div>
              ) : (
                <>
                  <div className="card-header">
                    <div>
                      <h3><Wallet size={20} /> Thanh toán</h3>
                      <p className="muted" style={{ fontSize: '0.85rem', marginTop: '4px' }}>Hoàn tất quá trình thanh toán</p>
                    </div>
                  </div>

                  {/* VÙNG HIỂN THỊ CÁC NHÓM SPLIT BILL */}
                  {invoice.split_groups && Object.keys(invoice.split_groups).length > 0 && (Object.keys(invoice.split_groups).length > 1 || Object.keys(invoice.split_groups)[0] !== 'Unassigned') && (
                    <div style={{ padding: '16px', borderBottom: '1px solid var(--glass-border)' }}>
                      <h4 style={{ marginBottom: '12px', fontSize: '0.9rem' }}>Chọn nhóm thanh toán:</h4>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {Object.entries(invoice.split_groups).map(([label, groupData]) => {
                          const grpRemaining = typeof groupData.remaining === "string" ? Number(groupData.remaining) : groupData.remaining;
                          const isDone = grpRemaining <= 0;
                          return (
                            <div
                              key={label}
                              onClick={() => {
                                if (!isDone) {
                                  setSelectedSplitGroup(label);
                                  setPaymentStep("menu");
                                }
                              }}
                              style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${selectedSplitGroup === label ? 'var(--accent-primary)' : 'var(--glass-border)'}`,
                                background: selectedSplitGroup === label ? '#eff6ff' : (isDone ? '#f8fafc' : '#ffffff'),
                                cursor: isDone ? 'not-allowed' : 'pointer',
                                opacity: isDone ? 0.6 : 1,
                                flex: '1 1 calc(50% - 4px)',
                                display: 'flex',
                                flexDirection: 'column'
                              }}
                            >
                              <span style={{ fontWeight: 600, color: selectedSplitGroup === label ? 'var(--accent-primary)' : 'inherit' }}>{label}</span>
                              <span style={{ fontSize: '0.8rem', color: isDone ? '#16a34a' : 'var(--accent-danger)' }}>
                                {isDone ? 'Đã thanh toán' : `Nợ: ${formatVnd(grpRemaining)}`}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div style={{ padding: '24px', flex: 1, display: 'flex', flexDirection: 'column' }}>
                    {paymentStep === "menu" && (
                      <div className="payment-form" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                        <label style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '10px', display: 'block' }}>
                          {remaining === 0 ? "Khách đã thanh toán đủ tiền:" : "Vui lòng chọn thao tác thanh toán:"}
                        </label>

                        {remaining > 0 && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                            <button className="method-card" onClick={() => setPaymentStep("cash")}>
                              <Banknote size={36} color="#10b981" /> <span>Tiền mặt</span>
                            </button>
                            <button className="method-card" onClick={() => setPaymentStep("transfer")}>
                              <QrCode size={36} color="#3b82f6" /> <span>Chuyển khoản</span>
                            </button>
                            <button className="method-card" onClick={() => setPaymentStep("card")}>
                              <CreditCard size={36} color="#6366f1" /> <span>Thẻ</span>
                            </button>
                            <button className="method-card voucher" onClick={() => setPaymentStep("voucher")}>
                              <TicketPercent size={36} color="#f59e0b" /> <span>Voucher</span>
                            </button>
                          </div>
                        )}

                        <div className="action-buttons" style={{ marginTop: 'auto', borderTop: '1px solid var(--glass-border)', paddingTop: '20px' }}>
                          <button
                            className="btn btn-primary"
                            onClick={handleCloseSession}
                            disabled={!invoice || (Number(invoice.remaining) || 0) > 0 || hasUnservedItems || processing}
                            style={{ padding: '16px', fontSize: '1.05rem' }}
                          >
                            <CheckCircle2 size={18} /> Hoàn tất đóng phiên
                          </button>
                          <button className="btn btn-danger-outline" onClick={handlePrintBill} disabled={!invoice}>
                            <Receipt size={18} /> In hoá đơn
                          </button>
                        </div>
                      </div>
                    )}

                    {paymentStep === "voucher" && (
                      <div className="payment-form">
                        <button className="btn btn-secondary" onClick={() => setPaymentStep("menu")} style={{ width: 'fit-content', padding: '8px 16px', fontSize: '0.85rem' }}>
                          ← Quay lại
                        </button>

                        <div className="input-group" style={{ marginTop: '20px' }}>
                          <label style={{ fontSize: '0.95rem' }}>Khách có Voucher giảm giá? Chọn mức giảm:</label>
                          <div style={{ display: 'flex', gap: '12px', marginTop: '12px' }}>
                            {[5, 10, 20].map(pct => (
                              <button
                                key={pct}
                                className={`btn ${tempDiscount === pct ? 'btn-primary' : 'btn-secondary'}`}
                                style={{ flex: 1, padding: '14px 0', border: tempDiscount !== pct ? '1px solid var(--glass-border)' : 'none', fontSize: '1.05rem' }}
                                onClick={() => setTempDiscount(pct)}
                              >
                                Giảm {pct}%
                              </button>
                            ))}
                          </div>
                        </div>

                        {tempDiscount > 0 && (
                          <div style={{ background: '#fffbeb', padding: '16px', borderRadius: '12px', border: '1px solid #fde68a', margin: '20px 0' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                              <span className="muted">Tổng tiền nhóm (để tính KM):</span>
                              <strong>
                                {formatVnd(invoice.split_groups && Object.keys(invoice.split_groups).length > 0 ? (invoice.split_groups[selectedSplitGroup]?.total || 0) : invoice?.total || 0)}
                              </strong>
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', color: '#ea580c' }}>
                              <span>Mức giảm ({tempDiscount}%):</span>
                              <strong>
                                - {formatVnd(Math.round((Number(invoice.split_groups && Object.keys(invoice.split_groups).length > 0 ? (invoice.split_groups[selectedSplitGroup]?.total || 0) : invoice?.total || 0) * tempDiscount) / 100))}
                              </strong>
                            </div>
                          </div>
                        )}

                        <div className="action-buttons" style={{ marginTop: '20px' }}>
                          <button
                            className="btn btn-primary"
                            style={{ width: '100%', padding: '16px', fontSize: '1.1rem', background: '#f59e0b', color: '#fff' }}
                            onClick={handleCreatePayment}
                            disabled={tempDiscount === 0 || processing}
                          >
                            {processing ? <Loader2 className="animate-spin" /> : `Áp dụng giảm giá ${formatVnd(Math.min(Math.round(Number(invoice.split_groups && Object.keys(invoice.split_groups).length > 0 ? (invoice.split_groups[selectedSplitGroup]?.total || 0) : invoice?.total || 0) * tempDiscount / 100), remaining))}`}
                          </button>
                        </div>
                      </div>
                    )}

                    {(paymentStep === "cash" || paymentStep === "transfer" || paymentStep === "card") && (
                      <div className="payment-form">
                        <button className="btn btn-secondary" onClick={() => setPaymentStep("menu")} style={{ width: 'fit-content', padding: '8px 16px', fontSize: '0.85rem' }}>
                          ← Quay lại chọn phương thức
                        </button>

                        <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)', margin: '16px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '1rem' }}>Cần thanh toán:</span>
                          <strong style={{ fontSize: '1.4rem', color: 'var(--accent-danger)' }}>{formatVnd(paymentStep === 'cash' ? roundedRemaining : remaining)}</strong>
                        </div>

                        {paymentStep === "cash" && (
                          <>
                            <div className="input-group" style={{ marginBottom: '16px' }}>
                              <label>Số tiền khách đưa (có thể nhập ít hơn để thanh toán 1 phần)</label>
                              <input
                                value={amountInput}
                                onChange={(e) => setAmountInput(e.target.value)}
                                inputMode="numeric"
                                placeholder="Nhập số tiền..."
                                style={{ fontSize: '1.2rem', fontWeight: 700 }}
                              />
                            </div>
                            <div className="change-display" style={{ padding: '16px', background: '#ecfdf5', borderRadius: '12px', border: '1px dashed #6ee7b7', display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ color: '#047857', fontWeight: 500 }}>Tiền thối lại</span>
                              <strong style={{ color: '#059669', fontSize: '1.2rem' }}>{formatVnd(changeAmount)}</strong>
                            </div>
                          </>
                        )}

                        {paymentStep === "transfer" && (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px', background: '#eff6ff', borderRadius: '12px', border: '1px solid #bfdbfe', marginBottom: '16px' }}>
                            <p style={{ fontSize: '0.85rem', color: '#1e40af', marginBottom: '12px', fontWeight: 600 }}>Quét mã VietQR để thanh toán</p>

                            <img
                              src={`https://img.vietqr.io/image/970415-0335831571-compact2.png?amount=${remaining}&addInfo=Thanh toan don ${invoice?.session_id}&accountName=QUAN AN SMART OS&time=${qrKey}`}
                              alt="VietQR"
                              style={{ width: '160px', height: '160px', borderRadius: '8px', border: '4px solid white', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', marginBottom: '16px' }}
                            />

                            <div style={{ display: 'flex', gap: '10px' }}>
                              <button className="btn btn-secondary" onClick={handlePrintQR} style={{ background: '#fff', color: '#3b82f6', borderColor: '#3b82f6' }}>
                                <Printer size={16} /> In mã QR
                              </button>
                              <button className="btn btn-secondary" onClick={() => setQrKey(Date.now())} style={{ background: '#fff', color: '#f59e0b', borderColor: '#fcd34d' }}>
                                <RefreshCcw size={16} /> Tạo lại mã
                              </button>
                            </div>
                          </div>
                        )}

                        {paymentStep === "card" && (
                          <div className="input-group" style={{ marginBottom: '16px' }}>
                            <label>Mã giao dịch POS/Bank (Bắt buộc để đối soát)</label>
                            <input
                              value={transactionRef}
                              onChange={(e) => setTransactionRef(e.target.value)}
                              placeholder="VD: VNP-2025-0001"
                            />
                          </div>
                        )}

                        <button
                          className="btn btn-primary"
                          onClick={handleCreatePayment}
                          disabled={processing || (paymentStep === 'cash' && (Number(amountInput) || 0) <= 0)}
                          style={{ padding: '16px', fontSize: '1.1rem', width: '100%', marginTop: '10px' }}
                        >
                          {processing ? (
                            <Loader2 className="animate-spin" />
                          ) : paymentStep === 'cash' ? (
                            <> <CheckCircle2 size={20} /> Xác nhận thu {formatVnd(Math.min(Number(amountInput) || 0, roundedRemaining))}</>
                          ) : (
                            <> <CheckCircle2 size={20} /> Xác nhận đã thu {formatVnd(remaining)}</>
                          )}
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        <div className="shift-summary-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px", borderBottom: "1px solid var(--glass-border)", paddingBottom: "16px" }}>
            <div>
              <h3 style={{ fontSize: "1.3rem", fontWeight: 700 }}>Lịch sử ca làm việc</h3>
              <p className="muted" style={{ fontSize: "0.9rem", marginTop: "4px" }}>
                {filterMethod === "all" ? "Tất cả giao dịch thanh toán trong ca của bạn" : `Lọc theo phương thức: ${filterMethod.toUpperCase()}`}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', background: '#f8fafc', padding: '6px 12px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
                <Filter size={16} color="var(--text-secondary)" style={{ marginRight: '8px' }} />
                <select
                  value={filterMethod}
                  onChange={(e) => setFilterMethod(e.target.value)}
                  style={{ background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontWeight: 500, cursor: 'pointer' }}
                >
                  <option value="all">Tất cả phương thức</option>
                  <option value="cash">Tiền mặt</option>
                  <option value="transfer">Chuyển khoản</option>
                  <option value="card">Thẻ</option>
                  <option value="voucher">Voucher</option>
                </select>
              </div>

              <div style={{ textAlign: "right", marginRight: '16px' }}>
                <span className="muted" style={{ fontSize: "0.85rem" }}>Tổng thu trong ca:</span>
                <h2 style={{ color: "var(--accent-primary)", fontSize: "1.6rem", fontWeight: 700 }}>
                  {shiftSummary ? formatVnd(shiftSummary.total_collected) : "0đ"}
                </h2>
              </div>

              <button
                className="btn btn-primary"
                onClick={() => { setActualCash(""); setShowEndShiftModal(true); }}
                style={{ padding: '12px 16px', height: 'fit-content' }}
              >
                Kết ca POS
              </button>
            </div>
          </div>

          {shiftSummary && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "16px", marginBottom: "24px" }}>
              <div className="stat-box">
                <span className="muted" style={{ fontSize: "0.85rem", display: 'flex', alignItems: 'center', gap: '6px' }}><Banknote size={16} /> Tiền mặt</span>
                <h4 style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "8px" }}>{formatVnd(shiftSummary.payments_by_method?.cash || 0)}</h4>
              </div>
              <div className="stat-box">
                <span className="muted" style={{ fontSize: "0.85rem", display: 'flex', alignItems: 'center', gap: '6px' }}><CreditCard size={16} /> Thẻ</span>
                <h4 style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "8px" }}>{formatVnd(shiftSummary.payments_by_method?.card || 0)}</h4>
              </div>
              <div className="stat-box">
                <span className="muted" style={{ fontSize: "0.85rem", display: 'flex', alignItems: 'center', gap: '6px' }}><QrCode size={16} /> Chuyển khoản</span>
                <h4 style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "8px" }}>{formatVnd(shiftSummary.payments_by_method?.transfer || 0)}</h4>
              </div>
              <div className="stat-box">
                <span className="muted" style={{ fontSize: "0.85rem", display: 'flex', alignItems: 'center', gap: '6px' }}><TicketPercent size={16} /> Giảm giá (Voucher)</span>
                <h4 style={{ fontSize: "1.2rem", fontWeight: 700, marginTop: "8px" }}>{formatVnd(shiftSummary.payments_by_method?.voucher || 0)}</h4>
              </div>
            </div>
          )}

          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "60vh" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.95rem" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid var(--glass-border)", textAlign: "left" }}>
                  <th style={{ padding: "14px 12px", color: "var(--text-secondary)", fontWeight: 600 }}>Thời gian</th>
                  <th style={{ padding: "14px 12px", color: "var(--text-secondary)", fontWeight: 600 }}>Mã phiên</th>
                  <th style={{ padding: "14px 12px", color: "var(--text-secondary)", fontWeight: 600 }}>Các phương thức</th>
                  <th style={{ padding: "14px 12px", color: "var(--text-secondary)", fontWeight: 600 }}>Chi tiết giao dịch</th>
                  <th style={{ padding: "14px 12px", color: "var(--text-secondary)", fontWeight: 600, textAlign: "right" }}>Tổng thanh toán</th>
                </tr>
              </thead>
              <tbody>
                {displayedPayments.length > 0 ? (
                  displayedPayments.map((group: any) => (
                    <tr key={group.session_id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "14px 12px", verticalAlign: "top" }}>
                        <div style={{ fontWeight: 600 }}>{new Date(group.latest_time).toLocaleTimeString("vi-VN")}</div>
                        <div className="muted" style={{ fontSize: "0.8rem" }}>{new Date(group.latest_time).toLocaleDateString("vi-VN")}</div>
                      </td>
                      <td style={{ padding: "14px 12px", verticalAlign: "top" }}>
                        <button onClick={() => setSelectedSessionId(String(group.session_id))} style={{ background: "none", border: "none", color: "var(--accent-secondary)", cursor: "pointer", fontWeight: 600, fontSize: '1rem', padding: 0 }}>
                          #{group.session_id}
                        </button>
                      </td>
                      <td style={{ padding: "14px 12px", verticalAlign: "top" }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {group.methods.map((method: string, idx: number) => (
                            <span key={idx} style={{
                              fontSize: "0.75rem", fontWeight: 600, padding: "4px 8px", borderRadius: "var(--border-radius-pill)",
                              background: method === "cash" ? "#ecfdf5" : method === "card" ? "#eff6ff" : method === "transfer" ? "#fffbeb" : method === "voucher" ? "#fef3c7" : "#fef2f2",
                              color: method === "cash" ? "#10b981" : method === "card" ? "#3b82f6" : method === "transfer" ? "#f59e0b" : method === "voucher" ? "#d97706" : "#ef4444"
                            }}>
                              {method.toUpperCase()}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "14px 12px", color: "var(--text-secondary)", verticalAlign: "top" }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          {group.transactions.map((tx: any, idx: number) => (
                            <div key={idx} style={{ fontSize: "0.85rem", background: '#f8fafc', padding: '6px 10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                              <div style={{ fontWeight: 600, color: "var(--text-primary)", display: 'flex', justifyContent: 'space-between' }}>
                                <span>GD #{tx.id}</span>
                                <span>{formatVnd(tx.amount)}</span>
                              </div>
                              {tx.ref && <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: '2px' }}>Ref: {tx.ref}</div>}
                            </div>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: "14px 12px", textAlign: "right", fontWeight: 700, color: "var(--text-primary)", verticalAlign: "top", fontSize: '1.1rem' }}>
                        <div>{formatVnd(group.total_amount)}</div>
                        <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
                          <button 
                            onClick={() => handleReprintHistory(group.session_id)}
                            style={{ padding: '4px 10px', fontSize: '0.75rem', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                          >
                            <Printer size={12} /> In lại
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr><td colSpan={5} style={{ textAlign: "center", padding: "32px 0", color: "var(--text-secondary)" }}>Không có giao dịch nào phù hợp với bộ lọc.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Lớp In Hoá Đơn */}
      {invoice && (
        <div className="print-bill">
          <div className="print-header">
            <h1>SMART RESTAURANT</h1>
            <p>12 Nguyễn Văn Bảo, Gò Vấp, TP.HCM</p>
            <p>SĐT: 012 345 6789</p>
            <br />
            <h2>HOÁ ĐƠN THANH TOÁN</h2>
            <p>Phiên: #{invoice.session_id}</p>
            <p>Bàn: {invoice.table_id}</p>
            <p>Ngày: {new Date().toLocaleDateString("vi-VN")} {new Date().toLocaleTimeString("vi-VN")}</p>
          </div>

          <div className="print-lines">
            <div className="print-line" style={{ fontWeight: 'bold', borderBottom: '1px dashed #000', paddingBottom: '5px', marginBottom: '5px' }}>
              <span className="print-line-name">Tên món</span>
              <span className="print-line-qty">SL</span>
              <span className="print-line-price">T.Tiền</span>
            </div>
            {invoice.details.map((detail) => (
              <div key={detail.id} className="print-line">
                <span className="print-line-name">{detail.item_name} {detail.split_label && detail.split_label !== 'Unassigned' && `(${detail.split_label})`}</span>
                <span className="print-line-qty">{detail.quantity}</span>
                <span className="print-line-price">
                  {formatVnd(Number(detail.unit_price) * detail.quantity)}
                </span>
              </div>
            ))}
          </div>

          <div className="print-summary">
            <div>
              <span>Cộng tiền hàng:</span>
              <span>{formatVnd(invoice.subtotal)}</span>
            </div>
            <div>
              <span>Thuế VAT:</span>
              <span>{formatVnd(invoice.tax_amount)}</span>
            </div>
            <div>
              <span>Phí phục vụ:</span>
              <span>{formatVnd(invoice.service_charge)}</span>
            </div>
            {invoice.payments && invoice.payments.filter(p => p.payment_method === 'voucher').map((p, idx) => (
              <div key={`v-${p.id || idx}`}>
                <span>Voucher giảm giá:</span>
                <span>- {formatVnd(p.amount)}</span>
              </div>
            ))}
            <div className="print-total">
              <span>TỔNG CỘNG:</span>
              <span>
                {formatVnd(
                  Number(invoice.total) -
                  (invoice.payments ? invoice.payments.filter(p => p.payment_method === 'voucher').reduce((acc, p) => acc + Number(p.amount), 0) : 0)
                )}
              </span>
            </div>

            {/* Print actual payments */}
            {(() => {
              const actualPayments = invoice.payments ? invoice.payments.filter(p => p.payment_method !== 'voucher') : [];
              if (actualPayments.length === 0) return null;

              const lastCashIndex = actualPayments.map(p => p.payment_method).lastIndexOf('cash');

              return (
                <>
                  <div style={{ display: 'block', marginTop: '5px', paddingTop: '5px', borderTop: '1px dashed #000' }}>
                    {actualPayments.map((p, idx) => {
                      const isLastCash = idx === lastCashIndex;
                      const displayAmount = isLastCash ? Number(p.amount) + lastChangeAmount : Number(p.amount);

                      return (
                        <div key={p.id || idx}>
                          <span>
                            {p.payment_method === 'cash' ? 'Tiền mặt:' :
                              p.payment_method === 'transfer' ? 'Chuyển khoản:' :
                                p.payment_method === 'card' ? 'Thẻ:' :
                                  `${p.payment_method}:`}
                          </span>
                          <span>{formatVnd(displayAmount)}</span>
                        </div>
                      );
                    })}
                  </div>

                  {lastChangeAmount > 0 && (
                    <div className="print-total">
                      <span>TIỀN THỪA:</span>
                      <span>{formatVnd(lastChangeAmount)}</span>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
          <div className="print-footer">
            <p>Cảm ơn quý khách và hẹn gặp lại!</p>
            <p>Powered by Smart OS</p>
          </div>
        </div>
      )}

      {/* Modal Đối soát Kết ca POS */}
      {showEndShiftModal && shiftSummary && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ maxWidth: '400px' }}>
            <h2 style={{ marginBottom: '16px' }}>Kết thúc ca làm việc</h2>
            <p className="muted" style={{ marginBottom: '24px' }}>Vui lòng kiểm kê két tiền và xác nhận kết ca.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', background: '#f8fafc', borderRadius: '8px' }}>
                <span>Tổng thu tiền mặt (A):</span>
                <strong>{formatVnd(shiftSummary.payments_by_method?.cash || 0)}</strong>
              </div>

              <div className="input-group">
                <label>Tiền mặt thực đếm trong két (B):</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={actualCash}
                  onChange={(e) => setActualCash(e.target.value)}
                  placeholder="Nhập số tiền..."
                  style={{ fontSize: '1.2rem', fontWeight: 600 }}
                />
              </div>

              {actualCash !== "" && !isNaN(Number(actualCash)) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderRadius: '8px', border: '1px solid', ...((Number(actualCash) - Number(shiftSummary.payments_by_method?.cash || 0)) === 0 ? { background: '#ecfdf5', borderColor: '#a7f3d0' } : (Number(actualCash) - Number(shiftSummary.payments_by_method?.cash || 0)) > 0 ? { background: '#eff6ff', borderColor: '#bfdbfe' } : { background: '#fef2f2', borderColor: '#fecaca' }) }}>
                  <span>Chênh lệch (B - A):</span>
                  <strong style={{ color: (Number(actualCash) - Number(shiftSummary.payments_by_method?.cash || 0)) === 0 ? '#059669' : (Number(actualCash) - Number(shiftSummary.payments_by_method?.cash || 0)) > 0 ? '#2563eb' : '#dc2626' }}>
                    {(Number(actualCash) - Number(shiftSummary.payments_by_method?.cash || 0)) > 0 ? '+' : ''}
                    {formatVnd(Number(actualCash) - Number(shiftSummary.payments_by_method?.cash || 0))}
                  </strong>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowEndShiftModal(false)}>Hủy</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleCloseShift} disabled={processing}>
                {processing ? "Đang xử lý..." : "Xác nhận & Đăng xuất"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSplitModal && invoice && (
        <div className="modal-overlay">
          <div className="modal-content animate-fade-in" style={{ maxWidth: '600px', width: '100%', maxHeight: '80vh', overflowY: 'auto' }}>
            <h2 style={{ marginBottom: '16px' }}>Tách hóa đơn</h2>
            <p className="muted" style={{ marginBottom: '24px' }}>Gán từng món cho các nhóm khác nhau. Mặc định là Unassigned.</p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {invoice.details.map(detail => (
                <div key={detail.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', border: '1px solid var(--glass-border)', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{detail.item_name} x {detail.quantity}</span>
                    <span className="muted">{formatVnd(detail.unit_price)} / món</span>
                  </div>
                  <div style={{ width: '150px' }}>
                    <select
                      style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid var(--glass-border)', background: 'white' }}
                      value={splitAssignments[detail.id] || "Unassigned"}
                      onChange={(e) => setSplitAssignments({ ...splitAssignments, [detail.id]: e.target.value })}
                    >
                      <option value="Unassigned">Unassigned</option>
                      <option value="Khách 1">Khách 1</option>
                      <option value="Khách 2">Khách 2</option>
                      <option value="Khách 3">Khách 3</option>
                      <option value="Khách 4">Khách 4</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowSplitModal(false)}>Hủy</button>
              <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSplitBill} disabled={processing}>
                {processing ? "Đang xử lý..." : "Xác nhận tách"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}