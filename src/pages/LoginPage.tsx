import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  Mail, Lock, Eye, EyeOff, Shield, Box, Zap, ArrowRight, Globe, Check, AlertCircle,
  Loader2,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { isSupabaseConfigured } from '@/lib/supabase';
import { useLoginStats, type LoginPublicStats } from '@/hooks/useLoginStats';

// ─── Brand tokens (from design handoff) ────────────────────────────────────
const BRAND = {
  navy:      '#0a1428',
  navyDeep:  '#050a18',
  navyMid:   '#1e2a47',
  blue:      '#3b82f6',
  blueSoft:  '#60a5fa',
  blueDark:  '#2563eb',
  teal:      '#5eead4',
  amber:     '#f59e0b',
  red:       '#ef4444',
  textHi:    '#f8fafc',
  textMid:   '#e2e8f0',
  textLo:    'rgba(226,232,240,0.65)',
  textDim:   'rgba(148,163,184,0.8)',
  textMuted: 'rgba(148,163,184,0.5)',
};

// ─── Warehouse map data (Thailand regional pins) ──────────────────────────
type Pin = { code: string; x: number; y: number; major?: boolean; hq?: boolean; label?: string };
const PINS: Pin[] = [
  { code: 'CRI', x: 34, y: 14 },
  { code: 'CNX', x: 30, y: 22, major: true, label: 'CNX' },
  { code: '',    x: 40, y: 24 },
  { code: 'UDN', x: 48, y: 18 },
  { code: 'UBN', x: 62, y: 24 },
  { code: 'KKC', x: 55, y: 30 },
  { code: '',    x: 38, y: 36 },
  { code: 'BKK', x: 44, y: 44, major: true, hq: true, label: 'BKK' },
  { code: 'PTY', x: 54, y: 46 },
  { code: 'CTI', x: 60, y: 52 },
  { code: '',    x: 36, y: 54 },
  { code: 'HHN', x: 34, y: 64 },
  { code: '',    x: 36, y: 74 },
  { code: 'HKT', x: 42, y: 82, major: true, label: 'HKT' },
  { code: 'SKL', x: 48, y: 88 },
];

// Sparse edges between pins (indexes)
const EDGES: [number, number][] = [
  [0, 1], [1, 2], [2, 3], [3, 4], [3, 5], [5, 4], [5, 7], [2, 6], [6, 7],
  [7, 8], [7, 10], [8, 9], [10, 11], [11, 12], [12, 13], [13, 14], [7, 11],
];

// ─── Ticker data ──────────────────────────────────────────────────────────
// Static fallback used when the public-stats RPC fails (network / no DB).
// In normal operation buildTickerItems() below replaces this with real data.
type TickerItem = { key: string; value: string; color: string };

const FALLBACK_TICKER: TickerItem[] = [
  { key: 'SYSTEM',     value: 'online',          color: BRAND.teal },
  { key: 'FEFO',       value: 'ready',           color: BRAND.teal },
  { key: 'GMP_AUDIT',  value: 'compliant',       color: BRAND.teal },
  { key: 'TENANCY',    value: 'isolated',        color: BRAND.blueSoft },
  { key: 'ENCRYPTION', value: 'at rest + transit', color: BRAND.blueSoft },
  { key: 'IMPORT',     value: 'Excel-based',     color: 'rgba(148,163,184,0.85)' },
];

/** Format a YYYY-MM-DD date string into "dd MMM yyyy" (Buddhist Era for Thai). */
function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  try {
    return new Date(s).toLocaleDateString('th-TH', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return s; }
}

/** Compact number for ticker (1.2K / 264K / 1.5M) */
function fmtCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

/**
 * Build the ticker item list from real DB stats.
 * Each item is curated to be **non-sensitive** — only counts + dates +
 * group taxonomy. No prices, no SKU codes, no warehouse codes, no names.
 */
