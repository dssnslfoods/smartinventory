import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Shield, Search, Filter, Download, Globe, Monitor, AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { HelpSection } from '@/components/HelpButton';
import { formatDateTime, formatNumber } from '@/utils/format';
import { exportToExcel } from '@/utils/export';

interface AuditRow {
  id: number;
  user_id: string | null;
  user_email: string;
  user_role: string | null;
  action: string;
  resource: string | null;
  ip_address: string | null;
  user_agent: string | null;
  payload: Record<string, unknown> | null;
  status: 'success' | 'failed';
  error_message: string | null;
  created_at: string;
}

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  CLEAR_ALL_DATA_FROM_SETTINGS: { label: 'ลบข้อมูลทั้งหมด (Settings)', color: '#dc2626' },
  CLEAR_ALL_DATA_FROM_IMPORT:   { label: 'ลบข้อมูลทั้งหมด (Import)',   color: '#dc2626' },
  CLEAR_ALL_DATA:               { label: 'ลบข้อมูลทั้งหมด',             color: '#dc2626' },
  DELETE_USER:                  { label: 'ลบผู้ใช้',                    color: '#dc2626' },
  RESET_USER_PASSWORD:          { label: 'รีเซ็ตรหัสผ่าน',                color: '#d97706' },
  CHANGE_USER_ROLE:             { label: 'เปลี่ยน Role',                color: '#d97706' },
  IMPORT_DATA:                  { label: 'นำเข้าข้อมูล',                 color: '#2E75B6' },
  BULK_DELETE:                  { label: 'ลบจำนวนมาก',                  color: '#dc2626' },
};

function shortUA(ua: string | null): string {
  if (!ua) return '—';
  // Extract browser + OS from UA
  let browser = 'Unknown';
  let os = 'Unknown';
  if (/Chrome\/(\d+)/.test(ua)) browser = `Chrome ${RegExp.$1}`;
  else if (/Firefox\/(\d+)/.test(ua)) browser = `Firefox ${RegExp.$1}`;
  else if (/Safari\/(\d+)/.test(ua) && !/Chrome/.test(ua)) browser = 'Safari';
  else if (/Edg\/(\d+)/.test(ua)) browser = `Edge ${RegExp.$1}`;

  if (/Windows NT/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/Linux/.test(ua)) os = 'Linux';
  return `${browser} · ${os}`;
}

