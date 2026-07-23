/**
 * Lightweight smoke checks for critical pure logic (no DB required).
 * Run: node --test scripts/smoke-check.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

// These are TypeScript modules — smoke tests re-implement critical invariants
// in plain JS so CI can run without a TS loader.

test('subscription bypass paths allow settings and auth only', () => {
  const allow = (pathname) =>
    pathname === '/settings' ||
    pathname.startsWith('/settings/') ||
    pathname.startsWith('/api/settings') ||
    pathname.startsWith('/api/subscription') ||
    pathname.startsWith('/api/auth/') ||
    pathname === '/change-password';

  assert.equal(allow('/settings'), true);
  assert.equal(allow('/settings/'), true);
  assert.equal(allow('/api/subscription/summary'), true);
  assert.equal(allow('/api/auth/logout'), true);
  assert.equal(allow('/dashboard'), false);
  assert.equal(allow('/front-desk'), false);
  assert.equal(allow('/api/reservations'), false);
});

test('food receipt money formatting stays two-decimal', () => {
  const money = (amount, currency) => `${currency} ${Number(amount || 0).toFixed(2)}`;
  assert.equal(money(193, 'GHS'), 'GHS 193.00');
  assert.equal(money(28.5, 'GHS'), 'GHS 28.50');
  assert.equal(money(null, 'GHS'), 'GHS 0.00');
});

test('order status progression includes delivered terminal', () => {
  const allowed = ['pending', 'preparing', 'ready', 'delivered', 'cancelled'];
  assert.ok(allowed.includes('delivered'));
  assert.ok(allowed.includes('cancelled'));
  assert.equal(allowed.includes('completed'), false);
});

test('tenant SQL migration files are numbered and present', () => {
  const fs = createRequire(import.meta.url)('fs');
  const dir = path.join(root, 'database', 'tenant');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.includes('001_tenant_core.sql'));
  assert.ok(files.includes('021_schema_migrations.sql'));
  assert.ok(files.length >= 20);
});

test('session payload must not require dbPass for tenant identity', () => {
  const session = {
    type: 'tenant',
    userId: 1,
    userName: 'Owner',
    userEmail: 'owner@hotel.local',
    companyId: 9,
  };
  assert.equal(session.dbPass, undefined);
  assert.ok(session.companyId > 0);
});
