'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/ToastProvider';
import { useConfirm } from '@/components/ui/ConfirmProvider';
import {
  PremiumPage,
  PageHeader,
  PremiumCard,
  PremiumTabs,
  LoadingState,
} from '@/components/ui/premium';
import { fetchApi } from '@/lib/client/fetch-api';
import UserAvatar from '@/components/ui/UserAvatar';
import SettingsIntegrations from '@/components/modules/SettingsIntegrations';
import SettingsSubscription from '@/components/modules/SettingsSubscription';

type Property = {
  id: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  currency: string | null;
  attendance_latitude: number | null;
  attendance_longitude: number | null;
  attendance_radius_m: number | null;
};

type Profile = {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
};

export default function SettingsModule() {
  const toast = useToast();
  const confirm = useConfirm();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<'property' | 'profile' | 'integrations' | 'subscription'>('profile');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [hotelLogoUrl, setHotelLogoUrl] = useState<string | null>(null);
  const [property, setProperty] = useState<Property | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [propertyForm, setPropertyForm] = useState({
    name: '',
    address: '',
    phone: '',
    email: '',
    timezone: '',
    currency: '',
    attendance_latitude: '',
    attendance_longitude: '',
    attendance_radius_m: '',
  });
  const [profileForm, setProfileForm] = useState({ name: '' });

  const loadProperty = useCallback(async () => {
    const res = await fetchApi<Property>('/api/settings/property');
    if (!res.success) {
      toast.error('Failed to load property', res.message);
      return;
    }
    const p = res.data;
    if (p) {
      setProperty(p);
      setPropertyForm({
        name: p.name || '',
        address: p.address || '',
        phone: p.phone || '',
        email: p.email || '',
        timezone: p.timezone || '',
        currency: p.currency || '',
        attendance_latitude:
          p.attendance_latitude != null ? String(p.attendance_latitude) : '',
        attendance_longitude:
          p.attendance_longitude != null ? String(p.attendance_longitude) : '',
        attendance_radius_m:
          p.attendance_radius_m != null ? String(p.attendance_radius_m) : '',
      });
    }
  }, [toast]);

  const loadProfile = useCallback(async () => {
    const res = await fetchApi<Profile>('/api/settings/profile');
    if (!res.success) {
      toast.error('Failed to load profile', res.message);
      return;
    }
      if (res.data) {
      setProfile(res.data);
      setProfileForm({ name: res.data.name });
    }
  }, [toast]);

  const loadLogo = useCallback(async () => {
    const res = await fetchApi<{ logo_url: string | null }>('/api/settings/logo');
    if (res.success && res.data) {
      setHotelLogoUrl(res.data.logo_url);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadProperty(), loadProfile(), loadLogo()]);
    setLoading(false);
  }, [loadProperty, loadProfile, loadLogo]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('tab');
    if (requested === 'subscription' || requested === 'property' || requested === 'integrations') {
      setTab(requested);
    }
  }, []);

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.warning('Invalid file', 'Please choose a JPG, PNG, WebP, or SVG image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.warning('File too large', 'Maximum size is 2 MB.');
      return;
    }

    setLogoUploading(true);
    try {
      const body = new FormData();
      body.append('logo', file);
      const res = await fetch('/api/settings/logo', { method: 'POST', body });
      const json = await res.json();
      if (!json.success) {
        toast.error('Upload failed', json.message);
        return;
      }
      toast.success('Hotel logo updated', 'Logo will appear on the login page and sidebar.');
      setHotelLogoUrl(json.data?.logo_url ?? null);
      router.refresh();
    } catch {
      toast.error('Upload failed');
    } finally {
      setLogoUploading(false);
      if (logoRef.current) logoRef.current.value = '';
    }
  }

  async function handleRemoveLogo() {
    const ok = await confirm({
      title: 'Remove hotel logo',
      message: 'Remove the hotel logo from the login page and sidebar?',
      confirmLabel: 'Remove logo',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      const res = await fetchApi('/api/settings/logo', { method: 'DELETE' });
      if (!res.success) {
        toast.error('Remove failed', res.message);
        return;
      }
      toast.info('Logo removed');
      setHotelLogoUrl(null);
      router.refresh();
    } catch {
      toast.error('Remove failed');
    }
  }

  async function handleSaveProperty(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi<Property>('/api/settings/property', {
        method: 'PATCH',
        body: JSON.stringify(propertyForm),
      });
      if (!res.success) {
        toast.error('Failed to save property', res.message);
        return;
      }
      toast.success('Property settings saved');
      if (res.data) setProperty(res.data);
      router.refresh();
    } catch {
      toast.error('Failed to save property');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetchApi<Profile>('/api/settings/profile', {
        method: 'PATCH',
        body: JSON.stringify(profileForm),
      });
      if (!res.success) {
        toast.error('Failed to save profile', res.message);
        return;
      }
      toast.success('Profile updated');
      if (res.data) setProfile(res.data);
      router.refresh();
    } catch {
      toast.error('Failed to save profile');
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.warning('Invalid file', 'Please choose a JPG, PNG, or WebP image.');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.warning('File too large', 'Maximum size is 2 MB.');
      return;
    }

    setUploading(true);
    try {
      const body = new FormData();
      body.append('avatar', file);
      const res = await fetch('/api/settings/profile', { method: 'POST', body });
      const json = await res.json();
      if (!json.success) {
        toast.error('Upload failed', json.message);
        return;
      }
      toast.success('Profile photo updated');
      await loadProfile();
      router.refresh();
    } catch {
      toast.error('Upload failed');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  const canEditProperty =
    profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'manager';
  const canManageIntegrations =
    profile?.role === 'owner' || profile?.role === 'admin';

  const settingsTabs = [
    ...(canEditProperty ? [{ id: 'property', label: 'Property' }] : []),
    { id: 'profile', label: 'My Profile' },
    { id: 'subscription', label: 'Subscription' },
    ...(canManageIntegrations ? [{ id: 'integrations', label: 'SMS / Email / Paystack' }] : []),
  ];

  return (
    <PremiumPage>
      <PageHeader
        title="Settings"
        subtitle="Property configuration, integrations, and your personal profile."
        icon="ti-settings"
      />

      <PremiumTabs
        tabs={settingsTabs}
        active={tab}
        onChange={(id) => setTab(id as 'property' | 'profile' | 'integrations' | 'subscription')}
      />

      {loading && tab !== 'integrations' && tab !== 'subscription' ? (
        <PremiumCard>
          <LoadingState label="Loading…" />
        </PremiumCard>
      ) : tab === 'subscription' ? (
        <SettingsSubscription />
      ) : tab === 'integrations' ? (
        <SettingsIntegrations />
      ) : tab === 'property' ? (
        <>
          <PremiumCard title="Hotel logo">
            <p className="text-muted small mb-3">
              Shown on the login page when guests connect your hotel, and in the app sidebar.
            </p>
            <div className="d-flex flex-wrap align-items-center gap-4">
              {hotelLogoUrl ? (
                <img
                  src={hotelLogoUrl}
                  alt=""
                  width={72}
                  height={72}
                  style={{ objectFit: 'contain', borderRadius: 12, border: '1px solid #e5e7eb' }}
                />
              ) : (
                <div
                  className="d-flex align-items-center justify-content-center text-muted"
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 12,
                    border: '1px dashed #d4d4d8',
                    fontSize: '0.8rem',
                  }}
                >
                  No logo
                </div>
              )}
              <div>
                <p className="mb-2 text-muted small">JPG, PNG, WebP or SVG · max 2 MB</p>
                <input
                  ref={logoRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/svg+xml"
                  className="d-none"
                  onChange={handleLogoChange}
                />
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="btn btn-premium-outline btn-sm"
                    disabled={logoUploading}
                    onClick={() => logoRef.current?.click()}
                  >
                    {logoUploading ? 'Uploading…' : hotelLogoUrl ? 'Change logo' : 'Upload logo'}
                  </button>
                  {hotelLogoUrl ? (
                    <button
                      type="button"
                      className="btn btn-outline-danger btn-sm"
                      disabled={logoUploading}
                      onClick={() => void handleRemoveLogo()}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </PremiumCard>
          <PremiumCard title="Property settings">
          <form className="premium-form" onSubmit={handleSaveProperty}>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Property name</label>
                <input
                  className="form-control"
                  value={propertyForm.name}
                  onChange={(e) => setPropertyForm({ ...propertyForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Currency</label>
                <input
                  className="form-control"
                  value={propertyForm.currency}
                  onChange={(e) => setPropertyForm({ ...propertyForm, currency: e.target.value })}
                  placeholder="GHS"
                />
              </div>
              <div className="col-12">
                <label className="form-label">Address</label>
                <textarea
                  className="form-control"
                  rows={2}
                  value={propertyForm.address}
                  onChange={(e) => setPropertyForm({ ...propertyForm, address: e.target.value })}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Phone</label>
                <input
                  className="form-control"
                  value={propertyForm.phone}
                  onChange={(e) => setPropertyForm({ ...propertyForm, phone: e.target.value })}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Email</label>
                <input
                  type="email"
                  className="form-control"
                  value={propertyForm.email}
                  onChange={(e) => setPropertyForm({ ...propertyForm, email: e.target.value })}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Timezone</label>
                <input
                  className="form-control"
                  value={propertyForm.timezone}
                  onChange={(e) => setPropertyForm({ ...propertyForm, timezone: e.target.value })}
                  placeholder="Africa/Accra"
                />
              </div>
              <div className="col-12">
                <hr className="my-1" />
                <h3 className="h6 mb-2">Attendance location</h3>
                <p className="small text-muted mb-3">
                  Set the hotel coordinates and allowed distance so staff must be on-site to clock in or
                  out. Leave blank to allow clock-in from anywhere.
                </p>
              </div>
              <div className="col-md-4">
                <label className="form-label">Latitude</label>
                <input
                  type="number"
                  step="any"
                  className="form-control font-monospace"
                  value={propertyForm.attendance_latitude}
                  onChange={(e) =>
                    setPropertyForm({ ...propertyForm, attendance_latitude: e.target.value })
                  }
                  placeholder="5.6037"
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Longitude</label>
                <input
                  type="number"
                  step="any"
                  className="form-control font-monospace"
                  value={propertyForm.attendance_longitude}
                  onChange={(e) =>
                    setPropertyForm({ ...propertyForm, attendance_longitude: e.target.value })
                  }
                  placeholder="-0.1870"
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Allowed distance (meters)</label>
                <input
                  type="number"
                  min={1}
                  className="form-control"
                  value={propertyForm.attendance_radius_m}
                  onChange={(e) =>
                    setPropertyForm({ ...propertyForm, attendance_radius_m: e.target.value })
                  }
                  placeholder="100"
                />
              </div>
              <div className="col-12">
                <button type="submit" className="btn btn-premium" disabled={saving}>
                  {saving ? 'Saving…' : 'Save property'}
                </button>
                {property ? (
                  <span className="text-muted ms-3 small">Property ID: {property.id}</span>
                ) : null}
              </div>
            </div>
          </form>
        </PremiumCard>
        </>
      ) : (
        <PremiumCard title="My profile">
          <div className="d-flex flex-wrap align-items-center gap-4 mb-4">
            <UserAvatar
              name={profile?.name || 'User'}
              imageUrl={profile?.avatar_url}
              size="xl"
              variant="primary"
            />
            <div>
              <p className="mb-2 text-muted small">JPG, PNG or WebP · max 2 MB</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="d-none"
                onChange={handleAvatarChange}
              />
              <button
                type="button"
                className="btn btn-premium-outline"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              >
                {uploading ? 'Uploading…' : 'Upload photo'}
              </button>
            </div>
          </div>
          <form className="premium-form" onSubmit={handleSaveProfile}>
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Display name</label>
                <input
                  className="form-control"
                  value={profileForm.name}
                  onChange={(e) => setProfileForm({ name: e.target.value })}
                  required
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Email</label>
                <input className="form-control" value={profile?.email || ''} disabled readOnly />
              </div>
              <div className="col-md-6">
                <label className="form-label">Role</label>
                <input
                  className="form-control text-capitalize"
                  value={profile?.role?.replace(/_/g, ' ') || ''}
                  disabled
                  readOnly
                />
              </div>
              <div className="col-12">
                <button type="submit" className="btn btn-premium" disabled={saving}>
                  {saving ? 'Saving…' : 'Save profile'}
                </button>
              </div>
            </div>
          </form>
        </PremiumCard>
      )}
    </PremiumPage>
  );
}
