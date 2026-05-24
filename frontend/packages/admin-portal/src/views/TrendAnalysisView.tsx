import { useState, useEffect } from 'react';
import { api } from '../api';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import { TrendingUp, TrendingDown, Minus, Clock, FileX, MoveRight, Receipt, CheckCircle, AlertCircle, Calendar, Loader2, X, ChevronRight } from 'lucide-react';

interface KPIData {
  id: string;
  name: string;
  unit: string;
  target: number;
  current_value: number;
  previous_value: number;
  change_pct: number;
  direction: string;
  target_met: boolean;
  daily_series: {
    current: number[];
    previous: number[];
  };
}

interface TrendReport {
  period: string;
  current_range: { from: string; to: string };
  previous_range: { from: string; to: string };
  kpis: KPIData[];
}

export default function TrendAnalysisView() {
  const [period, setPeriod] = useState<"week" | "month" | "quarter">("week");
  const [report, setReport] = useState<TrendReport | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [selectedKpi, setSelectedKpi] = useState<KPIData | null>(null);
  const [detailData, setDetailData] = useState<any[]>([]);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [breakdown, setBreakdown] = useState<"day" | "hour" | "staff">("day");

  useEffect(() => {
    const fetchTrends = async () => {
      setLoading(true);
      try {
        const res = await api.get("/reports/trends", { params: { period } });
        setReport(res.data.data);
        handleSelectKpi(null);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    fetchTrends();
  }, [period]);

  const getKpiIcon = (kpiId: string) => {
    switch(kpiId) {
      case 'KPI-01': return <Clock size={24} />;
      case 'KPI-02': return <FileX size={24} />;
      case 'KPI-03': return <MoveRight size={24} />;
      case 'KPI-04': return <Receipt size={24} />;
      case 'KPI-05': return <Timer size={24} />;
      default: return <TrendingUp size={24} />;
    }
  };

  const getDirectionIcon = (direction: string) => {
    switch(direction) {
      case 'improving': return <TrendingUp size={16} />;
      case 'declining': return <TrendingDown size={16} />;
      default: return <Minus size={16} />;
    }
  };

  const getDirectionColor = (direction: string) => {
    switch(direction) {
      case 'improving': return 'var(--accent-secondary)'; // Green
      case 'declining': return 'var(--accent-danger)'; // Red
      default: return 'var(--text-secondary)'; // Gray
    }
  };

  const formatValue = (value: number, unit: string) => {
    if (unit === 'seconds') {
      const mins = Math.floor(value / 60);
      const secs = Math.floor(value % 60);
      return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    }
    if (unit === '%') return `${value.toFixed(1)}%`;
    return Math.round(value).toString();
  };

  const Timer = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline>
    </svg>
  );

  const handleSelectKpi = (kpi: KPIData | null) => {
    setSelectedKpi(kpi);
  };

  useEffect(() => {
    if (selectedKpi && report) {
      setLoadingDetail(true);
      api.get(`/reports/trends/${selectedKpi.id}/detail`, {
        params: {
          date_from: report.current_range.from,
          date_to: report.current_range.to,
          breakdown
        }
      }).then(res => setDetailData(res.data.data || []))
        .catch(console.error)
        .finally(() => setLoadingDetail(false));
    } else {
      setDetailData([]);
    }
  }, [selectedKpi, breakdown, report]);

  // Auto-generate insight
  const generateInsight = (kpis: KPIData[]) => {
    if (!kpis || kpis.length === 0) return null;
    
    const improving = kpis.filter(k => k.direction === 'improving');
    const declining = kpis.filter(k => k.direction === 'declining');
    
    let text = "";
    if (improving.length > 0) {
      text += `🎯 KPI tốt nhất: ${improving[0].name} cải thiện ${Math.abs(improving[0].change_pct).toFixed(1)}%. `;
    }
    if (declining.length > 0) {
      text += `⚠️ Cần chú ý: ${declining[0].name} xấu đi ${Math.abs(declining[0].change_pct).toFixed(1)}%.`;
    }
    if (text === "") text = "Mọi chỉ số đều ổn định.";
    return text;
  };

  if (loading && !report) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

  return (
    <div className="reports-view animate-fade-in" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      
      {/* Header & Period Selector */}
      <div className="menu-toolbar glass" style={{ justifyContent: 'space-between' }}>
        <div className="filter-bar" style={{ marginBottom: 0 }}>
          <button className={`filter-btn ${period === "week" ? "active" : ""}`} onClick={() => setPeriod("week")}>
             7 ngày
          </button>
          <button className={`filter-btn ${period === "month" ? "active" : ""}`} onClick={() => setPeriod("month")}>
             30 ngày
          </button>
          <button className={`filter-btn ${period === "quarter" ? "active" : ""}`} onClick={() => setPeriod("quarter")}>
             90 ngày
          </button>
        </div>
        
        {report && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            <Calendar size={16} />
            <span>
              {new Date(report.current_range.from).toLocaleDateString('vi-VN')} – {new Date(report.current_range.to).toLocaleDateString('vi-VN')}
            </span>
            <span style={{ opacity: 0.5 }}>so với</span>
            <span>
              {new Date(report.previous_range.from).toLocaleDateString('vi-VN')} – {new Date(report.previous_range.to).toLocaleDateString('vi-VN')}
            </span>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
        {/* KPI Grid */}
        <div style={{ flex: '1 1 60%', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
          {report?.kpis.map((kpi) => {
            const isSelected = selectedKpi?.id === kpi.id;
            const sparklineData = kpi.daily_series.current.map((val, idx) => ({
              day: idx,
              current: val,
              previous: kpi.daily_series.previous[idx] || 0
            }));

            return (
              <div 
                key={kpi.id} 
                className={`glass report-card ${isSelected ? 'active-kpi-card' : ''}`}
                style={{ 
                  padding: '20px', 
                  cursor: 'pointer', 
                  border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                  transition: 'all 0.2s ease'
                }}
                onClick={() => handleSelectKpi(kpi)}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ color: 'var(--accent-primary)', background: 'rgba(59,130,246,0.1)', padding: '10px', borderRadius: '10px' }}>
                      {getKpiIcon(kpi.id)}
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontWeight: 600, fontSize: '1rem' }}>{kpi.name}</h4>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mục tiêu: {formatValue(kpi.target, kpi.unit)}</span>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                  <div>
                    <div style={{ fontSize: '1.8rem', fontWeight: 800 }}>
                      {formatValue(kpi.current_value, kpi.unit)}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                      <span 
                        className="badge" 
                        style={{ 
                          background: `${getDirectionColor(kpi.direction)}22`, 
                          color: getDirectionColor(kpi.direction),
                          display: 'flex', alignItems: 'center', gap: '4px'
                        }}
                      >
                        {getDirectionIcon(kpi.direction)}
                        {Math.abs(kpi.change_pct).toFixed(1)}%
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        vs kỳ trước ({formatValue(kpi.previous_value, kpi.unit)})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sparkline */}
                <div style={{ height: '60px', marginTop: '20px', marginLeft: '-10px', marginRight: '-10px' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparklineData}>
                      <Line type="monotone" dataKey="current" stroke="var(--accent-primary)" strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="previous" stroke="var(--text-tertiary)" strokeWidth={2} strokeDasharray="3 3" dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {kpi.target_met ? (
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-secondary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <CheckCircle size={14} /> Đạt mục tiêu
                    </span>
                  ) : (
                    <span style={{ fontSize: '0.8rem', color: 'var(--accent-danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertCircle size={14} /> Cần cải thiện
                    </span>
                  )}
                  <span style={{ fontSize: '0.8rem', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    Chi tiết <ChevronRight size={14} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Drill-down panel */}
        {selectedKpi && (
          <div className="glass report-card animate-slide-in" style={{ flex: '1 1 30%', padding: '24px', minWidth: '350px', height: 'fit-content', position: 'sticky', top: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <span className="badge" style={{ background: 'var(--bg-lighter)' }}>{selectedKpi.id}</span>
                <h3 style={{ margin: '8px 0', fontWeight: 700 }}>Phân tích chi tiết</h3>
              </div>
              <button className="btn-icon" onClick={() => handleSelectKpi(null)}><X size={16} /></button>
            </div>
            
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
              {selectedKpi.name}
            </p>
            
            <div className="filter-bar" style={{ marginBottom: '16px' }}>
              <button className={`filter-btn ${breakdown === "day" ? "active" : ""}`} onClick={() => setBreakdown("day")}>Theo ngày</button>
              <button className={`filter-btn ${breakdown === "hour" ? "active" : ""}`} onClick={() => setBreakdown("hour")}>Theo giờ</button>
              <button className={`filter-btn ${breakdown === "staff" ? "active" : ""}`} onClick={() => setBreakdown("staff")}>Theo nhân viên</button>
            </div>

            <div style={{ width: '100%', height: '250px', marginBottom: '24px' }}>
              {loadingDetail ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Loader2 className="animate-spin" size={24} style={{ color: "var(--text-secondary)" }} />
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={detailData} margin={{ top: 5, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} vertical={false} />
                    <XAxis dataKey="label" stroke="var(--text-secondary)" fontSize={12} />
                    <YAxis stroke="var(--text-secondary)" fontSize={12} />
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: '#1e1e2d', border: '1px solid var(--glass-border)', borderRadius: '8px' }}
                      itemStyle={{ fontSize: '0.9rem' }}
                    />
                    <Line type="monotone" name="Giá trị" dataKey="value" stroke="var(--accent-primary)" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                    {/* Target line */}
                    <ReferenceLine y={selectedKpi.target} stroke="var(--accent-danger)" strokeDasharray="3 3" label={{ position: 'top', value: 'Target', fill: 'var(--accent-danger)', fontSize: 10 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: '12px', border: '1px solid var(--glass-border)' }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: '12px' }}>Đánh giá hiệu suất</h4>
              <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <li>Mục tiêu kinh doanh: <strong style={{ color: 'var(--text-primary)' }}>{formatValue(selectedKpi.target, selectedKpi.unit)}</strong></li>
                <li>Mức độ đạt được: <strong style={{ color: selectedKpi.target_met ? 'var(--accent-secondary)' : 'var(--accent-danger)' }}>{selectedKpi.target_met ? "Đạt chỉ tiêu" : "Chưa đạt"}</strong></li>
                <li>Thay đổi so với kỳ trước: <strong style={{ color: getDirectionColor(selectedKpi.direction) }}>{Math.abs(selectedKpi.change_pct).toFixed(1)}% {selectedKpi.direction === 'improving' ? 'Tốt lên' : selectedKpi.direction === 'declining' ? 'Tệ đi' : 'Ổn định'}</strong></li>
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Insight Panel */}
      {report && (
        <div className="glass report-card" style={{ padding: '20px', display: 'flex', gap: '16px', alignItems: 'center', background: 'linear-gradient(45deg, rgba(59,130,246,0.05), rgba(139,92,246,0.05))' }}>
          <div style={{ padding: '12px', background: 'rgba(255,255,255,0.05)', borderRadius: '50%' }}>
            <Activity size={24} color="var(--accent-primary)" />
          </div>
          <div>
            <h4 style={{ margin: 0, fontWeight: 700, marginBottom: '4px' }}>AI Insight Tự động</h4>
            <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
              {generateInsight(report.kpis)}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const Activity = ({ size, color }: { size: number, color: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
  </svg>
);