export function AuditLogPage() {
  const [search, setSearch]         = useState('');
  const [actionFilter, setAction]   = useState('');
  const [statusFilter, setStatus]   = useState<'' | 'success' | 'failed'>('');
  const [expanded, setExpanded]     = useState<Set<number>>(new Set());

  const { data = [], isLoading, refetch } = useQuery({
    queryKey: ['auditLog'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as AuditRow[];
    },
  });

  const filtered = useMemo(() => {
    return data.filter(r => {
      if (actionFilter && r.action !== actionFilter) return false;
      if (statusFilter && r.status !== statusFilter) return false;
      if (search) {
        const q = search.toLowerCase();
        const hit =
          r.user_email.toLowerCase().includes(q) ||
          r.action.toLowerCase().includes(q) ||
          (r.resource ?? '').toLowerCase().includes(q) ||
          (r.ip_address ?? '').toLowerCase().includes(q);
        if (!hit) return false;
      }
      return true;
    });
  }, [data, search, actionFilter, statusFilter]);

  const actionsAvailable = useMemo(
    () => Array.from(new Set(data.map(r => r.action))).sort(),
    [data],
  );

  const toggleExpand = (id: number) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExport = () => {
    exportToExcel(filtered.map(r => ({
      'Timestamp':     r.created_at,
      'User':          r.user_email,
      'Role':          r.user_role ?? '',
      'Action':        r.action,
      'Status':        r.status,
      'Resource':      r.resource ?? '',
      'IP Address':    r.ip_address ?? '',
      'Browser/OS':    shortUA(r.user_agent),
      'Full User-Agent': r.user_agent ?? '',
      'Error':         r.error_message ?? '',
      'Payload':       r.payload ? JSON.stringify(r.payload) : '',
    })), `Audit_Log_${new Date().toISOString().split('T')[0]}`);
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Audit Log"
        subtitle="บันทึกการกระทำที่สำคัญในระบบ — ใครทำอะไร เมื่อไหร่ จากที่ไหน"
        helpTitle="Audit Log (บันทึกการตรวจสอบ)"
        helpBody={(<>
          <HelpSection title="หน้านี้แสดงอะไร">
            บันทึกการกระทำสำคัญ — เช่น Clear All Data, ลบผู้ใช้, รีเซ็ตรหัสผ่าน — พร้อมข้อมูล:
            <ul className="list-disc ml-5 text-xs mt-1 space-y-0.5">
              <li><strong>ใคร</strong> — Email + Role ของผู้ใช้</li>
              <li><strong>เมื่อไหร่</strong> — Timestamp (Asia/Bangkok)</li>
              <li><strong>จากที่ไหน</strong> — IP address + Browser/OS</li>
              <li><strong>ทำอะไร</strong> — Action + Resource ที่ถูกแก้</li>
              <li><strong>ผลลัพธ์</strong> — สำเร็จ / ล้มเหลว + error message</li>
            </ul>
          </HelpSection>
          <HelpSection title="ทำไมไม่มี MAC Address?">
            เบราว์เซอร์ทุกตัว <strong>ไม่ให้สิทธิ์</strong> JS เข้าถึง MAC Address เพื่อ
            ปกป้องความเป็นส่วนตัวของผู้ใช้ — เราใช้ User Email + IP + Browser
            แทน ซึ่งระบุตัวตนได้แม่นยำกว่า (MAC ปลอมง่าย แต่ session JWT ปลอมยาก)
          </HelpSection>
          <HelpSection title="Retention Policy">
            บันทึก audit เก็บไว้ <strong>ตลอดอายุของระบบ</strong> และเป็น append-only —
            แก้ไข/ลบไม่ได้ ทำให้ผ่าน audit GMP/HACCP ได้
          </HelpSection>
        </>)}
      />

      {/* Filters */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />
          <div className="relative flex-1 min-w-[240px] max-w-sm">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา email / IP / action..."
              className="input pl-9 w-full"
            />
          </div>
          <select className="select" value={actionFilter} onChange={e => setAction(e.target.value)}>
            <option value="">ทุก Action</option>
            {actionsAvailable.map(a => (
              <option key={a} value={a}>
                {ACTION_LABELS[a]?.label ?? a}
              </option>
            ))}
          </select>
          <select className="select" value={statusFilter} onChange={e => setStatus(e.target.value as '' | 'success' | 'failed')}>
            <option value="">ทุกสถานะ</option>
            <option value="success">✓ สำเร็จ</option>
            <option value="failed">✗ ล้มเหลว</option>
          </select>
          <button onClick={() => refetch()} className="btn btn-secondary">
            <Shield size={16} /> Refresh
          </button>
          <button onClick={handleExport} disabled={filtered.length === 0} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export Excel
          </button>
        </div>
        <p className="text-xs mt-3" style={{ color: 'var(--text-muted)' }}>
          แสดง {formatNumber(filtered.length)} รายการ {filtered.length !== data.length && `จากทั้งหมด ${formatNumber(data.length)}`} · เก็บล่าสุด 500 รายการ
        </p>
      </div>

      {/* Table */}
      <div className="card p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20" style={{ color: 'var(--text-muted)' }}>
            <Shield size={32} className="mx-auto mb-3 opacity-40" />
            ยังไม่มีบันทึก audit ที่ตรงกับฟิลเตอร์
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-alt)' }}>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">เวลา</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">ผู้ใช้</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Action</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">IP / Browser</th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase">สถานะ</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(row => {
                const actionMeta = ACTION_LABELS[row.action] ?? { label: row.action, color: '#6b7280' };
                const isExp = expanded.has(row.id);
                return (
                  <>
                    <tr
                      key={row.id}
                      className="border-t hover:bg-[var(--bg-alt)] cursor-pointer"
                      style={{ borderColor: 'var(--border)' }}
                      onClick={() => toggleExpand(row.id)}
                    >
                      <td className="px-3 py-2 text-xs tabular-nums" style={{ color: 'var(--text)' }}>
                        {formatDateTime(row.created_at)}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="font-medium" style={{ color: 'var(--text)' }}>{row.user_email}</div>
                        {row.user_role && (
                          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{row.user_role}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <span className="inline-block px-2 py-0.5 rounded font-medium" style={{ backgroundColor: actionMeta.color + '15', color: actionMeta.color }}>
                          {actionMeta.label}
                        </span>
                        {row.resource && (
                          <div className="text-[10px] mt-0.5 truncate max-w-[260px]" style={{ color: 'var(--text-muted)' }} title={row.resource}>
                            {row.resource}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="flex items-center gap-1.5" style={{ color: 'var(--text)' }}>
                          <Globe size={12} /> <span className="font-mono">{row.ip_address ?? '—'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          <Monitor size={11} /> {shortUA(row.user_agent)}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {row.status === 'success' ? (
                          <CheckCircle size={16} className="inline" style={{ color: '#16a34a' }} />
                        ) : (
                          <AlertCircle size={16} className="inline" style={{ color: '#dc2626' }} />
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{isExp ? '▲' : '▼'}</span>
                      </td>
                    </tr>
                    {isExp && (
                      <tr style={{ borderColor: 'var(--border)' }}>
                        <td colSpan={6} className="px-3 py-3 border-t" style={{ backgroundColor: 'var(--bg-alt)' }}>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>User Agent (เต็ม)</p>
                              <p className="font-mono text-[10px] break-all" style={{ color: 'var(--text-muted)' }}>
                                {row.user_agent ?? '—'}
                              </p>
                            </div>
                            <div>
                              <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Payload</p>
                              <pre className="font-mono text-[10px] p-2 rounded overflow-x-auto" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text)' }}>
                                {row.payload ? JSON.stringify(row.payload, null, 2) : '(ไม่มี)'}
                              </pre>
                            </div>
                            {row.error_message && (
                              <div className="md:col-span-2">
                                <p className="font-semibold mb-1" style={{ color: '#dc2626' }}>Error Message</p>
                                <p className="font-mono text-[10px] p-2 rounded" style={{ backgroundColor: 'rgba(220,38,38,0.1)', color: '#dc2626' }}>
                                  {row.error_message}
                                </p>
                              </div>
                            )}
                            <div className="md:col-span-2 text-[10px]" style={{ color: 'var(--text-muted)' }}>
                              ID: <span className="font-mono">{row.id}</span> ·
                              User ID: <span className="font-mono">{row.user_id ?? '—'}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
