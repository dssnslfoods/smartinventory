import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type {
  StockOnHand, InventoryTransaction, MovementMonthly,
  StockThreshold, Item, ImportLog,
  StockAlertView, ABCItem, SlowMovingItem,
  InventoryTurnover, ReorderSuggestion,
  Warehouse, ItemGroup,
  Supplier, PurchaseOrder, PurchaseOrderLine,
  GoodsInTransit, StockPosition,
} from '@/types/database';

// Supabase default max rows = 1,000 — always set an explicit limit above data size
const LIMIT_ITEMS        = 5_000;
const LIMIT_STOCK        = 20_000;
const LIMIT_MOVEMENT     = 50_000;
const LIMIT_THRESHOLDS   = 5_000;
const LIMIT_TRANSACTIONS = 500_000;
const LIMIT_REPORTS      = 10_000;

// ============ Stock On-Hand ============
export function useStockOnHand(filters?: {
  warehouse?: string;
  groupCode?: number;
  isActive?: boolean;
  search?: string;
}) {
  return useQuery({
    queryKey: ['stockOnHand', filters],
    queryFn: async () => {
      let query = supabase.from('v_stock_onhand').select('*');

      if (filters?.warehouse)               query = query.eq('warehouse',  filters.warehouse);
      if (filters?.groupCode)               query = query.eq('group_code', filters.groupCode);
      if (filters?.isActive !== undefined)  query = query.eq('is_active',  filters.isActive);
      if (filters?.search) {
        query = query.or(`item_code.ilike.%${filters.search}%,itemname.ilike.%${filters.search}%`);
      }

      const { data, error } = await query
        .order('stock_value', { ascending: false })
        .limit(LIMIT_STOCK);
      if (error) throw error;
      return (data ?? []) as StockOnHand[];
    },
  });
}

// ============ Transactions (paginated) ============
export function useTransactions(filters?: {
  warehouse?: string;
  groupCode?: number;
  direction?: string;
  transType?: number;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}) {
  const page     = filters?.page     ?? 0;
  const pageSize = filters?.pageSize ?? 50;

  return useQuery({
    queryKey: ['transactions', filters],
    queryFn: async () => {
      // Query v_transactions (normalized view with joined names)
      let query = supabase
        .from('v_transactions')
        .select('*', { count: 'exact' });

      if (filters?.warehouse)  query = query.eq('warehouse',  filters.warehouse);
      if (filters?.groupCode)  query = query.eq('group_code', filters.groupCode);
      if (filters?.direction)  query = query.eq('direction',  filters.direction);
      if (filters?.transType)  query = query.eq('trans_type', filters.transType);
      if (filters?.dateFrom)   query = query.gte('doc_date',  filters.dateFrom);
      if (filters?.dateTo)     query = query.lte('doc_date',  filters.dateTo);
      if (filters?.search) {
        query = query.or(`item_code.ilike.%${filters.search}%,itemname.ilike.%${filters.search}%`);
      }

      const from = page * pageSize;
      const to   = from + pageSize - 1;

      const { data, error, count } = await query
        .order('doc_date',  { ascending: false })
        .order('trans_num', { ascending: false })
        .range(from, to);

      if (error) throw error;
      return {
        data:       (data ?? []) as InventoryTransaction[],
        count:      count ?? 0,
        page,
        pageSize,
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    },
  });
}

// ============ Movement Monthly ============
export function useMovementMonthly(filters?: {
  warehouse?: string;
  groupName?: string;
  groupCode?: number;
  months?: number;
}) {
  const months = filters?.months ?? 12;

  return useQuery({
    queryKey: ['movementMonthly', filters],
    queryFn: async () => {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      cutoff.setDate(1);
      const cutoffStr = cutoff.toISOString().split('T')[0];

      let query = supabase
        .from('v_movement_monthly')
        .select('*')
        .gte('month', cutoffStr);

      if (filters?.warehouse)  query = query.eq('warehouse',   filters.warehouse);
      if (filters?.groupName)  query = query.eq('group_name',  filters.groupName);
      if (filters?.groupCode)  query = query.eq('group_code',  filters.groupCode);

      const { data, error } = await query
        .order('month', { ascending: true })
        .limit(LIMIT_MOVEMENT);
      if (error) throw error;

      // Aggregate by month and direction
      const monthlyMap = new Map<string, {
        month: string; In: number; Out: number; Transfers: number; total_amount: number;
      }>();

      for (const row of (data ?? []) as MovementMonthly[]) {
        const key = row.month;
        if (!monthlyMap.has(key)) {
          monthlyMap.set(key, { month: key, In: 0, Out: 0, Transfers: 0, total_amount: 0 });
        }
        const entry = monthlyMap.get(key)!;
        if (row.direction === 'In')        entry.In        += Number(row.total_in);
        if (row.direction === 'Out')       entry.Out       += Number(row.total_out);
        if (row.direction === 'Transfers') entry.Transfers += Number(row.total_in) + Number(row.total_out);
        entry.total_amount += Number(row.total_amount);
      }

      return Array.from(monthlyMap.values());
    },
  });
}

// ============ Items ============
export function useItems(filters?: { isActive?: boolean; groupCode?: number; search?: string }) {
  return useQuery({
    queryKey: ['items', filters],
    queryFn: async () => {
      let query = supabase.from('items').select('*, item_groups(group_name)');
      if (filters?.isActive !== undefined) query = query.eq('is_active',  filters.isActive);
      if (filters?.groupCode)              query = query.eq('group_code', filters.groupCode);
      if (filters?.search) {
        query = query.or(`item_code.ilike.%${filters.search}%,itemname.ilike.%${filters.search}%`);
      }
      const { data, error } = await query
        .order('item_code')
        .limit(LIMIT_ITEMS);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        group_name: row.item_groups?.group_name ?? '',
      })) as (Item & { group_name: string })[];
    },
  });
}

