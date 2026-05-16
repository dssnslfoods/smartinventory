import { useState, useMemo, useEffect, useRef } from 'react';
import {
  Target, RefreshCw, Download, Filter, Clock, Layers, Search, X,
  TrendingUp, TrendingDown, Minus, FolderTree,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, Legend,
  Scatter, ScatterChart, ResponsiveContainer,
} from 'recharts';
import {
  useStockOnHand, useSlowMoving, useInventoryTurnover,
  useSystemConfig, useLotDetail, useLatestLotSnapshot,
  useMonthlySummary, useMonthlyTotal,
} from '@/hooks/useSupabaseQuery';
import type { MonthlySummaryRow } from '@/hooks/useSupabaseQuery';
import { ITEM_GROUPS, WAREHOUSES } from '@/types/database';
import { formatNumber, formatDate, formatCompact } from '@/utils/format';
import { exportToExcel } from '@/utils/export';
import { PageHeader } from '@/components/PageHeader';
import { HelpSection, HelpFormula, HelpLegend } from '@/components/HelpButton';

// ── Color palettes ─────────────────────────────────────────────────────────────
const VV_COLORS   = { A: '#16a34a', B: '#d97706', C: '#dc2626' } as const;
const SLOW_COLORS = { dead_stock: '#C62828', slow_moving: '#E65100', normal: '#2E7D32' };
const TURNOVER_HIGH = '#1F3864';
const TURNOVER_LOW  = '#90A4AE';

const tooltipStyle = {
  contentStyle: {
    backgroundColor: 'var(--bg-card, #fff)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 13,
  },
};

// ── Tab definitions ────────────────────────────────────────────────────────────
const TABS = [
  { id: 'vv',       label: 'VV Matrix',          icon: Target },
  { id: 'groups',   label: 'Group Analysis',      icon: FolderTree },
  { id: 'trends',   label: 'Trends & Compare',    icon: TrendingUp },
  { id: 'slow',     label: 'Slow Moving',         icon: Clock },
  { id: 'turnover', label: 'Inventory Turnover',  icon: RefreshCw },
  { id: 'fefo',     label: 'FEFO Pick List',      icon: Layers },
] as const;

type TabId = typeof TABS[number]['id'];

