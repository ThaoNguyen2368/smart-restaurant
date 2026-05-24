import { useState, useEffect } from 'react';
import { api } from '../api';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Clock, ChefHat, Utensils, AlertTriangle, Loader2 } from 'lucide-react';

export default function ServiceSpeedView() {
  const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [dateFrom, setDateFrom] = useState(getLocalDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [dateTo, setDateTo] = useState(getLocalDateStr(new Date()));
  const [categories, setCategories] = useState<{id: number, name: string}[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [groupBy, setGroupBy] = useState<"hour" | "day" | "staff" | "category">("day");
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  const [bottlenecks, setBottlenecks] = useState<any[]>([]);
  
  const [tableTab, setTableTab] = useState<"slowest" | "bottlenecks">("slowest");

  useEffect(() => {
    api.get("/categories").then(res => setCategories(res.data.data || []));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { date_from: dateFrom, date_to: dateTo, group_by: groupBy, category_id: selectedCategoryId || undefined };
      const [detailedRes, bottlenecksRes] = await Promise.all([
        api.get("/reports/service-speed/detailed", { params }),
        api.get("/reports/service-speed/bottlenecks", { params: { date_from: dateFrom, date_to: dateTo } })
      ]);
      setData(detailedRes.data.data);
      setBottlenecks(bottlenecksRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo, selectedCategoryId, groupBy]);

  const formatSeconds = (sec: number) => {
    if (!sec) return "0s";
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    if (m > 0) return `${m}p ${s}s`;
    return `${s}s`;
  };

  if (loading && !data) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  const summary = data?.summary || {};

  return (
    <div className="reports-view animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* Filters */}
      <div className="menu-toolbar glass" style={{ flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </div>
          <span>-</span>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </div>
        </div>

        <div className="form-group" style={{ marginBottom: 0 }}>
          <select value={selectedCategoryId || ''} onChange={(e) => setSelectedCategoryId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Tất cả danh mục</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>

        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <button className={`filter-btn ${groupBy === "hour" ? "active" : ""}`} onClick={() => setGroupBy("hour")}>Theo giờ</button>
          <button className={`filter-btn ${groupBy === "day" ? "active" : ""}`} onClick={() => setGroupBy("day")}>Theo ngày</button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="menu-stats-row">
        <div className={`menu-stat-card glass ${summary.avg_pending_to_confirmed_sec > 180 ? 'border-warning' : ''}`} style={{ borderLeft: summary.avg_pending_to_confirmed_sec > 180 ? '4px solid #f59e0b' : '4px solid var(--glass-border)' }}>
          <Clock size={20} style={{ color: "var(--text-secondary)" }} />
          <div>
            <span className="menu-stat-label">Chờ xác nhận</span>
            <span className="menu-stat-value" style={{ color: summary.avg_pending_to_confirmed_sec > 180 ? '#f59e0b' : 'var(--text-primary)' }}>
              {formatSeconds(summary.avg_pending_to_confirmed_sec)}
            </span>
          </div>
        </div>
        <div className="menu-stat-card glass">
          <Utensils size={20} style={{ color: "var(--text-secondary)" }} />
          <div>
            <span className="menu-stat-label">Chờ bếp nhận</span>
            <span className="menu-stat-value">{formatSeconds(summary.avg_confirmed_to_cooking_sec)}</span>
          </div>
        </div>
        <div className="menu-stat-card glass" style={{ borderLeft: '4px solid var(--accent-primary)' }}>
          <ChefHat size={20} style={{ color: "var(--accent-primary)" }} />
          <div>
            <span className="menu-stat-label">Thời gian nấu (Quan trọng)</span>
            <span className="menu-stat-value" style={{ color: "var(--accent-primary)" }}>
              {formatSeconds(summary.avg_cooking_to_done_sec)}
            </span>
          </div>
        </div>
        <div className="menu-stat-card glass">
          <Clock size={20} style={{ color: "var(--text-secondary)" }} />
          <div>
            <span className="menu-stat-label">Chờ phục vụ</span>
            <span className="menu-stat-value">{formatSeconds(summary.avg_done_to_served_sec)}</span>
          </div>
        </div>
      </div>

      {/* Stacked Bar Chart */}
      <div className="glass report-card" style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '20px', fontWeight: 700 }}>Phân bổ thời gian theo chu kỳ</h3>
        <div style={{ width: '100%', height: '400px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data?.breakdown || []} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
              <XAxis dataKey="label" stroke="var(--text-secondary)" />
              <YAxis stroke="var(--text-secondary)" tickFormatter={(val) => Math.floor(val/60) + "m"} />
              <RechartsTooltip 
                cursor={{ fill: 'rgba(255,255,255,0.05)' }} 
                contentStyle={{ backgroundColor: '#1e1e2d', border: '1px solid #333' }}
                formatter={(value: any) => formatSeconds(value as number)}
              />
              <Legend />
              <Bar dataKey="pending_to_confirmed" name="Chờ xác nhận" stackId="a" fill="#64748b" />
              <Bar dataKey="confirmed_to_cooking" name="Chờ bếp nhận" stackId="a" fill="#f59e0b" />
              <Bar dataKey="cooking_to_done" name="Thời gian nấu" stackId="a" fill="#3b82f6" />
              <Bar dataKey="done_to_served" name="Chờ phục vụ" stackId="a" fill="#10b981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detail Table */}
      <div className="glass table-container">
        <div className="table-header" style={{ borderBottom: '1px solid var(--glass-border)' }}>
          <div className="filter-bar" style={{ marginBottom: 0, padding: '10px 20px' }}>
            <button className={`filter-btn ${tableTab === "slowest" ? "active" : ""}`} onClick={() => setTableTab("slowest")}>
              Chậm nhất theo món
            </button>
            <button className={`filter-btn ${tableTab === "bottlenecks" ? "active" : ""}`} onClick={() => setTableTab("bottlenecks")}>
              <AlertTriangle size={14} /> Bottleneck gần đây
            </button>
          </div>
        </div>

        {tableTab === "slowest" && (
          <table>
            <thead>
              <tr>
                <th>Thứ hạng</th>
                <th>Tên món ăn</th>
                <th style={{ textAlign: 'right' }}>Thời gian nấu trung bình</th>
                <th style={{ textAlign: 'right' }}>Số lượt gọi</th>
              </tr>
            </thead>
            <tbody>
              {data?.slowest_items?.map((item: any, idx: number) => (
                <tr key={idx}>
                  <td>{idx + 1}</td>
                  <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                  <td style={{ textAlign: 'right', color: 'var(--accent-danger)', fontWeight: 600 }}>
                    {formatSeconds(item.avg_cooking_sec)}
                  </td>
                  <td style={{ textAlign: 'right' }}>{item.count}</td>
                </tr>
              ))}
              {(!data?.slowest_items || data.slowest_items.length === 0) && (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    Không có dữ liệu
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}

        {tableTab === "bottlenecks" && (
          <table>
            <thead>
              <tr>
                <th>Thời gian</th>
                <th>Tên món</th>
                <th>Giai đoạn tắc nghẽn</th>
                <th>Thời gian thực tế</th>
                <th>Ngưỡng vi phạm</th>
                <th>Nhân sự liên quan</th>
              </tr>
            </thead>
            <tbody>
              {bottlenecks.map((b: any, idx: number) => (
                <tr key={idx}>
                  <td>{new Date(b.occurred_at).toLocaleString('vi-VN')}</td>
                  <td style={{ fontWeight: 600 }}>{b.item_name}</td>
                  <td><span className="badge" style={{ background: 'var(--bg-lighter)' }}>{b.stage}</span></td>
                  <td style={{ color: 'var(--accent-danger)', fontWeight: 600 }}>{formatSeconds(b.duration_sec)}</td>
                  <td>{formatSeconds(b.threshold_sec)}</td>
                  <td>{b.staff_name}</td>
                </tr>
              ))}
              {bottlenecks.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    Không phát hiện bottleneck nào trong khoảng thời gian này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

    </div>
  );
}