// ============ Warehouses ============
export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select('*')
        .order('sort_order');
      if (error) throw error;
      return (data ?? []) as Warehouse[];
    },
    staleTime: 60 * 60 * 1000, // reference data — cache 1 hour
  });
}

// ============ Item Groups ============
export function useItemGroups() {
  return useQuery({
    queryKey: ['itemGroups'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('item_groups')
        .select('*')
        .order('group_code');
      if (error) throw error;
      return (data ?? []) as ItemGroup[];
    },
    staleTime: 60 * 60 * 1000,
  });
}

// ============ Thresholds ============
export function useThresholds() {
  return useQuery({
    queryKey: ['thresholds'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('stock_thresholds')
        .select('*')
        .order('item_code')
        .limit(LIMIT_THRESHOLDS);
      if (error) throw error;
      return (data ?? []) as StockThreshold[];
    },
  });
}

// ============ Stock Alerts (server-side view) ============
export function useStockAlerts(filters?: { status?: string }) {
  return useQuery({
    queryKey: ['stockAlerts', filters],
    queryFn: async () => {
      let query = supabase.from('v_stock_alerts').select('*');
      if (filters?.status) query = query.eq('status', filters.status);

      const { data, error } = await query
        .order('status')        // critical → warning → overstock → normal
        .order('days_remaining', { ascending: true, nullsFirst: false })
        .limit(LIMIT_STOCK);
      if (error) throw error;
      return (data ?? []) as StockAlertView[];
    },
  });
}

// ============ ABC Analysis ============
export function useABCAnalysis(filters?: { groupName?: string; abcClass?: string }) {
  return useQuery({
    queryKey: ['abcAnalysis', filters],
    queryFn: async () => {
      let query = supabase.from('v_abc_analysis').select('*');
      if (filters?.groupName) query = query.eq('group_name', filters.groupName);
      if (filters?.abcClass)  query = query.eq('abc_class',  filters.abcClass);

      const { data, error } = await query
        .order('rank', { ascending: true })
        .limit(LIMIT_REPORTS);
      if (error) throw error;
      return (data ?? []) as ABCItem[];
    },
  });
}

