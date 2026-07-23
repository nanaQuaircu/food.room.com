# Hotel PMS — Loop Engineering Development Plan

> **Pattern:** Washbay-style multi-tenant SaaS (central registry + database-per-hotel)  
> **Stack:** Next.js 16 · MySQL · InApp (ThemeWagon) dashboard UI  
> **Method:** Loop engineering — parallel dev teams ship modules each loop, integrate, then advance.

---

## Developer Teams

| Team | Codename | Owns | Lead modules |
|------|----------|------|--------------|
| **A** | Alpha | Platform & multi-tenancy | Central DB, tenant switching, provisioning, middleware |
| **B** | Bravo | Reservations | Availability, bookings, rate plans, waitlist |
| **C** | Charlie | Front desk | Check-in/out, folio, tape chart, walk-ins |
| **D** | Delta | Housekeeping | Room status, tasks, maintenance tickets |
| **E** | Echo | Billing & finance | Folios, payments, taxes, night audit |
| **F** | Foxtrot | UI/UX & shell | InApp template port, layout, components, theming |
| **G** | Golf | Guest CRM | Profiles, preferences, loyalty, segmentation |
| **H** | Hotel | Reporting | KPIs, dashboards, exports, forecasting |
| **I** | India | Integrations | Email/SMS, payment gateways, APIs, locks |
| **J** | Juliet | Security & compliance | RBAC, audit logs, 2FA, encryption, backups |
| **K** | Kilo | Platform admin | Super-admin, subscriptions, hotel onboarding |
| **L** | Lima | Inventory & procurement | Stock, POs, suppliers, low-stock alerts |
| **M** | Mike | POS & F&B | Outlets, charge-to-room, menus |
| **N** | November | Channel & distribution | OTAs, booking engine, rate sync |

---

## Loop Engineering Model

Each **loop** = one integration cycle (target: 2–3 weeks).

```
┌─────────────────────────────────────────────────────────────┐
│  LOOP N                                                      │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐           │
│  │ Team A  │ │ Team B  │ │ Team C  │ │ Team …  │  parallel│
│  └────┬────┘ └────┬────┘ └────┬────┘ └────┬────┘           │
│       └───────────┴───────────┴───────────┘                 │
│                         │ integrate + test                  │
│                         ▼                                     │
│                  LOOP N+1 backlog                             │
└─────────────────────────────────────────────────────────────┘
```

**Rules per loop:**
1. Each team ships against agreed API contracts (`src/lib/contracts/`).
2. No cross-team DB changes without Alpha review.
3. Every feature needs: migration, API route, UI page, RBAC check.
4. Demo hotel tenant must work end-to-end before loop closes.

---

## LOOP 0 — Foundation (current)

**Goal:** Runnable app with multi-hotel login, tenant isolation, platform shell.

| Team | Tasks | Status |
|------|-------|--------|
| **Alpha** | Central DB schema, `TenantService`, middleware, session | 🔄 In progress |
| **Foxtrot** | Bootstrap shell, login page, dashboard layout from InApp | 🔄 In progress |
| **Kilo** | Platform admin routes, hotel provision script | 🔄 In progress |
| **Juliet** | Auth, RBAC roles enum, audit log table | 🔄 In progress |

**Deliverables:**
- [x] Next.js project scaffold (`hotel-pms/`)
- [ ] Central `hotel_central` database
- [ ] Login with hotel name lookup (Washbay pattern)
- [ ] Tenant DB provisioning script
- [ ] Dashboard shell (empty KPIs)
- [ ] Platform admin: list/create hotels

---

## LOOP 1 — Operational MVP

**Goal:** Staff can manage rooms, book guests, check in/out, track housekeeping.

| Team | Tasks |
|------|-------|
| **Alpha** | Property context (multi-property within tenant), branch switching |
| **Bravo** | Room types, rooms CRUD, reservation calendar, create/modify/cancel booking |
| **Charlie** | Check-in, check-out, guest folio (room charges only), tape chart view |
| **Delta** | Room status board (clean/dirty/inspected/OOO), housekeeping tasks |
| **Echo** | Basic folio charges, manual payment recording (cash/card) |
| **Foxtrot** | Pages: Rooms, Reservations, Front Desk, Housekeeping, Guests |
| **Hotel** | Dashboard: occupancy today, arrivals/departures, revenue today |
| **Juliet** | Roles: admin, manager, front_desk, housekeeping; route guards |

**From feature doc:** §2 Reservations (core), §3 Front desk (core), §3 Housekeeping (basic), §4 Billing (basic folio), §9 Staff roles, §11 Reporting (basic KPIs).

---

## LOOP 2 — Revenue & Guest Experience

