export type CompanyStatus = 'active' | 'trial' | 'suspended';

export type Company = {
  id: number;
  name: string;
  slug: string;
  db_host: string;
  db_name: string;
  db_user: string;
  db_pass: string;
  status: CompanyStatus;
  logo_path: string | null;
  settings: Record<string, unknown> | null;
};

export type TenantUser = {
  id: number;
  property_id: number | null;
  name: string;
  email: string;
  avatar_url?: string | null;
  password_hash: string;
  role:
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
  is_active: number;
  must_change_password: number;
};

export type PlatformAdmin = {
  id: number;
  name: string;
  email: string;
  password_hash: string;
  is_active: number;
  must_change_password: number;
};

export type SessionPayload = {
  type: 'tenant' | 'platform' | 'guest';
  userId: number;
  userName: string;
  userEmail: string;
  userAvatarUrl?: string | null;
  userRole?: string;
  mustChangePassword?: boolean;
  companyId?: number;
  companyName?: string;
  companyLogoUrl?: string | null;
  companySlug?: string;
  guestId?: number;
  dbHost?: string;
  dbName?: string;
  dbUser?: string;
  dbPass?: string;
  propertyId?: number | null;
};

export type ApiResponse<T = unknown> = {
  success: boolean;
  data?: T;
  message?: string;
};
