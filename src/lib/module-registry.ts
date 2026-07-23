export type ModuleScope = 'tenant' | 'platform';
export type ModuleStatus = 'live' | 'coming-soon';

export type DevModule = {
  id: string;
  title: string;
  team: string;
  loop: number;
  scope: ModuleScope;
  href: string;
  icon?: string;
  status: ModuleStatus;
  summary: string;
  features: string[];
};

function loopLabel(loop: number) {
  return `Loop ${loop}`;
}

export const TENANT_MODULES: DevModule[] = [
  {
    id: 'dashboard',
    title: 'Dashboard',
    team: 'Hotel',
    loop: 1,
    scope: 'tenant',
    href: '/dashboard',
    icon: 'ti-home',
    status: 'live',
    summary: 'Operational KPIs — occupancy, arrivals/departures, revenue today.',
    features: ['Occupancy today', 'Arrivals and departures', 'Revenue today', 'ADR and RevPAR'],
  },
  {
    id: 'reservations',
    title: 'Reservations',
    team: 'Bravo',
    loop: 2,
    scope: 'tenant',
    href: '/reservations',
    icon: 'ti-calendar-check',
    status: 'live',
    summary: 'Availability, bookings, rate plans, waitlist, and overbooking.',
    features: [
      'Create, modify, and cancel bookings',
      'Rate plans and deposits',
      'Waitlist and overbooking controls',
    ],
  },
  {
    id: 'front-desk',
    title: 'Front Desk',
    team: 'Charlie',
    loop: 1,
    scope: 'tenant',
    href: '/front-desk',
    icon: 'ti-door-enter',
    status: 'live',
    summary: 'Check-in/out, tape chart, and guest folio.',
    features: ['Quick check-in / check-out', 'Tape chart / room grid', 'Walk-in bookings', 'Guest folio view'],
  },
  {
    id: 'housekeeping',
    title: 'Housekeeping',
    team: 'Delta',
    loop: 2,
    scope: 'tenant',
    href: '/housekeeping',
    icon: 'ti-brush',
    status: 'live',
    summary: 'Room status board, tasks, and maintenance tickets.',
    features: [
      'Room status board (clean / dirty / inspected / OOO)',
      'Task assignment',
      'Maintenance tickets with OOO lifecycle',
    ],
  },
  {
    id: 'maintenance',
    title: 'Maintenance',
    team: 'Delta',
    loop: 3,
    scope: 'tenant',
    href: '/maintenance',
    icon: 'ti-tool',
    status: 'live',
    summary: 'Room and facility maintenance register with costs and repair status.',
    features: ['Maintenance register', 'Priority and status tracking', 'Cost and cash disbursement log'],
  },
  {
    id: 'rooms',
    title: 'Rooms',
    team: 'Bravo',
    loop: 1,
    scope: 'tenant',
    href: '/rooms',
    icon: 'ti-building',
    status: 'live',
    summary: 'Room types, inventory, and floor management.',
    features: ['Room types and pricing', 'Room inventory CRUD', 'Floor and status management'],
  },
  {
    id: 'guests',
    title: 'Guests',
    team: 'Golf',
    loop: 2,
    scope: 'tenant',
    href: '/guests',
    icon: 'ti-users',
    status: 'live',
    summary: 'Guest CRM, profiles, and stay history.',
    features: ['Guest profiles and stay history', 'VIP and blacklist flags', 'Preferences and special requests'],
  },
  {
    id: 'billing',
    title: 'Billing',
    team: 'Echo',
    loop: 2,
    scope: 'tenant',
    href: '/billing',
    icon: 'ti-receipt',
    status: 'live',
    summary: 'Folios, tax, invoices, refunds, and night audit.',
    features: [
      'Guest folios and room charges',
      'Tax rates and auto tax lines',
      'Invoices, refunds, and night audit',
      'Manual and Paystack payments',
    ],
  },
  {
    id: 'debtors',
    title: 'Debtors',
    team: 'Echo',
    loop: 2,
    scope: 'tenant',
    href: '/debtors',
    icon: 'ti-building-bank',
    status: 'live',
    summary: 'Corporate accounts receivable, payment log, and debtor balances.',
    features: [
      'Master ledger of unpaid corporate stays',
      'Payment log for corporate-billed folios',
      'Company CRUD and credit limits',
      'Company summary of owed / paid / balance',
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    team: 'Hotel',
    loop: 2,
    scope: 'tenant',
    href: '/reports',
    icon: 'ti-chart-bar',
    status: 'live',
    summary: 'Operational and revenue reporting.',
    features: ['Occupancy, ADR, and RevPAR', 'Departmental revenue reports', 'PDF and Excel exports'],
  },
  {
    id: 'inventory',
    title: 'Inventory',
    team: 'Lima',
    loop: 2,
    scope: 'tenant',
    href: '/inventory',
    icon: 'ti-box-seam',
    status: 'live',
    summary: 'Stock, purchase orders, and suppliers.',
    features: ['Stock levels per department', 'Purchase orders and suppliers', 'Low-stock alerts'],
  },
  {
    id: 'warehouse',
    title: 'Warehouse',
    team: 'Lima',
    loop: 2,
    scope: 'tenant',
    href: '/warehouse',
    icon: 'ti-building-warehouse',
    status: 'live',
    summary: 'Multi-location stock — warehouse, kitchen, cleaners, and front office.',
    features: [
      'Warehouse purchases and receiving',
      'Inter-location stock transfers',
      'Department usage logs',
      'Unit conversions and low-stock dashboard',
    ],
  },
  {
    id: 'restaurant',
    title: 'Restaurant',
    team: 'Hotel',
    loop: 3,
    scope: 'tenant',
    href: '/restaurant',
    icon: 'ti-tools-kitchen-2',
    status: 'live',
    summary: 'Menu management and live food order tracking.',
    features: ['Add/edit menu categories and items', 'Live orders Kanban board', 'Room service and dine-in tracking'],
  },
  {
    id: 'staff',
    title: 'Staff',
    team: 'Foxtrot',
    loop: 3,
    scope: 'tenant',
    href: '/staff',
    icon: 'ti-users-group',
    status: 'live',
    summary: 'Add team members and manage staff access.',
    features: ['Add staff with default password', 'Role assignment', 'Password reset'],
  },
  {
    id: 'attendance',
    title: 'Attendance',
    team: 'Foxtrot',
    loop: 3,
    scope: 'tenant',
    href: '/attendance',
    icon: 'ti-clock',
    status: 'live',
    summary: 'Staff clock in/out and attendance history.',
    features: ['Clock in and out', 'Today’s attendance board', 'Filterable history by staff and date'],
  },
  {
    id: 'settings',
    title: 'Settings',
    team: 'Foxtrot',
    loop: 3,
    scope: 'tenant',
    href: '/settings',
    icon: 'ti-settings',
    status: 'live',
    summary: 'Hotel profile, integrations, and subscription billing.',
    features: ['Hotel profile and branding', 'SMS / Email / guest Paystack', 'SaaS plan billing via Paystack'],
  },
  {
    id: 'contact-inquiries',
    title: 'Contact Inbox',
    team: 'Hotel',
    loop: 3,
    scope: 'tenant',
    href: '/contact-inquiries',
    icon: 'ti-mail',
    status: 'live',
    summary: 'Guest website contact form messages.',
    features: ['Inbox of guest inquiries', 'Mark read / archive', 'Reply by email and staff notes'],
  },
];

export const PLATFORM_MODULES: DevModule[] = [
  {
    id: 'platform-dashboard',
    title: 'Platform Dashboard',
    team: 'Kilo',
    loop: 0,
    scope: 'platform',
    href: '/platform',
    icon: 'ti-shield-lock',
    status: 'live',
    summary: 'Platform health, hotel stats, and provisioning.',
    features: ['Hotel counts and MRR overview', 'Provision new hotels', 'Recent signups chart'],
  },
  {
    id: 'platform-hotels',
    title: 'Hotels',
    team: 'Kilo',
    loop: 0,
    scope: 'platform',
    href: '/platform/hotels',
    icon: 'ti-building',
    status: 'live',
    summary: 'Registered tenant hotels on the platform.',
    features: ['List all hotels', 'View database and status', 'Onboard new properties'],
  },
  {
    id: 'platform-plans',
    title: 'Subscription Plans',
    team: 'Kilo',
    loop: 3,
    scope: 'platform',
    href: '/platform/plans',
    icon: 'ti-layers-subtract',
    status: 'live',
    summary: 'SaaS plans, trials, and Paystack subscription billing.',
    features: [
      'Starter, Professional, and Enterprise tiers',
      'Trial and grace-period handling',
      'Paystack subscription payments and webhook',
      'Plan assignment per hotel',
    ],
  },
  {
    id: 'platform-settings',
    title: 'Settings',
    team: 'Kilo',
    loop: 3,
    scope: 'platform',
    href: '/platform/settings',
    icon: 'ti-settings',
    status: 'live',
    summary: 'Platform Paystack keys for tenant subscription billing.',
    features: [
      'Paste public and secret Paystack keys',
      'Webhook secret for subscription confirmations',
      'Test or live mode',
    ],
  },
];

export function getTenantModule(id: string) {
  return TENANT_MODULES.find((m) => m.id === id);
}

export function getPlatformModule(id: string) {
  return PLATFORM_MODULES.find((m) => m.id === id);
}

export function formatModuleAssignment(module: DevModule) {
  return `Team ${module.team} · ${loopLabel(module.loop)}`;
}

/** Sidebar nav groups — module ids must exist in TENANT_MODULES. */
export type TenantNavGroup = {
  id: string;
  label: string;
  icon: string;
  moduleIds: string[];
};

export const TENANT_NAV_TOP_IDS = ['dashboard'] as const;

export const TENANT_NAV_GROUPS: TenantNavGroup[] = [
  {
    id: 'operations',
    label: 'Operations',
    icon: 'ti-door-enter',
    moduleIds: ['reservations', 'front-desk', 'rooms', 'guests'],
  },
  {
    id: 'property',
    label: 'Property',
    icon: 'ti-building',
    moduleIds: ['housekeeping', 'maintenance'],
  },
  {
    id: 'finance',
    label: 'Finance',
    icon: 'ti-receipt',
    moduleIds: ['billing', 'debtors', 'reports'],
  },
  {
    id: 'fnb-stock',
    label: 'F&B & Stock',
    icon: 'ti-tools-kitchen-2',
    moduleIds: ['restaurant', 'inventory', 'warehouse'],
  },
  {
    id: 'people',
    label: 'People',
    icon: 'ti-users-group',
    moduleIds: ['staff', 'attendance'],
  },
  {
    id: 'system',
    label: 'System',
    icon: 'ti-settings',
    moduleIds: ['contact-inquiries', 'settings'],
  },
];