// ── Main Component ─────────────────────────────────────────────────────────────
export function ReportsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('vv');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Management Reports"
        subtitle="รายงานเชิงวิเคราะห์: VV Matrix, Slow Moving, Turnover, FEFO"
        helpTitle="Management Reports (รายงานบริหาร)"
        helpBody={(<>
          <HelpSection title="หน้านี้แสดงอะไร">
            4 แท็บรายงานเชิงวิเคราะห์ที่ใช้ตัดสินใจระดับบริหาร
          </HelpSection>
          <HelpSection title="แท็บ VV Matrix (Value × Validity)">
            จัดอันดับสินค้า A/B/C โดยรวมมูลค่าและวันที่จะหมดอายุ
            <HelpFormula>Final Score = ValueScore × (ValidityScore / 5)^α</HelpFormula>
            <HelpLegend items={[
              { color: '#16a34a', label: 'Class A', meaning: 'Score สูง — สำคัญและสด' },
              { color: '#d97706', label: 'Class B', meaning: 'ปานกลาง' },
              { color: '#dc2626', label: 'Class C', meaning: 'Score ต่ำ — ต้องเร่งระบาย' },
            ]} />
            <p className="text-xs mt-2 italic">ปรับเกณฑ์ A/B และค่า α ได้ที่ Settings → VV Matrix Configuration</p>
          </HelpSection>
          <HelpSection title="แท็บ Group Analysis">
            วิเคราะห์ตามกลุ่มสินค้า โดยใช้ <strong>VV ระดับ lot</strong> (เพราะ validity เป็นเรื่องของ lot จริงๆ)
            <ul className="list-disc ml-5 text-xs mt-1 space-y-1">
              <li>แต่ละกลุ่มมีของ Class A/B/C กี่ <strong>lot</strong></li>
              <li>กลุ่มไหน Move เยอะ/น้อย</li>
              <li>กลุ่มไหนของแพงสะสมเยอะ + หมุนช้า (Cash trapped)</li>
            </ul>
          </HelpSection>
          <HelpSection title="แท็บ Slow Moving">
            <HelpLegend items={[
              { color: '#C62828', label: 'Dead Stock',   meaning: 'ไม่มีการเคลื่อนไหวเลยใน 180 วัน' },
              { color: '#E65100', label: 'Slow Moving',  meaning: 'เคลื่อนไหวบ้างแต่นานๆ ครั้ง' },
              { color: '#2E7D32', label: 'Normal',        meaning: 'หมุนเวียนปกติ' },
            ]} />
          </HelpSection>
          <HelpSection title="แท็บ Inventory Turnover">
            <HelpFormula>Turnover Ratio = Annual COGS / Average Inventory Value</HelpFormula>
            ค่าสูง = หมุนเร็ว ดี — Days on Hand = 365 / Turnover
          </HelpSection>
          <HelpSection title="แท็บ FEFO Pick List">
            ลำดับการหยิบ lot ตามวันหมดอายุน้อย → มาก สำหรับใช้กับคลังจริง (First-Expired-First-Out)
          </HelpSection>
        </>)}
      />
      <div className="card p-1.5">
        <div className="flex flex-wrap gap-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeTab === id
                  ? 'text-white'
                  : 'text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-alt)]'
              }`}
              style={activeTab === id ? { backgroundColor: 'var(--color-primary)' } : {}}
            >
              <Icon size={15} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'vv'       && <VVMatrixTab />}
      {activeTab === 'groups'   && <GroupAnalysisTab />}
      {activeTab === 'trends'   && <TrendsTab />}
      {activeTab === 'slow'     && <SlowMovingTab />}
      {activeTab === 'turnover' && <TurnoverTab />}
      {activeTab === 'fefo'     && <FEFOPickListTab />}
    </div>
  );
}

// ── VV Matrix Types ────────────────────────────────────────────────────────────
interface VVItem {
  item_code: string;
  itemname: string;
  group_name: string;
  uom: string;
  stock_value: number;
  expire_date: string | null;
  remaining_days: number | null;
  value_score: number;
  validity_score: number;
  // ── Simple (weighted-average) model ──
  final_score: number;
  vv_class: 'A' | 'B' | 'C';
  // ── Exponential model ──
  normalized_validity: number;       // validity_score / 5
  exp_factor: number;                // (normalized_validity)^alpha
  exp_score: number;                 // value_score * exp_factor
  exp_class: 'A' | 'B' | 'C';       // A≥3.5  B≥1.5  C<1.5
  // ── Risk ──
  risk_flag: 'critical' | 'high_expiry' | null;
  priority_rank: number;             // rank by exp_score desc
  recommendation: string;
  is_urgent: boolean;
  // ── Lot-mode extras (undefined in item mode) ──
  batch_num?: string;
  warehouse?: string;
  whs_name?: string;
  qty?: number;
  fs_category?: string | null;
}

/** Generic record fed into the scoring engine. */
interface VVInput {
  item_code: string;
  itemname: string;
  group_name: string;
  uom: string;
  stock_value: number;
  expire_date: string | null;
  // optional pass-throughs
  batch_num?: string;
  warehouse?: string;
  whs_name?: string;
  qty?: number;
  fs_category?: string | null;
}

/** Core scoring — input list → VVItem list with all percentile / exp / class fields. */
function computeVVScores(
  inputs: VVInput[],
  cfg: ReturnType<typeof parseVVConfig>,
  alpha: number,
): VVItem[] {
  const sorted = [...inputs]
    .filter(v => v.stock_value > 0)
    .sort((a, b) => b.stock_value - a.stock_value);
  const total = sorted.length;
  if (total === 0) return [];

  const computed = sorted.map((v, idx) => {
    const pct = total > 1 ? idx / (total - 1) : 0;
    const value_score =
      pct < cfg.value_p5 ? 5 :
      pct < cfg.value_p4 ? 4 :
      pct < cfg.value_p3 ? 3 :
      pct < cfg.value_p2 ? 2 : 1;

    const remaining = getRemainingDays(v.expire_date);
    const validity_score =
      remaining === null            ? cfg.validity_no_expiry :
      remaining > cfg.validity_v5  ? 5 :
      remaining > cfg.validity_v4  ? 4 :
      remaining > cfg.validity_v3  ? 3 :
      remaining > cfg.validity_v2  ? 2 : 1;

    const final_score = Math.round(
      (value_score * cfg.weight_value + validity_score * cfg.weight_validity) * 10
    ) / 10;
    const vv_class: 'A' | 'B' | 'C' =
      final_score >= cfg.class_a ? 'A' :
      final_score >= cfg.class_b ? 'B' : 'C';

    const normalized_validity = validity_score / 5;
    const exp_factor = Math.pow(normalized_validity, alpha);
    const exp_score  = Math.round(value_score * exp_factor * 100) / 100;
    const exp_class: 'A' | 'B' | 'C' =
      exp_score >= cfg.exp_class_a ? 'A' :
      exp_score >= cfg.exp_class_b ? 'B' : 'C';

    const risk_flag: VVItem['risk_flag'] =
      value_score >= 4 && validity_score <= 2 ? 'critical' :
      validity_score <= 2                      ? 'high_expiry' : null;

    const recommendation =
      risk_flag === 'critical'    ? RISK_RECOMMENDATIONS.critical :
      risk_flag === 'high_expiry' ? RISK_RECOMMENDATIONS.high_expiry :
      RECOMMENDATIONS[exp_class];

    return {
      item_code:     v.item_code,
      itemname:      v.itemname,
      group_name:    v.group_name,
      uom:           v.uom,
      stock_value:   v.stock_value,
      expire_date:   v.expire_date,
      remaining_days: remaining,
      value_score, validity_score,
      final_score, vv_class,
      normalized_validity, exp_factor, exp_score, exp_class,
      risk_flag, priority_rank: 0,
      recommendation,
      is_urgent: value_score >= cfg.urgent_value_min && validity_score <= cfg.urgent_validity_max,
      batch_num:   v.batch_num,
      warehouse:   v.warehouse,
      whs_name:    v.whs_name,
      qty:         v.qty,
      fs_category: v.fs_category,
    } satisfies VVItem;
  });

  // Assign priority rank by exp_score desc
  const byExpScore = [...computed].sort((a, b) => b.exp_score - a.exp_score);
  byExpScore.forEach((item, i) => { item.priority_rank = i + 1; });
  return computed;
}

function getRemainingDays(expireDate: string | null): number | null {
  if (!expireDate) return null;
  return Math.floor((new Date(expireDate).getTime() - Date.now()) / 86_400_000);
}

const RECOMMENDATIONS: Record<'A' | 'B' | 'C', string> = {
  A: 'Push growth / Maintain availability',
  B: 'Monitor / Optimize pricing',
  C: 'Clearance / Reduce stock / Stop purchasing',
};

const RISK_RECOMMENDATIONS: Record<'critical' | 'high_expiry', string> = {
  critical:    'URGENT SALE REQUIRED — High value at expiry risk',
  high_expiry: 'Prioritise clearance — Expiry approaching',
};

// ── VV Config defaults (mirrored from SettingsPage) ──
const VV_DEFAULTS = {
  // Validity thresholds (days)
  validity_v5: 180, validity_v4: 90, validity_v3: 60, validity_v2: 30,
  validity_no_expiry: 3,
  // Value score percentile bands
  value_p5: 0.20, value_p4: 0.40, value_p3: 0.60, value_p2: 0.80,
  // Simple (weighted) model — kept for reference display
  class_a: 4.0, class_b: 2.5,
  weight_value: 0.5, weight_validity: 0.5,
  // Exponential model
  vv_alpha: 2,          // default exponential factor
  exp_class_a: 3.5,     // exp score ≥ this → Class A
  exp_class_b: 1.5,     // exp score ≥ this → Class B (else C)
  // Risk flagging
  urgent_value_min: 4, urgent_validity_max: 2,
};

function parseVVConfig(config: Array<{ key: string; value: string }> | undefined) {
  const c = { ...VV_DEFAULTS };
  if (!config) return c;
  const get = (k: string) => config.find(r => r.key === `vv_${k}`)?.value;
  const n = (k: keyof typeof VV_DEFAULTS, fallback: number) =>
    parseFloat(get(k) ?? '') || fallback;
  c.validity_v5        = n('validity_v5',        VV_DEFAULTS.validity_v5);
  c.validity_v4        = n('validity_v4',        VV_DEFAULTS.validity_v4);
  c.validity_v3        = n('validity_v3',        VV_DEFAULTS.validity_v3);
  c.validity_v2        = n('validity_v2',        VV_DEFAULTS.validity_v2);
  c.validity_no_expiry = n('validity_no_expiry', VV_DEFAULTS.validity_no_expiry);
  c.value_p5           = n('value_p5',           VV_DEFAULTS.value_p5);
  c.value_p4           = n('value_p4',           VV_DEFAULTS.value_p4);
  c.value_p3           = n('value_p3',           VV_DEFAULTS.value_p3);
  c.value_p2           = n('value_p2',           VV_DEFAULTS.value_p2);
  c.class_a            = n('class_a',            VV_DEFAULTS.class_a);
  c.class_b            = n('class_b',            VV_DEFAULTS.class_b);
  c.weight_value       = n('weight_value',       VV_DEFAULTS.weight_value);
  c.weight_validity    = n('weight_validity',    VV_DEFAULTS.weight_validity);
  c.vv_alpha           = n('vv_alpha',           VV_DEFAULTS.vv_alpha);
  c.exp_class_a        = n('exp_class_a',        VV_DEFAULTS.exp_class_a);
  c.exp_class_b        = n('exp_class_b',        VV_DEFAULTS.exp_class_b);
  c.urgent_value_min   = n('urgent_value_min',   VV_DEFAULTS.urgent_value_min);
  c.urgent_validity_max= n('urgent_validity_max',VV_DEFAULTS.urgent_validity_max);
  return c;
}

// ── VV Matrix Tab ─────────────────────────────────────────────────────────────
// 3 analytical modes for VV Matrix. See MODE_INFO below for full explanation.
type VVMode = 'lot' | 'item_worst' | 'item_weighted';

function VVMatrixTab() {
  const [vvClass, setVvClass]         = useState('');
  const [groupCode, setGroupCode]     = useState<number | undefined>();
  const [mode, setMode]               = useState<VVMode>('lot');
  const [search, setSearch]           = useState('');
  const [warehouse, setWarehouse]     = useState('');
  const [fsCategory, setFsCategory]   = useState('');
  // Ref to scroll to filtered table when a KPI card is clicked
  const tableRef = useRef<HTMLDivElement>(null);
  const scrollToTable = () => {
    setTimeout(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const [daysMax, setDaysMax]         = useState<number | undefined>();
  const [riskFlag, setRiskFlag]       = useState<'' | 'critical' | 'high_expiry'>('');
  const [minStockValue, setMinStockValue] = useState<string>('');

  const { data: stockData, isLoading: stockLoading } = useStockOnHand();
  const { data: snap }                                = useLatestLotSnapshot();
  const { data: lotResult, isLoading: lotLoading }    = useLotDetail({
    snapshotDate: snap,
    pageSize: 5000,
    page: 0,
  });
  const { data: sysConfig }                           = useSystemConfig();
  const cfg = useMemo(() => parseVVConfig(sysConfig), [sysConfig]);

  // item_worst falls back to v_stock_onhand (which already uses earliest lot
  // expire per warehouse); other modes need raw lot data.
  const isLoading = mode === 'item_worst' ? stockLoading : lotLoading;

  // Alpha initialises from config (admin can still override in-page)
  const [alpha, setAlpha] = useState(2);
  const [alphaSynced, setAlphaSynced] = useState(false);
  if (!alphaSynced && cfg.vv_alpha !== VV_DEFAULTS.vv_alpha) {
    setAlpha(Math.round(cfg.vv_alpha) as 1 | 2 | 3);
    setAlphaSynced(true);
  }

  const vvItems = useMemo<VVItem[]>(() => {
    // ── Mode 1: LOT — each lot scored independently (the canonical truth) ──
    if (mode === 'lot') {
      const lots = lotResult?.data ?? [];
      const inputs: VVInput[] = lots
        .filter(l => Number(l.qty) > 0)
        .map(l => ({
          item_code:   l.item_code,
          itemname:    l.itemname,
          group_name:  l.group_name,
          uom:         l.uom,
          stock_value: Number(l.amount),
          expire_date: l.expire_date,
          batch_num:   l.batch_num,
          warehouse:   l.warehouse,
          whs_name:    l.whs_name,
          qty:         Number(l.qty),
          fs_category: l.fs_category ?? null,
        }));
      return computeVVScores(inputs, cfg, alpha);
    }

    // ── Mode 2: ITEM (WORST-CASE) — aggregate to SKU, use earliest lot expire ──
    // Conservative rule: "if any lot is at risk, the SKU is at risk"
    if (mode === 'item_worst') {
      const all = stockData ?? [];
      if (!all.length) return [];
      const itemMap = new Map<string, VVInput>();
      for (const s of all) {
        const ex = itemMap.get(s.item_code);
        if (ex) {
          ex.stock_value += Number(s.stock_value);
          // earliest expire across all warehouses wins (already lot-based per row)
          if (s.expire_date && (!ex.expire_date || s.expire_date < ex.expire_date)) {
            ex.expire_date = s.expire_date;
          }
        } else {
          itemMap.set(s.item_code, {
            item_code:   s.item_code,
            itemname:    s.itemname,
            group_name:  s.group_name,
            uom:         s.uom,
            stock_value: Number(s.stock_value),
            expire_date: s.expire_date ?? null,
            fs_category: (s as any).fs_category ?? null,
          });
        }
      }
      return computeVVScores(Array.from(itemMap.values()), cfg, alpha);
    }

    // ── Mode 3: ITEM (WEIGHTED) — value-weighted avg of lot validity ──
    // Realistic rule: "average freshness of money tied up in this SKU"
    const lots = lotResult?.data ?? [];
    if (!lots.length) return [];

    type Acc = {
      item_code: string; itemname: string; group_name: string; uom: string;
      fs_category: string | null;
      total_value: number;
      weighted_days_sum: number;       // Σ (days_remaining × lot_value)
      total_value_with_expire: number; // denominator for weighted avg
    };
    const itemMap = new Map<string, Acc>();
    const today = Date.now();

    for (const l of lots) {
      const qty = Number(l.qty);
      if (qty <= 0) continue;
      const value = Number(l.amount);
      const daysLeft = l.expire_date
        ? (new Date(l.expire_date).getTime() - today) / 86_400_000
        : null;

      const ex = itemMap.get(l.item_code);
      if (ex) {
        ex.total_value += value;
        if (daysLeft != null) {
          ex.weighted_days_sum += daysLeft * value;
          ex.total_value_with_expire += value;
        }
      } else {
        itemMap.set(l.item_code, {
          item_code:   l.item_code,
          itemname:    l.itemname,
          group_name:  l.group_name,
          uom:         l.uom,
          fs_category: l.fs_category ?? null,
          total_value:             value,
          weighted_days_sum:       daysLeft != null ? daysLeft * value : 0,
          total_value_with_expire: daysLeft != null ? value : 0,
        });
      }
    }

    // Build synthetic VVInput: convert weighted-avg-days back into a synthetic
    // expire_date that produces the right validity_score when fed to computeVVScores.
    const inputs: VVInput[] = Array.from(itemMap.values()).map(it => {
      let effectiveExpire: string | null = null;
      if (it.total_value_with_expire > 0) {
        const avgDays = it.weighted_days_sum / it.total_value_with_expire;
        const t = today + avgDays * 86_400_000;
        effectiveExpire = new Date(t).toISOString().split('T')[0];
      }
      return {
        item_code:   it.item_code,
        itemname:    it.itemname,
        group_name:  it.group_name,
        uom:         it.uom,
        stock_value: it.total_value,
        expire_date: effectiveExpire,
        fs_category: it.fs_category,
      };
    });
    return computeVVScores(inputs, cfg, alpha);
  }, [mode, stockData, lotResult, cfg, alpha]);

  // Unique FS Categories present in the current dataset — drives the dropdown
  const availableFsCategories = useMemo(() => {
    const set = new Set<string>();
    for (const it of vvItems) {
      if (it.fs_category) set.add(it.fs_category);
    }
    return Array.from(set).sort();
  }, [vvItems]);

  // Unique warehouses present (lot mode only)
  const availableWarehouses = useMemo(() => {
    const set = new Set<string>();
    for (const it of vvItems) {
      if (it.warehouse) set.add(it.warehouse);
    }
    return Array.from(set).sort();
  }, [vvItems]);

  const minStockValueNum = useMemo(() => {
    const n = parseFloat(minStockValue);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [minStockValue]);

  const filtered = useMemo(() =>
    vvItems
      .filter(item => {
        if (vvClass   && item.exp_class  !== vvClass)               return false;
        if (groupCode && item.group_name !== ITEM_GROUPS[groupCode]) return false;
        if (fsCategory && item.fs_category !== fsCategory)          return false;
        if (warehouse && item.warehouse !== warehouse)              return false;
        if (riskFlag && item.risk_flag !== riskFlag)                return false;
        if (daysMax !== undefined) {
          if (item.remaining_days == null) return false;
          if (item.remaining_days > daysMax) return false;
        }
        if (minStockValueNum != null && item.stock_value < minStockValueNum) return false;
        if (search) {
          const q = search.toLowerCase();
          const hit =
            item.item_code.toLowerCase().includes(q) ||
            item.itemname.toLowerCase().includes(q) ||
            (item.batch_num ?? '').toLowerCase().includes(q) ||
            (item.fs_category ?? '').toLowerCase().includes(q);
          if (!hit) return false;
        }
        return true;
      })
      .sort((a, b) => a.priority_rank - b.priority_rank),
    [vvItems, vvClass, groupCode, fsCategory, warehouse, riskFlag, daysMax, minStockValueNum, search],
  );

  const resetFilters = () => {
    setVvClass(''); setGroupCode(undefined); setFsCategory('');
    setWarehouse(''); setDaysMax(undefined); setRiskFlag('');
    setMinStockValue(''); setSearch('');
  };

  const activeFilterCount = [
    vvClass, groupCode, fsCategory, warehouse, daysMax !== undefined ? '1' : '',
    riskFlag, minStockValueNum != null ? '1' : '', search,
  ].filter(Boolean).length;

  const summary = useMemo(() => {
    const all      = vvItems;
    const countA   = all.filter(i => i.exp_class === 'A').length;
    const countB   = all.filter(i => i.exp_class === 'B').length;
    const countC   = all.filter(i => i.exp_class === 'C').length;
    const totalVal = all.reduce((s, i) => s + i.stock_value, 0);
    const valA     = all.filter(i => i.exp_class === 'A').reduce((s, i) => s + i.stock_value, 0);
    const valB     = all.filter(i => i.exp_class === 'B').reduce((s, i) => s + i.stock_value, 0);
    const valC     = all.filter(i => i.exp_class === 'C').reduce((s, i) => s + i.stock_value, 0);
    const avgExpScore   = all.length ? all.reduce((s, i) => s + i.exp_score,   0) / all.length : 0;
    const avgSimScore   = all.length ? all.reduce((s, i) => s + i.final_score, 0) / all.length : 0;
    const criticalCount = all.filter(i => i.risk_flag === 'critical').length;
    const highRiskCount = all.filter(i => i.risk_flag === 'high_expiry').length;
    return { countA, countB, countC, total: all.length, totalVal, valA, valB, valC, avgExpScore, avgSimScore, criticalCount, highRiskCount };
  }, [vvItems]);

  // Bin items by integer (value_score, validity_score) cell — many items collapse
  // onto the same grid position because both axes are 1-5 integers. We aggregate
  // and size each dot by item count so the user actually sees the density.
  const scatterData = useMemo(() => {
    type Bin = {
      x: number; y: number;
      count: number;
      items: VVItem[];
      avg_exp_score: number;
    };
    const bin = (cls: 'A' | 'B' | 'C') => {
      const map = new Map<string, Bin>();
      for (const it of vvItems) {
        if (it.exp_class !== cls) continue;
        const key = `${it.value_score}|${it.validity_score}`;
        const ex = map.get(key);
        if (ex) {
          ex.count += 1;
          ex.items.push(it);
          ex.avg_exp_score = (ex.avg_exp_score * (ex.count - 1) + it.exp_score) / ex.count;
        } else {
          map.set(key, {
            x: it.value_score, y: it.validity_score,
            count: 1, items: [it], avg_exp_score: it.exp_score,
          });
        }
      }
      return Array.from(map.values());
    };
    return { A: bin('A'), B: bin('B'), C: bin('C') };
  }, [vvItems]);

  // Max bin count — used to scale dot radius logarithmically so a 200-item bin
  // doesn't visually drown a 5-item bin.
  const maxBinCount = useMemo(() => {
    let m = 1;
    for (const bins of Object.values(scatterData)) {
      for (const b of bins) if (b.count > m) m = b.count;
    }
    return m;
  }, [scatterData]);

  const handleExport = () => {
    exportToExcel(filtered.map(r => ({
      'Priority Rank':             r.priority_rank,
      'Item Code':                 r.item_code,
      ...(mode === 'lot' ? {
        'Batch / Lot':             r.batch_num ?? '',
        'Warehouse':               r.warehouse ?? '',
        'Lot Qty':                 r.qty ?? '',
      } : {}),
      'Item Name':                 r.itemname,
      'Group':                     r.group_name,
      'FS Category':               r.fs_category ?? '',
      'Stock Value (฿)':           r.stock_value,
      'Expire Date':               r.expire_date ?? 'N/A',
      'Days Remaining':            r.remaining_days ?? 'N/A',
      'Value Score (1-5)':         r.value_score,
      'Validity Score (1-5)':      r.validity_score,
      'Simple Score':              r.final_score,
      'Simple Class':              r.vv_class,
      'Normalized Validity':       r.normalized_validity.toFixed(2),
      'Exp Factor':                r.exp_factor.toFixed(4),
      'Exponential Score':         r.exp_score,
      'Exponential Class':         r.exp_class,
      'Risk Flag':                 r.risk_flag ?? '',
      'Recommendation':            r.recommendation,
    })),
      mode === 'lot'           ? 'VV_Matrix_By_Lot'
      : mode === 'item_worst'  ? 'VV_Matrix_Item_WorstCase'
      :                          'VV_Matrix_Item_Weighted'
    );
  };

  const alphaInfo = {
    1: { label: 'α=1 Linear',   desc: 'Same as weighted average' },
    2: { label: 'α=2 Moderate', desc: 'Default — balanced risk penalty' },
    3: { label: 'α=3 Aggressive', desc: 'Recommended for perishables / food' },
  } as const;

  return (
    <div className="space-y-6">

      {/* ── Mode Selector: 3 analytical lenses on the same data ── */}
      <ModeSelectorCard mode={mode} setMode={setMode} snapAvailable={!!snap} snap={snap ?? null} />

      {/* ── Alpha Selector Bar */}
      <div className="card py-3 px-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Exponential Factor (α)</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Controls how aggressively low validity is penalised</p>
          </div>
          <div className="flex gap-2">
            {([1, 2, 3] as const).map(a => (
              <button
                key={a}
                onClick={() => setAlpha(a)}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border transition-all"
                style={alpha === a
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff', borderColor: 'var(--color-primary)' }
                  : { borderColor: 'var(--border)', color: 'var(--text-muted)' }
                }
              >
                {alphaInfo[a].label}
              </button>
            ))}
          </div>
          <p className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
            {alphaInfo[alpha as 1|2|3].desc}
          </p>
          <div className="ml-auto text-xs px-2 py-1 rounded" style={{ backgroundColor: 'var(--bg-alt)', color: 'var(--text-muted)' }}>
            Score = ValueScore × (ValidityScore/5)<sup>α</sup>
          </div>
        </div>
      </div>

      {/* ── KPI Cards (clickable → filter the table below) ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Avg Exp Score — click to reset all filters */}
        <KpiClickCard
          title="Avg Exp Score"
          value={summary.avgExpScore.toFixed(2)}
          sub={`Simple: ${summary.avgSimScore.toFixed(2)}`}
          color="var(--color-primary)"
          isActive={false}
          onClick={() => { resetFilters(); scrollToTable(); }}
          hint="คลิก → ล้างฟิลเตอร์ทั้งหมด"
        />

        {/* Class A / B / C — click to filter by that class */}
        {(['A', 'B', 'C'] as const).map(cls => {
          const count = cls === 'A' ? summary.countA : cls === 'B' ? summary.countB : summary.countC;
          const val   = cls === 'A' ? summary.valA   : cls === 'B' ? summary.valB   : summary.valC;
          const label = { A: 'Strategic', B: 'Core', C: 'At Risk' }[cls];
          const pct   = summary.total ? ((count / summary.total) * 100).toFixed(0) : '0';
          const isActive = vvClass === cls;
          return (
            <KpiClickCard
              key={cls}
              title={`Class ${cls} – ${label}`}
              value={`${pct}%`}
              sub={`${count} items · ฿${formatCompact(val)}`}
              color={VV_COLORS[cls]}
              isActive={isActive}
              onClick={() => {
                if (isActive) {
                  setVvClass('');
                } else {
                  setVvClass(cls);
                  setRiskFlag('');
                }
                scrollToTable();
              }}
              hint={isActive ? 'คลิกซ้ำ → ยกเลิกฟิลเตอร์' : `คลิก → กรอง Class ${cls}`}
            />
          );
        })}

        {/* Critical — click to filter by risk_flag = critical */}
        <KpiClickCard
          title="Critical Items"
          value={String(summary.criticalCount)}
          sub="High value + near expiry"
          color="#7c3aed"
          isActive={riskFlag === 'critical'}
          onClick={() => {
            if (riskFlag === 'critical') {
              setRiskFlag('');
            } else {
              setRiskFlag('critical');
              setVvClass('');
            }
            scrollToTable();
          }}
          hint={riskFlag === 'critical' ? 'คลิกซ้ำ → ยกเลิก' : 'คลิก → กรอง Critical เท่านั้น'}
        />

        {/* Value at Risk — click to filter Class C */}
        <KpiClickCard
          title="Value at Risk"
          value={`฿${formatCompact(summary.valC)}`}
          sub="Class C inventory"
          color="#dc2626"
          isActive={vvClass === 'C'}
          onClick={() => {
            if (vvClass === 'C') {
              setVvClass('');
            } else {
              setVvClass('C');
              setRiskFlag('');
            }
            scrollToTable();
          }}
          hint={vvClass === 'C' ? 'คลิกซ้ำ → ยกเลิก' : 'คลิก → กรอง Class C'}
          smallValue
        />
      </div>

      {/* ── Risk Alert Banner */}
      {(summary.criticalCount > 0 || summary.highRiskCount > 0) && (
        <div className="rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.2)' }}>
          <span className="text-lg leading-none mt-0.5">🚨</span>
          <div className="text-sm">
            <span className="font-semibold" style={{ color: '#dc2626' }}>Expiry Risk Alert — </span>
            <span style={{ color: 'var(--text)' }}>
              {summary.criticalCount > 0 && <><strong>{summary.criticalCount} Critical</strong> (high-value items expiring soon){summary.highRiskCount > 0 ? ' · ' : ''}</>}
              {summary.highRiskCount > 0 && <><strong>{summary.highRiskCount} High-Risk</strong> items with validity ≤ 2</>}
              . Immediate action required.
            </span>
          </div>
        </div>
      )}

      {/* ── Matrix Scatter + Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div className="card lg:col-span-2">
          <div className="flex items-start justify-between mb-0.5">
            <h3 className="font-semibold" style={{ color: 'var(--text)' }}>VV Matrix — Value × Validity</h3>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: 'rgba(var(--color-primary-rgb,99,102,241),0.1)', color: 'var(--color-primary)' }}>
              Coloured by Exp Class (α={alpha})
            </span>
          </div>
          <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
            จุด 1 จุด = สินค้าหลายตัวที่มีคะแนนตำแหน่งเดียวกัน · <strong>ขนาด=จำนวน</strong> · X = Value, Y = Validity · โซนเสี่ยง: ขวาล่าง
          </p>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 10, right: 30, bottom: 36, left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis
                  type="number" dataKey="x"
                  domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]}
                  stroke="var(--text-muted)" fontSize={11}
                  label={{ value: 'Value Score (Stock Ranking) →', position: 'insideBottom', offset: -20, fontSize: 10, fill: 'var(--text-muted)' }}
                />
                <YAxis
                  type="number" dataKey="y"
                  domain={[0.5, 5.5]} ticks={[1, 2, 3, 4, 5]}
                  stroke="var(--text-muted)" fontSize={11}
                  label={{ value: 'Validity Score →', angle: -90, position: 'insideLeft', offset: -5, fontSize: 10, fill: 'var(--text-muted)' }}
                  width={32}
                />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload as { x: number; y: number; count: number; items: VVItem[]; avg_exp_score: number };
                    const critCount = d.items.filter(i => i.risk_flag === 'critical').length;
                    const highExpCount = d.items.filter(i => i.risk_flag === 'high_expiry').length;
                    const preview = d.items.slice(0, 5);
                    return (
                      <div style={{ ...tooltipStyle.contentStyle, padding: '10px 12px', minWidth: 260, maxWidth: 340 }}>
                        <p className="font-semibold text-sm mb-1">
                          {d.count} {d.count === 1 ? 'รายการ' : 'รายการ'} • Value {d.x} / Validity {d.y}
                        </p>
                        <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                          Exp Score เฉลี่ย: <strong>{d.avg_exp_score.toFixed(2)}</strong> (α={alpha})
                        </p>
                        {(critCount > 0 || highExpCount > 0) && (
                          <div className="flex gap-2 mb-2 text-[11px] font-semibold">
                            {critCount > 0 && <span style={{ color: '#dc2626' }}>🔴 Critical: {critCount}</span>}
                            {highExpCount > 0 && <span style={{ color: '#ea580c' }}>🟠 High Expiry: {highExpCount}</span>}
                          </div>
                        )}
                        <div className="border-t pt-1.5" style={{ borderColor: 'var(--border)' }}>
                          <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>ตัวอย่าง:</p>
                          {preview.map(it => (
                            <div key={it.item_code} className="text-[11px] truncate">
                              <span className="font-mono" style={{ color: 'var(--color-primary-light)' }}>{it.item_code}</span>{' '}
                              <span style={{ color: 'var(--text-muted)' }}>{it.itemname}</span>
                            </div>
                          ))}
                          {d.count > preview.length && (
                            <p className="text-[10px] mt-1 italic" style={{ color: 'var(--text-muted)' }}>
                              + อีก {d.count - preview.length} รายการ — ดูในตารางด้านล่าง
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  }}
                />
                {(['A', 'B', 'C'] as const).map(cls => (
                  <Scatter
                    key={cls}
                    name={`Class ${cls}`}
                    data={scatterData[cls]}
                    fill={VV_COLORS[cls]}
                    fillOpacity={0.75}
                    stroke="#fff"
                    strokeWidth={1.5}
                    shape={(props: any) => {
                      // Scale radius by item count — sqrt scale so big bins don't dwarf small ones.
                      // r range: 6 (count=1) → 26 (count=maxBin)
                      const count = props.payload?.count ?? 1;
                      const r = 6 + 20 * Math.sqrt((count - 1) / Math.max(1, maxBinCount - 1));
                      return (
                        <g>
                          <circle cx={props.cx} cy={props.cy} r={r} fill={props.fill} fillOpacity={0.75} stroke="#fff" strokeWidth={1.5} />
                          {count > 1 && (
                            <text
                              x={props.cx} y={props.cy} dy={4}
                              textAnchor="middle"
                              fontSize={r >= 14 ? 12 : 10}
                              fontWeight={700}
                              fill="#fff"
                              style={{ pointerEvents: 'none' }}
                            >
                              {count}
                            </text>
                          )}
                        </g>
                      );
                    }}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs border-t pt-3" style={{ borderColor: 'var(--border)' }}>
            {[
              { color: VV_COLORS.A, label: `A  (Exp Score ≥ ${cfg.exp_class_a})`,                           desc: 'Strategic — high value + fresh → push growth' },
              { color: VV_COLORS.B, label: `B  (Exp Score ${cfg.exp_class_b}–${cfg.exp_class_a - 0.01})`, desc: 'Core / Monitor — optimise & watch' },
              { color: VV_COLORS.C, label: `C  (Exp Score < ${cfg.exp_class_b})`,                         desc: 'Risk / Clearance — reduce & stop purchasing' },
              { color: '#7c3aed',   label: '🔴 Critical',              desc: `Value ≥ 4 AND Validity ≤ 2 — urgent sale` },
            ].map(({ color, label, desc }) => (
              <div key={label} className="flex items-start gap-2">
                <span className="mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                <span style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>
                  <strong style={{ color: 'var(--text)', display: 'block' }}>{label}</strong>
                  {desc}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sidebar — Exp Classification + Score Reference */}
        <div className="card">
          <h3 className="font-semibold mb-1" style={{ color: 'var(--text)' }}>Exp Classification</h3>
          <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>Based on exponential score (α={alpha})</p>
          <div className="space-y-4">
            {(['A', 'B', 'C'] as const).map(cls => {
              const count = cls === 'A' ? summary.countA : cls === 'B' ? summary.countB : summary.countC;
              const val   = cls === 'A' ? summary.valA   : cls === 'B' ? summary.valB   : summary.valC;
              const pct   = summary.total ? (count / summary.total) * 100 : 0;
              const labels = { A: 'Strategic', B: 'Core', C: 'At Risk' };
              const thresholds = {
                A: `≥ ${cfg.exp_class_a}`,
                B: `${cfg.exp_class_b} – ${(cfg.exp_class_a - 0.01).toFixed(2)}`,
                C: `< ${cfg.exp_class_b}`,
              };
              return (
                <div key={cls}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded text-white text-xs font-bold flex items-center justify-center"
                        style={{ backgroundColor: VV_COLORS[cls] }}>{cls}</span>
                      <div>
                        <span className="text-sm font-medium block" style={{ color: 'var(--text)' }}>{labels[cls]}</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{thresholds[cls]}</span>
                      </div>
                    </div>
                    <span className="text-xs font-semibold" style={{ color: VV_COLORS[cls] }}>{pct.toFixed(0)}%</span>
                  </div>
                  <div className="w-full rounded-full h-2 mb-1" style={{ backgroundColor: 'var(--bg-alt)' }}>
                    <div className="h-2 rounded-full" style={{ width: `${pct}%`, backgroundColor: VV_COLORS[cls] }} />
                  </div>
                  <p className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    {count} items · ฿{formatCompact(val)}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-5 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text)' }}>Validity Score Reference</p>
            <div className="space-y-1.5 text-xs">
              {[
                { score: 5, label: '> 180 days',         color: '#16a34a', norm: '1.00', ef: Math.pow(1.00, alpha).toFixed(2) },
                { score: 4, label: '91 – 180 days',       color: '#65a30d', norm: '0.80', ef: Math.pow(0.80, alpha).toFixed(2) },
                { score: 3, label: '61 – 90 days',        color: '#d97706', norm: '0.60', ef: Math.pow(0.60, alpha).toFixed(2) },
                { score: 2, label: '31 – 60 days',        color: '#ea580c', norm: '0.40', ef: Math.pow(0.40, alpha).toFixed(2) },
                { score: 1, label: '≤ 30 days / expired', color: '#dc2626', norm: '0.20', ef: Math.pow(0.20, alpha).toFixed(2) },
              ].map(({ score, label, color, ef }) => (
                <div key={score} className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold w-10" style={{ color }}>Sc.{score}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                  </div>
                  <span className="font-mono font-semibold" style={{ color }}>×{ef}</span>
                </div>
              ))}
            </div>
            <p className="text-xs mt-2 italic" style={{ color: 'var(--text-muted)' }}>
              Multiplier = (score/5)<sup>α</sup> applied to value score
            </p>
          </div>
        </div>
      </div>

      {/* ── Filters: search + action row */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[260px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา รหัส / ชื่อสินค้า / batch / FS category..."
              className="input pl-9 w-full"
            />
          </div>
          <div className="flex items-center gap-2 ml-auto">
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
                title="ลบ filter ทั้งหมด"
              >
                <X size={12} /> Reset ({activeFilterCount})
              </button>
            )}
            <button onClick={handleExport} className="btn btn-secondary">
              <Download size={16} /> Export ({filtered.length})
            </button>
          </div>
        </div>

        {/* Dropdown row */}
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />

          <select className="select" value={vvClass} onChange={e => setVvClass(e.target.value)} title="Exp Class">
            <option value="">All Classes (Exp)</option>
            <option value="A">Class A – Strategic</option>
            <option value="B">Class B – Core</option>
            <option value="C">Class C – At Risk</option>
          </select>

          <select className="select" value={groupCode ?? ''} onChange={e => setGroupCode(e.target.value ? Number(e.target.value) : undefined)} title="Item Group">
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>

          {availableFsCategories.length > 0 && (
            <select className="select" value={fsCategory} onChange={e => setFsCategory(e.target.value)} title="FS Category">
              <option value="">All FS Categories</option>
              {availableFsCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          )}

          {mode === 'lot' && availableWarehouses.length > 0 && (
            <select className="select" value={warehouse} onChange={e => setWarehouse(e.target.value)} title="Warehouse">
              <option value="">All Warehouses</option>
              {availableWarehouses.map(w => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          )}

          <select
            className="select"
            value={riskFlag}
            onChange={e => setRiskFlag(e.target.value as '' | 'critical' | 'high_expiry')}
            title="Risk Flag"
          >
            <option value="">All Risk Levels</option>
            <option value="critical">🔴 CRITICAL only</option>
            <option value="high_expiry">🟠 HIGH RISK only</option>
          </select>

          <div className="flex items-center gap-1.5">
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Min ฿:</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={minStockValue}
              onChange={e => setMinStockValue(e.target.value)}
              placeholder="0"
              className="input w-28 text-right text-xs"
            />
          </div>
        </div>

        {/* Days-left quick chips */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Days Left ≤</span>
          {([
            { label: 'All', value: undefined },
            { label: '7 วัน',  value: 7 },
            { label: '30 วัน', value: 30 },
            { label: '60 วัน', value: 60 },
            { label: '90 วัน', value: 90 },
            { label: '180 วัน', value: 180 },
          ] as const).map(({ label, value }) => (
            <button
              key={String(value ?? 'all')}
              onClick={() => setDaysMax(value)}
              className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
              style={daysMax === value
                ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
                : { borderColor: 'var(--border)', color: 'var(--text-muted)' }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Product Table */}
      <div ref={tableRef} className="card p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <colgroup>
                <col style={{ width: 36 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 110 }} />
                <col style={{ width: 190 }} />
                <col style={{ width: 55 }} />
                <col style={{ width: 95 }} />
                <col style={{ width: 95 }} />
                <col style={{ width: 72 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 88 }} />
                <col style={{ width: 68 }} />
                <col style={{ width: 82 }} />
                <col style={{ width: 90 }} />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th className="text-center">#</th>
                  <th>Class</th>
                  <th>Item Code</th>
                  {mode === 'lot' && <th>Batch / Whs</th>}
                  <th>Item Name</th>
                  <th>Grp</th>
                  <th className="text-right">Stock Value</th>
                  <th>Expire Date</th>
                  <th className="text-right">Days Left</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Validity</th>
                  <th className="text-right">Simple</th>
                  <th className="text-right">Exp Score</th>
                  <th>Risk</th>
                  <th>Recommendation</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={mode === 'lot' ? `${row.item_code}|${row.warehouse}|${row.batch_num}` : row.item_code}
                    style={row.risk_flag === 'critical'    ? { backgroundColor: 'rgba(220,38,38,0.05)' } :
                           row.risk_flag === 'high_expiry' ? { backgroundColor: 'rgba(234,88,12,0.04)'  } : {}}>
                    <td className="text-center text-xs tabular-nums font-semibold" style={{ color: 'var(--text-muted)' }}>
                      {row.priority_rank}
                    </td>
                    <td>
                      <div className="flex flex-col gap-0.5">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded text-white text-xs font-bold"
                          style={{ backgroundColor: VV_COLORS[row.exp_class] }}>
                          {row.exp_class}
                        </span>
                        {row.vv_class !== row.exp_class && (
                          <span className="text-xs leading-none px-1 rounded"
                            style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-alt)' }}>
                            {row.vv_class}↑
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="font-mono text-xs font-medium whitespace-nowrap" style={{ color: 'var(--color-primary-light)' }}>
                      {row.item_code}
                    </td>
                    {mode === 'lot' && (
                      <td className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                        <div className="font-mono text-[11px] truncate" style={{ maxWidth: 140 }} title={row.batch_num}>{row.batch_num}</div>
                        <div className="text-[10px]">{row.warehouse}</div>
                      </td>
                    )}
                    <td className="text-xs" style={{ overflow: 'hidden' }}>
                      <span className="block truncate" style={{ maxWidth: 180 }} title={row.itemname}>{row.itemname}</span>
                    </td>
                    <td className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {row.group_name.split('-')[0].trim()}
                    </td>
                    <td className="text-right tabular-nums text-xs whitespace-nowrap">฿{formatCompact(row.stock_value)}</td>
                    <td className="text-xs tabular-nums whitespace-nowrap"
                      style={{ color: row.remaining_days !== null && row.remaining_days <= 30 ? '#dc2626' : 'var(--text-muted)' }}>
                      {row.expire_date ? formatDate(row.expire_date) : '—'}
                    </td>
                    <td className="text-right tabular-nums text-xs font-semibold whitespace-nowrap">
                      {row.remaining_days !== null ? (
                        <span style={{ color: row.remaining_days <= 0 ? '#dc2626' : row.remaining_days <= 30 ? '#ea580c' : row.remaining_days <= 90 ? '#d97706' : 'var(--text)' }}>
                          {row.remaining_days > 0 ? `${row.remaining_days}d` : 'Expired'}
                        </span>
                      ) : '—'}
                    </td>
                    <td><ScoreBar score={row.value_score} color={VV_COLORS[row.exp_class]} /></td>
                    <td><ScoreBar score={row.validity_score} color={VV_COLORS[row.exp_class]} /></td>
                    <td className="text-right tabular-nums text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
                      {row.final_score.toFixed(1)}
                    </td>
                    <td className="text-right tabular-nums whitespace-nowrap">
                      <span className="font-bold text-sm" style={{ color: VV_COLORS[row.exp_class] }}>
                        {row.exp_score.toFixed(2)}
                      </span>
                    </td>
                    <td>
                      {row.risk_flag === 'critical' && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={{ backgroundColor: 'rgba(124,58,237,0.1)', color: '#7c3aed' }}>
                          CRITICAL
                        </span>
                      )}
                      {row.risk_flag === 'high_expiry' && (
                        <span className="text-xs font-semibold px-1.5 py-0.5 rounded whitespace-nowrap"
                          style={{ backgroundColor: 'rgba(234,88,12,0.1)', color: '#ea580c' }}>
                          HIGH RISK
                        </span>
                      )}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      <span className="block truncate" style={{ maxWidth: 200 }} title={row.recommendation}>
                        {row.recommendation}
                      </span>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={14} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ยังไม่มีข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Score Bar ─────────────────────────────────────────────────────────────────
function ScoreBar({ score, color }: { score: number; color: string }) {
  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-xs font-bold w-4 tabular-nums" style={{ color }}>{score}</span>
      <div className="flex gap-0.5">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="w-2 h-3 rounded-sm"
            style={{ backgroundColor: i <= score ? color : 'var(--bg-alt)' }} />
        ))}
      </div>
    </div>
  );
}

// ── Slow Moving Tab ───────────────────────────────────────────────────────────
function SlowMovingTab() {
  const [status, setStatus]       = useState('');
  const [warehouse, setWhs]       = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();

  const { data, isLoading } = useSlowMoving({
    movementStatus: status    || undefined,
    warehouse:      warehouse || undefined,
    groupName:      groupCode ? ITEM_GROUPS[groupCode] : undefined,
  });

  const summary = useMemo(() => {
    const all = data ?? [];
    return {
      dead:    all.filter(r => r.movement_status === 'dead_stock').length,
      slow:    all.filter(r => r.movement_status === 'slow_moving').length,
      normal:  all.filter(r => r.movement_status === 'normal').length,
      deadVal: all.filter(r => r.movement_status === 'dead_stock').reduce((s, r) => s + Number(r.stock_value), 0),
      slowVal: all.filter(r => r.movement_status === 'slow_moving').reduce((s, r) => s + Number(r.stock_value), 0),
    };
  }, [data]);

  const handleExport = () => {
    exportToExcel((data ?? []).map(r => ({
      'Item Code':      r.item_code,
      'Item Name':      r.itemname,
      'Group':          r.group_name,
      'Warehouse':      r.warehouse,
      'Current Stock':  Number(r.current_stock),
      'UOM':            r.uom,
      'Stock Value':    Number(r.stock_value),
      'Last Out Date':  r.last_out_date ?? 'Never',
      'Days Since Out': r.days_since_last_out ?? 'N/A',
      'Status':         r.movement_status,
    })), 'Slow_Moving_Items');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card border-l-4" style={{ borderLeftColor: SLOW_COLORS.dead_stock }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Dead Stock (≥180d / never)</p>
          <p className="text-2xl font-bold" style={{ color: SLOW_COLORS.dead_stock }}>{summary.dead}</p>
          <p className="text-sm tabular-nums" style={{ color: 'var(--text-muted)' }}>฿{formatCompact(summary.deadVal)}</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: SLOW_COLORS.slow_moving }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Slow Moving (90–179 days)</p>
          <p className="text-2xl font-bold" style={{ color: SLOW_COLORS.slow_moving }}>{summary.slow}</p>
          <p className="text-sm tabular-nums" style={{ color: 'var(--text-muted)' }}>฿{formatCompact(summary.slowVal)}</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: SLOW_COLORS.normal }}>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Active (&lt;90 days)</p>
          <p className="text-2xl font-bold" style={{ color: SLOW_COLORS.normal }}>{summary.normal}</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>At-Risk Inventory Value</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--text)' }}>
            ฿{formatCompact(summary.deadVal + summary.slowVal)}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Dead + Slow stock combined</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select className="select" value={status} onChange={e => setStatus(e.target.value)}>
            <option value="">All Statuses</option>
            <option value="dead_stock">Dead Stock</option>
            <option value="slow_moving">Slow Moving</option>
            <option value="normal">Normal</option>
          </select>
          <select className="select" value={warehouse} onChange={e => setWhs(e.target.value)}>
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => <option key={w.code} value={w.code}>{w.code} - {w.name}</option>)}
          </select>
          <select className="select" value={groupCode ?? ''} onChange={e => setGroupCode(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="card p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Group</th>
                  <th>Warehouse</th>
                  <th className="text-right">Stock Qty</th>
                  <th className="text-right">Stock Value</th>
                  <th>Last Out</th>
                  <th className="text-right">Days Since Out</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((row, i) => (
                  <tr key={`${row.item_code}-${row.warehouse}-${i}`}>
                    <td>
                      <span className="badge text-white text-xs"
                        style={{ backgroundColor: SLOW_COLORS[row.movement_status] }}>
                        {row.movement_status === 'dead_stock' ? 'Dead' :
                         row.movement_status === 'slow_moving' ? 'Slow' : 'Active'}
                      </span>
                    </td>
                    <td className="font-mono text-sm font-medium" style={{ color: 'var(--color-primary-light)' }}>
                      {row.item_code}
                    </td>
                    <td className="text-sm" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.itemname}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {(row.group_name ?? '').split('-')[0]}
                    </td>
                    <td>{row.warehouse}</td>
                    <td className="text-right tabular-nums">{formatNumber(Number(row.current_stock), 2)} {row.uom}</td>
                    <td className="text-right tabular-nums text-sm">฿{formatCompact(Number(row.stock_value))}</td>
                    <td className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      {row.last_out_date ? formatDate(row.last_out_date) : <span className="text-red-600">Never</span>}
                    </td>
                    <td className="text-right tabular-nums font-semibold"
                      style={{ color: row.movement_status === 'dead_stock' ? SLOW_COLORS.dead_stock : 'var(--text)' }}>
                      {row.days_since_last_out !== null ? `${row.days_since_last_out}d` : '∞'}
                    </td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={9} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ยังไม่มีข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Inventory Turnover Tab ────────────────────────────────────────────────────
function TurnoverTab() {
  const [groupCode, setGroupCode] = useState<number | undefined>();

  const { data, isLoading } = useInventoryTurnover({
    groupName: groupCode ? ITEM_GROUPS[groupCode] : undefined,
  });

  const summary = useMemo(() => {
    const all = data ?? [];
    const withRatio = all.filter(r => r.turnover_ratio !== null);
    if (!withRatio.length) return { avg: 0, high: 0, low: 0, avgDoh: 0 };
    const ratios = withRatio.map(r => Number(r.turnover_ratio));
    const dohs   = withRatio.filter(r => r.days_on_hand !== null).map(r => Number(r.days_on_hand));
    return {
      avg:    ratios.reduce((s, v) => s + v, 0) / ratios.length,
      high:   Math.max(...ratios),
      low:    Math.min(...ratios),
      avgDoh: dohs.length ? dohs.reduce((s, v) => s + v, 0) / dohs.length : 0,
    };
  }, [data]);

  const chartData = useMemo(() =>
    (data ?? []).slice(0, 20).map(r => ({
      item_code:      r.item_code,
      turnover_ratio: Number(r.turnover_ratio ?? 0),
      days_on_hand:   Number(r.days_on_hand   ?? 0),
    })),
    [data],
  );

  const handleExport = () => {
    exportToExcel((data ?? []).map(r => ({
      'Item Code':      r.item_code,
      'Item Name':      r.itemname,
      'Group':          r.group_name,
      'Annual COGS':    Number(r.annual_cogs),
      'Annual Out Qty': Number(r.annual_out_qty),
      'Stock Value':    Number(r.current_stock_value),
      'Turnover Ratio': r.turnover_ratio !== null ? Number(r.turnover_ratio) : 'N/A',
      'Days On Hand':   r.days_on_hand   !== null ? Number(r.days_on_hand)   : 'N/A',
      'Active Months':  r.active_months,
    })), 'Inventory_Turnover');
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg Turnover Ratio</p>
          <p className="text-2xl font-bold tabular-nums" style={{ color: 'var(--color-primary)' }}>
            {summary.avg.toFixed(1)}×
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Annual COGS / Stock Value</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Highest Turnover</p>
          <p className="text-2xl font-bold tabular-nums text-green-600">{summary.high.toFixed(1)}×</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Best performing item</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Lowest Turnover</p>
          <p className="text-2xl font-bold tabular-nums text-red-600">{summary.low.toFixed(1)}×</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Needs attention</p>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <select className="select" value={groupCode ?? ''} onChange={e => setGroupCode(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
          <button onClick={handleExport} className="btn btn-secondary ml-auto">
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-3" style={{ color: 'var(--text)' }}>Top 20 Items by Turnover Ratio</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 10, right: 40 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
              <XAxis type="number" stroke="var(--text-muted)" fontSize={11}
                label={{ value: 'Turnover Ratio (×)', position: 'insideBottomRight', offset: -10, fontSize: 11 }} />
              <YAxis type="category" dataKey="item_code" width={90} stroke="var(--text-muted)" fontSize={10} />
              <Tooltip {...tooltipStyle}
                formatter={(val: unknown, name?: string) =>
                  name === 'turnover_ratio' ? [`${Number(val).toFixed(1)}×`, 'Turnover'] : [`${Number(val).toFixed(0)} days`, 'Days on Hand']}
              />
              <Bar dataKey="turnover_ratio" name="turnover_ratio" radius={[0, 4, 4, 0]} barSize={14}>
                {chartData.map((d, i) => (
                  <Cell key={i} fill={d.turnover_ratio >= summary.avg ? TURNOVER_HIGH : TURNOVER_LOW} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="table-container" style={{ border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Item Code</th>
                  <th>Item Name</th>
                  <th>Group</th>
                  <th className="text-right">Annual COGS</th>
                  <th className="text-right">Stock Value</th>
                  <th className="text-right">Turnover</th>
                  <th className="text-right">Days on Hand</th>
                  <th className="text-right">Active Months</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((row) => (
                  <tr key={row.item_code}>
                    <td className="font-mono text-sm font-medium" style={{ color: 'var(--color-primary-light)' }}>
                      {row.item_code}
                    </td>
                    <td className="text-sm" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {row.itemname}
                    </td>
                    <td className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      {(row.group_name ?? '').split('-')[0]}
                    </td>
                    <td className="text-right tabular-nums text-sm">฿{formatCompact(Number(row.annual_cogs))}</td>
                    <td className="text-right tabular-nums text-sm">฿{formatCompact(Number(row.current_stock_value))}</td>
                    <td className="text-right tabular-nums font-bold">
                      {row.turnover_ratio !== null ? (
                        <span style={{ color: Number(row.turnover_ratio) >= summary.avg ? '#2E7D32' : '#C62828' }}>
                          {Number(row.turnover_ratio).toFixed(1)}×
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-right tabular-nums">
                      {row.days_on_hand !== null ? (
                        <span style={{ color: Number(row.days_on_hand) > summary.avgDoh * 1.5 ? '#C62828' : 'var(--text)' }}>
                          {Number(row.days_on_hand)}d
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-right tabular-nums text-sm" style={{ color: 'var(--text-muted)' }}>
                      {row.active_months}mo
                    </td>
                  </tr>
                ))}
                {(data ?? []).length === 0 && (
                  <tr><td colSpan={8} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ยังไม่มีข้อมูล</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


// ── FEFO Pick List Tab ─────────────────────────────────────────────────────
function FEFOPickListTab() {
  const { data: snap } = useLatestLotSnapshot();
  const [warehouse, setWarehouse] = useState('');
  const [groupCode, setGroupCode] = useState<number | undefined>();
  const [search, setSearch]       = useState('');
  const [fsCategory, setFsCategory] = useState('');
  const [lotCountFilter, setLotCountFilter] = useState<'all' | '1' | '2-3' | '4-10' | '10+'>('all');
  // Bucket filter — clicking an Aging Matrix row sets one of these keys.
  // null = no bucket filter (matrix shows totals; table shows all rows).
  type BucketKey = 'expired' | '0-30' | '31-60' | '61-90' | '91-180' | '180+' | 'unknown';
  const [bucketFilter, setBucketFilter] = useState<BucketKey | null>(null);
  // Separate "Days Left ≤ N" quick-chip filter (cumulative cap). Stacks with bucketFilter.
  const [daysMax, setDaysMax]     = useState<number | undefined>();
  const [minValue, setMinValue]   = useState<string>('');
  const [hasExpired, setHasExpired] = useState<boolean>(false);
  const [sortBy, setSortBy]       = useState<'fefo' | 'lots' | 'value'>('fefo');

  const { data: lotResult, isLoading } = useLotDetail({
    snapshotDate: snap,
    warehouse: warehouse || undefined,
    groupCode,
    pageSize: 5000,
    page: 0,
  });
  const lots = lotResult?.data ?? [];

  // Group lots by item × warehouse, then sort lots within each group by expire_date asc (FEFO)
  const groupedAll = useMemo(() => {
    type Group = {
      item_code: string; itemname: string; group_name: string; uom: string;
      warehouse: string; whs_name: string; fs_category: string | null;
      lots: typeof lots; total_qty: number; total_value: number;
      earliest_days: number | null; has_expired: boolean;
    };
    const map = new Map<string, Group>();
    for (const l of lots) {
      if (Number(l.qty) <= 0) continue;
      const key = `${l.item_code}|${l.warehouse}`;
      const entry = map.get(key);
      if (entry) {
        entry.lots.push(l);
        entry.total_qty   += Number(l.qty);
        entry.total_value += Number(l.amount);
      } else {
        map.set(key, {
          item_code:   l.item_code, itemname: l.itemname, group_name: l.group_name, uom: l.uom,
          warehouse:   l.warehouse, whs_name: l.whs_name,
          fs_category: l.fs_category ?? null,
          lots:        [l],
          total_qty:   Number(l.qty), total_value: Number(l.amount),
          earliest_days: null, has_expired: false,
        });
      }
    }
    // Sort lots within each group + compute group-level stats
    for (const g of map.values()) {
      g.lots.sort((a, b) => {
        if (!a.expire_date && !b.expire_date) return 0;
        if (!a.expire_date) return 1;
        if (!b.expire_date) return -1;
        return new Date(a.expire_date).getTime() - new Date(b.expire_date).getTime();
      });
      g.earliest_days = g.lots[0]?.days_remaining ?? null;
      g.has_expired   = g.lots.some(l => l.days_remaining != null && l.days_remaining < 0);
    }
    return Array.from(map.values());
  }, [lots]);

  // Available FS categories in the dataset
  const availableFsCategories = useMemo(() => {
    const s = new Set<string>();
    for (const g of groupedAll) if (g.fs_category) s.add(g.fs_category);
    return Array.from(s).sort();
  }, [groupedAll]);

  const minValueNum = useMemo(() => {
    const n = parseFloat(minValue);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [minValue]);

  // Map bucket key → predicate for a single lot's days_remaining.
  // Used by both bucket filter and Aging Matrix so the two stay in sync.
  const matchBucket = (d: number | null, key: BucketKey): boolean => {
    if (key === 'unknown') return d == null;
    if (d == null) return false;
    switch (key) {
      case 'expired':  return d < 0;
      case '0-30':     return d >= 0   && d <= 30;
      case '31-60':    return d >= 31  && d <= 60;
      case '61-90':    return d >= 61  && d <= 90;
      case '91-180':   return d >= 91  && d <= 180;
      case '180+':     return d > 180;
    }
  };

  // Apply filters + sort
  const grouped = useMemo(() => {
    const lotCountMatch = (n: number) => {
      switch (lotCountFilter) {
        case '1':    return n === 1;
        case '2-3':  return n >= 2 && n <= 3;
        case '4-10': return n >= 4 && n <= 10;
        case '10+':  return n > 10;
        default:     return true;
      }
    };
    const filtered = groupedAll.filter(g => {
      if (!lotCountMatch(g.lots.length)) return false;
      if (fsCategory && g.fs_category !== fsCategory) return false;
      if (hasExpired && !g.has_expired) return false;
      // Bucket filter — keep groups that have at least one lot in the selected bucket.
      if (bucketFilter !== null) {
        const hit = g.lots.some(l => matchBucket(l.days_remaining, bucketFilter));
        if (!hit) return false;
      }
      // Days Left ≤ N quick-chip filter (cumulative cap by earliest expiry).
      if (daysMax !== undefined) {
        if (g.earliest_days == null) return false;
        if (g.earliest_days > daysMax) return false;
      }
      if (minValueNum != null && g.total_value < minValueNum) return false;
      if (search) {
        const q = search.toLowerCase();
        const hit =
          g.item_code.toLowerCase().includes(q) ||
          g.itemname.toLowerCase().includes(q) ||
          (g.fs_category ?? '').toLowerCase().includes(q) ||
          g.lots.some(l => (l.batch_num ?? '').toLowerCase().includes(q));
        if (!hit) return false;
      }
      return true;
    });
    if (sortBy === 'lots') {
      filtered.sort((a, b) => b.lots.length - a.lots.length);
    } else if (sortBy === 'value') {
      filtered.sort((a, b) => b.total_value - a.total_value);
    } else {
      // FEFO: earliest-expiring lot first, NULLs last
      filtered.sort((a, b) => {
        if (a.earliest_days == null && b.earliest_days == null) return 0;
        if (a.earliest_days == null) return 1;
        if (b.earliest_days == null) return -1;
        return a.earliest_days - b.earliest_days;
      });
    }
    return filtered;
  }, [groupedAll, lotCountFilter, fsCategory, hasExpired, bucketFilter, daysMax, minValueNum, search, sortBy]);

  // ── Aging Matrix: bucket × stats (Items / Lots / Value) ──
  // IMPORTANT: derive from groupedAll so the matrix stays stable as the user
  // clicks rows. Otherwise the matrix would collapse to the filtered subset
  // and the user would see other buckets "disappear" — confusing.
  const agingMatrix = useMemo(() => {
    type Bucket = 'expired' | '0-30' | '31-60' | '61-90' | '91-180' | '180+' | 'unknown';
    const order: Bucket[] = ['expired', '0-30', '31-60', '61-90', '91-180', '180+', 'unknown'];
    const labels: Record<Bucket, string> = {
      expired: 'หมดอายุแล้ว', '0-30': '≤ 30 วัน', '31-60': '31–60 วัน',
      '61-90': '61–90 วัน', '91-180': '91–180 วัน', '180+': '> 180 วัน', unknown: 'ไม่ระบุ',
    };
    const colors: Record<Bucket, string> = {
      expired: '#7f1d1d', '0-30': '#dc2626', '31-60': '#ea580c',
      '61-90': '#d97706', '91-180': '#65a30d', '180+': '#16a34a', unknown: '#94a3b8',
    };
    const stats: Record<Bucket, { items: Set<string>; lots: number; value: number; qty: number }> = Object.fromEntries(
      order.map(b => [b, { items: new Set<string>(), lots: 0, value: 0, qty: 0 }])
    ) as any;

    for (const g of groupedAll) {
      for (const l of g.lots) {
        const d = l.days_remaining;
        const b: Bucket =
          d == null     ? 'unknown' :
          d < 0         ? 'expired' :
          d <= 30       ? '0-30'    :
          d <= 60       ? '31-60'   :
          d <= 90       ? '61-90'   :
          d <= 180      ? '91-180'  : '180+';
        stats[b].items.add(g.item_code);
        stats[b].lots += 1;
        stats[b].value += Number(l.amount);
        stats[b].qty += Number(l.qty);
      }
    }
    return order.map(b => ({
      key:    b,
      label:  labels[b],
      color:  colors[b],
      items:  stats[b].items.size,
      lots:   stats[b].lots,
      value:  stats[b].value,
      qty:    stats[b].qty,
    }));
  }, [groupedAll]);

  // Matrix totals (stable — for share %)
  const matrixTotalValue = useMemo(
    () => agingMatrix.reduce((s, r) => s + r.value, 0),
    [agingMatrix],
  );

  // ── KPI Summary ──
  const kpi = useMemo(() => {
    const totalItems = grouped.length;
    const totalLots = grouped.reduce((s, g) => s + g.lots.length, 0);
    const totalValue = grouped.reduce((s, g) => s + g.total_value, 0);
    let urgentLots = 0, urgentValue = 0, expiredLots = 0, expiredValue = 0;
    let multiLotItems = 0;
    for (const g of grouped) {
      if (g.lots.length > 1) multiLotItems++;
      for (const l of g.lots) {
        const d = l.days_remaining;
        if (d == null) continue;
        if (d < 0) { expiredLots++; expiredValue += Number(l.amount); }
        else if (d <= 30) { urgentLots++; urgentValue += Number(l.amount); }
      }
    }
    return { totalItems, totalLots, totalValue, urgentLots, urgentValue, expiredLots, expiredValue, multiLotItems };
  }, [grouped]);

  const handleExport = () => {
    const rows: any[] = [];
    for (const g of grouped) {
      g.lots.forEach((l, idx) => rows.push({
        'Pick #':       idx + 1,
        'Item Code':    g.item_code,
        'Item Name':    g.itemname,
        'Group':        g.group_name,
        'FS Category':  g.fs_category ?? '',
        'Warehouse':    g.warehouse,
        'Batch / Lot':  l.batch_num,
        'Qty':          Number(l.qty),
        'UOM':          g.uom,
        'Exp Date':     l.expire_date,
        'Days Left':    l.days_remaining,
        'Unit Cost':    Number(l.unit_cost),
        'Value':        Number(l.amount),
        'Lots in Group':g.lots.length,
      }));
    }
    exportToExcel(rows, 'FEFO_Pick_List');
  };

  const resetFilters = () => {
    setWarehouse(''); setGroupCode(undefined); setSearch(''); setFsCategory('');
    setLotCountFilter('all'); setBucketFilter(null); setDaysMax(undefined);
    setMinValue(''); setHasExpired(false); setSortBy('fefo');
  };

  const activeFilterCount = [
    warehouse, groupCode, search, fsCategory,
    lotCountFilter !== 'all' ? '1' : '',
    bucketFilter !== null ? '1' : '',
    daysMax !== undefined ? '1' : '',
    minValueNum != null ? '1' : '',
    hasExpired ? '1' : '',
    sortBy !== 'fefo' ? '1' : '',
  ].filter(Boolean).length;

  if (!snap) {
    return (
      <div className="card text-center py-12" style={{ color: 'var(--text-muted)' }}>
        <Layers size={32} className="mx-auto mb-3 opacity-40" />
        <p>ยังไม่มีข้อมูล Lot — Import sheet "Lot Inventory" ก่อนที่ Data Import</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Items</p>
          <p className="text-xl font-bold tabular-nums">{formatNumber(kpi.totalItems)}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{kpi.multiLotItems} ที่มีหลาย lot</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Lots</p>
          <p className="text-xl font-bold tabular-nums">{formatNumber(kpi.totalLots)}</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Value</p>
          <p className="text-xl font-bold tabular-nums">฿{formatCompact(kpi.totalValue)}</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: '#7f1d1d' }}>
          <p className="text-xs" style={{ color: '#7f1d1d' }}>หมดอายุแล้ว</p>
          <p className="text-xl font-bold tabular-nums" style={{ color: '#7f1d1d' }}>{formatNumber(kpi.expiredLots)}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>มูลค่า ฿{formatCompact(kpi.expiredValue)}</p>
        </div>
        <div className="card border-l-4" style={{ borderLeftColor: '#dc2626' }}>
          <p className="text-xs" style={{ color: '#dc2626' }}>≤ 30 วัน</p>
          <p className="text-xl font-bold tabular-nums" style={{ color: '#dc2626' }}>{formatNumber(kpi.urgentLots)}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>มูลค่า ฿{formatCompact(kpi.urgentValue)}</p>
        </div>
        <div className="card">
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Snapshot</p>
          <p className="text-sm font-semibold mt-1">{formatDate(snap)}</p>
          <p className="text-[10px]" style={{ color: 'var(--text-muted)' }}>วัน as-of</p>
        </div>
      </div>

      {/* ── Aging Matrix ── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
          <Layers size={15} style={{ color: 'var(--text-muted)' }} />
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Aging Matrix</h4>
          <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>คลิกแถวเพื่อกรอง <strong>เฉพาะช่วงนั้น</strong> — คลิกซ้ำเพื่อยกเลิก</span>
          {bucketFilter !== null && (
            <button
              onClick={() => setBucketFilter(null)}
              className="ml-auto text-xs px-2.5 py-1 rounded-full border hover:bg-[var(--bg-card)]"
              style={{ borderColor: 'var(--border)', color: 'var(--text)' }}
            >
              ล้างฟิลเตอร์ช่วง
            </button>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase">ช่วงวันหมดอายุ</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Items</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Lots</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Total Value</th>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Share</th>
            </tr>
          </thead>
          <tbody>
            {agingMatrix.map(row => {
              const totalValue = matrixTotalValue || 1;
              const share = (row.value / totalValue) * 100;
              const isActive = bucketFilter === row.key;
              const isDimmed = bucketFilter !== null && !isActive;
              return (
                <tr
                  key={row.key}
                  onClick={() => setBucketFilter(prev => prev === row.key ? null : (row.key as BucketKey))}
                  className="border-t cursor-pointer transition-colors"
                  style={{
                    borderColor: 'var(--border)',
                    opacity: row.items === 0 ? 0.45 : (isDimmed ? 0.55 : 1),
                    backgroundColor: isActive ? 'var(--bg-alt)' : undefined,
                    borderLeft: isActive ? `3px solid ${row.color}` : '3px solid transparent',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'var(--bg-alt)'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = ''; }}
                >
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: row.color }} />
                      <span className="text-xs font-medium" style={{ color: 'var(--text)' }}>{row.label}</span>
                      {isActive && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ backgroundColor: row.color, color: 'white' }}>
                          กรองอยู่
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{formatNumber(row.items)}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{formatNumber(row.lots)}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums font-semibold">฿{formatCompact(row.value)}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-alt)' }}>
                        <div className="h-full" style={{ width: `${Math.max(2, share)}%`, backgroundColor: row.color }} />
                      </div>
                      <span className="text-[10px] tabular-nums w-10 text-right" style={{ color: 'var(--text-muted)' }}>
                        {share.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Filter card: search + dropdowns + chips ── */}
      <div className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>FEFO — First Expired, First Out</span>
          <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
            snapshot {formatDate(snap)}
          </span>
          <div className="flex items-center gap-2 ml-auto">
            {activeFilterCount > 0 && (
              <button
                onClick={resetFilters}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border hover:bg-[var(--bg-alt)]"
                style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
              >
                <X size={12} /> Reset ({activeFilterCount})
              </button>
            )}
            <button onClick={handleExport} className="btn btn-secondary" disabled={grouped.length === 0}>
              <Download size={16} /> Export ({grouped.length})
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="ค้นหา รหัส / ชื่อ / batch / FS category..."
              className="input pl-9 w-full"
            />
          </div>
          <select className="select" value={warehouse} onChange={e => setWarehouse(e.target.value)}>
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => <option key={w.code} value={w.code}>{w.code}</option>)}
          </select>
          <select className="select" value={groupCode ?? ''} onChange={e => setGroupCode(e.target.value ? Number(e.target.value) : undefined)}>
            <option value="">All Groups</option>
            {Object.entries(ITEM_GROUPS).map(([code, name]) => <option key={code} value={code}>{name}</option>)}
          </select>
          {availableFsCategories.length > 0 && (
            <select className="select" value={fsCategory} onChange={e => setFsCategory(e.target.value)}>
              <option value="">All FS Categories</option>
              {availableFsCategories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
          <select className="select" value={sortBy} onChange={e => setSortBy(e.target.value as any)} title="Sort by">
            <option value="fefo">เรียง: FEFO (ใกล้หมดอายุก่อน)</option>
            <option value="lots">เรียง: มี lot มากที่สุดก่อน</option>
            <option value="value">เรียง: มูลค่าสูงสุดก่อน</option>
          </select>
          <label className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg border cursor-pointer"
            style={{ borderColor: 'var(--border)', color: 'var(--text)',
              backgroundColor: hasExpired ? 'rgba(220,38,38,0.08)' : 'transparent' }}>
            <input type="checkbox" checked={hasExpired} onChange={e => setHasExpired(e.target.checked)} />
            มี lot หมดอายุแล้ว
          </label>
          <div className="flex items-center gap-1.5">
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>Min ฿:</span>
            <input
              type="number"
              min="0"
              step="1000"
              value={minValue}
              onChange={e => setMinValue(e.target.value)}
              placeholder="0"
              className="input w-24 text-right text-xs"
            />
          </div>
        </div>

        {/* Lot-count + Days-left chips */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>จำนวน Lot:</span>
            {([
              { label: 'ทั้งหมด', value: 'all'  as const },
              { label: '1 lot',  value: '1'    as const },
              { label: '2–3',    value: '2-3'  as const },
              { label: '4–10',   value: '4-10' as const },
              { label: '> 10',   value: '10+'  as const },
            ]).map(opt => (
              <button
                key={opt.value}
                onClick={() => setLotCountFilter(opt.value)}
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                style={lotCountFilter === opt.value
                  ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
                  : { borderColor: 'var(--border)', color: 'var(--text-muted)' }
                }
              >
                {opt.label}
              </button>
            ))}
          </div>
          <span className="opacity-30">·</span>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Days Left ≤</span>
            {([
              { label: 'ทั้งหมด', value: undefined as number | undefined },
              { label: '7 วัน',   value: 7 },
              { label: '30',     value: 30 },
              { label: '60',     value: 60 },
              { label: '90',     value: 90 },
              { label: '180',    value: 180 },
            ]).map(({ label, value }) => (
              <button
                key={String(value ?? 'all')}
                onClick={() => setDaysMax(value)}
                className="px-2.5 py-1 rounded-full text-xs font-medium border transition-colors"
                style={daysMax === value
                  ? { backgroundColor: 'var(--color-primary)', borderColor: 'var(--color-primary)', color: '#fff' }
                  : { borderColor: 'var(--border)', color: 'var(--text-muted)' }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="card text-center py-12" style={{ color: 'var(--text-muted)' }}>กำลังโหลด...</div>
      ) : grouped.length === 0 ? (
        <div className="card text-center py-12" style={{ color: 'var(--text-muted)' }}>ไม่พบข้อมูล lot</div>
      ) : (
        <div className="space-y-3">
          {grouped.map(g => (
            <div key={`${g.item_code}|${g.warehouse}`} className="card p-0 overflow-hidden">
              <div className="px-4 py-3 flex flex-wrap items-center gap-3 border-b" style={{ backgroundColor: 'var(--bg-alt)', borderColor: 'var(--border)' }}>
                <span className="font-mono text-sm font-medium" style={{ color: 'var(--color-primary-light)' }}>{g.item_code}</span>
                <span className="text-sm" style={{ color: 'var(--text)' }}>{g.itemname}</span>
                <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}>
                  {g.warehouse} · {g.whs_name}
                </span>
                <span className="ml-auto text-xs" style={{ color: 'var(--text-muted)' }}>
                  {g.lots.length} lots · {formatNumber(g.total_qty, 2)} {g.uom} · ฿{formatCompact(g.total_value)}
                </span>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--text-muted)' }}>
                    <th className="px-4 py-2 text-center text-xs font-semibold" style={{ width: 60 }}>Pick #</th>
                    <th className="px-4 py-2 text-left  text-xs font-semibold">Batch / Lot</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold">Qty</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold">Value</th>
                    <th className="px-4 py-2 text-left  text-xs font-semibold">Exp Date</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold">Days Left</th>
                  </tr>
                </thead>
                <tbody>
                  {g.lots.map((l, idx) => {
                    const dr = l.days_remaining;
                    const color =
                      dr == null     ? '#94a3b8' :
                      dr < 0         ? '#7f1d1d' :
                      dr <= 30       ? '#dc2626' :
                      dr <= 60       ? '#ea580c' :
                      dr <= 90       ? '#d97706' :
                      dr <= 180      ? '#65a30d' : '#16a34a';
                    return (
                      <tr key={l.id} className="border-t" style={{ borderColor: 'var(--border)' }}>
                        <td className="px-4 py-2 text-center text-xs font-bold" style={{ color: idx === 0 ? '#dc2626' : 'var(--text-muted)' }}>
                          {idx + 1}{idx === 0 ? ' ↓' : ''}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>{l.batch_num}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-xs">{formatNumber(Number(l.qty), 2)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-xs">฿{formatNumber(Number(l.amount), 2)}</td>
                        <td className="px-4 py-2 text-xs">{l.expire_date ? formatDate(l.expire_date) : '—'}</td>
                        <td className="px-4 py-2 text-right">
                          <span className="px-2 py-0.5 rounded-full text-xs font-semibold text-white" style={{ backgroundColor: color }}>
                            {dr == null ? '—' : dr < 0 ? `เกิน ${-dr}d` : `${dr}d`}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Trends & Compare Tab (MoM / QoQ / YoY analysis) ──────────────────────────
//
// Three layers of insight:
//   1) Headline KPI cards comparing the selected month vs a baseline period
//      (prior month / prior quarter / same month last year).
//   2) 24-month trend chart: In, Out, and Net stacked side-by-side so seasonal
//      patterns are visually obvious.
//   3) Group-level comparison table — top movers and stagnants per group with
//      delta % vs the baseline.

type ComparePeriod = 'mom' | 'qoq' | 'yoy';

function TrendsTab() {
  const { data: monthlyTotal = [], isLoading: loadingT } = useMonthlyTotal(36);
  const { data: monthlySummary = [], isLoading: loadingS } = useMonthlySummary(36);
  const isLoading = loadingT || loadingS;

  // Available months (descending) for the selector
  const allMonths = useMemo(
    () => monthlyTotal.map(r => r.month).sort((a, b) => b.localeCompare(a)),
    [monthlyTotal],
  );
  const [selectedMonth, setSelectedMonth] = useState<string>('');
  const [comparePeriod, setComparePeriod] = useState<ComparePeriod>('yoy');

  // Default selection to the latest month available once data loads
  useEffect(() => {
    if (!selectedMonth && allMonths.length > 0) setSelectedMonth(allMonths[0]);
  }, [allMonths, selectedMonth]);

  // Compute the baseline month string given the selected month + period
  const baselineMonth = useMemo(() => {
    if (!selectedMonth) return '';
    const d = new Date(selectedMonth);
    if (comparePeriod === 'mom') d.setMonth(d.getMonth() - 1);
    else if (comparePeriod === 'qoq') d.setMonth(d.getMonth() - 3);
    else d.setFullYear(d.getFullYear() - 1);
    return d.toISOString().slice(0, 10);
  }, [selectedMonth, comparePeriod]);

  const currentRow  = monthlyTotal.find(r => r.month === selectedMonth);
  const baselineRow = monthlyTotal.find(r => r.month === baselineMonth);

  // Group-level current vs baseline
  const groupCompare = useMemo(() => {
    const cur = new Map<string, MonthlySummaryRow>();
    const base = new Map<string, MonthlySummaryRow>();
    for (const r of monthlySummary) {
      if (r.month === selectedMonth) cur.set(r.group_name, r);
      if (r.month === baselineMonth) base.set(r.group_name, r);
    }
    const groups = new Set([...cur.keys(), ...base.keys()]);
    return Array.from(groups).map(name => {
      const c = cur.get(name);
      const b = base.get(name);
      const cIn  = Number(c?.in_value  ?? 0);
      const cOut = Number(c?.out_value ?? 0);
      const bIn  = Number(b?.in_value  ?? 0);
      const bOut = Number(b?.out_value ?? 0);
      return {
        group_name: name,
        cur_in: cIn, cur_out: cOut, cur_net: cIn - cOut, cur_tx: Number(c?.tx_count ?? 0),
        bas_in: bIn, bas_out: bOut, bas_net: bIn - bOut, bas_tx: Number(b?.tx_count ?? 0),
        delta_out_pct: bOut === 0 ? null : ((cOut - bOut) / bOut) * 100,
        delta_in_pct:  bIn  === 0 ? null : ((cIn  - bIn)  / bIn) * 100,
        delta_tx_pct:  (b?.tx_count ?? 0) === 0 ? null
          : ((Number(c?.tx_count ?? 0) - Number(b?.tx_count ?? 0)) / Number(b?.tx_count ?? 1)) * 100,
      };
    }).sort((a, b) => b.cur_out - a.cur_out);
  }, [monthlySummary, selectedMonth, baselineMonth]);

  // Trailing 24-month trend for the chart, anchored to the selected month
  const trendData = useMemo(() => {
    if (!selectedMonth) return [];
    const sel = new Date(selectedMonth);
    const min = new Date(sel);
    min.setMonth(min.getMonth() - 23);
    return monthlyTotal
      .filter(r => r.month >= min.toISOString().slice(0, 10) && r.month <= selectedMonth)
      .map(r => ({
        month: r.month.slice(0, 7), // YYYY-MM
        in_value: Number(r.in_value) / 1e6,
        out_value: Number(r.out_value) / 1e6,
        net: (Number(r.in_value) - Number(r.out_value)) / 1e6,
      }));
  }, [monthlyTotal, selectedMonth]);

  // Year-over-year anchored at selected month — same month each of last 3 years
  const yoyTrail = useMemo(() => {
    if (!selectedMonth) return [];
    const sel = new Date(selectedMonth);
    const result: Array<{ year: number; in_value: number; out_value: number; net: number; tx_count: number }> = [];
    for (let y = 2; y >= 0; y--) {
      const target = new Date(sel);
      target.setFullYear(sel.getFullYear() - y);
      const key = target.toISOString().slice(0, 10);
      const r = monthlyTotal.find(x => x.month === key);
      result.push({
        year: target.getFullYear(),
        in_value:  Number(r?.in_value  ?? 0),
        out_value: Number(r?.out_value ?? 0),
        net:       Number(r?.in_value  ?? 0) - Number(r?.out_value ?? 0),
        tx_count:  Number(r?.tx_count  ?? 0),
      });
    }
    return result;
  }, [monthlyTotal, selectedMonth]);

  // Detect anomalies — months whose value > 1.5× the trailing 12-month mean
  const anomalies = useMemo(() => {
    if (trendData.length < 6) return [];
    const lastSix = trendData.slice(-6);
    const meanOut = lastSix.reduce((s, r) => s + r.out_value, 0) / lastSix.length;
    return lastSix.filter(r => Math.abs(r.out_value - meanOut) > meanOut * 0.5)
      .map(r => ({ month: r.month, out_value: r.out_value, deviation: ((r.out_value - meanOut) / meanOut) * 100 }));
  }, [trendData]);

  const handleExport = () => {
    if (!selectedMonth) return;
    const rows = groupCompare.map(g => ({
      'Group':                g.group_name,
      'Current Month':        selectedMonth,
      'Baseline Month':       baselineMonth,
      'Current In (฿)':       g.cur_in,
      'Baseline In (฿)':      g.bas_in,
      'In Delta %':           g.delta_in_pct?.toFixed(1) ?? 'N/A',
      'Current Out (฿)':      g.cur_out,
      'Baseline Out (฿)':     g.bas_out,
      'Out Delta %':          g.delta_out_pct?.toFixed(1) ?? 'N/A',
      'Current Net (฿)':      g.cur_net,
      'Baseline Net (฿)':     g.bas_net,
      'Current Tx Count':     g.cur_tx,
      'Baseline Tx Count':    g.bas_tx,
      'Tx Delta %':           g.delta_tx_pct?.toFixed(1) ?? 'N/A',
    }));
    exportToExcel(rows, `Trends_${comparePeriod.toUpperCase()}_${selectedMonth.slice(0,7)}`);
  };

  const periodLabel = comparePeriod === 'mom' ? 'Month-over-Month'
                    : comparePeriod === 'qoq' ? 'Quarter-over-Quarter'
                    : 'Year-over-Year';

  if (isLoading) {
    return <div className="card text-center py-20" style={{ color: 'var(--text-muted)' }}>กำลังโหลดข้อมูล trend...</div>;
  }
  if (monthlyTotal.length === 0) {
    return (
      <div className="card text-center py-20" style={{ color: 'var(--text-muted)' }}>
        <TrendingUp size={36} className="mx-auto mb-3 opacity-30" />
        <p>ยังไม่มีข้อมูล Transactions — Import sheet "Transactions" ก่อน</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Period selector ── */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-3">
          <Filter size={16} style={{ color: 'var(--text-muted)' }} />
          <span className="text-sm font-medium" style={{ color: 'var(--text)' }}>เปรียบเทียบช่วงเวลา</span>

          <select
            className="select"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            title="เลือกเดือนปัจจุบัน"
          >
            {allMonths.map(m => (
              <option key={m} value={m}>{m.slice(0, 7)}</option>
            ))}
          </select>

          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>vs</span>

          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {([
              { id: 'mom', label: 'MoM' },
              { id: 'qoq', label: 'QoQ' },
              { id: 'yoy', label: 'YoY' },
            ] as { id: ComparePeriod; label: string }[]).map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setComparePeriod(id)}
                className="px-3 py-1.5 text-xs font-medium transition-colors"
                style={comparePeriod === id
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                  : { color: 'var(--text-muted)' }}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-xs italic" style={{ color: 'var(--text-muted)' }}>
            {periodLabel} — เทียบ {selectedMonth.slice(0, 7)} กับ {baselineMonth.slice(0, 7)}
          </span>

          <button onClick={handleExport} className="btn btn-secondary ml-auto" disabled={!selectedMonth}>
            <Download size={16} /> Export
          </button>
        </div>
      </div>

      {/* ── KPI delta cards ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <DeltaCard
          label="Out Value (มูลค่าจ่ายออก)"
          current={Number(currentRow?.out_value ?? 0)}
          baseline={Number(baselineRow?.out_value ?? 0)}
          formatFn={v => `฿${formatCompact(v)}`}
          biggerIsBetter
        />
        <DeltaCard
          label="In Value (มูลค่ารับเข้า)"
          current={Number(currentRow?.in_value ?? 0)}
          baseline={Number(baselineRow?.in_value ?? 0)}
          formatFn={v => `฿${formatCompact(v)}`}
          biggerIsBetter
        />
        <DeltaCard
          label="Net (รับ − จ่าย)"
          current={Number(currentRow?.in_value ?? 0) - Number(currentRow?.out_value ?? 0)}
          baseline={Number(baselineRow?.in_value ?? 0) - Number(baselineRow?.out_value ?? 0)}
          formatFn={v => `฿${formatCompact(v)}`}
          biggerIsBetter={false} // closer to zero is healthier for inventory
        />
        <DeltaCard
          label="Transactions"
          current={Number(currentRow?.tx_count ?? 0)}
          baseline={Number(baselineRow?.tx_count ?? 0)}
          formatFn={v => formatNumber(v)}
          biggerIsBetter
        />
      </div>

      {/* ── 24-month trend chart ── */}
      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            แนวโน้ม 24 เดือนล่าสุด (มูลค่า ฿ ล้านบาท)
          </h4>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ดูแพทเทิร์นและฤดูกาล
          </span>
        </div>
        <div style={{ height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="month" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} unit="M" />
              <Tooltip
                {...tooltipStyle}
                formatter={(v) => `฿${(Number(v) ?? 0).toFixed(2)}M`}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="in_value"  name="In"  fill="#2E7D32" />
              <Bar dataKey="out_value" name="Out" fill="#C62828" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── 3-year YoY anchor table ── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
          <RefreshCw size={15} style={{ color: 'var(--text-muted)' }} />
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            Year-over-Year — เดือนเดียวกัน 3 ปีย้อนหลัง
          </h4>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ color: 'var(--text-muted)' }}>
              <th className="px-4 py-2 text-left text-xs font-semibold uppercase">เดือน</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">In</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Out</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Net</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Tx</th>
              <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Out YoY%</th>
            </tr>
          </thead>
          <tbody>
            {yoyTrail.map((r, idx) => {
              const prev = yoyTrail[idx - 1];
              const yoyPct = prev && prev.out_value > 0
                ? ((r.out_value - prev.out_value) / prev.out_value) * 100
                : null;
              return (
                <tr key={r.year} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-2 text-xs font-mono">
                    {selectedMonth ? `${selectedMonth.slice(5,7)}/${r.year}` : r.year}
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">฿{formatCompact(r.in_value)}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">฿{formatCompact(r.out_value)}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums font-semibold">฿{formatCompact(r.net)}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">{formatNumber(r.tx_count)}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">
                    {yoyPct == null
                      ? <span style={{ color: 'var(--text-muted)' }}>—</span>
                      : <DeltaPill pct={yoyPct} />
                    }
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Group-level comparison table ── */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
          <Layers size={15} style={{ color: 'var(--text-muted)' }} />
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
            เปรียบเทียบรายกลุ่ม ({periodLabel})
          </h4>
          <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
            เรียงตาม Out Value
          </span>
        </div>
        <div className="table-container" style={{ border: 'none' }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)' }}>
                <th className="px-4 py-2 text-left text-xs font-semibold uppercase">Group</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Out (Current)</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Out (Baseline)</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Out Δ%</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase">In (Current)</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase">In Δ%</th>
                <th className="px-4 py-2 text-right text-xs font-semibold uppercase">Tx Δ%</th>
              </tr>
            </thead>
            <tbody>
              {groupCompare.map(g => (
                <tr key={g.group_name} className="border-t" style={{ borderColor: 'var(--border)' }}>
                  <td className="px-4 py-2 text-xs font-medium">{g.group_name}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">฿{formatCompact(g.cur_out)}</td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
                    ฿{formatCompact(g.bas_out)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {g.delta_out_pct == null
                      ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                      : <DeltaPill pct={g.delta_out_pct} />
                    }
                  </td>
                  <td className="px-4 py-2 text-right text-xs tabular-nums">฿{formatCompact(g.cur_in)}</td>
                  <td className="px-4 py-2 text-right">
                    {g.delta_in_pct == null
                      ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                      : <DeltaPill pct={g.delta_in_pct} />
                    }
                  </td>
                  <td className="px-4 py-2 text-right">
                    {g.delta_tx_pct == null
                      ? <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>
                      : <DeltaPill pct={g.delta_tx_pct} />
                    }
                  </td>
                </tr>
              ))}
              {groupCompare.length === 0 && (
                <tr><td colSpan={7} className="text-center py-12 text-xs" style={{ color: 'var(--text-muted)' }}>
                  ไม่มีข้อมูลในเดือนที่เลือก
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Anomaly flag ── */}
      {anomalies.length > 0 && (
        <div className="card border-l-4" style={{ borderLeftColor: '#d97706', backgroundColor: 'rgba(251,191,36,0.06)' }}>
          <div className="flex items-start gap-3">
            <span className="text-lg">⚡</span>
            <div className="flex-1">
              <h4 className="text-sm font-semibold mb-1" style={{ color: '#92400e' }}>
                Anomaly Detected — เดือนที่ Out Value เบี่ยงเบนมาก
              </h4>
              <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                เดือนที่ Out Value เบี่ยงเบนเกิน ±50% จากค่าเฉลี่ย 6 เดือนล่าสุด — อาจมีเหตุการณ์พิเศษ (โปรโมชั่น, ปิดงวด, สินค้าผิดปกติ)
              </p>
              <div className="flex flex-wrap gap-2">
                {anomalies.map(a => (
                  <span key={a.month} className="text-xs px-2.5 py-1 rounded-full font-medium"
                    style={{ backgroundColor: 'rgba(217,119,6,0.12)', color: '#92400e' }}>
                    {a.month}: ฿{a.out_value.toFixed(1)}M ({a.deviation > 0 ? '+' : ''}{a.deviation.toFixed(0)}%)
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Reusable delta widgets ──────────────────────────────────────────────────

function DeltaCard({
  label, current, baseline, formatFn, biggerIsBetter,
}: {
  label: string;
  current: number;
  baseline: number;
  formatFn: (n: number) => string;
  biggerIsBetter: boolean;
}) {
  const delta = current - baseline;
  const pct = baseline === 0 ? null : (delta / Math.abs(baseline)) * 100;
  const positive = delta > 0;
  const flat = Math.abs(delta) < 0.0001;
  const goodDirection = biggerIsBetter ? positive : !positive;
  const color = flat ? '#6b7280' : goodDirection ? '#16a34a' : '#dc2626';
  const Arrow = flat ? Minus : positive ? TrendingUp : TrendingDown;

  return (
    <div className="card">
      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</p>
      <p className="text-xl font-bold tabular-nums mt-1" style={{ color: 'var(--text)' }}>
        {formatFn(current)}
      </p>
      <div className="flex items-center gap-1.5 text-xs mt-1.5" style={{ color }}>
        <Arrow size={14} />
        {pct == null ? (
          <span>—</span>
        ) : (
          <>
            <span className="font-semibold tabular-nums">{positive ? '+' : ''}{pct.toFixed(1)}%</span>
            <span style={{ color: 'var(--text-muted)' }}>vs {formatFn(baseline)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function DeltaPill({ pct }: { pct: number }) {
  const positive = pct > 0;
  const flat = Math.abs(pct) < 0.1;
  const bg = flat ? 'rgba(107,114,128,0.12)' : positive ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)';
  const fg = flat ? '#6b7280'              : positive ? '#16a34a'              : '#dc2626';
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold tabular-nums"
      style={{ backgroundColor: bg, color: fg }}>
      {flat ? '—' : positive ? '↑' : '↓'}
      {flat ? '' : `${positive ? '+' : ''}${pct.toFixed(1)}%`}
    </span>
  );
}


// ── Group Analysis Tab ──────────────────────────────────────────────────────
// Cross-cuts the VV Matrix scoring with movement data per item group.
// Answers exec questions like:
//   • Which groups have the most A-class items? (high-value & fresh)
//   • Which groups have the most C-class items? (clear-out targets)
//   • Which groups move the most volume / fastest?
//   • Which groups are big in $ but slow to move? (cash trapped)
//
// Data sources:
//   useLotDetail()        → lot-level data for VV scoring (REAL expiry per lot)
//   useMonthlySummary(n)  → group × month movement for the period selector
//   useSystemConfig()     → VV thresholds + alpha
//
// Why lot-level: validity is intrinsically per-lot. Two lots of the same SKU
// can have wildly different expire dates → different validity scores → different
// VV classes. Rolling up to SKU loses this information.
type GroupRow = {
  group_name: string;
  group_code: number | null;
  skus_total: number;       // unique item_code in group
  lots_total: number;       // total lots in group (the analytical unit)
  lots_a: number;
  lots_b: number;
  lots_c: number;
  stock_value: number;      // sum of lot amounts
  in_value: number;
  out_value: number;
  net_value: number;
  tx_count: number;
  turnover_ratio: number;   // out_value / stock_value (period-annualized)
  movement_share: number;   // group out / total out
};

function GroupAnalysisTab() {
  const [monthsBack, setMonthsBack] = useState<6 | 12 | 24>(12);
  const [sortKey, setSortKey]       = useState<'out' | 'in' | 'stock' | 'turnover' | 'a' | 'c'>('out');
  const [showOnly, setShowOnly]     = useState<'all' | 'has_a' | 'has_c'>('all');

  const { data: snap }                                       = useLatestLotSnapshot();
  const { data: lotResult, isLoading: lotLoading }           = useLotDetail({
    snapshotDate: snap, pageSize: 5000, page: 0,
  });
  const { data: monthlyData, isLoading: monthlyLoading }     = useMonthlySummary(monthsBack);
  const { data: sysConfig }                                  = useSystemConfig();
  const cfg = useMemo(() => parseVVConfig(sysConfig), [sysConfig]);
  const alpha = Math.round(cfg.vv_alpha) as 1 | 2 | 3;

  const isLoading = lotLoading || monthlyLoading;

  // Score EACH LOT individually — validity is per-lot by nature
  const vvLots = useMemo<VVItem[]>(() => {
    const lots = lotResult?.data ?? [];
    if (!lots.length) return [];
    const inputs: VVInput[] = lots
      .filter(l => Number(l.qty) > 0)
      .map(l => ({
        item_code:   l.item_code,
        itemname:    l.itemname,
        group_name:  l.group_name,
        uom:         l.uom,
        stock_value: Number(l.amount),
        expire_date: l.expire_date,            // ← REAL lot-level expire date
        batch_num:   l.batch_num,
        warehouse:   l.warehouse,
        whs_name:    l.whs_name,
        qty:         Number(l.qty),
        fs_category: l.fs_category ?? null,
      }));
    return computeVVScores(inputs, cfg, alpha);
  }, [lotResult, cfg, alpha]);

  // Build group rollup at LOT level
  const groupRows: GroupRow[] = useMemo(() => {
    type Acc = Omit<GroupRow, 'turnover_ratio' | 'movement_share' | 'skus_total'> & {
      _skus: Set<string>;
    };
    const map = new Map<string, Acc>();

    const ensure = (group_name: string, group_code: number | null): Acc => {
      const ex = map.get(group_name);
      if (ex) return ex;
      const fresh: Acc = {
        group_name, group_code,
        lots_total: 0, lots_a: 0, lots_b: 0, lots_c: 0,
        stock_value: 0, in_value: 0, out_value: 0, net_value: 0, tx_count: 0,
        _skus: new Set<string>(),
      };
      map.set(group_name, fresh);
      return fresh;
    };

    // 1. Count lots by VV class per group + collect unique SKUs + stock value
    for (const lot of vvLots) {
      const row = ensure(lot.group_name, null);
      row.lots_total += 1;
      row._skus.add(lot.item_code);
      if (lot.exp_class === 'A') row.lots_a += 1;
      else if (lot.exp_class === 'B') row.lots_b += 1;
      else row.lots_c += 1;
      row.stock_value += lot.stock_value;
    }

    // 2. Movement aggregation across selected period (still group-level — no lot in tx data)
    for (const m of (monthlyData ?? []) as MonthlySummaryRow[]) {
      const row = ensure(m.group_name, m.group_code);
      row.in_value  += Number(m.in_value);
      row.out_value += Number(m.out_value);
      row.net_value  = row.in_value - row.out_value;
      row.tx_count  += Number(m.tx_count);
      if (m.group_code != null && row.group_code == null) row.group_code = m.group_code;
    }

    // 3. Compute turnover (annualized) + movement share
    const totalOut = Array.from(map.values()).reduce((s, r) => s + r.out_value, 0) || 1;
    const yearsFactor = 12 / monthsBack;
    return Array.from(map.values()).map(r => ({
      group_name: r.group_name,
      group_code: r.group_code,
      skus_total: r._skus.size,
      lots_total: r.lots_total,
      lots_a: r.lots_a,
      lots_b: r.lots_b,
      lots_c: r.lots_c,
      stock_value: r.stock_value,
      in_value:   r.in_value,
      out_value:  r.out_value,
      net_value:  r.net_value,
      tx_count:   r.tx_count,
      turnover_ratio: r.stock_value > 0 ? (r.out_value * yearsFactor) / r.stock_value : 0,
      movement_share: (r.out_value / totalOut) * 100,
    }));
  }, [vvLots, monthlyData, monthsBack]);

  // Filter + sort
  const filtered = useMemo(() => {
    let rows = groupRows;
    if (showOnly === 'has_a')      rows = rows.filter(r => r.lots_a > 0);
    else if (showOnly === 'has_c') rows = rows.filter(r => r.lots_c > 0);
    return [...rows].sort((a, b) => {
      switch (sortKey) {
        case 'out':      return b.out_value - a.out_value;
        case 'in':       return b.in_value - a.in_value;
        case 'stock':    return b.stock_value - a.stock_value;
        case 'turnover': return b.turnover_ratio - a.turnover_ratio;
        case 'a':        return b.lots_a - a.lots_a;
        case 'c':        return b.lots_c - a.lots_c;
      }
    });
  }, [groupRows, sortKey, showOnly]);

  // Totals for the summary strip
  const totals = useMemo(() => {
    const t = filtered.reduce((acc, r) => ({
      groups: acc.groups + 1,
      skus_total: acc.skus_total + r.skus_total,
      lots_total: acc.lots_total + r.lots_total,
      lots_a: acc.lots_a + r.lots_a,
      lots_b: acc.lots_b + r.lots_b,
      lots_c: acc.lots_c + r.lots_c,
      stock_value: acc.stock_value + r.stock_value,
      out_value: acc.out_value + r.out_value,
      in_value: acc.in_value + r.in_value,
    }), { groups: 0, skus_total: 0, lots_total: 0, lots_a: 0, lots_b: 0, lots_c: 0, stock_value: 0, out_value: 0, in_value: 0 });

    const topMover  = [...filtered].sort((a, b) => b.out_value - a.out_value)[0];
    const topValue  = [...filtered].sort((a, b) => b.stock_value - a.stock_value)[0];
    const fastest   = [...filtered].filter(r => r.stock_value > 0).sort((a, b) => b.turnover_ratio - a.turnover_ratio)[0];
    const slowest   = [...filtered].filter(r => r.stock_value > 0 && r.out_value > 0).sort((a, b) => a.turnover_ratio - b.turnover_ratio)[0];
    const mostA     = [...filtered].sort((a, b) => b.lots_a - a.lots_a)[0];
    const mostC     = [...filtered].sort((a, b) => b.lots_c - a.lots_c)[0];

    return { ...t, topMover, topValue, fastest, slowest, mostA, mostC };
  }, [filtered]);

  // Chart data
  // Top-N by out_value for clarity (lots of small groups make a stacked chart unreadable)
  const TOP_N = 12;
  const chartData = useMemo(() => {
    const top = [...filtered].sort((a, b) => b.out_value - a.out_value).slice(0, TOP_N);
    // Shorten group names for x-axis (cut at '-' or 20 chars)
    return top.map(r => ({
      ...r,
      short_name: r.group_name.split('-')[0].trim().slice(0, 18),
    }));
  }, [filtered]);

  const handleExport = () => {
    exportToExcel(filtered.map(r => ({
      'Group':                   r.group_name,
      'Group Code':              r.group_code ?? '',
      'SKUs':                    r.skus_total,
      'Lots Total':              r.lots_total,
      'VV Class A (lots)':       r.lots_a,
      'VV Class B (lots)':       r.lots_b,
      'VV Class C (lots)':       r.lots_c,
      'Stock Value (฿)':         r.stock_value,
      [`In ${monthsBack}mo`]:    r.in_value,
      [`Out ${monthsBack}mo`]:   r.out_value,
      'Net':                     r.net_value,
      'Tx Count':                r.tx_count,
      'Turnover (Annual)':       Number(r.turnover_ratio.toFixed(2)),
      'Movement Share %':        Number(r.movement_share.toFixed(2)),
    })), `Group_Analysis_${monthsBack}mo`);
  };

  if (isLoading) {
    return (
      <div className="card text-center py-20" style={{ color: 'var(--text-muted)' }}>
        <div className="w-8 h-8 border-3 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        กำลังโหลด...
      </div>
    );
  }

  if (!snap) {
    return (
      <div className="card text-center py-12" style={{ color: 'var(--text-muted)' }}>
        <Layers size={32} className="mx-auto mb-3 opacity-40" />
        <p>ยังไม่มีข้อมูล Lot — Import sheet "Lot Inventory" ก่อนที่ Data Import</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="card">
        <div className="flex flex-wrap items-center gap-4">
          <Filter size={18} style={{ color: 'var(--text-muted)' }} />

          <div className="flex items-center gap-1 border rounded-lg p-0.5" style={{ borderColor: 'var(--border)' }}>
            <span className="text-xs px-2" style={{ color: 'var(--text-muted)' }}>ช่วง:</span>
            {([6, 12, 24] as const).map(m => (
              <button
                key={m}
                onClick={() => setMonthsBack(m)}
                className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                style={monthsBack === m
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                  : { color: 'var(--text-muted)' }
                }
              >
                {m}mo
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 border rounded-lg p-0.5" style={{ borderColor: 'var(--border)' }}>
            {([
              { key: 'all',   label: 'ทั้งหมด' },
              { key: 'has_a', label: 'มี Class A' },
              { key: 'has_c', label: 'มี Class C' },
            ] as const).map(o => (
              <button
                key={o.key}
                onClick={() => setShowOnly(o.key)}
                className="px-3 py-1 rounded-md text-xs font-medium transition-colors"
                style={showOnly === o.key
                  ? { backgroundColor: 'var(--color-primary)', color: '#fff' }
                  : { color: 'var(--text-muted)' }
                }
              >
                {o.label}
              </button>
            ))}
          </div>

          <select className="select" value={sortKey} onChange={e => setSortKey(e.target.value as typeof sortKey)}>
            <option value="out">เรียง: Out (มาก→น้อย)</option>
            <option value="in">เรียง: In (มาก→น้อย)</option>
            <option value="stock">เรียง: Stock Value</option>
            <option value="turnover">เรียง: Turnover (เร็ว→ช้า)</option>
            <option value="a">เรียง: Class A</option>
            <option value="c">เรียง: Class C</option>
          </select>

          <button onClick={handleExport} className="btn btn-secondary ml-auto" disabled={filtered.length === 0}>
            <Download size={16} /> Export Excel
          </button>
        </div>
      </div>

      {/* KPI Strip — 6 insight cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <InsightCard
          icon={<FolderTree size={14} />}
          label="จำนวนกลุ่ม"
          value={formatNumber(totals.groups)}
          sub={`${formatNumber(totals.skus_total)} SKU • ${formatNumber(totals.lots_total)} lots`}
          color="#1F3864"
        />
        <InsightCard
          icon={<TrendingDown size={14} />}
          label="กลุ่มที่ Move มากสุด"
          value={totals.topMover?.group_name.split('-')[0].slice(0, 14) || '—'}
          sub={totals.topMover ? `Out ฿${formatCompact(totals.topMover.out_value)}` : ''}
          color="#dc2626"
        />
        <InsightCard
          icon={<Layers size={14} />}
          label="กลุ่มที่มี Stock สูงสุด"
          value={totals.topValue?.group_name.split('-')[0].slice(0, 14) || '—'}
          sub={totals.topValue ? `฿${formatCompact(totals.topValue.stock_value)}` : ''}
          color="#1F3864"
        />
        <InsightCard
          icon={<RefreshCw size={14} />}
          label="หมุนเร็วสุด"
          value={totals.fastest?.group_name.split('-')[0].slice(0, 14) || '—'}
          sub={totals.fastest ? `Turnover ${totals.fastest.turnover_ratio.toFixed(1)}x` : ''}
          color="#16a34a"
        />
        <InsightCard
          icon={<Clock size={14} />}
          label="หมุนช้าสุด"
          value={totals.slowest?.group_name.split('-')[0].slice(0, 14) || '—'}
          sub={totals.slowest ? `Turnover ${totals.slowest.turnover_ratio.toFixed(1)}x` : ''}
          color="#E65100"
        />
        <InsightCard
          icon={<Target size={14} />}
          label="Class A เยอะสุด / C เยอะสุด"
          value={`${totals.mostA?.group_name.split('-')[0].slice(0, 10) || '—'} / ${totals.mostC?.group_name.split('-')[0].slice(0, 10) || '—'}`}
          sub={`A=${totals.mostA?.lots_a ?? 0} lots • C=${totals.mostC?.lots_c ?? 0} lots`}
          color="#d97706"
        />
      </div>

      {/* Two side-by-side charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Chart 1: Movement by group (In vs Out) */}
        <div className="card">
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            Movement by Group (Top {Math.min(TOP_N, chartData.length)}) — {monthsBack} เดือน
          </h4>
          <div style={{ height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 15, bottom: 60, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="short_name"
                  stroke="var(--text-muted)"
                  fontSize={10}
                  tick={{ fill: 'var(--text-muted)' }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                />
                <YAxis stroke="var(--text-muted)" fontSize={11} tickFormatter={v => `฿${formatCompact(Number(v))}`} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v?: number | string, name?: string) => [`฿${formatCompact(Number(v ?? 0))}`, name]}
                  labelFormatter={l => String(l)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="in_value"  name="In (รับเข้า)"  fill="#16a34a" radius={[2,2,0,0]} />
                <Bar dataKey="out_value" name="Out (จ่ายออก)" fill="#dc2626" radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: VV class distribution by group (stacked) — lot-level */}
        <div className="card">
          <h4 className="text-sm font-semibold mb-3" style={{ color: 'var(--text)' }}>
            VV Class Distribution by Group (Top {Math.min(TOP_N, chartData.length)}) — นับเป็น lot
          </h4>
          <div style={{ height: 360 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 15, bottom: 60, left: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="short_name"
                  stroke="var(--text-muted)"
                  fontSize={10}
                  tick={{ fill: 'var(--text-muted)' }}
                  interval={0}
                  angle={-35}
                  textAnchor="end"
                  height={70}
                />
                <YAxis stroke="var(--text-muted)" fontSize={11} allowDecimals={false} />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v?: number | string, name?: string) => [formatNumber(Number(v ?? 0)), name]}
                  labelFormatter={l => String(l)}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="lots_a" name="Class A (lots)" stackId="vv" fill={VV_COLORS.A} radius={[0,0,0,0]} />
                <Bar dataKey="lots_b" name="Class B (lots)" stackId="vv" fill={VV_COLORS.B} />
                <Bar dataKey="lots_c" name="Class C (lots)" stackId="vv" fill={VV_COLORS.C} radius={[2,2,0,0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Group Performance Table */}
      <div className="card p-0 overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center gap-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
          <FolderTree size={15} style={{ color: 'var(--text-muted)' }} />
          <h4 className="text-sm font-semibold" style={{ color: 'var(--text)' }}>Group Performance</h4>
          <span className="text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} กลุ่ม • VV คำนวณจาก lot จริง • คลิกหัวคอลัมน์เพื่อเรียงลำดับ
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-alt)' }}>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Group</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase">SKUs</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase">Lots</th>
                <th className="px-3 py-2 text-center text-xs font-semibold uppercase">VV by Lot (A/B/C)</th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase cursor-pointer hover:text-[var(--text)]" onClick={() => setSortKey('stock')}>
                  Stock Value{sortKey === 'stock' && ' ↓'}
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase cursor-pointer hover:text-[var(--text)]" onClick={() => setSortKey('in')}>
                  In ({monthsBack}mo){sortKey === 'in' && ' ↓'}
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase cursor-pointer hover:text-[var(--text)]" onClick={() => setSortKey('out')}>
                  Out ({monthsBack}mo){sortKey === 'out' && ' ↓'}
                </th>
                <th className="px-3 py-2 text-right text-xs font-semibold uppercase cursor-pointer hover:text-[var(--text)]" onClick={() => setSortKey('turnover')}>
                  Turnover{sortKey === 'turnover' && ' ↓'}
                </th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase">Move Share</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => {
                // Build A/B/C inline distribution bar (lot-level)
                const total = r.lots_total || 1;
                const aPct = (r.lots_a / total) * 100;
                const bPct = (r.lots_b / total) * 100;
                const cPct = (r.lots_c / total) * 100;
                return (
                  <tr key={r.group_name} className="border-t hover:bg-[var(--bg-alt)]" style={{ borderColor: 'var(--border)' }}>
                    <td className="px-3 py-2 text-xs" style={{ color: 'var(--text)' }}>
                      <div className="font-medium">{r.group_name.split('-')[0].trim()}</div>
                      {r.group_name.includes('-') && (
                        <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{r.group_name.split('-').slice(1).join('-').trim()}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{formatNumber(r.skus_total)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">{formatNumber(r.lots_total)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1 justify-center">
                        <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: VV_COLORS.A, color: '#fff' }}>{r.lots_a}</span>
                        <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: VV_COLORS.B, color: '#fff' }}>{r.lots_b}</span>
                        <span className="text-[10px] tabular-nums px-1.5 py-0.5 rounded font-semibold" style={{ backgroundColor: VV_COLORS.C, color: '#fff' }}>{r.lots_c}</span>
                      </div>
                      {/* tiny distribution bar */}
                      <div className="flex h-1 mt-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-alt)' }}>
                        <div style={{ width: `${aPct}%`, backgroundColor: VV_COLORS.A }} />
                        <div style={{ width: `${bPct}%`, backgroundColor: VV_COLORS.B }} />
                        <div style={{ width: `${cPct}%`, backgroundColor: VV_COLORS.C }} />
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums font-semibold">฿{formatCompact(r.stock_value)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: '#16a34a' }}>฿{formatCompact(r.in_value)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: '#dc2626' }}>฿{formatCompact(r.out_value)}</td>
                    <td className="px-3 py-2 text-right text-xs tabular-nums">
                      <span className="font-semibold" style={{ color: r.turnover_ratio >= 4 ? '#16a34a' : r.turnover_ratio >= 1 ? '#d97706' : '#dc2626' }}>
                        {r.turnover_ratio.toFixed(2)}x
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-alt)' }}>
                          <div className="h-full" style={{ width: `${Math.max(2, r.movement_share)}%`, backgroundColor: '#dc2626' }} />
                        </div>
                        <span className="text-[10px] tabular-nums w-10 text-right" style={{ color: 'var(--text-muted)' }}>
                          {r.movement_share.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan={9} className="text-center py-12" style={{ color: 'var(--text-muted)' }}>ไม่พบข้อมูล</td></tr>
              )}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="border-t-2" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
                  <td className="px-3 py-2 text-xs font-bold" style={{ color: 'var(--text)' }}>รวม {totals.groups} กลุ่ม</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-bold">{formatNumber(totals.skus_total)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-bold">{formatNumber(totals.lots_total)}</td>
                  <td className="px-3 py-2 text-center text-xs font-bold">
                    A:{totals.lots_a} / B:{totals.lots_b} / C:{totals.lots_c}
                  </td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-bold">฿{formatCompact(totals.stock_value)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-bold" style={{ color: '#16a34a' }}>฿{formatCompact(totals.in_value)}</td>
                  <td className="px-3 py-2 text-right text-xs tabular-nums font-bold" style={{ color: '#dc2626' }}>฿{formatCompact(totals.out_value)}</td>
                  <td className="px-3 py-2"></td>
                  <td className="px-3 py-2"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Reading guide */}
      <div className="card text-xs" style={{ color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)' }}>วิธีใช้รายงานนี้:</strong>
        <ul className="list-disc ml-5 mt-1 space-y-0.5">
          <li>
            <strong>VV นับเป็น lot</strong> — เพราะ 1 SKU อาจมีหลาย lot ที่ value/validity ต่างกัน
            จึงให้คะแนนระดับ lot จะแม่นยำกว่า (เช่น SKU เดียวกันอาจมี 3 lot: 1 lot Class A, 1 lot Class B, 1 lot Class C)
          </li>
          <li><strong style={{ color: VV_COLORS.A }}>Class A (lots)</strong> = lot ที่ของแพง & สด → กลุ่มที่มี A เยอะ = ของหลักที่ขายดี</li>
          <li><strong style={{ color: VV_COLORS.C }}>Class C (lots)</strong> = lot ที่ใกล้หมดอายุ หรือมูลค่าต่ำ → ต้องเร่งระบาย</li>
          <li><strong>SKUs vs Lots</strong> — SKUs = จำนวนรหัสสินค้าไม่ซ้ำ • Lots = จำนวนล็อตรวม (1 SKU อาจมีหลาย lot)</li>
          <li><strong>Turnover</strong> = อัตราหมุนต่อปี — สูง=หมุนเร็ว (ดี), ต่ำ=ของค้าง</li>
          <li><strong>Move Share</strong> = สัดส่วน Out ของกลุ่มนี้ จากยอดรวม → เห็นว่ากลุ่มไหนคือ "ตัวขับเคลื่อน" ของธุรกิจ</li>
          <li><strong>เคสน่าสนใจ:</strong> กลุ่มที่มี Stock Value สูง + Turnover ต่ำ + Class C เยอะ = ของค้างที่ใกล้หมดอายุ ต้องเร่งระบาย</li>
        </ul>
      </div>
    </div>
  );
}

// ── VV Mode Selector Card — 3 buttons + inline explanation always visible ────
const MODE_INFO: Record<VVMode, {
  emoji: string;
  label: string;
  short: string;
  why: string;
  formula: string;
  useFor: string;
  goodFor: string[];
  caution?: string;
  accent: string;
}> = {
  lot: {
    emoji:    '🧾',
    label:    'By Lot',
    short:    'แต่ละ lot คำนวณคะแนนของตัวเอง',
    why:      'Validity และ Value ของแต่ละ lot ต่างกันโดยธรรมชาติ — การให้คะแนนระดับ lot คือความจริงที่แม่นยำที่สุด',
    formula:  '1 lot = 1 หน่วยให้คะแนน → 1 SKU อาจกระจายอยู่ใน Class A/B/C พร้อมกันก็ได้',
    useFor:   'การ Action รายตัว — FEFO picking, การทิ้งของหมดอายุ, audit',
    goodFor:  ['FEFO Pick List', 'Write-off ของหมดอายุ', 'GMP/HACCP audit', 'ความเสี่ยงระดับ batch'],
    accent:   '#16a34a',
  },
  item_worst: {
    emoji:    '⚠️',
    label:    'Item — Worst-Case',
    short:    'รวมเป็น SKU โดยใช้ lot ที่ใกล้หมดที่สุด',
    why:      'ปรัชญา Conservative — ถ้ามี lot ใดเสี่ยง → SKU นี้เสี่ยง',
    formula:  'Validity Score = คะแนนของ lot ที่ใกล้หมดที่สุด (Min)  •  Value Score = sum ของ stock value',
    useFor:   'การตัดสินใจระดับ SKU แบบรอบคอบ — alert, การหยุดสั่งซื้อ',
    goodFor:  ['Risk Alert', 'หยุดสั่ง SKU ที่ใกล้หมด', 'Food safety', 'Quarterly review'],
    caution:  'อาจตัด SKU เป็น Class C ทั้งที่มี lot ใหม่อยู่ — ตรวจดู Lot mode คู่กัน',
    accent:   '#d97706',
  },
  item_weighted: {
    emoji:    '⚖️',
    label:    'Item — Weighted',
    short:    'รวมเป็น SKU โดยถ่วงน้ำหนัก validity ด้วยมูลค่า lot',
    why:      'ปรัชญา Realistic — สะท้อนความสดของเงินที่จมใน SKU นี้โดยเฉลี่ย',
    formula:  'Validity Score = Σ(lot_days × lot_value) / Σ(lot_value)  •  Value Score = sum ของ stock value',
    useFor:   'การตั้งราคา, การประเมินมูลค่าเชิงกลยุทธ์, แผนการตลาด',
    goodFor:  ['การตั้งราคา/ส่วนลด', 'Pricing strategy', 'การเจรจา Supplier', 'งบประมาณ'],
    caution:  'lot ใกล้หมดที่มูลค่าน้อยจะถูกบดบัง — ใช้คู่กับ Worst-Case mode',
    accent:   '#1F3864',
  },
};

function ModeSelectorCard({
  mode, setMode, snapAvailable, snap,
}: {
  mode: VVMode;
  setMode: (m: VVMode) => void;
  snapAvailable: boolean;
  snap: string | null;
}) {
  const order: VVMode[] = ['lot', 'item_worst', 'item_weighted'];
  const active = MODE_INFO[mode];

  return (
    <div className="card p-0 overflow-hidden">
      {/* Header strip with title + 3 buttons */}
      <div className="px-4 py-3 border-b flex flex-wrap items-center gap-3" style={{ borderColor: 'var(--border)', backgroundColor: 'var(--bg-alt)' }}>
        <div>
          <p className="text-xs font-semibold" style={{ color: 'var(--text)' }}>Analysis Mode</p>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>เลือกมุมมองตามคำถามที่ต้องการตอบ</p>
        </div>
        <div className="flex flex-wrap rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          {order.map(m => {
            const info = MODE_INFO[m];
            const disabled = !snapAvailable;
            const isActive = mode === m;
            return (
              <button
                key={m}
                onClick={() => setMode(m)}
                disabled={disabled}
                className="px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed border-r last:border-r-0"
                style={{
                  borderColor: 'var(--border)',
                  ...(isActive
                    ? { backgroundColor: info.accent, color: '#fff' }
                    : { color: 'var(--text-muted)', backgroundColor: 'var(--bg-card)' }
                  ),
                }}
                title={disabled ? 'ยังไม่มีข้อมูล Lot — Import sheet "Lot Inventory" ก่อน' : info.short}
              >
                {info.emoji} {info.label}
              </button>
            );
          })}
        </div>
        {snap && (
          <span className="text-[10px] px-2 py-1 rounded ml-auto" style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-muted)' }}>
            Snapshot: {snap}
          </span>
        )}
      </div>

      {/* Inline tooltip card — explains the active mode */}
      <div className="p-4" style={{ borderLeft: `4px solid ${active.accent}` }}>
        <div className="flex items-start gap-3 mb-2">
          <span className="text-xl">{active.emoji}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold" style={{ color: active.accent }}>{active.label}</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text)' }}>{active.short}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3 text-xs">
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>💡 ปรัชญา</p>
            <p style={{ color: 'var(--text-muted)' }}>{active.why}</p>
          </div>
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>📐 วิธีคิด</p>
            <p className="font-mono text-[11px] p-2 rounded" style={{ color: 'var(--text)', backgroundColor: 'var(--bg-alt)' }}>
              {active.formula}
            </p>
          </div>
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>🎯 เหมาะใช้ตอบ</p>
            <p style={{ color: 'var(--text-muted)' }}>{active.useFor}</p>
          </div>
          <div>
            <p className="font-semibold mb-1" style={{ color: 'var(--text)' }}>✅ ใช้กับงาน</p>
            <div className="flex flex-wrap gap-1">
              {active.goodFor.map(g => (
                <span key={g} className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: active.accent + '20', color: active.accent }}>
                  {g}
                </span>
              ))}
            </div>
          </div>
        </div>

        {active.caution && (
          <div className="mt-3 px-3 py-2 rounded text-[11px] flex items-start gap-2"
               style={{ backgroundColor: 'rgba(217,119,6,0.08)', color: '#92400e', borderLeft: '3px solid #d97706' }}>
            <span>⚠️</span><span><strong>ข้อควรระวัง:</strong> {active.caution}</span>
          </div>
        )}

        {/* Comparison chips — all 3 modes side-by-side as one-liner */}
        <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[10px] font-semibold mb-2" style={{ color: 'var(--text-muted)' }}>เปรียบเทียบทั้ง 3 mode:</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
            {order.map(m => {
              const info = MODE_INFO[m];
              const isActive = mode === m;
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className="text-left p-2 rounded border transition-all"
                  style={{
                    borderColor: isActive ? info.accent : 'var(--border)',
                    backgroundColor: isActive ? info.accent + '12' : 'var(--bg-card)',
                    opacity: isActive ? 1 : 0.7,
                  }}
                >
                  <div className="font-semibold" style={{ color: info.accent }}>
                    {info.emoji} {info.label}
                  </div>
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {info.short}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Clickable KPI card — drives filter state on the VV Matrix tab ──
function KpiClickCard({
  title, value, sub, color, isActive, onClick, hint, smallValue,
}: {
  title: string;
  value: string;
  sub: string;
  color: string;
  isActive: boolean;
  onClick: () => void;
  hint?: string;
  smallValue?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className="card border-l-4 text-left transition-all hover:shadow-md cursor-pointer relative group"
      style={{
        borderLeftColor: color,
        // Active state — colored ring + tinted background
        ...(isActive
          ? { boxShadow: `0 0 0 2px ${color}`, backgroundColor: `${color}0a` }
          : {}),
      }}
      title={hint}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs flex-1" style={{ color: 'var(--text-muted)' }}>{title}</p>
        {isActive && (
          <span className="text-[9px] px-1.5 py-0.5 rounded-full font-bold flex-shrink-0"
                style={{ backgroundColor: color, color: '#fff' }}>
            ACTIVE
          </span>
        )}
      </div>
      <p className={`${smallValue ? 'text-xl' : 'text-2xl'} font-bold tabular-nums mt-0.5`} style={{ color }}>
        {value}
      </p>
      <p className="text-xs mt-1 tabular-nums" style={{ color: 'var(--text-muted)' }}>{sub}</p>
      {/* Hint chip — visible on hover (or always when active) */}
      {hint && (
        <p className={`text-[10px] mt-1 italic transition-opacity ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
           style={{ color }}>
          {hint}
        </p>
      )}
    </button>
  );
}

function InsightCard({ icon, label, value, sub, color }: {
  icon: React.ReactNode; label: string; value: string; sub: string; color: string;
}) {
  return (
    <div className="card border-l-4" style={{ borderLeftColor: color }}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
        {icon}<span>{label}</span>
      </div>
      <div className="mt-1 text-sm font-bold" style={{ color }}>{value}</div>
      <div className="text-[10px] mt-0.5 tabular-nums" style={{ color: 'var(--text-muted)' }}>{sub}</div>
    </div>
  );
}
