'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/ToastProvider';
import { DEFAULT_PASSWORD } from '@/lib/config';

export default function ChangePasswordForm({ userName }: { userName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password, confirm_password: confirm }),
      });
      const json = await res.json();
      if (!json.success) {
        toast.error('Password update failed', json.message);
        return;
      }
      toast.success('Password updated', json.message);
      router.push(json.data.redirect);
      router.refresh();
    } catch {
      toast.error('Password update failed', 'Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page premium-login">
      <div className="login-page__ambient" aria-hidden="true">
        <div className="login-orb login-orb--1" />
        <div className="login-orb login-orb--2" />
      </div>
      <div className="login-panel" style={{ minHeight: '100vh', width: '100%' }}>
        <div className="login-card premium-card mx-auto" style={{ maxWidth: 460 }}>
          <div className="premium-card__body">
            <div className="text-center mb-4">
              <div className="premium-page-header__icon mx-auto mb-3">
                <i className="ti ti-lock" />
              </div>
              <h1 className="premium-page-header__title h4">Change your password</h1>
              <p className="premium-page-header__subtitle">Hi {userName}, set a new password to continue.</p>
            </div>
            <p className="small text-muted mb-3">
              You cannot keep the default password ({DEFAULT_PASSWORD}). Choose at least 8 characters.
            </p>
            <form className="premium-form" onSubmit={handleSubmit}>
              <div className="login-field mb-3">
                <label className="login-field__label" htmlFor="password">
                  New password
                </label>
                <div className="login-field__wrap">
                  <i className="ti ti-lock login-field__icon" />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className="login-field__input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    style={{ paddingRight: '2.75rem' }}
                  />
                  <button
                    type="button"
                    className="login-field__toggle"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <i className={`ti ${showPassword ? 'ti-eye-off' : 'ti-eye'}`} />
                  </button>
                </div>
              </div>
              <div className="login-field mb-3">
                <label className="login-field__label" htmlFor="confirm">
                  Confirm password
                </label>
                <div className="login-field__wrap">
                  <i className="ti ti-lock login-field__icon" />
                  <input
                    id="confirm"
                    type={showConfirm ? 'text' : 'password'}
                    className="login-field__input"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    style={{ paddingRight: '2.75rem' }}
                  />
                  <button
                    type="button"
                    className="login-field__toggle"
                    onClick={() => setShowConfirm((v) => !v)}
                    aria-label={showConfirm ? 'Hide password' : 'Show password'}
                  >
                    <i className={`ti ${showConfirm ? 'ti-eye-off' : 'ti-eye'}`} />
                  </button>
                </div>
              </div>
              <button type="submit" className="btn btn-premium w-100" disabled={loading}>
                {loading ? 'Updating…' : 'Update password'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
