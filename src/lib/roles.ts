export type TenantRole =
  | 'owner'
  | 'admin'
  | 'manager'
  | 'front_desk'
  | 'housekeeping'
  | 'finance'
  | 'cook'
  | 'chef'
  | 'kitchen_supervisor'
  | 'security'
  | 'driver';

const TENANT_ROLES: TenantRole[] = [
  'owner',
  'admin',
  'manager',
  'front_desk',
  'housekeeping',
  'finance',
  'cook',
  'chef',
  'kitchen_supervisor',
  'security',
  'driver',
];

/** Module IDs align with `TENANT_MODULES` in module-registry.ts */
export const MODULE_ACCESS: Record<string, TenantRole[]> = {
  dashboard: ['owner'],
  reservations: ['owner', 'admin', 'manager', 'front_desk'],
  'front-desk': ['owner', 'admin', 'manager', 'front_desk'],
  housekeeping: ['owner', 'admin', 'manager', 'front_desk', 'housekeeping'],
  maintenance: ['owner', 'admin', 'manager', 'front_desk', 'housekeeping', 'kitchen_supervisor'],
  rooms: ['owner', 'admin', 'manager', 'front_desk', 'housekeeping'],
  guests: ['owner', 'admin', 'manager', 'front_desk', 'finance'],
  billing: ['owner', 'admin', 'manager', 'front_desk', 'finance'],
  debtors: ['owner', 'admin', 'manager', 'front_desk', 'finance'],
  reports: ['owner', 'admin', 'manager', 'finance'],
  inventory: ['owner', 'admin', 'manager', 'kitchen_supervisor'],
  warehouse: ['owner', 'admin', 'manager', 'kitchen_supervisor', 'housekeeping', 'front_desk'],
  restaurant: ['owner', 'admin', 'manager', 'front_desk', 'cook', 'chef', 'kitchen_supervisor'],
  staff: ['owner', 'admin'],
  attendance: [
    'owner',
    'admin',
    'manager',
    'front_desk',
    'housekeeping',
    'finance',
    'cook',
    'chef',
    'kitchen_supervisor',
    'security',
    'driver',
  ],
  settings: ['owner'],
  'contact-inquiries': ['owner', 'admin', 'manager', 'front_desk'],
  integrations: ['owner'],
  'property-settings': ['owner'],
};

export const PROPERTY_SETTINGS_ROLES: TenantRole[] = ['owner'];
export const INTEGRATION_SETTINGS_ROLES: TenantRole[] = ['owner'];
export const STAFF_MANAGEMENT_ROLES: TenantRole[] = ['owner', 'admin'];
export const ATTENDANCE_ADMIN_ROLES: TenantRole[] = ['owner', 'admin', 'manager'];
export const DASHBOARD_ROLES: TenantRole[] = ['owner'];
export const SETTINGS_ROLES: TenantRole[] = ['owner'];

const PATH_TO_MODULE: Array<{ prefix: string; moduleId: string }> = [
  { prefix: '/dashboard', moduleId: 'dashboard' },
  { prefix: '/reservations', moduleId: 'reservations' },
  { prefix: '/front-desk', moduleId: 'front-desk' },
  { prefix: '/housekeeping', moduleId: 'housekeeping' },
  { prefix: '/maintenance', moduleId: 'maintenance' },
  { prefix: '/rooms', moduleId: 'rooms' },
  { prefix: '/guests', moduleId: 'guests' },
  { prefix: '/billing', moduleId: 'billing' },
  { prefix: '/debtors', moduleId: 'debtors' },
  { prefix: '/reports', moduleId: 'reports' },
  { prefix: '/inventory', moduleId: 'inventory' },
  { prefix: '/warehouse', moduleId: 'warehouse' },
  { prefix: '/restaurant', moduleId: 'restaurant' },
  { prefix: '/staff', moduleId: 'staff' },
  { prefix: '/attendance', moduleId: 'attendance' },
  { prefix: '/settings', moduleId: 'settings' },
  { prefix: '/contact-inquiries', moduleId: 'contact-inquiries' },
  { prefix: '/api/contact-inquiries', moduleId: 'contact-inquiries' },
  { prefix: '/api/reports', moduleId: 'reports' },
  { prefix: '/api/inventory', moduleId: 'inventory' },
  { prefix: '/api/warehouse', moduleId: 'warehouse' },
  { prefix: '/api/front-desk', moduleId: 'front-desk' },
  { prefix: '/api/maintenance', moduleId: 'maintenance' },
  { prefix: '/api/food-orders', moduleId: 'restaurant' },
  { prefix: '/api/restaurant', moduleId: 'restaurant' },
  { prefix: '/api/payments/paystack', moduleId: 'billing' },
  { prefix: '/api/billing', moduleId: 'billing' },
  { prefix: '/api/debtors', moduleId: 'debtors' },
  { prefix: '/api/settings/users', moduleId: 'staff' },
  { prefix: '/api/attendance', moduleId: 'attendance' },
  { prefix: '/api/workers', moduleId: 'attendance' },
  { prefix: '/api/settings/integrations', moduleId: 'integrations' },
  { prefix: '/api/settings/property', moduleId: 'property-settings' },
  { prefix: '/api/settings/subscription', moduleId: 'settings' },
];

export function normalizeRole(role?: string | null): TenantRole | '' {
  const r = String(role || '').trim() as TenantRole;
  return TENANT_ROLES.includes(r) ? r : '';
}

export function canAccessModule(role: string | undefined | null, moduleId: string): boolean {
  const allowed = MODULE_ACCESS[moduleId];
  if (!allowed) return false;
  const normalized = normalizeRole(role);
  if (!normalized) return false;
  return allowed.includes(normalized);
}

export function moduleIdFromPath(pathname: string): string | null {
  const path = pathname.split('?')[0];
  for (const { prefix, moduleId } of PATH_TO_MODULE) {
    if (path === prefix || path.startsWith(`${prefix}/`)) {
      return moduleId;
    }
  }
  return null;
}

export function hasAnyRole(role: string | undefined | null, roles: TenantRole[]): boolean {
  const normalized = normalizeRole(role);
  return Boolean(normalized && roles.includes(normalized));
}

export function filterModulesForRole<T extends { id: string }>(
  modules: T[],
  role: string | undefined | null
): T[] {
  return modules.filter((m) => canAccessModule(role, m.id));
}

/** Default landing page after tenant login, by role. */
export function getHomePathForRole(role?: string | null): string {
  const normalized = normalizeRole(role);
  switch (normalized) {
    case 'owner':
      return '/dashboard';
    case 'front_desk':
      return '/front-desk';
    case 'housekeeping':
      return '/housekeeping';
    case 'finance':
      return '/billing';
    case 'cook':
    case 'chef':
    case 'kitchen_supervisor':
      return '/restaurant';
    case 'security':
    case 'driver':
      return '/attendance';
    case 'admin':
    case 'manager':
      return '/front-desk';
    default:
      return '/front-desk';
  }
}
