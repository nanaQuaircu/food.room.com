'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/ToastProvider';
import { fetchApi } from '@/lib/client/fetch-api';
import UserAvatar from '@/components/ui/UserAvatar';

type Profile = {
  id: number;
  name: string;
  email: string;
  role: string;
  avatar_url: string | null;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

export default function AccountSettingsModal({ open, onClose }: Props) {
  const toast = useToast();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileForm, setProfileForm] = useState({ name: '' });

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchApi<Profile>('/api/settings/profile');
      if (!res.success) {
        toast.error('Failed to load profile', res.message);
        return;
      }
      if (res.data) {
        setProfile(res.data);
        setProfileForm({ name: res.data.name });
      }
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (open) void loadProfile();
  }, [open, loadProfile]);

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

  if (!open) return null;

  return (
    <>
      <div className="modal fade show d-block" tabIndex={-1} role="dialog" aria-modal="true">
        <div className="modal-dialog modal-dialog-centered modal-lg">
          <div className="modal-content">
            <div className="modal-header">
              <h5 className="modal-title">Account settings</h5>
              <button type="button" className="btn-close" aria-label="Close" onClick={onClose} />
            </div>
            <div className="modal-body">
              {loading ? (
                <div className="text-center py-4 text-muted">Loading profile…</div>
              ) : (
                <>
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
                        className="btn btn-premium-outline btn-sm"
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
                    </div>
                    <div className="modal-footer px-0 pb-0 mt-4">
                      <button type="button" className="btn btn-outline-secondary" onClick={onClose}>
                        Close
                      </button>
                      <button type="submit" className="btn btn-premium" disabled={saving}>
                        {saving ? 'Saving…' : 'Save profile'}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="modal-backdrop fade show" onClick={onClose} aria-hidden="true" />
    </>
  );
}
