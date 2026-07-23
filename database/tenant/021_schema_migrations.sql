-- Schema migration ledger for incremental upgrades on existing tenants.
CREATE TABLE IF NOT EXISTS schema_migrations (
  id VARCHAR(191) NOT NULL PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
