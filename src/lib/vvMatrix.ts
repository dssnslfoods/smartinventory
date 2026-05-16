/**
 * VV Matrix scoring engine — Value × Validity classification.
 *
 * Extracted from ReportsPage so the Dashboard (and any future consumer)
 * can compute summary aggregates without duplicating the logic. The
 * inline copy in ReportsPage.tsx is kept intact to avoid risk; this is
 * the canonical implementation for new code.
 *
 * Scoring philosophy:
 *   1. Each input row is ranked by stock_value to produce a percentile
 *      Value Score (1-5).
 *   2. Days remaining until expire_date map to a Validity Score (1-5).
 *   3. Simple Class uses a weighted-average; Exp Class uses
 *      Value × (Validity/5)^α — the canonical "VV Matrix" formula.
 *   4. Risk flags surface high-value + low-validity outliers.
 */

export interface VVItem {
  item_code: string;
  itemname: string;
  group_name: string;
  uom: string;
  stock_value: number;
  expire_date: string | null;
  remaining_days: number | null;
  value_score: number;
  validity_score: number;
  /** Simple (weighted-average) model */
  final_score: number;
  vv_class: 'A' | 'B' | 'C';
  /** Exponential model */
  normalized_validity: number;       // validity_score / 5
  exp_factor: number;                // (normalized_validity)^alpha
  exp_score: number;                 // value_score * exp_factor
  exp_class: 'A' | 'B' | 'C';
  /** Risk flag for surfacing urgent items */
  risk_flag: 'critical' | 'high_expiry' | null;
  priority_rank: number;             // rank by exp_score desc
  recommendation: string;
  is_urgent: boolean;
  /** Lot-mode extras (undefined in item mode) */
  batch_num?: string;
  warehouse?: string;
  whs_name?: string;
  qty?: number;
  fs_category?: string | null;
}

/** Generic record fed into the scoring engine. */
export interface VVInput {
  item_code: string;
  itemname: string;
  group_name: string;
  uom: string;
  stock_value: number;
  expire_date: string | null;
  batch_num?: string;
  warehouse?: string;
  whs_name?: string;
  qty?: number;
  fs_category?: string | null;
}

export const VV_DEFAULTS = {
  // Validity thresholds (days)
  validity_v5: 180, validity_v4: 90, validity_v3: 60, validity_v2: 30,
  validity_no_expiry: 3,
  // Value score percentile bands
  value_p5: 0.20, value_p4: 0.40, value_p3: 0.60, value_p2: 0.80,
  // Simple (weighted) model
  class_a: 4.0, class_b: 2.5,
  weight_value: 0.5, weight_validity: 0.5,
  // Exponential model
  vv_alpha: 2,
  exp_class_a: 3.5,
  exp_class_b: 1.5,
  // Risk flagging
  urgent_value_min: 4, urgent_validity_max: 2,
};

export type VVConfig = typeof VV_DEFAULTS;

const RECOMMENDATIONS: Record<'A' | 'B' | 'C', string> = {
  A: 'Push growth / Maintain availability',
  B: 'Monitor / Optimize pricing',
  C: 'Clearance / Reduce stock / Stop purchasing',
};

const RISK_RECOMMENDATIONS: Record<'critical' | 'high_expiry', string> = {
  critical:    'URGENT SALE REQUIRED — High value at expiry risk',
  high_expiry: 'Prioritise clearance — Expiry approaching',
};

export function getRemainingDays(expireDate: string | null): number | null {
  if (!expireDate) return null;
  return Math.floor((new Date(expireDate).getTime() - Date.now()) / 86_400_000);
}

/** Parse system_config rows into a VVConfig with defaults for missing keys. */
export function parseVVConfig(config: Array<{ key: string; value: string }> | undefined): VVConfig {
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

/** Core scoring — input list → VVItem list with all percentile / exp / class fields. */
export function computeVVScores(inputs: VVInput[], cfg: VVConfig, alpha: number): VVItem[] {
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

// ─── Dashboard-friendly aggregate ────────────────────────────────────────────

export interface VVSummary {
  total:            number;
  totalValue:       number;
  counts:           { A: number; B: number; C: number };
  values:           { A: number; B: number; C: number };
  pct:              { A: number; B: number; C: number };
  criticalCount:    number;
  criticalValue:    number;
  highRiskCount:    number;   // includes Critical
  highRiskValue:    number;
  topCritical:      VVItem[]; // top-N by stock_value among critical items
  classCValue:      number;   // alias of values.C — "Value at Risk"
}

/** Aggregate a scored VVItem[] into a Dashboard-ready summary. */
export function summarizeVV(items: VVItem[], topN = 5): VVSummary {
  const counts = { A: 0, B: 0, C: 0 };
  const values = { A: 0, B: 0, C: 0 };
  let criticalCount = 0;
  let criticalValue = 0;
  let highRiskCount = 0;
  let highRiskValue = 0;
  const criticals: VVItem[] = [];

  for (const it of items) {
    counts[it.exp_class] += 1;
    values[it.exp_class] += it.stock_value;
    if (it.risk_flag === 'critical') {
      criticalCount += 1;
      criticalValue += it.stock_value;
      highRiskCount += 1;
      highRiskValue += it.stock_value;
      criticals.push(it);
    } else if (it.risk_flag === 'high_expiry') {
      highRiskCount += 1;
      highRiskValue += it.stock_value;
    }
  }

  const total = counts.A + counts.B + counts.C;
  const totalValue = values.A + values.B + values.C;
  const pct = {
    A: total > 0 ? (counts.A / total) * 100 : 0,
    B: total > 0 ? (counts.B / total) * 100 : 0,
    C: total > 0 ? (counts.C / total) * 100 : 0,
  };

  const topCritical = [...criticals]
    .sort((a, b) => b.stock_value - a.stock_value)
    .slice(0, topN);

  return {
    total, totalValue, counts, values, pct,
    criticalCount, criticalValue, highRiskCount, highRiskValue,
    topCritical, classCValue: values.C,
  };
}