function buildTickerItems(stats: LoginPublicStats | null | undefined): TickerItem[] {
  if (!stats) return FALLBACK_TICKER;

  const items: TickerItem[] = [];

  // Total scope (always present)
  items.push({ key: 'WAREHOUSES',  value: String(stats.warehouse_count),         color: BRAND.blueSoft });
  items.push({ key: 'GROUPS',      value: String(stats.group_count),             color: 'rgba(148,163,184,0.85)' });
  items.push({ key: 'SKUS',        value: `${fmtCompact(stats.active_sku_count)} active`, color: BRAND.textMid });
  items.push({ key: 'LOTS',        value: fmtCompact(stats.lot_count),           color: BRAND.blueSoft });

  // Group taxonomy (short codes — fully generic)
  if (stats.group_codes && stats.group_codes.length) {
    items.push({
      key:   'TAXONOMY',
      value: stats.group_codes.join(' · '),
      color: 'rgba(148,163,184,0.85)',
    });
  }

  // Transactions
  items.push({ key: 'TRANSACTIONS', value: `${fmtCompact(stats.tx_count)} total`, color: BRAND.textMid });
  if (stats.tx_last_30d > 0) {
    items.push({ key: 'TX_30D', value: `${fmtCompact(stats.tx_last_30d)} in last 30d`, color: BRAND.teal });
  }

  // Last update dates
  if (stats.last_tx_date) {
    items.push({ key: 'LAST_TX',  value: fmtDate(stats.last_tx_date),       color: BRAND.teal });
  }
  if (stats.last_snapshot_date) {
    items.push({ key: 'SNAPSHOT', value: fmtDate(stats.last_snapshot_date), color: BRAND.blueSoft });
  }
  if (stats.last_master_update) {
    items.push({ key: 'MASTER_SYNC', value: fmtDate(stats.last_master_update), color: 'rgba(148,163,184,0.85)' });
  }

  // Risk indicators — counts only, not "which lots"
  if (stats.expired_lots > 0) {
    items.push({ key: 'EXPIRED_LOTS',   value: `${fmtCompact(stats.expired_lots)} flagged`, color: BRAND.red });
  }
  if (stats.lots_expiring_30d > 0) {
    items.push({ key: 'EXPIRING_30D',   value: `${fmtCompact(stats.lots_expiring_30d)} lots`, color: BRAND.amber });
  }

  // Static brand value props (always at the end)
  items.push({ key: 'FEFO',      value: 'ready',           color: BRAND.teal });
  items.push({ key: 'GMP_AUDIT', value: 'compliant',       color: BRAND.teal });
  items.push({ key: 'TENANCY',   value: 'isolated',        color: BRAND.blueSoft });

  return items;
}

// ─── Brand mark — "SI" with stacked horizontal bars ───────────────────────
function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="2" y="2" width="32" height="32" rx="7" stroke="rgba(255,255,255,0.18)" strokeWidth="1.5" />
      {/* Stacked bars suggesting inventory rows */}
      <rect x="9"  y="10" width="3" height="16" rx="0.5" fill="#f8fafc" />
      <rect x="24" y="10" width="3" height="16" rx="0.5" fill="#f8fafc" />
      <rect x="9"  y="12" width="18" height="1.8" rx="0.5" fill="#f8fafc" />
      <rect x="9"  y="17.5" width="18" height="1.8" rx="0.5" fill="#5eead4" />
      <rect x="9"  y="23" width="18" height="1.8" rx="0.5" fill="#f8fafc" />
    </svg>
  );
}