// ============ Slow Moving Items ============
export function useSlowMoving(filters?: {
  movementStatus?: string;
  warehouse?: string;
  groupName?: string;
  minDays?: number;
}) {
  return useQuery({
    queryKey: ['slowMoving', filters],
    queryFn: async () => {
      let query = supabase.from('v_slow_moving').select('*');
      if (filters?.movementStatus) query = query.eq('movement_status', filters.movementStatus);
      if (filters?.warehouse)      query = query.eq('warehouse',       filters.warehouse);
      if (filters?.groupName)      query = query.eq('group_name',      filters.groupName);
      if (filters?.minDays)        query = query.gte('days_since_last_out', filters.minDays);

      const { data, error } = await query
        .order('days_since_last_out', { ascending: false, nullsFirst: true })
        .limit(LIMIT_REPORTS);
      if (error) throw error;
      return (data ?? []) as SlowMovingItem[];
    },
  });
}

// ============ Inventory Turnover ============
export function useInventoryTurnover(filters?: { groupName?: string }) {
  return useQuery({
    queryKey: ['inventoryTurnover', filters],
    queryFn: async () => {
      let query = supabase.from('v_inventory_turnover').select('*');
      if (filters?.groupName) query = query.eq('group_name', filters.groupName);

      const { data, error } = await query
        .order('turnover_ratio', { ascending: false, nullsFirst: false })
        .limit(LIMIT_REPORTS);
      if (error) throw error;
      return (data ?? []) as InventoryTurnover[];
    },
  });
}

// ============ Reorder Suggestions ============
export function useReorderSuggestions(filters?: {
  warehouse?: string;
  groupName?: string;
}) {
  return useQuery({
    queryKey: ['reorderSuggestions', filters],
    queryFn: async () => {
      let query = supabase.from('v_reorder_suggestions').select('*');
      if (filters?.warehouse)  query = query.eq('warehouse',  filters.warehouse);
      if (filters?.groupName)  query = query.eq('group_name', filters.groupName);

      const { data, error } = await query.limit(LIMIT_REPORTS);
      if (error) throw error;
      return (data ?? []) as ReorderSuggestion[];
    },
  });
}

// ============ KPI ============
export function useKPI() {
  return useQuery({
    queryKey: ['kpi'],
    queryFn: async () => {
      const [stockRes, itemsRes, alertsRes, configRes] = await Promise.all([
        supabase
          .from('v_stock_onhand')
          .select('stock_value, current_stock, item_code, warehouse')
          .eq('is_active', true)
          .limit(LIMIT_STOCK),
        supabase
          .from('items')
          .select('item_code', { count: 'exact', head: true })
          .eq('is_active', true),
        supabase
          .from('v_stock_alerts')
          .select('status', { count: 'exact' })
          .eq('status', 'critical')
          .limit(LIMIT_STOCK),
        supabase
          .from('system_config')
          .select('value')
          .eq('key', 'last_sync_at')
          .single(),
      ]);

      const stockData      = (stockRes.data ?? []) as Array<{ stock_value: number }>;
      const totalStockValue = stockData.reduce((sum, r) => sum + Number(r.stock_value), 0);
      const activeItems    = itemsRes.count ?? 0;
      const criticalAlerts = alertsRes.count ?? 0;

      return {
        totalStockValue,
        activeItems,
        criticalAlerts,
        lastSync: configRes.data?.value || null,
      };
    },
  });
}

