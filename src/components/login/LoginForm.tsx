'use client';

import Image from 'next/image';
import { useEffect, useState, useMemo } from 'react';
import { useToast } from '@/components/ui/ToastProvider';
import { getPublicPlatformBypassLogins } from '@/lib/config';
import LoginHotelSlideshow from '@/components/login/LoginHotelSlideshow';
import {
  loadSavedHotel,
  saveSavedHotel,
  clearSavedHotel,
  type SavedHotel,
} from '@/lib/client/saved-hotel';

type Branding = { id: number; name: string; logo_url: string | null };

type Props = {
  savedCompanyId?: number;
  savedCompanyName?: string;
  initialBranding?: Branding | null;
};

export default function LoginForm({
  savedCompanyId = 0,
  savedCompanyName = '',
  initialBranding = null,
}: Props) {
  const toast = useToast();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [companyId, setCompanyId] = useState(savedCompanyId > 0 ? String(savedCompanyId) : '');
  const [companyName, setCompanyName] = useState(savedCompanyName);
  const [branding, setBranding] = useState<Branding | null>(initialBranding);
  const [brandAnimKey, setBrandAnimKey] = useState(0);
  const [configOpen, setConfigOpen] = useState(false);
  const [lookupName, setLookupName] = useState(savedCompanyName);
  const [loginError, setLoginError] = useState('');
  const [loading, setLoading] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [mounted, setMounted] = useState(false);

  const bypassLogins = useMemo(() => getPublicPlatformBypassLogins(), []);
  const isPlatformLogin = useMemo(() => {
    const normalized = login.trim().toLowerCase();
    return normalized !== '' && bypassLogins.includes(normalized);
  }, [login, bypassLogins]);

  useEffect(() => {
    setMounted(true);

    async function initConnectedHotel() {
      const saved = loadSavedHotel();
      const id = saved?.id || (savedCompanyId > 0 ? savedCompanyId : 0);

      if (saved) {
        setCompanyId(String(saved.id));
        setCompanyName(saved.name);
        setLookupName(saved.name);
        setBranding({ id: saved.id, name: saved.name, logo_url: saved.logo_url });
      } else if (savedCompanyId > 0 && initialBranding) {
        setBranding(initialBranding);
      }

      if (id > 0) {
        await refreshHotelBranding(id);
      }
    }

    void initConnectedHotel();
  }, []);

  async function refreshHotelBranding(companyId: number) {
    try {
      const res = await fetch('/api/hotel/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId }),
      });
      const json = await res.json();
      if (!json.success || !json.data) return;

      const nextBranding = json.data as Branding;
      setBranding(nextBranding);
      setCompanyId(String(nextBranding.id));
      setCompanyName(nextBranding.name);
      setLookupName(nextBranding.name);
      saveSavedHotel({
        id: nextBranding.id,
        name: nextBranding.name,
        logo_url: nextBranding.logo_url ?? null,
      });
      setBrandAnimKey((k) => k + 1);
    } catch {
      // Keep locally cached hotel if refresh fails (offline, etc.)
    }
  }

  useEffect(() => {
    if (isPlatformLogin && configOpen) {
      setConfigOpen(false);
    }
  }, [isPlatformLogin, configOpen]);

  async function handleLookup() {
    const name = lookupName.trim();
    if (!name) {
      toast.warning('Hotel name required', 'Enter your registered hotel name to continue.');
      return;
    }

    setLookupLoading(true);
    try {
      const res = await fetch('/api/hotel/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();

      if (!json.success) {
        toast.error('Hotel not found', json.message || 'No hotel matched that name.');
        return;
      }

      setBranding(json.data);
      setCompanyId(String(json.data.id));
      setCompanyName(json.data.name);
      setLookupName(json.data.name);
      saveSavedHotel({
        id: json.data.id,
        name: json.data.name,
        logo_url: json.data.logo_url ?? null,
      });
      setBrandAnimKey((k) => k + 1);
      setConfigOpen(false);
      toast.success('Hotel connected', `${json.data.name} is ready for sign in.`);
    } catch {
      toast.error('Lookup failed', 'Unable to reach the hotel registry. Please try again.');
    } finally {
      setLookupLoading(false);
    }
  }

  function removeHotel() {
    const removed = branding?.name || companyName;
    setBranding(null);
    setCompanyId('');
    setCompanyName('');
    setLookupName('');
    clearSavedHotel();
    setBrandAnimKey((k) => k + 1);
    if (removed) {
      toast.info('Hotel removed', `${removed} was cleared from this browser.`);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');

    if (!isPlatformLogin && !companyId && !companyName.trim()) {
      const message = 'Add your hotel under Hotel Configuration before signing in.';
      setLoginError(message);
      toast.warning('Hotel not configured', message);
      setConfigOpen(true);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login,
          password,
          company_id: companyId ? Number(companyId) : undefined,
          company_name: companyName,
        }),
      });
      const json = await res.json();

      if (!json.success) {
        const message = json.message || 'Invalid email or password.';
        setLoginError(message);
        toast.error('Sign in failed', message);
        return;
      }

      const rawRedirect = String(json.data.redirect || '/dashboard');
      // Stay on the Hotel PMS (Next) dashboard.
      const destination = rawRedirect.startsWith('http')
        ? rawRedirect
        : rawRedirect.startsWith('/')
          ? rawRedirect
          : `/${rawRedirect}`;
      const welcome =
        json.data.type === 'platform'
          ? 'Welcome to the platform admin.'
          : `Welcome to ${json.data.hotel || companyName || 'your hotel'}.`;

      toast.success('Signed in successfully', welcome);

      if (json.data.type === 'tenant' && companyId && companyName) {
        saveSavedHotel({
          id: Number(companyId),
          name: companyName,
          logo_url: branding?.logo_url ?? null,
        });
      }

      setExiting(true);
      // Full-page skeleton while the post-login workspace loads
      try {
        sessionStorage.setItem('pms_post_login_skeleton', '1');
      } catch {
        /* ignore */
      }
      window.setTimeout(() => {
        window.location.assign(destination);
      }, 420);
    } catch {
      const message = 'Unable to sign in right now. Check your connection and try again.';
      setLoginError(message);
      toast.error('Sign in failed', message);
    } finally {
      setLoading(false);
    }
  }

  const displayName = branding?.name || companyName;
  const hasHotel = Boolean(displayName);
  const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Hotel PMS Pro';

  function hotelLogoSrc(logoUrl: string) {
    const joiner = logoUrl.includes('?') ? '&' : '?';
    return `${logoUrl}${joiner}v=${companyId || branding?.id || '1'}`;
  }

  return (
    <div className={`login-page premium-login${mounted ? ' is-mounted' : ''}`}>
      <div className="login-page__ambient" aria-hidden="true">
        <div className="login-orb login-orb--1" />
        <div className="login-orb login-orb--2" />
        <div className="login-orb login-orb--3" />
      </div>

      <div className="login-grid">
        <aside className="login-hero">
          <LoginHotelSlideshow />
          <div className="login-hero__inner">
            <div className="login-hero__badge">
              <span className="login-hero__badge-dot" />
              Trusted by hotel teams
            </div>
            <h1 className="login-hero__title">
              Run your property with clarity and confidence.
            </h1>
            <p className="login-hero__text">
              Reservations, front desk, housekeeping, and billing — unified in one
              beautiful dashboard built for modern hospitality.
            </p>
            <div className="login-hero__stats">
              <div className="login-hero__stat">
                <div className="login-hero__stat-value">98%</div>
                <div className="login-hero__stat-label">Uptime</div>
              </div>
              <div className="login-hero__stat">
                <div className="login-hero__stat-value">24/7</div>
                <div className="login-hero__stat-label">Access</div>
              </div>
              <div className="login-hero__stat">
                <div className="login-hero__stat-value">Multi</div>
                <div className="login-hero__stat-label">Property</div>
              </div>
            </div>
          </div>
        </aside>

        <section className="login-panel">
          <div className={`login-card${exiting ? ' login-card--exit' : ''}`}>
            <div className="login-card__header">
              <div
                key={brandAnimKey}
                className={`login-brand${brandAnimKey > 0 ? ' login-brand--swap' : ''}`}
              >
                {isPlatformLogin ? (
                <>
                  <div className="login-brand__logo-fallback mx-auto">
                    <i className="ti ti-shield-lock" />
                  </div>
                  <h1 className="login-brand__title">Platform Admin</h1>
                  <p className="login-brand__subtitle">Sign in to manage all hotels</p>
                </>
              ) : hasHotel ? (
                  <>
                    {branding?.logo_url ? (
                      <img
                        src={hotelLogoSrc(branding.logo_url)}
                        alt=""
                        className="login-brand__logo"
                      />
                    ) : (
                      <div className="login-brand__logo-fallback">{displayName.charAt(0)}</div>
                    )}
                    <h1 className="login-brand__title">{displayName}</h1>
                    <p className="login-brand__subtitle">Hotel Property Management</p>
                  </>
                ) : (
                  <>
                    <Image
                      src="/assets/images/logo-icon.svg"
                      alt=""
                      width={48}
                      height={48}
                      className="login-brand__app-icon"
                    />
                    <h1 className="login-brand__title">{appName}</h1>
                    <p className="login-brand__subtitle">Sign in to your hotel workspace</p>
                  </>
                )}
              </div>
            </div>

            <div className="login-card__body">
              {isPlatformLogin && (
                <div className="login-hotel-chip" style={{ background: 'rgba(198, 163, 77, 0.18)', color: '#4a3714' }}>
                  <i className="ti ti-shield-check" />
                  Platform administrator sign-in
                </div>
              )}

              {hasHotel && !isPlatformLogin && (
                <div className="login-hotel-chip">
                  <i className="ti ti-circle-check-filled" />
                  Hotel connected
                </div>
              )}

              <form onSubmit={handleSubmit} noValidate>
                <div className="login-field">
                  <label className="login-field__label" htmlFor="login">
                    {isPlatformLogin ? 'Admin name or email' : 'Email address'}
                  </label>
                  <div className="login-field__wrap">
                    <i className={`ti ${isPlatformLogin ? 'ti-shield' : 'ti-mail'} login-field__icon`} />
                    <input
                      id="login"
                      type="text"
                      className={`login-field__input${loginError ? ' is-invalid' : ''}`}
                      value={login}
                      onChange={(e) => {
                        setLogin(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      placeholder={isPlatformLogin ? 'Alex Andoh' : 'admin@grandplaza.local'}
                      required
                      autoFocus
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="login-field">
                  <label className="login-field__label" htmlFor="password">
                    Password
                  </label>
                  <div className="login-field__wrap">
                    <i className="ti ti-lock login-field__icon" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      className={`login-field__input${loginError ? ' is-invalid' : ''}`}
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (loginError) setLoginError('');
                      }}
                      placeholder="Enter your password"
                      required
                      autoComplete="current-password"
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
                  {loginError ? <div className="login-field__error">{loginError}</div> : null}
                </div>

                <div className="login-options">
                  <div className="form-check mb-0">
                    <input className="form-check-input" type="checkbox" id="remember" />
                    <label className="form-check-label small" htmlFor="remember">
                      Remember me
                    </label>
                  </div>
                </div>

                <button type="submit" className="login-submit" disabled={loading || exiting}>
                  {loading ? (
                    <>
                      <span className="login-submit__spinner" />
                      Signing in…
                    </>
                  ) : (
                    <>
                      <i className="ti ti-login me-2" />
                      Sign in to dashboard
                    </>
                  )}
                </button>
              </form>
            </div>

            {!isPlatformLogin && (
            <div className="login-config">
              <button
                type="button"
                className="login-config__toggle"
                onClick={() => setConfigOpen((v) => !v)}
                aria-expanded={configOpen}
              >
                <span>
                  <i className="ti ti-building me-2" />
                  Hotel configuration
                </span>
                <i className={`ti ti-chevron-down login-config__chevron${configOpen ? ' is-open' : ''}`} />
              </button>

              <div className={`login-config__panel${configOpen ? ' is-open' : ''}`}>
                <div className="login-config__panel-inner">
                  <div className="login-config__content">
                    <p className="login-config__hint">
                      Enter your hotel name exactly as registered.
                    </p>
                    <div className="login-field mb-2">
                      <div className="login-field__wrap">
                        <i className="ti ti-search login-field__icon" />
                        <input
                          type="text"
                          className="login-field__input"
                          value={lookupName}
                          onChange={(e) => setLookupName(e.target.value)}
                          placeholder="Hotel name"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              void handleLookup();
                            }
                          }}
                        />
                      </div>
                    </div>
                    <div className="d-flex gap-2">
                      <button
                        type="button"
                        className="btn btn-primary flex-fill"
                        onClick={handleLookup}
                        disabled={lookupLoading || !lookupName.trim()}
                      >
                        {lookupLoading ? (
                          <>
                            <span className="login-submit__spinner" />
                            Looking up…
                          </>
                        ) : (
                          <>
                            <i className="ti ti-plus me-1" />
                            Connect hotel
                          </>
                        )}
                      </button>
                      {hasHotel && (
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={removeHotel}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            )}

            <p className="login-footer-note">
              {isPlatformLogin
                ? 'Hotel configuration is not required for platform administrators.'
                : 'Hotel staff must connect their property before signing in.'}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