// ─── Warehouse map background ─────────────────────────────────────────────
function WarehouseMap() {
  return (
    <svg
      className="absolute inset-0 w-full h-full pointer-events-none"
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="edge" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor={BRAND.blueSoft} stopOpacity="0" />
          <stop offset="45%"  stopColor={BRAND.blueSoft} stopOpacity="0.45" />
          <stop offset="100%" stopColor={BRAND.blueSoft} stopOpacity="0" />
        </linearGradient>
        <radialGradient id="pinGlow" cx="50%" cy="50%">
          <stop offset="0%"   stopColor={BRAND.blueSoft} stopOpacity="0.55" />
          <stop offset="100%" stopColor={BRAND.blueSoft} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="pinGlowHQ" cx="50%" cy="50%">
          <stop offset="0%"   stopColor={BRAND.teal} stopOpacity="0.65" />
          <stop offset="100%" stopColor={BRAND.teal} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Edges (sparse Bezier curves) */}
      {EDGES.map(([a, b], i) => {
        const p1 = PINS[a], p2 = PINS[b];
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2 - 3;
        return (
          <path
            key={i}
            d={`M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`}
            stroke="url(#edge)"
            strokeWidth="0.18"
            fill="none"
            opacity="0.7"
          />
        );
      })}

      {/* Pins */}
      {PINS.map((p, i) => {
        const isHQ = p.hq;
        const delay = ((i * 0.35) % 3).toFixed(2);
        return (
          <g key={i}>
            <circle
              cx={p.x} cy={p.y} r={isHQ ? 3 : 2}
              fill={isHQ ? 'url(#pinGlowHQ)' : 'url(#pinGlow)'}
              className={isHQ ? 'wh-pulse-hq' : 'wh-pulse'}
              style={{ animationDelay: `${delay}s`, transformOrigin: `${p.x}px ${p.y}px` }}
            />
            <circle
              cx={p.x} cy={p.y} r={isHQ ? 0.7 : 0.45}
              fill={isHQ ? BRAND.teal : BRAND.blueSoft}
            />
            {p.label && (
              <text
                x={p.x + 2} y={p.y + 0.6}
                fontSize={p.major ? '1.8' : '1.4'}
                fontFamily="Geist Mono, monospace"
                fill={p.major ? 'rgba(226,232,240,0.7)' : 'rgba(148,163,184,0.5)'}
                letterSpacing="0.1"
              >
                {p.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

// ─── Bottom ticker ────────────────────────────────────────────────────────
function DataTicker({ items: source }: { items: TickerItem[] }) {
  const items = [...source, ...source]; // duplicate for seamless loop
  return (
    <div
      className="fixed bottom-0 left-0 right-0 h-9 overflow-hidden pointer-events-none"
      style={{
        background: 'linear-gradient(180deg, transparent, rgba(0,0,0,0.45))',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        zIndex: 4,
        WebkitMaskImage:  'linear-gradient(90deg, transparent 0, black 4%, black 96%, transparent 100%)',
        maskImage:        'linear-gradient(90deg, transparent 0, black 4%, black 96%, transparent 100%)',
      }}
    >
      <div className="ticker-track h-full flex items-center gap-9 px-8" style={{ width: 'max-content' }}>
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-2 text-[12px] whitespace-nowrap" style={{ fontFamily: 'Geist Mono, monospace' }}>
            <span className="w-[5px] h-[5px] rounded-full" style={{ backgroundColor: it.color }} />
            <span style={{ color: 'rgba(226,232,240,0.55)' }}>{it.key}</span>
            <span style={{ color: it.color }}>{it.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Feature row in the left column ───────────────────────────────────────
function FeatureRow({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-3.5">
      <div
        className="flex items-center justify-center flex-shrink-0"
        style={{
          width: 36, height: 36, borderRadius: 9,
          backgroundColor: 'rgba(59,130,246,0.1)',
          border: '1px solid rgba(59,130,246,0.28)',
          color: BRAND.blueSoft,
        }}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[14px] font-medium leading-tight mb-0.5" style={{ color: '#f1f5f9' }}>{title}</div>
        <div className="text-[13px] leading-snug" style={{ color: 'rgba(148,163,184,0.85)' }}>{sub}</div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────
export function LoginPage() {
  const { user, signIn, loading } = useAuthStore();
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [showPassword, setShowPwd]  = useState(false);
  // Default OFF — user must opt in. Session is cleared on tab/browser close
  // unless they tick "จดจำอุปกรณ์นี้" before signing in.
  const [remember, setRemember]     = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);
  // Real-time public stats for the bottom ticker (safe pre-auth aggregates)
  const { data: stats } = useLoginStats();
  const tickerItems = buildTickerItems(stats);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: BRAND.navyDeep }}>
        <div className="w-12 h-12 border-4 rounded-full animate-spin" style={{ borderColor: BRAND.blue, borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    // Remember-this-device toggle:
    // Default (UNchecked) → clear session on tab/browser close. The user
    // must explicitly tick the box to keep the session in localStorage.
    if (!remember) {
      try {
        window.addEventListener('beforeunload', () => {
          for (const k of Object.keys(localStorage)) {
            if (k.startsWith('sb-') && k.endsWith('-auth-token')) localStorage.removeItem(k);
          }
        }, { once: true });
      } catch { /* no-op */ }
    }

    const result = await signIn(email, password);
    if (result.error) {
      setError(result.error);
    }
    setSubmitting(false);
  };

  return (
    <>
      {/* ── Page-scoped styles (animations + font family overrides) ── */}
      <style>{`
        .smartlogin {
          font-family: 'Geist', 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
          color: ${BRAND.textHi};
        }
        .smartlogin .thai {
          font-family: 'Noto Sans Thai', 'Sarabun', 'Geist', sans-serif;
        }
        .smartlogin .mono {
          font-family: 'Geist Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
        }
        .smartlogin .italic-serif {
          font-family: 'Instrument Serif', Georgia, serif;
          font-style: italic;
        }

        @media (prefers-reduced-motion: no-preference) {
          @keyframes wh-pulse {
            0%, 100% { transform: scale(1); opacity: 0.55; }
            50%      { transform: scale(2.2); opacity: 0.15; }
          }
          @keyframes wh-pulse-hq {
            0%, 100% { transform: scale(1); opacity: 0.65; }
            50%      { transform: scale(2.8); opacity: 0.1; }
          }
          @keyframes status-breath {
            0%, 100% { opacity: 1;    box-shadow: 0 0 6px  ${BRAND.teal}; }
            50%      { opacity: 0.55; box-shadow: 0 0 14px ${BRAND.teal}; }
          }
          @keyframes ticker-scroll {
            0%   { transform: translateX(0); }
            100% { transform: translateX(-50%); }
          }
          .wh-pulse    { animation: wh-pulse 3.4s ease-in-out infinite; transform-box: fill-box; }
          .wh-pulse-hq { animation: wh-pulse-hq 2.6s ease-in-out infinite; transform-box: fill-box; }
          .status-dot  { animation: status-breath 2.4s ease-in-out infinite; }
          .ticker-track { animation: ticker-scroll 60s linear infinite; }
        }
      `}</style>

      <div
        className="smartlogin relative min-h-screen overflow-hidden"
        style={{ backgroundColor: BRAND.navyDeep }}
      >
        {/* ── Background layers ── */}
        {/* Ambient radial wash */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `
              radial-gradient(80% 60% at 18% 32%, rgba(37,99,235,0.18), transparent 60%),
              radial-gradient(60% 50% at 84% 70%, rgba(94,234,212,0.10), transparent 65%),
              radial-gradient(70% 70% at 50% 50%, rgba(59,130,246,0.05), transparent 75%)
            `,
            zIndex: 0,
          }}
        />

        {/* Thailand warehouse map */}
        <div className="absolute inset-0" style={{ zIndex: 1, opacity: 0.85 }}>
          <WarehouseMap />
        </div>

        {/* Fine grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
            opacity: 0.5,
            zIndex: 2,
          }}
        />

        {/* Center vignette */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'radial-gradient(closest-side, transparent, rgba(5,10,24,0.55))',
            zIndex: 2,
          }}
        />

        {/* ── Top bar ── */}
        <div
          className="absolute flex items-center justify-between"
          style={{ top: 32, left: 48, right: 48, zIndex: 5 }}
        >
          {/* Brand block */}
          <div className="flex items-center gap-3">
            <BrandMark size={36} />
            <div className="leading-tight">
              <div className="text-[15px] font-semibold" style={{ color: BRAND.textHi, letterSpacing: '-0.2px' }}>SmartInventory</div>
              <div className="text-[11.5px] mt-[3px]" style={{ color: 'rgba(148,163,184,0.8)', letterSpacing: '0.3px' }}>
                Lot-Level Inventory Intelligence
              </div>
            </div>
          </div>

          {/* Status + locale */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2.5">
              <span
                className="status-dot inline-block rounded-full"
                style={{ width: 7, height: 7, backgroundColor: BRAND.teal, boxShadow: `0 0 6px ${BRAND.teal}` }}
              />
              <span className="mono text-[12px] uppercase" style={{ color: 'rgba(226,232,240,0.7)', letterSpacing: '0.3px' }}>
                ALL SERVICES OPERATIONAL
              </span>
            </div>
            <span className="block w-px h-[18px]" style={{ backgroundColor: 'rgba(255,255,255,0.1)' }} />
            <button
              className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[13px] transition-colors hover:bg-white/[0.06]"
              style={{ color: 'rgba(226,232,240,0.7)' }}
              tabIndex={-1}
              aria-label="Change language"
            >
              <Globe size={14} /> EN
            </button>
          </div>
        </div>

        {/* ── Two-column content ── */}
        <div
          className="relative mx-auto min-h-screen flex items-center"
          style={{ zIndex: 3, padding: '0 88px' }}
        >
          <div className="grid w-full items-center" style={{ gridTemplateColumns: '1.1fr 0.9fr', gap: 48 }}>
            {/* ── LEFT: brand story ── */}
            <div className="pr-15 hidden lg:block" style={{ paddingRight: 60 }}>
              {/* Eyebrow pill */}
              <div
                className="inline-flex items-center gap-2 mono uppercase"
                style={{
                  padding: '5px 11px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(59,130,246,0.1)',
                  border: '1px solid rgba(59,130,246,0.28)',
                  color: BRAND.blueSoft,
                  fontSize: 11.5,
                  letterSpacing: 1,
                  marginBottom: 28,
                }}
              >
                <span className="rounded-full" style={{ width: 6, height: 6, backgroundColor: BRAND.teal }} />
                Built for food service operators
              </div>

              {/* Headline */}
              <h1
                style={{
                  fontWeight: 500,
                  fontSize: 56,
                  lineHeight: 1.02,
                  letterSpacing: '-1.6px',
                  color: BRAND.textHi,
                  marginBottom: 14,
                }}
              >
                Every lot.<br />
                Every expiry.<br />
                <span className="italic-serif" style={{ color: BRAND.teal, fontWeight: 400 }}>One source of truth.</span>
              </h1>

              {/* Thai subtitle */}
              <p
                className="thai"
                style={{
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: 'rgba(148,163,184,0.8)',
                  marginBottom: 18,
                }}
              >
                ระบบบริหารคลังสินค้าอัจฉริยะระดับ Lot — ลดของหมดอายุ เพิ่มกระแสเงินสด
              </p>

              {/* English subhead */}
              <p
                style={{
                  fontSize: 16,
                  lineHeight: 1.55,
                  color: 'rgba(226,232,240,0.65)',
                  maxWidth: 480,
                  marginBottom: 36,
                }}
              >
                Lot-level inventory intelligence that catches expiring stock before it's lost — and turns boardroom questions into one-click answers.
              </p>

              {/* Feature rows */}
              <div className="flex flex-col gap-3.5" style={{ maxWidth: 440 }}>
                <FeatureRow
                  icon={<Box size={16} />}
                  title="Lot-level intelligence"
                  sub="Track every batch and expiry date — not just SKUs"
                />
                <FeatureRow
                  icon={<Zap size={16} />}
                  title="FEFO automation"
                  sub="First-Expired-First-Out pick lists, generated daily"
                />
                <FeatureRow
                  icon={<Shield size={16} />}
                  title="Audit-ready by default"
                  sub="Full lot traceability for GMP, HACCP and finance"
                />
              </div>
            </div>

            {/* ── RIGHT: sign-in card ── */}
            <div className="flex justify-center lg:justify-end">
              <form
                onSubmit={handleSubmit}
                className="relative w-full max-w-[460px]"
                style={{
                  background: 'linear-gradient(180deg, rgba(20,33,61,0.82) 0%, rgba(8,17,30,0.88) 100%)',
                  backdropFilter: 'blur(14px) saturate(1.3)',
                  WebkitBackdropFilter: 'blur(14px) saturate(1.3)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 18,
                  padding: '36px 38px',
                  boxShadow: '0 40px 80px -20px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.06)',
                  overflow: 'hidden',
                }}
              >
                {/* Decorative top accent */}
                <div
                  className="absolute"
                  style={{
                    top: 0, left: 24, right: 24, height: 1,
                    background: `linear-gradient(90deg, transparent, ${BRAND.blueSoft}, ${BRAND.teal}, transparent)`,
                  }}
                />

                {/* Eyebrow */}
                <div className="mono uppercase" style={{ fontSize: 11, letterSpacing: 1.5, color: BRAND.blueSoft, marginBottom: 8 }}>
                  / Sign in
                </div>
                <h2 style={{ fontSize: 26, fontWeight: 600, lineHeight: 1.2, letterSpacing: '-0.4px', color: BRAND.textHi, marginBottom: 30 }}>
                  Welcome back
                </h2>

                {/* Config warning (only when supabase not set) */}
                {!isSupabaseConfigured() && (
                  <div
                    className="mb-4 p-3 rounded-lg flex items-start gap-2"
                    style={{ backgroundColor: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)' }}
                  >
                    <AlertCircle size={16} className="shrink-0 mt-0.5" style={{ color: BRAND.amber }} />
                    <div className="text-[12.5px]" style={{ color: '#fbbf24' }}>
                      Supabase ยังไม่ได้ตั้งค่า — แก้ไข <code className="px-1 rounded" style={{ backgroundColor: 'rgba(0,0,0,0.3)' }}>.env</code>
                    </div>
                  </div>
                )}

                {/* Inline error block */}
                {error && (
                  <div
                    className="mb-4 p-3 rounded-xl flex items-start gap-2 text-[13px]"
                    style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}
                  >
                    <AlertCircle size={14} className="shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {/* Email + Password fields */}
                <div className="flex flex-col gap-[18px]">
                  <Field
                    label="Email"
                    icon={<Mail size={16} />}
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="you@company.com"
                    autoComplete="email"
                    disabled={submitting}
                    required
                  />

                  <Field
                    label="Password"
                    icon={<Lock size={16} />}
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={setPassword}
                    placeholder="••••••••••"
                    autoComplete="current-password"
                    disabled={submitting}
                    required
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPwd(v => !v)}
                        className="p-1 rounded transition-colors hover:bg-white/[0.06]"
                        style={{ color: 'rgba(148,163,184,0.7)' }}
                        tabIndex={-1}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    }
                  />
                </div>

                {/* Remember device */}
                <label className="mt-5 flex items-center gap-[9px] cursor-pointer select-none text-[13px]" style={{ color: 'rgba(226,232,240,0.75)' }}>
                  <span
                    role="checkbox"
                    aria-checked={remember}
                    onClick={() => setRemember(v => !v)}
                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); setRemember(v => !v); } }}
                    tabIndex={0}
                    className="flex items-center justify-center transition-all"
                    style={{
                      width: 15, height: 15, borderRadius: 3.5,
                      backgroundColor: remember ? BRAND.blue : 'transparent',
                      border: `1.5px solid ${remember ? BRAND.blue : 'rgba(148,163,184,0.5)'}`,
                    }}
                  >
                    {remember && <Check size={11} strokeWidth={3} color="#fff" />}
                  </span>
                  Remember this device
                </label>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting || !email || !password}
                  className="w-full mt-5 flex items-center justify-center gap-2.5 transition-all disabled:opacity-60 disabled:cursor-not-allowed active:scale-[0.99] hover:brightness-110"
                  style={{
                    height: 50,
                    borderRadius: 10,
                    border: 'none',
                    background: 'linear-gradient(180deg, #3b82f6 0%, #2563eb 100%)',
                    color: '#ffffff',
                    fontSize: 15,
                    fontWeight: 600,
                    letterSpacing: '0.2px',
                    boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 12px 28px -8px rgba(37,99,235,0.55)',
                  }}
                >
                  {submitting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      Sign in securely
                      <ArrowRight size={16} />
                    </>
                  )}
                </button>

                {/* Security footer */}
                <div
                  className="mt-[26px] pt-[22px] flex items-center justify-center gap-2 text-[12.5px]"
                  style={{ borderTop: '1px solid rgba(255,255,255,0.06)', color: 'rgba(148,163,184,0.7)' }}
                >
                  <Shield size={13} />
                  <span>Multi-tenant isolated · Encrypted · Audit-trailed</span>
                </div>
              </form>
            </div>
          </div>
        </div>

        {/* ── Bottom Data Ticker (real DB stats) ── */}
        <DataTicker items={tickerItems} />

        {/* ── License footer (subtle, below ticker visually) ── */}
        <div
          className="absolute pointer-events-none text-center w-full"
          style={{ bottom: 48, zIndex: 4, fontSize: 11, color: 'rgba(148,163,184,0.4)' }}
        >
          Developed by{' '}
          <span style={{ color: 'rgba(226,232,240,0.6)' }}>D2Infinite Co., Ltd.</span>
          {' · '}
          © 2026 · Licensed under{' '}
          <a
            href="https://opensource.org/licenses/MIT"
            target="_blank"
            rel="noopener noreferrer"
            className="underline pointer-events-auto hover:text-white/60 transition-colors"
          >
            MIT License
          </a>
        </div>
      </div>
    </>
  );
}

// ─── Field component ─────────────────────────────────────────────────────
function Field({
  label, icon, type, value, onChange, placeholder, autoComplete, disabled, required, trailing,
}: {
  label: string;
  icon: React.ReactNode;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  disabled?: boolean;
  required?: boolean;
  trailing?: React.ReactNode;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <div>
      <label
        className="block mb-2 uppercase"
        style={{ fontSize: 11.5, fontWeight: 500, letterSpacing: 1, color: 'rgba(226,232,240,0.7)' }}
      >
        {label}
      </label>
      <div
        className="flex items-center transition-all"
        style={{
          height: 50,
          borderRadius: 10,
          padding: '0 16px',
          backgroundColor: focused ? 'rgba(15,25,48,0.75)' : 'rgba(15,25,48,0.45)',
          border: `1px solid ${focused ? 'rgba(59,130,246,0.55)' : 'rgba(255,255,255,0.08)'}`,
          boxShadow: focused
            ? '0 0 0 3px rgba(59,130,246,0.18), inset 0 1px 0 rgba(255,255,255,0.04)'
            : 'inset 0 1px 0 rgba(255,255,255,0.03)',
        }}
      >
        <span className="mr-3" style={{ color: 'rgba(148,163,184,0.7)' }}>{icon}</span>
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          required={required}
          className="flex-1 bg-transparent outline-none placeholder:text-[rgba(148,163,184,0.5)]"
          style={{ fontSize: 14.5, fontWeight: 400, color: BRAND.textHi }}
        />
        {trailing}
      </div>
    </div>
  );
}