// ============ Import Logs ============
export function useImportLogs() {
  return useQuery({
    queryKey: ['importLogs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('import_logs')
        .select('*')
        .order('imported_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data ?? []) as ImportLog[];
    },
  });
}

// ============ Data Date Range (for dashboard banner) ============
export function useDataDateRange() {
  return useQuery({
    queryKey: ['dataDateRange'],
    queryFn: async () => {
      const [minRes, maxRes, countRes] = await Promise.all([
        supabase
          .from('inventory_transactions')
          .select('doc_date')
          .order('doc_date', { ascending: true })
          .limit(1),
        supabase
          .from('inventory_transactions')
          .select('doc_date')
          .order('doc_date', { ascending: false })
          .limit(1),
        supabase
          .from('inventory_transactions')
          .select('*', { count: 'exact', head: true }),
      ]);
      return {
        minDate:           minRes.data?.[0]?.doc_date ?? null,
        maxDate:           maxRes.data?.[0]?.doc_date ?? null,
        totalTransactions: countRes.count ?? 0,
      };
    },
  });
}

// ============ Suppliers ============
export function useSuppliers(filters?: { isActive?: boolean; search?: string }) {
  return useQuery({
    queryKey: ['suppliers', filters],
    queryFn: async () => {
      let query = supabase.from('suppliers').select('*');
      if (filters?.isActive !== undefined) query = query.eq('is_active', filters.isActive);
      if (filters?.search) {
        query = query.or(`supplier_code.ilike.%${filters.search}%,supplier_name.ilike.%${filters.search}%`);
      }
      const { data, error } = await query.order('supplier_name');
      if (error) throw error;
      return (data ?? []) as Supplier[];
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supplier: Partial<Supplier> & { supplier_code: string; supplier_name: string }) => {
      const { error } = await supabase
        .from('suppliers')
        .upsert(supplier, { onConflict: 'supplier_code' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supplier_code: string) => {
      const { error } = await supabase
        .from('suppliers')
        .update({ is_active: false })
        .eq('supplier_code', supplier_code);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['suppliers'] }),
  });
}

// ============ Purchase Orders ============
export function usePurchaseOrders(filters?: {
  status?: string;
  supplierCode?: string;
  search?: string;
}) {
  return useQuery({
    queryKey: ['purchaseOrders', filters],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select('*, suppliers(supplier_name)');
      if (filters?.status)       query = query.eq('status',        filters.status);
      if (filters?.supplierCode) query = query.eq('supplier_code', filters.supplierCode);
      if (filters?.search)       query = query.ilike('po_number',  `%${filters.search}%`);
      const { data, error } = await query
        .order('created_at', { ascending: false })
        .limit(1_000);
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        supplier_name: row.suppliers?.supplier_name ?? '',
      })) as PurchaseOrder[];
    },
  });
}

export function usePurchaseOrderLines(poNumber?: string) {
  return useQuery({
    queryKey: ['poLines', poNumber],
    queryFn: async () => {
      let query = supabase
        .from('purchase_order_lines')
        .select('*, items(itemname, uom), warehouses(whs_name)');
      if (poNumber) query = query.eq('po_number', poNumber);
      const { data, error } = await query.order('id');
      if (error) throw error;
      return (data ?? []).map((row: any) => ({
        ...row,
        itemname: row.items?.itemname ?? '',
        uom:      row.items?.uom     ?? '',
        whs_name: row.warehouses?.whs_name ?? '',
      })) as PurchaseOrderLine[];
    },
    enabled: !!poNumber,
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      po: Omit<PurchaseOrder, 'created_at' | 'updated_at'>;
      lines: Omit<PurchaseOrderLine, 'id'>[];
    }) => {
      const { error: poErr } = await supabase
        .from('purchase_orders')
        .insert(payload.po);
      if (poErr) throw poErr;

      if (payload.lines.length > 0) {
        const { error: lineErr } = await supabase
          .from('purchase_order_lines')
          .insert(payload.lines);
        if (lineErr) throw lineErr;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['goodsInTransit'] });
    },
  });
}

export function useUpdatePOStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      po_number: string;
      status: PurchaseOrder['status'];
      tracking_number?: string;
      expected_arrival?: string;
    }) => {
      const { error } = await supabase
        .from('purchase_orders')
        .update({
          status:           payload.status,
          tracking_number:  payload.tracking_number,
          expected_arrival: payload.expected_arrival,
        })
        .eq('po_number', payload.po_number);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['goodsInTransit'] });
      qc.invalidateQueries({ queryKey: ['stockAlerts'] });
      qc.invalidateQueries({ queryKey: ['reorderSuggestions'] });
    },
  });
}

