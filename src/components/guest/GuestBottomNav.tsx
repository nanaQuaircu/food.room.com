'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import { useGuestCartOptional } from '@/components/guest/GuestCartContext';

export default function GuestBottomNav({ slug }: { slug: string }) {
  const pathname = usePathname();
  const cart = useGuestCartOptional();
  const base = `/${slug}`;

  const items = [
    {
      key: 'home',
      href: base,
      label: 'Home',
      icon: '⌂',
      match: (p: string) => p === base || p === `${base}/`,
    },
    {
      key: 'types',
      href: `${base}/rooms`,
      label: 'Types',
      icon: '▦',
      match: (p: string) => p.startsWith(`${base}/rooms`) || p.startsWith(`${base}/book`),
    },
    {
      key: 'menu',
      href: `${base}/menu`,
      label: 'Menu',
      icon: 'cart',
      match: (p: string) => p.startsWith(`${base}/menu`),
    },
    {
      key: 'profile',
      href: `${base}/account`,
      label: 'Profile',
      icon: '☺',
      match: (p: string) =>
        p.startsWith(`${base}/account`) ||
        p.startsWith(`${base}/trips`) ||
        p.startsWith(`${base}/orders`) ||
        p.startsWith(`${base}/contact`),
    },
  ];

  return (
    <motion.nav
      className="guest-bottom-nav"
      aria-label="Guest app navigation"
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut', delay: 0.2 }}
    >
      {items.map((item) => {
        const isActive = item.match(pathname);
        const isMenu = item.key === 'menu';
        const count = cart?.cartCount || 0;

        if (isMenu && count > 0 && isActive) {
          return (
            <motion.div
              key={item.key}
              whileTap={{ scale: 0.88 }}
              whileHover={{ scale: 1.12 }}
              transition={{ duration: 0.18 }}
            >
              <button
                type="button"
                className="guest-bottom-nav__btn active"
                aria-label={`Open cart, ${count} items`}
                onClick={() => cart?.openCart()}
              >
                <span className="guest-bottom-nav__icon guest-bottom-nav__icon--cart" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M7 7h14l-1.5 9h-11L7 7zm0 0L5.5 4H2"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="10" cy="20" r="1.4" fill="currentColor" />
                    <circle cx="17" cy="20" r="1.4" fill="currentColor" />
                  </svg>
                  <span className="guest-bottom-nav__badge">{count}</span>
                </span>
                Menu
              </button>
            </motion.div>
          );
        }

        return (
          <motion.div
            key={item.key}
            whileTap={{ scale: 0.88 }}
            whileHover={{ scale: 1.12 }}
            transition={{ duration: 0.18 }}
          >
            <Link
              href={item.href}
              className={isActive ? 'active' : undefined}
              aria-label={isMenu && count > 0 ? `Menu, ${count} in cart` : item.label}
            >
              <span
                className={`guest-bottom-nav__icon${isMenu ? ' guest-bottom-nav__icon--cart' : ''}`}
                aria-hidden="true"
              >
                {isMenu ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M7 7h14l-1.5 9h-11L7 7zm0 0L5.5 4H2"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="10" cy="20" r="1.4" fill="currentColor" />
                      <circle cx="17" cy="20" r="1.4" fill="currentColor" />
                    </svg>
                    {count > 0 ? <span className="guest-bottom-nav__badge">{count}</span> : null}
                  </>
                ) : (
                  item.icon
                )}
              </span>
              {item.label}
            </Link>
          </motion.div>
        );
      })}
    </motion.nav>
  );
}