**Goal:** Full billing, guest profiles, notifications, operational reports.

| Team | Tasks |
|------|-------|
| **Bravo** | Rate plans (flexible, seasonal), deposits, cancellation policies, waitlist |
| **Charlie** | Early/late check-in charges, walk-in flow, split billing |
| **Delta** | Maintenance tickets, preventive maintenance schedule |
| **Echo** | Tax calculation, invoices/receipts, refunds, night audit |
| **Golf** | Guest profiles, stay history, VIP/blacklist flags |
| **Hotel** | ADR, RevPAR, occupancy reports, PDF/Excel export |
| **India** | Email confirmations, SMS reminders (config per hotel) |
| **Lima** | Stock tracking per department, low-stock alerts |
| **Juliet** | Activity audit trail on all critical actions |

**From feature doc:** §2 (advanced), §4 (full), §6 Inventory (basic), §7 CRM (basic), §11 (advanced).

---

## LOOP 3 — POS, Subscriptions & Platform

**Goal:** F&B charge-to-room, subscription billing, self-service hotel settings.

| Team | Tasks |
|------|-------|
| **Mike** | POS outlets, menus, charge-to-room posting |
| **Echo** | Payment gateway integration (Paystack/Stripe) |
| **Kilo** | Subscription plans, trial/grace, lock overlay when expired |
| **Alpha** | Hotel settings JSON (tax, currency, timezone) |
| **Foxtrot** | Settings pages: hotel profile, users, roles |
| **Golf** | Loyalty points, tiers, post-stay surveys |
| **India** | REST API for external tools, webhook events |

**From feature doc:** §5 POS, §7 CRM (loyalty), §10 Staff scheduling, §12 Security (2FA admin).

---

## LOOP 4 — Distribution & Scale

**Goal:** Direct bookings, OTA sync, multi-property groups.

| Team | Tasks |
|------|-------|
| **November** | Direct booking engine (public `/book/{hotel-slug}`) |
| **November** | Channel manager stubs + OTA adapter interface |
| **Alpha** | Cross-property guest recognition (same tenant DB) |
| **Bravo** | Overbooking controls, group/corporate block bookings |
| **India** | Electronic door lock integration API |
| **Juliet** | PCI-compliant payment tokenization, GDPR export/delete |

**From feature doc:** §8 Channel manager, §12 Multi-property, §13 Mobile & integrations.

---

## LOOP 5 — Mobile & Enterprise Polish

**Goal:** Production-ready for chains and high-volume properties.

| Team | Tasks |
|------|-------|
| **Foxtrot** | PWA / responsive housekeeping mobile views |
| **India** | Guest mobile check-in, messaging/chatbot hooks |
| **Hotel** | Forecasting, custom report builder |
| **November** | Booking.com / Expedia live adapters |
| **Juliet** | Automated backups, disaster recovery runbook |
| **Kilo** | White-label branding per hotel on login |

**From feature doc:** §13 Mobile, §11 Forecasting, §12 Multi-property (full).

---

## Database Architecture

```
hotel_central                    hotel_{slug} (per tenant)
├── companies                    ├── users
├── platform_admins              ├── properties (branches)
├── subscription_plans           ├── room_types
├── company_subscriptions        ├── rooms
└── platform_settings            ├── guests
                                 ├── reservations
                                 ├── folios
                                 ├── folio_charges
                                 ├── payments
                                 ├── housekeeping_tasks
                                 └── audit_logs
```

---

## API Contract Conventions

All teams expose routes under:

| Scope | Prefix | Auth |
|-------|--------|------|
| Public | `/api/hotel/lookup` | None |
| Tenant | `/api/*` | Session + tenant middleware |
| Platform | `/api/platform/*` | Platform admin session |

Response envelope:
```json
{ "success": true, "data": {}, "message": "" }
```

---

## Current Sprint Assignment (Loop 0)

```
Alpha  → src/lib/tenant/*, src/middleware.ts, database/central/*
Foxtrot→ src/app/login, src/components/layout/*, src/styles/*
Kilo   → src/app/platform/*, scripts/provision-tenant.ts
Juliet → src/lib/auth/*, database/tenant/001_tenant_core.sql (users, roles)
```

**Next loop gate:** Demo login as `Grand Plaza Hotel` → dashboard with sidebar navigation.

---

## Quick Start (developers)

```bash
cd hotel-pms
cp .env.example .env.local
# Create central DB and run:
npm run db:setup-central
npm run db:provision -- --name "Grand Plaza Hotel" --slug grand-plaza --owner-email admin@grandplaza.local --owner-password secret123
npm run dev
```

Login at `http://localhost:3000/login` → enter **Grand Plaza Hotel** → sign in.
