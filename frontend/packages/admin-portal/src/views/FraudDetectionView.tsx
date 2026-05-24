import { useState, useEffect } from 'react';
import { api } from '../api';
import {
  ShieldAlert, Shield, ShieldCheck, AlertTriangle, User, History, Settings, CheckCircle2, ChevronRight, X, Loader2
} from 'lucide-react';
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Cell, ZAxis
} from 'recharts';

export default function FraudDetectionView() {
  const getLocalDateStr = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [dateFrom, setDateFrom] = useState(getLocalDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)));
  const [dateTo, setDateTo] = useState(getLocalDateStr(new Date()));
  const [severity, setSeverity] = useState<string>("");
  
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);
  
  const [selectedStaff, setSelectedStaff] = useState<any | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  
  const [showConfig, setShowConfig] = useState(false);
  const [config, setConfig] = useState<any>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = { date_from: dateFrom, date_to: dateTo, severity: severity || undefined };
      const res = await api.get("/reports/fraud-detection/summary", { params });
      setData(res.data.data);
      setSelectedStaff(null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [dateFrom, dateTo, severity]);
  
  useEffect(() => {
    if (showConfig && !config) {
      api.get("/reports/fraud-detection/config").then(res => setConfig(res.data.data)).catch(console.error);
    }
  }, [showConfig, config]);

  const loadTimeline = async (staff: any) => {
    setSelectedStaff(staff);
    setLoadingTimeline(true);
    try {
      const res = await api.get(`/reports/fraud-detection/staff/${staff.staff_id}/timeline`, {
        params: { date_from: dateFrom, date_to: dateTo }
      });
      setTimeline(res.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  const getSeverityColor = (level: string) => {
    switch(level?.toUpperCase()) {
      case 'CRITICAL': return '#ef4444'; // Red
      case 'HIGH': return '#f97316'; // Orange
      case 'MEDIUM': return '#eab308'; // Yellow
      case 'WARNING': return '#3b82f6'; // Blue
      default: return '#9ca3af';
    }
  };

  const getSeverityIcon = (level: string, size = 18) => {
    switch(level?.toUpperCase()) {
      case 'CRITICAL': return <ShieldAlert size={size} color="#ef4444" />;
      case 'HIGH': return <AlertTriangle size={size} color="#f97316" />;
      case 'MEDIUM': return <Shield size={size} color="#eab308" />;
      case 'WARNING': return <ShieldCheck size={size} color="#3b82f6" />;
      default: return <CheckCircle2 size={size} color="#9ca3af" />;
    }
  };

  const handleSaveConfig = async () => {
    setSavingConfig(true);
    try {
      await api.put("/reports/fraud-detection/config", config);
      setShowConfig(false);
      fetchData(); // Reload with new config
    } catch (err) {
      console.error(err);
    } finally {
      setSavingConfig(false);
    }
  };

  const heatmapData = data?.heatmap_data || [];

  if (loading && !data) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
        <Loader2 className="animate-spin" size={32} style={{ color: "var(--accent-primary)" }} />
      </div>
    );
  }

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
          <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
            <option value="">Tất cả mức độ</option>
            <option value="CRITICAL">Nghiêm trọng (CRITICAL)</option>
            <option value="HIGH">Cao (HIGH)</option>
            <option value="MEDIUM">Trung bình (MEDIUM)</option>
            <option value="WARNING">Cảnh báo (WARNING)</option>
          </select>
        </div>

        <div style={{ flex: 1 }}></div>
        
        <button className="btn btn-secondary" onClick={() => setShowConfig(true)}>
          <Settings size={16} /> Cấu hình Pattern
        </button>
      </div>

      {/* Overview Cards */}
      <div className="menu-stats-row">
        <div className="menu-stat-card glass" style={{ borderLeft: '4px solid #3b82f6' }}>
          <History size={20} style={{ color: "#3b82f6" }} />
          <div>
            <span className="menu-stat-label">Tổng số lượt huỷ/sửa</span>
            <span className="menu-stat-value">{data?.total_cancellations || 0}</span>
          </div>
        </div>
        <div className="menu-stat-card glass" style={{ borderLeft: '4px solid #eab308' }}>
          <User size={20} style={{ color: "#eab308" }} />
          <div>
            <span className="menu-stat-label">Nhân sự bị cắm cờ (Flagged)</span>
            <span className="menu-stat-value" style={{ color: data?.flagged_staff_count > 0 ? '#eab308' : '' }}>
              {data?.flagged_staff_count || 0}
            </span>
          </div>
        </div>
        <div className="menu-stat-card glass" style={{ borderLeft: '4px solid #ef4444' }}>
          <ShieldAlert size={20} style={{ color: "#ef4444" }} />
          <div>
            <span className="menu-stat-label">Vi phạm nghiêm trọng</span>
            <span className="menu-stat-value" style={{ color: data?.critical_violations > 0 ? '#ef4444' : '' }}>
              {data?.critical_violations || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Heatmap Section */}
      <div className="glass report-card" style={{ padding: '24px' }}>
        <h3 style={{ marginBottom: '20px', fontWeight: 700 }}>Heatmap Tần suất Vi phạm (Theo ngày/giờ)</h3>
        <div style={{ width: '100%', height: '300px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
              <XAxis type="number" dataKey="hour" name="Giờ" domain={[8, 22]} tickCount={15} stroke="var(--text-secondary)" />
              <YAxis type="category" dataKey="day" name="Ngày" stroke="var(--text-secondary)" />
              <ZAxis type="number" dataKey="riskLevel" range={[50, 400]} />
              <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', color: '#111827' }} itemStyle={{ color: '#111827' }} labelStyle={{ color: '#6b7280' }} />
              <Scatter name="Vi phạm" data={heatmapData}>
                {heatmapData.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={entry.riskLevel > 5 ? '#ef4444' : (entry.riskLevel > 2 ? '#eab308' : '#3b82f6')} opacity={0.8} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Main Table */}
        <div className="glass table-container" style={{ flex: 2 }}>
          <div className="table-header" style={{ padding: '20px' }}>
            <h3 style={{ margin: 0, fontWeight: 700 }}>Danh sách Cảnh báo theo Nhân sự</h3>
          </div>
          <table>
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Chức vụ</th>
                <th style={{ textAlign: 'center' }}>Mức độ rủi ro</th>
                <th style={{ textAlign: 'right' }}>Điểm rủi ro</th>
                <th style={{ textAlign: 'right' }}>Số lần huỷ</th>
                <th style={{ textAlign: 'right' }}>Tỷ lệ huỷ</th>
                <th>Pattern vi phạm</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data?.staff_risk_list?.map((staff: any) => (
                <tr 
                  key={staff.staff_id} 
                  className={selectedStaff?.staff_id === staff.staff_id ? 'active-row' : ''}
                  onClick={() => loadTimeline(staff)}
                  style={{ cursor: 'pointer' }}
                >
                  <td style={{ fontWeight: 600 }}>{staff.display_name}</td>
                  <td><span className="badge" style={{ background: 'rgba(255,255,255,0.05)' }}>{staff.role}</span></td>
                  <td style={{ textAlign: 'center' }}>
                    <span 
                      className="badge" 
                      style={{ 
                        background: `${getSeverityColor(staff.risk_level)}22`, 
                        color: getSeverityColor(staff.risk_level),
                        fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: '4px' 
                      }}
                    >
                      {getSeverityIcon(staff.risk_level, 14)} {staff.risk_level}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 600 }}>{staff.risk_score}</td>
                  <td style={{ textAlign: 'right' }}>{staff.total_cancels}</td>
                  <td style={{ textAlign: 'right' }}>{staff.cancel_rate_pct}%</td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                      {staff.patterns_triggered.map((p: string) => (
                        <span key={p} className="badge" style={{ background: 'var(--bg-lighter)', color: 'var(--text-secondary)' }}>
                          {p}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}><ChevronRight size={16} /></td>
                </tr>
              ))}
              {(!data?.staff_risk_list || data.staff_risk_list.length === 0) && (
                <tr>
                  <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                    Không phát hiện rủi ro nào trong khoảng thời gian này. Hệ thống an toàn.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Selected Staff Drawer */}
        {selectedStaff && (
          <div className="glass report-card animate-slide-in" style={{ flex: 1, padding: '24px', height: 'fit-content' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontWeight: 700, fontSize: '1.2rem' }}>{selectedStaff.display_name}</h3>
                <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>{selectedStaff.role}</span>
              </div>
              <button className="btn-icon" onClick={() => setSelectedStaff(null)}><X size={16} /></button>
            </div>

            <div style={{ marginTop: '24px', display: 'flex', gap: '16px' }}>
              <div style={{ flex: 1, padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Mức độ Rủi ro</span>
                <p style={{ margin: '4px 0 0 0', fontWeight: 700, color: getSeverityColor(selectedStaff.risk_level), display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {getSeverityIcon(selectedStaff.risk_level, 16)} {selectedStaff.risk_level}
                </p>
              </div>
              <div style={{ flex: 1, padding: '16px', background: 'rgba(255,255,255,0.02)', borderRadius: '8px', border: '1px solid var(--glass-border)' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Điểm Rủi ro</span>
                <p style={{ margin: '4px 0 0 0', fontWeight: 700, fontSize: '1.2rem' }}>{selectedStaff.risk_score}</p>
              </div>
            </div>

            <h4 style={{ margin: '24px 0 16px 0', fontSize: '1rem' }}>Lịch sử Hành động Đáng ngờ</h4>
            {loadingTimeline ? (
               <div style={{ display: "flex", justifyContent: "center", padding: "20px 0" }}>
                 <Loader2 className="animate-spin" size={24} style={{ color: "var(--text-secondary)" }} />
               </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '400px', overflowY: 'auto', paddingRight: '8px' }}>
                {timeline.length > 0 ? timeline.map(log => (
                  <div key={log.id} style={{ 
                    padding: '12px', 
                    borderRadius: '8px', 
                    background: log.is_suspicious ? 'rgba(239, 68, 68, 0.05)' : 'rgba(255,255,255,0.02)', 
                    borderLeft: log.is_suspicious ? '3px solid #ef4444' : '3px solid var(--glass-border)'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span className="badge" style={{ background: log.is_suspicious ? '#ef444422' : 'var(--bg-lighter)', color: log.is_suspicious ? '#ef4444' : 'var(--text-primary)' }}>
                        {log.action}
                      </span>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {new Date(log.created_at).toLocaleString('vi-VN')}
                      </span>
                    </div>
                    <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem' }}>{log.context}</p>
                    {log.reason && (
                      <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        Lý do: {log.reason}
                      </p>
                    )}
                  </div>
                )) : (
                  <p style={{ color: 'var(--text-secondary)', textAlign: 'center', padding: '20px' }}>Không có lịch sử hành động</p>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Pattern Config Modal */}
      {showConfig && (
        <div className="modal-overlay">
          <div className="modal-container animate-fade-in" style={{ maxWidth: '500px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <h3 style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={20} /> Cấu hình Pattern Nhận diện
              </h3>
              <button className="btn-icon" onClick={() => setShowConfig(false)}><X size={16} /></button>
            </div>
            
            {config ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>P01: Ngưỡng tỷ lệ huỷ (%)</label>
                  <input type="number" value={config.P01_threshold_pct} onChange={(e) => setConfig({...config, P01_threshold_pct: Number(e.target.value)})} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>P02: Khung giờ cuối ca (Phút trước khi đóng ca)</label>
                  <input type="number" value={config.P02_end_of_shift_minutes} onChange={(e) => setConfig({...config, P02_end_of_shift_minutes: Number(e.target.value)})} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>P03: Giới hạn huỷ khi đang nấu</label>
                  <input type="number" value={config.P03_cooking_cancel_limit} onChange={(e) => setConfig({...config, P03_cooking_cancel_limit: Number(e.target.value)})} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>P04: Số lần lặp lại cùng món bị flag</label>
                  <input type="number" value={config.P04_repeated_item_limit} onChange={(e) => setConfig({...config, P04_repeated_item_limit: Number(e.target.value)})} />
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '24px' }}>
                  <button className="btn btn-secondary" onClick={() => setShowConfig(false)}>Huỷ</button>
                  <button className="btn btn-primary" onClick={handleSaveConfig} disabled={savingConfig}>
                    {savingConfig ? <Loader2 className="animate-spin" size={16} /> : 'Lưu cấu hình'}
                  </button>
                </div>
              </div>
            ) : (
               <div style={{ display: "flex", justifyContent: "center", padding: "40px 0" }}>
                 <Loader2 className="animate-spin" size={24} style={{ color: "var(--text-secondary)" }} />
               </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