// ============ Goods In Transit ============
export function useGoodsInTransit(filters?: {
  warehouse?: string;
  itemCode?: string;
  arrivalStatus?: string;
}) {
  return useQuery({
    queryKey: ['goodsInTransit', filters],
    queryFn: async () => {
      let query = supabase.from('v_goods_in_transit').select('*');
      if (filters?.warehouse)     query = query.eq('warehouse',      filters.warehouse);
      if (filters?.itemCode)      query = query.eq('item_code',      filters.itemCode);
      if (filters?.arrivalStatus) query = query.eq('arrival_status', filters.arrivalStatus);
      const { data, error } = await query
        .order('days_until_arrival', { ascending: true, nullsFirst: false });
      if (error) throw error;
      return (data ?? []) as GoodsInTransit[];
    },
  });
}

// ============ Stock Position (on-hand + transit combined) ============
export function useStockPosition(filters?: {
  warehouse?: string;
  groupCode?: number;
  search?: string;
}) {
  return useQuery({
    queryKey: ['stockPosition', filters],
    queryFn: async () => {
      let query = supabase.from('v_stock_position').select('*');
      if (filters?.warehouse) query = query.eq('warehouse',  filters.warehouse);
      if (filters?.groupCode) query = query.eq('group_code', filters.groupCode);
      if (filters?.search) {
        query = query.or(`item_code.ilike.%${filters.search}%,itemname.ilike.%${filters.search}%`);
      }
      const { data, error } = await query
        .eq('is_active', true)
        .order('projected_value', { ascending: false })
        .limit(LIMIT_STOCK);
      if (error) throw error;
      return (data ?? []) as StockPosition[];
    },
  });
}

// ============ Receive Goods (PO → inventory_transaction) ============
export function useReceivePOLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      po_number: string;
      item_code: string;
      warehouse: string;
      qty: number;
      unit_price?: number;
    }) => {
      const { error } = await supabase.rpc('receive_po_line', {
        p_po_number:  payload.po_number,
        p_item_code:  payload.item_code,
        p_warehouse:  payload.warehouse,
        p_qty:        payload.qty,
        p_unit_price: payload.unit_price ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchaseOrders'] });
      qc.invalidateQueries({ queryKey: ['poLines'] });
      qc.invalidateQueries({ queryKey: ['goodsInTransit'] });
      qc.invalidateQueries({ queryKey: ['stockOnHand'] });
      qc.invalidateQueries({ queryKey: ['stockPosition'] });
      qc.invalidateQueries({ queryKey: ['stockAlerts'] });
      qc.invalidateQueries({ queryKey: ['kpi'] });
    },
  });
}

// ============ Full Export (no UI limit) ============
export function useTransactionsExport(filters?: {
  warehouse?: string;
  groupCode?: number;
  direction?: string;
  dateFrom?: string;
  dateTo?: string;
}) {
  return useQuery({
    queryKey: ['transactionsExport', filters],
    queryFn: async () => {
      let query = supabase.from('v_transactions').select('*');

      if (filters?.warehouse) query = query.eq('warehouse',  filters.warehouse);
      if (filters?.groupCode) query = query.eq('group_code', filters.groupCode);
      if (filters?.direction) query = query.eq('direction',  filters.direction);
      if (filters?.dateFrom)  query = query.gte('doc_date',  filters.dateFrom);
      if (filters?.dateTo)    query = query.lte('doc_date',  filters.dateTo);

      const { data, error } = await query
        .order('doc_date', { ascending: false })
        .limit(LIMIT_TRANSACTIONS);
      if (error) throw error;
      return (data ?? []) as InventoryTransaction[];
    },
    enabled: false, // only run when explicitly triggered
  });
}
