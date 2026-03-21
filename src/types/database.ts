// ── Lookup / Reference Tables ─────────────────────────────────────────────────

export interface Warehouse {
  code: string;
  whs_name: string;
  whs_type: string;
  is_active: boolean;
  sort_order: number;
}

export interface ItemGroup {
  group_code: number;
  group_name: string;
  description: string | null;
}

export interface TransactionType {
  trans_type: number;
  trans_name: string;
  direction: string;
}

// ── Core Tables ───────────────────────────────────────────────────────────────

export interface Item {
  item_code: string;
  itemname: string;
  foreign_name: string | null;
  uom: string;
  std_cost: number;
  moving_avg: number;
  group_code: number;
  // group_name removed — join via item_groups table
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** Raw inventory_transactions row (post-normalization, no redundant name columns) */
export interface InventoryTransaction {
  id: number;
  trans_num: number;
  doc_date: string;
  trans_type: number;
  warehouse: string;
  group_code: number;
  doc_line_num: number | null;
  item_code: string;
  in_qty: number;
  out_qty: number;
  balance_qty: number;
  amount: number;
  direction: string;
  created_at: string;
  // Joined fields (from v_transactions view)
  itemname?: string;
  foreign_name?: string;
  whs_name?: string;
  group_name?: string;
  trans_name?: string;
}

export interface StockThreshold {
  id: number;
  item_code: string;
  warehouse: string;
  min_level: number;
  reorder_point: number;
  max_level: number | null;
  created_by: string | null;
  updated_at: string;
}

export interface ImportLog {
  id: number;
  file_name: string;
  imported_at: string;
  items_count: number;
  transactions_count: number;
  status: 'success' | 'error' | 'partial';
  error_summary: string | null;
  imported_by: string | null;
}

// ── Views ─────────────────────────────────────────────────────────────────────

/** v_stock_onhand — current stock per item + warehouse */
export interface StockOnHand {
  item_code: string;
  itemname: string;
  foreign_name: string | null;
  warehouse: string;
  whs_name: string;
  whs_type: string;
  group_code: number;
  group_name: string;
  current_stock: number;
  uom: string;
  moving_avg: number;
  std_cost: number;
  stock_value: number;
  is_active: boolean;
}

/** v_movement_monthly — monthly movement aggregates for trend charts */
export interface MovementMonthly {
  month: string;       // YYYY-MM-DD (first day of month)
  item_code: string;
  warehouse: string;
  direction: string;
  group_name: string;
  total_in: number;
  total_out: number;
  total_amount: number;
  transaction_count: number;
}

// ── Management Report Views ───────────────────────────────────────────────────

/** v_stock_alerts — server-side computed alerts with real days_remaining */
export interface StockAlertView {
  item_code: string;
  itemname: string;
  warehouse: string;
  whs_name: string;
  group_name: string;
  current_stock: number;
  uom: string;
  stock_value: number;
  min_level: number;
  reorder_point: number;
  max_level: number | null;
  daily_avg_out: number;
  days_remaining: number | null;
  status: StockStatus;
}

/** v_abc_analysis — ABC classification by cumulative outbound value */
export interface ABCItem {
  rank: number;
  item_code: string;
  itemname: string;
  group_name: string;
  uom: string;
  total_out_qty: number;
  total_out_value: number;
  value_pct: number;
  cumulative_pct: number;
  abc_class: 'A' | 'B' | 'C';
  active_days: number;
  last_movement_date: string;
}

/** v_slow_moving — items with low or no recent outbound activity */
export interface SlowMovingItem {
  item_code: string;
  itemname: string;
  group_name: string;
  warehouse: string;
  whs_name: string;
  current_stock: number;
  uom: string;
  stock_value: number;
  last_out_date: string | null;
  days_since_last_out: number | null;
  total_out_qty: number;
  movement_status: 'dead_stock' | 'slow_moving' | 'normal';
}

/** v_inventory_turnover — annual turnover ratio per item */
export interface InventoryTurnover {
  item_code: string;
  itemname: string;
  group_name: string;
  uom: string;
  annual_cogs: number;
  annual_out_qty: number;
  current_stock_value: number;
  current_stock_qty: number;
  turnover_ratio: number | null;
  days_on_hand: number | null;
  active_months: number;
}

/** v_reorder_suggestions — items at or below reorder point */
export interface ReorderSuggestion {
  item_code: string;
  itemname: string;
  group_name: string;
  warehouse: string;
  whs_name: string;
  current_stock: number;
  uom: string;
  min_level: number;
  reorder_point: number;
  max_level: number | null;
  daily_avg_out: number;
  days_remaining: number | null;
  suggested_order_qty: number;
  stock_value: number;
  moving_avg: number;
  suggested_order_value: number;
}

// ── Aggregated / Computed ─────────────────────────────────────────────────────

export type StockStatus = 'critical' | 'warning' | 'normal' | 'overstock';

/** Legacy StockAlert shape kept for backward compat with Alerts page */
export interface StockAlert {
  item_code: string;
  itemname: string;
  warehouse: string;
  whs_name: string;
  group_name: string;
  current_stock: number;
  uom: string;
  stock_value: number;
  min_level: number;
  reorder_point: number;
  max_level: number | null;
  status: StockStatus;
  days_remaining: number | null;
  daily_avg_out: number;
}

export interface KPIData {
  totalStockValue: number;
  activeItems: number;
  criticalAlerts: number;
  lastSync: string | null;
}

// ── Static Constants ──────────────────────────────────────────────────────────

export const ITEM_GROUPS: Record<number, string> = {
  123: 'FFG-Finish Goods',
  125: 'FRM-Raw Materials',
  126: 'FBY-By Product',
  127: 'FPKG-Packaging',
};

export const WAREHOUSES = [
  { code: 'FS-FG01', name: 'คลัง FG - ใน1',                type: 'Finish Goods' },
  { code: 'FS-FG02', name: 'คลัง FG - ใน2',                type: 'Finish Goods' },
  { code: 'FS-FG03', name: 'คลัง FG - นอก',                type: 'Finish Goods' },
  { code: 'FS-RM01', name: 'คลัง RM - ใน1',                type: 'Raw Materials' },
  { code: 'FS-RM02', name: 'คลัง RM - ใน2',                type: 'Raw Materials' },
  { code: 'FS-RM03', name: 'คลัง RM - นอก1',               type: 'Raw Materials' },
  { code: 'FS-RM04', name: 'คลัง RM - นอก2',               type: 'Raw Materials' },
  { code: 'FS-PD01', name: 'คลังผลิต - ใน1',               type: 'Production' },
  { code: 'FS-PD02', name: 'คลังผลิต - ใน2',               type: 'Production' },
  { code: 'FS-PK01', name: 'คลัง PK&Factory Supply - ใน1', type: 'Packaging' },
  { code: 'FS-PK02', name: 'คลัง PK&Factory Supply - ใน2', type: 'Packaging' },
  { code: 'FS-QC01', name: 'คลัง QC - ใน',                 type: 'Quality Control' },
  { code: 'FS-QC02', name: 'คลัง QC - นอก',                type: 'Quality Control' },
  { code: 'FS-CL01', name: 'คลังรอเคลมในประเทศ',            type: 'Claim Hold' },
  { code: 'FS-CO01', name: 'คลังรอเคลมต่างประเทศ',          type: 'Claim Hold' },
  { code: 'FS-WS01', name: 'คลังของเสียรอทำลาย - ใน1',     type: 'Waste' },
  { code: 'BT-RM02', name: 'บางบัวทอง คลัง RM-Frozen',     type: 'Raw Materials' },
] as const;

export const TRANS_TYPES = [
  { code: 0,   name: 'Opening',               direction: 'Opening' },
  { code: 15,  name: 'Delivery',              direction: 'Out' },
  { code: 16,  name: 'Return',                direction: 'In' },
  { code: 18,  name: 'A/P Invoice',           direction: 'In' },
  { code: 20,  name: 'Goods Receipt PO',      direction: 'In' },
  { code: 21,  name: 'Goods Return',          direction: 'Out' },
  { code: 59,  name: 'Goods Receipt',         direction: 'In' },
  { code: 60,  name: 'Goods Issue',           direction: 'Out' },
  { code: 67,  name: 'Inventory Transfers',   direction: 'Transfers' },
  { code: 69,  name: 'Landed Cost',           direction: 'Cost' },
  { code: 162, name: 'Inventory Revaluation', direction: 'Cost' },
] as const;
