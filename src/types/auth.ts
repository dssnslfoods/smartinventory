// ── Role types ───────────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'admin' | 'executive' | 'supervisor' | 'staff';

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  executive:   'Executive',
  supervisor:  'Supervisor',
  staff:       'Staff',
};

export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  admin:       'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  executive:   'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  supervisor:  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  staff:       'bg-gray-100 text-gray-700 dark:bg-gray-700/50 dark:text-gray-300',
};

// ── Data models ───────────────────────────────────────────────────────────────

export interface Company {
  id:          string;
  name:        string;
  slug:        string;
  description: string | null;
  logo_url:    string | null;
  is_active:   boolean;
  created_at:  string;
  updated_at:  string;
}

export interface UserProfile {
  id:         string;
  company_id: string | null;
  role:       UserRole;
  full_name:  string | null;
  email:      string | null;
  is_active:  boolean;
  created_at: string;
  updated_at: string;
  // Joined
  company?:   Company;
}

export interface CompanyFeature {
  id:          string;
  company_id:  string;
  feature_key: string;
  is_enabled:  boolean;
  updated_at:  string;
}

export interface RolePermission {
  id:             string;
  company_id:     string;
  role:           Exclude<UserRole, 'super_admin'>;
  permission_key: string;
  is_enabled:     boolean;
  updated_at:     string;
}

// ── Permission keys ───────────────────────────────────────────────────────────

export const PERMISSIONS = {
  // Menus
  MENU_DASHBOARD:   'menu.dashboard',
  MENU_STOCK:       'menu.stock',
  MENU_MOVEMENT:    'menu.movement',
  MENU_ALERTS:      'menu.alerts',
  MENU_VALUATION:   'menu.valuation',
  MENU_REPORTS:     'menu.reports',
  MENU_SUPPLIERS:   'menu.procurement.suppliers',
  MENU_ORDERS:      'menu.procurement.orders',
  MENU_TRANSIT:     'menu.procurement.transit',
  MENU_IMPORT:      'menu.admin.import',
  MENU_SETTINGS:    'menu.admin.settings',
  MENU_USERS:       'menu.admin.users',

  // Actions (granular)
  ACTION_IMPORT_EXECUTE: 'action.import.execute',
  ACTION_IMPORT_CLEAR:   'action.import.clear',
  ACTION_SETTINGS_EDIT:  'action.settings.edit',
  ACTION_THRESHOLDS_EDIT:'action.thresholds.edit',
  ACTION_PO_CREATE:      'action.procurement.create',
  ACTION_PO_EDIT:        'action.procurement.edit',
  ACTION_PO_DELETE:      'action.procurement.delete',
} as const;

export type PermissionKey = typeof PERMISSIONS[keyof typeof PERMISSIONS];

// ── Permission metadata (labels + grouping) ───────────────────────────────────

export const PERMISSION_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  {
    label: 'เมนูหลัก',
    keys: [
      'menu.dashboard',
      'menu.stock',
      'menu.movement',
      'menu.alerts',
      'menu.valuation',
      'menu.reports',
    ],
  },
  {
    label: 'จัดซื้อ / Procurement',
    keys: [
      'menu.procurement.suppliers',
      'menu.procurement.orders',
      'menu.procurement.transit',
      'action.procurement.create',
      'action.procurement.edit',
      'action.procurement.delete',
    ],
  },
  {
    label: 'ผู้ดูแลระบบ / Admin',
    keys: [
      'menu.admin.import',
      'action.import.execute',
      'action.import.clear',
      'menu.admin.settings',
      'action.settings.edit',
      'action.thresholds.edit',
      'menu.admin.users',
    ],
  },
];

export const PERMISSION_LABELS: Record<PermissionKey, string> = {
  'menu.dashboard':             'ดู Dashboard',
  'menu.stock':                 'ดู Stock On-Hand',
  'menu.movement':              'ดู Movement History',
  'menu.alerts':                'ดู Low Stock Alerts',
  'menu.valuation':             'ดู Cost & Valuation',
  'menu.reports':               'ดู Management Reports',
  'menu.procurement.suppliers': 'ดู Suppliers',
  'menu.procurement.orders':    'ดู Purchase Orders',
  'menu.procurement.transit':   'ดู Goods in Transit',
  'menu.admin.import':          'เข้าหน้า Data Import',
  'menu.admin.settings':        'เข้าหน้า Settings',
  'menu.admin.users':           'เข้าหน้า User Management',
  'action.import.execute':      'นำเข้าข้อมูล (Import)',
  'action.import.clear':        'ลบข้อมูลทั้งหมด (Clear All)',
  'action.settings.edit':       'แก้ไข Settings',
  'action.thresholds.edit':     'แก้ไข Stock Thresholds',
  'action.procurement.create':  'สร้าง PO / Supplier',
  'action.procurement.edit':    'แก้ไข PO / Supplier',
  'action.procurement.delete':  'ลบ PO / Supplier',
};

// ── Default permissions per role ──────────────────────────────────────────────
// Used when company admin hasn't configured custom permissions yet.

export const DEFAULT_ROLE_PERMISSIONS: Record<
  Exclude<UserRole, 'super_admin' | 'admin'>,
  PermissionKey[]
> = {
  executive: [
    'menu.dashboard',
    'menu.stock',
    'menu.movement',
    'menu.alerts',
    'menu.valuation',
    'menu.reports',
    'menu.procurement.suppliers',
    'menu.procurement.orders',
    'menu.procurement.transit',
  ],
  supervisor: [
    'menu.dashboard',
    'menu.stock',
    'menu.movement',
    'menu.alerts',
    'menu.valuation',
    'menu.reports',
    'menu.procurement.suppliers',
    'menu.procurement.orders',
    'menu.procurement.transit',
    'menu.admin.import',
    'menu.admin.settings',
    'action.import.execute',
    'action.settings.edit',
    'action.thresholds.edit',
    'action.procurement.create',
    'action.procurement.edit',
  ],
  staff: [
    'menu.dashboard',
    'menu.stock',
    'menu.alerts',
  ],
};

// ── Feature keys (super_admin controls per company) ───────────────────────────
// Same values as PERMISSIONS — used for company-level on/off switches.

export const FEATURE_GROUPS: { label: string; keys: PermissionKey[] }[] = [
  {
    label: 'โมดูลหลัก',
    keys: ['menu.dashboard', 'menu.stock', 'menu.movement', 'menu.alerts', 'menu.valuation', 'menu.reports'],
  },
  {
    label: 'จัดซื้อ',
    keys: ['menu.procurement.suppliers', 'menu.procurement.orders', 'menu.procurement.transit'],
  },
  {
    label: 'Admin Tools',
    keys: ['menu.admin.import', 'menu.admin.settings', 'menu.admin.users'],
  },
];
