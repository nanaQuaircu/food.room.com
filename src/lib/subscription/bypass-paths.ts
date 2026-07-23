export function isSubscriptionBypassPath(pathname: string): boolean {
  return (
    pathname === '/settings' ||
    pathname.startsWith('/settings/') ||
    pathname.startsWith('/api/settings') ||
    pathname.startsWith('/api/subscription') ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/change-password'
  );
}
