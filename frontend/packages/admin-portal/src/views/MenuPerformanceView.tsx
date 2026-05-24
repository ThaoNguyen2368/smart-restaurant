import { useState, useEffect } from 'react';
import { api } from '../api';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine, ZAxis, Cell,
  BarChart, Bar, Legend, LineChart, Line
} from 'recharts';
import { Star, Puzzle, TrendingUp, AlertCircle, List, Grid3x3, Search, Loader2, X } from 'lucide-react';

interface MatrixItem {
  item_id: number;
  item_name: string;
  category: string;
  order_count: number;
  total_revenue: number;
  avg_revenue_per_order: number;
  popularity_index: number;
  revenue_contribution_pct: number;
  quadrant: string;
  recommendation: string;
  is_available: boolean;
  is_new: boolean;
}

interface CategorySummary {
  category_id: number;
  category_name: string;
  stars: number;
  puzzles: number;
  plowhorses: number;
  dogs: number;
  new_items: number;
}

export default function MenuPerformanceView() {
  const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [dateFrom, setDateFrom] = useState(getLocalDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)));
  const [dateTo, setDateTo] = useState(getLocalDateStr(new Date()));
  const [categories, setCategories] = useState<{id: number, name: string}[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  
  const [viewMode, setViewMode] = useState<'matrix' | 'table'>('matrix');
  const [loading, setLoading] = useState(true);
  
  const [matrixData, setMatrixData] = useState<{
    stars: MatrixItem[], puzzles: MatrixItem[], plowhorses: MatrixItem[], dogs: MatrixItem[]
  } | null>(null);
  const [summary, setSummary] = useState<any>(null);
  const [categorySummary, setCategorySummary] = useState<CategorySummary[]>([]);
  
  const [selectedItem, setSelectedItem] = useState<MatrixItem | null>(null);
  const [itemTrend, setItemTrend] = useState<any[]>([]);
  const [loadingTrend, setLoadingTrend] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    // Load categories
    api.get("/categories").then(res => setCategories(res.data.data || []));
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { date_from: dateFrom, date_to: dateTo, category_id: selectedCategoryId || undefined };
      const [matrixRes, catSumRes] = await Promise.all([
        api.get("/reports/menu-performance", { params }),
        api.get("/reports/menu-performance/by-category", { params: { date_from: dateFrom, date_to: dateTo } })
      ]);
      setMatrixData(matrixRes.data.data.matrix);
      setSummary(matrixRes.data.data.summary);
      setCategorySummary(catSumRes.data.data);
      setSelectedItem(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo, selectedCategoryId]);

  useEffect(() => {
    if (selectedItem) {
      setLoadingTrend(true);
      api.get(`/reports/menu-performance/${selectedItem.item_id}/trend`, {
        params: { date_from: dateFrom, date_to: dateTo, granularity: "day" }
      })
      .then(res => setItemTrend(res.data.data || []))
      .catch(console.error)
      .finally(() => setLoadingTrend(false));
    } else {
      setItemTrend([]);
    }
  }, [selectedItem, dateFrom, dateTo]);

  const allItems = matrixData ? [
    ...matrixData.stars, ...matrixData.puzzles, ...matrixData.plowhorses, ...matrixData.dogs
  ] : [];

  const filteredItems = allItems.filter(item => 
    item.item_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getQuadrantColor = (quadrant: string) => {
    switch(quadrant) {
      case 'STAR': return '#f59e0b'; // Yellow/Orange
      case 'PUZZLE': return '#8b5cf6'; // Purple
      case 'PLOWHORSE': return '#3b82f6'; // Blue
      case 'DOG': return '#9ca3af'; // Gray
      default: return '#9ca3af';
    }
  };

  const getQuadrantIcon = (quadrant: string, size = 18) => {
    switch(quadrant) {
      case 'STAR': return <Star size={size} color="#f59e0b" fill="#f59e0b" />;
      case 'PUZZLE': return <Puzzle size={size} color="#8b5cf6" />;
      case 'PLOWHORSE': return <TrendingUp size={size} color="#3b82f6" />;
      case 'DOG': return <AlertCircle size={size} color="#9ca3af" />;
      default: return null;
    }
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload as MatrixItem;
      return (
        <div className="glass" style={{ padding: '12px', border: '1px solid var(--glass-border)' }}>
          <p style={{ fontWeight: 700, margin: '0 0 8px 0', color: getQuadrantColor(data.quadrant) }}>
            {data.item_name}
          </p>
          <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>Doanh thu: {data.total_revenue.toLocaleString()}đ</p>
          <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>Số lượng: {data.order_count}</p>
          <p style={{ margin: '4px 0', fontSize: '0.85rem' }}>Phân loại: <strong>{data.quadrant}</strong></p>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div className="reports-view animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* Toolbar */}
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

        <div style={{ flex: 1 }}></div>

        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <button className={`filter-btn ${viewMode === "matrix" ? "active" : ""}`} onClick={() => setViewMode("matrix")}>
            <Grid3x3 size={16} /> Matrix
          </button>
          <button className={`filter-btn ${viewMode === "table" ? "active" : ""}`} onClick={() => setViewMode("table")}>
            <List size={16} /> Bảng chi tiết
          </button>
        </div>
      </div>

      {viewMode === 'matrix' && (
        <>
          <div style={{ display: 'flex', gap: '24px' }}>
            {/* Scatter Plot */}
            <div className="glass report-card" style={{ flex: 2, padding: '24px', position: 'relative' }}>
              <h3 style={{ marginBottom: '20px', fontWeight: 700 }}>Ma trận Phân loại (Menu Engineering)</h3>
              <div style={{ width: '100%', height: '500px' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                    <XAxis type="number" dataKey="popularity_index" name="Độ phổ biến (Popularity)" stroke="var(--text-secondary)" 
                           label={{ value: 'Độ phổ biến (Popularity Index)', position: 'insideBottom', offset: -10, fill: 'var(--text-secondary)' }} />
                    <YAxis type="number" dataKey="revenue_contribution_pct" name="Tỷ trọng doanh thu (%)" stroke="var(--text-secondary)" 
                           label={{ value: 'Tỷ trọng Doanh thu (%)', angle: -90, position: 'insideLeft', fill: 'var(--text-secondary)' }} />
                    <ZAxis type="number" dataKey="total_revenue" range={[60, 400]} name="Doanh thu" />
                    <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} content={<CustomTooltip />} />
                    
                    {/* Đường trung bình chia 4 góc phần tư */}
                    <ReferenceLine x={1.0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
                    <ReferenceLine y={100 / (summary?.star_count + summary?.puzzle_count + summary?.plowhorse_count + summary?.dog_count || 1)} 
                                  stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />

                    <Scatter name="Món ăn" data={allItems} onClick={(data) => setSelectedItem(data as unknown as MatrixItem)}>
                      {allItems.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getQuadrantColor(entry.quadrant)} opacity={0.8} />
                      ))}
                    </Scatter>
                  </ScatterChart>
                </ResponsiveContainer>
              </div>

              {/* Legend overlay */}
              <div style={{ position: 'absolute', top: '24px', right: '24px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-card)', padding: '12px', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <Star size={14} color="#f59e0b" fill="#f59e0b" /> <span>STAR (Nổi bật, LN cao)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <Puzzle size={14} color="#8b5cf6" /> <span>PUZZLE (Khách ít, LN cao)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <TrendingUp size={14} color="#3b82f6" /> <span>PLOWHORSE (Đông khách, LN thấp)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                  <AlertCircle size={14} color="#9ca3af" /> <span>DOG (Khách ít, LN thấp)</span>
                </div>
              </div>
            </div>

            {/* Selected Item Drawer */}
            {selectedItem && (
              <div className="glass report-card animate-slide-in" style={{ flex: 1, padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <h3 style={{ margin: 0, fontWeight: 700, fontSize: '1.2rem', color: getQuadrantColor(selectedItem.quadrant) }}>
                    {selectedItem.item_name}
                  </h3>
                  <button className="btn-icon" onClick={() => setSelectedItem(null)}><X size={16} /></button>
                </div>
                <div style={{ marginTop: '8px', display: 'flex', gap: '8px' }}>
                  <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>{selectedItem.category}</span>
                  <span className="badge" style={{ background: `${getQuadrantColor(selectedItem.quadrant)}22`, color: getQuadrantColor(selectedItem.quadrant), fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {getQuadrantIcon(selectedItem.quadrant, 12)} {selectedItem.quadrant}
                  </span>
                </div>

                <div className="report-stats-grid" style={{ marginTop: '24px', gap: '16px', gridTemplateColumns: '1fr' }}>
                  <div className="report-summary-card" style={{ padding: '16px' }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Doanh thu kỳ này</span>
                    <p style={{ fontSize: "1.4rem", fontWeight: 700, margin: "4px 0 0 0" }}>{selectedItem.total_revenue.toLocaleString()}đ</p>
                  </div>
                  <div className="report-summary-card" style={{ padding: '16px' }}>
                    <span style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>Số phần đã bán</span>
                    <p style={{ fontSize: "1.4rem", fontWeight: 700, margin: "4px 0 0 0" }}>{selectedItem.order_count}</p>
                  </div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Xu hướng doanh thu</h4>
                  <div style={{ height: '150px', width: '100%' }}>
                    {loadingTrend ? (
                      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Loader2 className="animate-spin" size={24} style={{ color: "var(--text-secondary)" }} />
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={itemTrend}>
                          <Line type="monotone" dataKey="revenue" stroke={getQuadrantColor(selectedItem.quadrant)} strokeWidth={2} dot={false} />
                          <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#1e1e2d', border: '1px solid #333' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <h4 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>Gợi ý hành động</h4>
                  <div style={{ padding: '16px', borderRadius: '8px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--glass-border)', fontSize: '0.9rem', lineHeight: '1.5' }}>
                    {selectedItem.recommendation}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Summary Cards */}
          <div className="menu-stats-row">
            <div className="menu-stat-card glass" style={{ borderTop: '3px solid #f59e0b' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#f59e0b' }}>
                <Star size={18} fill="#f59e0b" /> STAR ({summary?.star_count})
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>Món nổi bật, doanh thu tốt.</p>
            </div>
            <div className="menu-stat-card glass" style={{ borderTop: '3px solid #8b5cf6' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#8b5cf6' }}>
                <Puzzle size={18} /> PUZZLE ({summary?.puzzle_count})
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>Ít khách nhưng biên lợi nhuận cao.</p>
            </div>
            <div className="menu-stat-card glass" style={{ borderTop: '3px solid #3b82f6' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#3b82f6' }}>
                <TrendingUp size={18} /> PLOWHORSE ({summary?.plowhorse_count})
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>Rất phổ biến nhưng doanh thu kém.</p>
            </div>
            <div className="menu-stat-card glass" style={{ borderTop: '3px solid #9ca3af' }}>
              <h4 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '8px', color: '#9ca3af' }}>
                <AlertCircle size={18} /> DOG ({summary?.dog_count})
              </h4>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: '8px' }}>Ít khách, doanh thu thấp.</p>
            </div>
          </div>

          {/* Category Bar Chart */}
          <div className="glass report-card" style={{ padding: '24px' }}>
            <h3 style={{ marginBottom: '20px', fontWeight: 700 }}>Tổng quan theo Danh mục</h3>
            <div style={{ width: '100%', height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={categorySummary} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                  <XAxis dataKey="category_name" stroke="var(--text-secondary)" />
                  <YAxis stroke="var(--text-secondary)" />
                  <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ backgroundColor: '#1e1e2d', border: '1px solid #333' }} />
                  <Legend />
                  <Bar dataKey="stars" name="Star" stackId="a" fill="#f59e0b" />
                  <Bar dataKey="puzzles" name="Puzzle" stackId="a" fill="#8b5cf6" />
                  <Bar dataKey="plowhorses" name="Plowhorse" stackId="a" fill="#3b82f6" />
                  <Bar dataKey="dogs" name="Dog" stackId="a" fill="#9ca3af" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {viewMode === 'table' && (
        <div className="glass table-container">
          <div className="table-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px' }}>
            <h3 style={{ margin: 0, fontWeight: 700 }}>Chi tiết hiệu suất món ăn</h3>
            <div className="menu-search-box" style={{ margin: 0, width: '300px' }}>
              <Search size={16} style={{ color: "var(--text-secondary)" }} />
              <input
                type="text"
                placeholder="Tìm kiếm..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="menu-search-input"
              />
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Tên món</th>
                <th>Danh mục</th>
                <th style={{ textAlign: 'center' }}>Phân loại</th>
                <th style={{ textAlign: 'right' }}>Số lượng bán</th>
                <th style={{ textAlign: 'right' }}>Doanh thu</th>
                <th style={{ textAlign: 'right' }}>Popularity Index</th>
                <th style={{ textAlign: 'right' }}>% Doanh thu</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.item_id}>
                  <td style={{ fontWeight: 600 }}>{item.item_name}</td>
                  <td>{item.category}</td>
                  <td style={{ textAlign: 'center' }}>
                    <span className="badge" style={{ background: `${getQuadrantColor(item.quadrant)}22`, color: getQuadrantColor(item.quadrant), fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                      {getQuadrantIcon(item.quadrant, 12)} {item.quadrant}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{item.order_count}</td>
                  <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--accent-primary)' }}>{item.total_revenue.toLocaleString()}đ</td>
                  <td style={{ textAlign: 'right' }}>{item.popularity_index.toFixed(2)}</td>
                  <td style={{ textAlign: 'right' }}>{item.revenue_contribution_pct.toFixed(2)}%</td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    Không có dữ liệu phù hợp
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

    </div>
  );
}
