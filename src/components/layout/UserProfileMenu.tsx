'use client';

import Link from 'next/link';
import UserAvatar from '@/components/ui/UserAvatar';

export type ProfileMenuItem =
  | {
      type: 'link';
      href: string;
      label: string;
      icon: string;
    }
  | {
      type: 'button';
      label: string;
      icon: string;
      onClick: () => void;
    };

function formatRoleLabel(role?: string | null) {
  if (!role) return 'Staff';
  return role
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

type UserProfileMenuProps = {
  userName: string;
  userAvatarUrl?: string | null;
  userRole?: string | null;
  roleLabel?: string;
  items: ProfileMenuItem[];
  onSignOut: () => void;
};

export function UserProfileMenuTrigger({
  userName,
  userAvatarUrl,
  userRole,
  roleLabel,
}: Pick<UserProfileMenuProps, 'userName' | 'userAvatarUrl' | 'userRole' | 'roleLabel'>) {
  const role = roleLabel ?? formatRoleLabel(userRole);

  return (
    <a
      href="#"
      role="button"
      data-bs-toggle="dropdown"
      aria-expanded="false"
      className="premium-navbar-profile-trigger text-decoration-none"
    >
      <UserAvatar
        name={userName}
        imageUrl={userAvatarUrl}
        size="sm"
        variant="primary"
        className="premium-navbar-avatar"
      />
      <span className="premium-navbar-profile-trigger__meta">
        <span className="premium-navbar-profile-trigger__name">{userName}</span>
        <span className="premium-navbar-profile-trigger__role">{role}</span>
      </span>
      <i className="ti ti-chevron-down premium-navbar-profile-trigger__chevron" aria-hidden="true" />
    </a>
  );
}

export function UserProfileMenuPanel({
  userName,
  userAvatarUrl,
  userRole,
  roleLabel,
  items,
  onSignOut,
}: UserProfileMenuProps) {
  const role = roleLabel ?? formatRoleLabel(userRole);

  return (
    <div className="dropdown-menu dropdown-menu-end premium-profile-menu p-0">
      <div className="premium-profile-menu__header">
        <div className="premium-profile-menu__avatar-wrap">
          <UserAvatar name={userName} imageUrl={userAvatarUrl} size="lg" variant="primary" />
        </div>
        <div className="premium-profile-menu__identity">
          <p className="premium-profile-menu__name">{userName}</p>
          <span className="premium-profile-menu__role-badge">{role}</span>
        </div>
      </div>

      <div className="premium-profile-menu__body">
        {items.map((item) =>
          item.type === 'link' ? (
            <Link key={item.label} href={item.href} className="premium-profile-menu__item">
              <span className="premium-profile-menu__icon" aria-hidden="true">
                <i className={`ti ${item.icon}`} />
              </span>
              <span className="premium-profile-menu__label">{item.label}</span>
              <i className="ti ti-chevron-right premium-profile-menu__arrow" aria-hidden="true" />
            </Link>
          ) : (
            <button
              key={item.label}
              type="button"
              className="premium-profile-menu__item"
              onClick={item.onClick}
            >
              <span className="premium-profile-menu__icon" aria-hidden="true">
                <i className={`ti ${item.icon}`} />
              </span>
              <span className="premium-profile-menu__label">{item.label}</span>
              <i className="ti ti-chevron-right premium-profile-menu__arrow" aria-hidden="true" />
            </button>
          )
        )}
      </div>

      <div className="premium-profile-menu__footer">
        <button type="button" className="premium-profile-menu__item premium-profile-menu__item--danger" onClick={onSignOut}>
          <span className="premium-profile-menu__icon" aria-hidden="true">
            <i className="ti ti-logout" />
          </span>
          <span className="premium-profile-menu__label">Sign out</span>
        </button>
      </div>
    </div>
  );
}

export default function UserProfileMenu(props: UserProfileMenuProps) {
  return (
    <li className="ms-3 dropdown">
      <UserProfileMenuTrigger {...props} />
      <UserProfileMenuPanel {...props} />
    </li>
  );
}
