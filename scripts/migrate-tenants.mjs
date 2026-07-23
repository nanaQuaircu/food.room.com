/**
 * Apply missing tenant SQL migrations to all (or one) hotel databases.
 *
 * Usage:
 *   node scripts/migrate-tenants.mjs
 *   node scripts/migrate-tenants.mjs --db hotel_grand_plaza_hotel
 *
 * Existing hotels without a ledger are bootstrapped (current files marked applied)
 * so only future numbered migrations run.
 */
import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      out[args[i].slice(2)] = args[i + 1];
      i++;
    }
  }
  return out;
}

async function ensureMigrationsTable(conn) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

async function appliedIds(conn) {
  const [rows] = await conn.query(`SELECT id FROM schema_migrations`);
  return new Set(rows.map((r) => r.id));
}

async function bootstrapExistingLedger(conn, sqlFiles) {
  const done = await appliedIds(conn);
  if (done.size > 0) return done;

  const [tables] = await conn.query(`SHOW TABLES LIKE 'properties'`);
  if (!tables.length) return done;

  console.log('  Bootstrapping migration ledger (existing schema detected)…');
  for (const file of sqlFiles) {
    await conn.execute(`INSERT IGNORE INTO schema_migrations (id) VALUES (?)`, [file]);
  }
  return appliedIds(conn);
}

async function migrateDatabase(adminConfig, dbName, sqlFiles) {
  const conn = await mysql.createConnection({
    ...adminConfig,
    database: dbName,
    multipleStatements: true,
  });
  try {
    await ensureMigrationsTable(conn);
    let done = await bootstrapExistingLedger(conn, sqlFiles);
    for (const file of sqlFiles) {
      if (done.has(file)) continue;
      const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'tenant', file), 'utf8');
      console.log(`  → ${dbName}: applying ${file}`);
      try {
        await conn.query(sql);
      } catch (err) {
        const msg = String(err?.message || err);
        const alreadyApplied =
          /Duplicate column name/i.test(msg) ||
          /already exists/i.test(msg) ||
          /Duplicate key name/i.test(msg) ||
          /Duplicate entry/i.test(msg);
        if (!alreadyApplied) throw err;
        console.log(`  · ${dbName}: ${file} already present — recording as applied`);
      }
      await conn.execute(`INSERT IGNORE INTO schema_migrations (id) VALUES (?)`, [file]);
      done.add(file);
    }
    console.log(`  ✓ ${dbName} up to date`);
  } finally {
    await conn.end();
  }
}

async function main() {
  const args = parseArgs();
  const adminConfig = {
    host: env('CENTRAL_DB_HOST', '127.0.0.1'),
    port: Number(env('CENTRAL_DB_PORT', '3306')),
    user: env('CENTRAL_DB_USER', 'root'),
    password: env('CENTRAL_DB_PASSWORD', ''),
  };
  const centralDb = env('CENTRAL_DB_NAME', 'hotel_central');

  const tenantDir = path.join(__dirname, '..', 'database', 'tenant');
  const sqlFiles = fs
    .readdirSync(tenantDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const central = await mysql.createConnection({ ...adminConfig, database: centralDb });
  let databases = [];
  if (args.db) {
    databases = [args.db];
  } else {
    const [rows] = await central.query(`SELECT db_name FROM companies ORDER BY id`);
    databases = rows.map((r) => r.db_name).filter(Boolean);
  }
  await central.end();

  if (!databases.length) {
    console.log('No tenant databases found.');
    return;
  }

  console.log(`Migrating ${databases.length} tenant database(s)…`);
  for (const dbName of databases) {
    try {
      await migrateDatabase(adminConfig, dbName, sqlFiles);
    } catch (err) {
      console.error(`  ✗ ${dbName}:`, err.message || err);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
