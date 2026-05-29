// ── Role types ───────────────────────────────────────────────────────────────

export type UserRole = 'super_admin' | 'admin' | 'executive' | 'supervisor' | 'staff';

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'Super Admin',
  admin:       'Admin',
  executive:   'Executive',
  supervisor:  'Supervisor',
  staff:       'Staff',
};

// Filled, high-contrast role badges. Solid background + white text guarantees
// readability across light/dark themes and prevents the washed-out look caused
// by tinted text on tinted background.
export const ROLE_COLORS: Record<UserRole, string> = {
  super_admin: 'bg-purple-600 text-white font-semibold ring-1 ring-purple-700/20 dark:bg-purple-500',
  admin:       'bg-blue-600   text-white font-semibold ring-1 ring-blue-700/20   dark:bg-blue-500',
  executive:   'bg-amber-600  text-white font-semibold ring-1 ring-amber-700/20  dark:bg-amber-500',
  supervisor:  'bg-emerald-600 text-white font-semibold ring-1 ring-emerald-700/20 dark:bg-emerald-500',
  staff:       'bg-slate-600  text-white font-semibold ring-1 ring-slate-700/20  dark:bg-slate-500',
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
  /** TRUE after admin-issued credentials (create or reset). User is forced to
   *  set a new password before they can use the app. Cleared by the
   *  clear_must_change_password() RPC after successful self-change. */
  must_change_password: boolean;
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
  MENU_LOTS:        'menu.lots',
  MENU_SMART_REPORT:'menu.smart_report',
  MENU_ASK_ME:      'menu.ask_me',
  MENU_IMPORT:      'menu.admin.import',
  MENU_SETTINGS:    'menu.admin.settings',
  MENU_USERS:       'menu.admin.users',
  MENU_AUDIT:       'menu.admin.audit',

  // Actions (granular)
  ACTION_IMPORT_EXECUTE: 'action.import.execute',
  ACTION_IMPORT_CLEAR:   'action.import.clear',
  ACTION_SETTINGS_EDIT:  'action.settings.edit',
  ACTION_THRESHOLDS_EDIT:'action.thresholds.edit',
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
      'menu.lots',
      'menu.smart_report',
      'menu.ask_me',
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
      'menu.admin.audit',
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
  'menu.lots':                  'ดู Lot Inventory',
  'menu.smart_report':          'ดู Smart Report (AI)',
  'menu.ask_me':                'ใช้ Ask Me (AI Chat)',
  'menu.admin.import':          'เข้าหน้า Data Import',
  'menu.admin.settings':        'เข้าหน้า Settings',
  'menu.admin.users':           'เข้าหน้า User Management',
  'menu.admin.audit':           'เข้าหน้า Audit Log',
  'action.import.execute':      'นำเข้าข้อมูล (Import)',
  'action.import.clear':        'ลบข้อมูลทั้งหมด (Clear All)',
  'action.settings.edit':       'แก้ไข Settings',
  'action.thresholds.edit':     'แก้ไข Stock Thresholds',
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
    'menu.lots',
    'menu.smart_report',
    'menu.ask_me',
  ],
  supervisor: [
    'menu.dashboard',
    'menu.stock',
    'menu.movement',
    'menu.alerts',
    'menu.valuation',
    'menu.reports',
    'menu.lots',
    'menu.smart_report',
    'menu.ask_me',
    'menu.admin.import',
    'menu.admin.settings',
    'action.import.execute',
    'action.settings.edit',
    'action.thresholds.edit',
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
    keys: ['menu.dashboard', 'menu.stock', 'menu.movement', 'menu.alerts', 'menu.valuation', 'menu.reports', 'menu.lots', 'menu.smart_report', 'menu.ask_me'],
  },
  {
    label: 'Admin Tools',
    keys: ['menu.admin.import', 'menu.admin.settings', 'menu.admin.users', 'menu.admin.audit'],
  },
];
