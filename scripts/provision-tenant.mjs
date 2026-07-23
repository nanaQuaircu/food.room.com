import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}

function slugify(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      out[key] = args[i + 1];
      i++;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs();
  const name = args.name;
  if (!name) {
    console.error('Usage: npm run db:provision -- --name "Grand Plaza Hotel" --owner-email admin@grandplaza.local');
    process.exit(1);
  }

  const slug = args.slug || slugify(name);
  const dbName = `hotel_${slug.replace(/-/g, '_').slice(0, 40)}`;
  const ownerEmail = (args['owner-email'] || 'owner@hotel.local').toLowerCase();
  const ownerPassword = args['owner-password'] || env('DEFAULT_PASSWORD', 'P@$$w0rd');
  const ownerName = args['owner-name'] || 'Hotel Owner';

  const config = {
    host: env('CENTRAL_DB_HOST', '127.0.0.1'),
    port: Number(env('CENTRAL_DB_PORT', '3306')),
    user: env('CENTRAL_DB_USER', 'root'),
    password: env('CENTRAL_DB_PASSWORD', ''),
    database: env('CENTRAL_DB_NAME', 'hotel_central'),
  };

  const tenantDir = path.join(__dirname, '..', 'database', 'tenant');
  const sqlFiles = fs.readdirSync(tenantDir).filter((f) => f.endsWith('.sql')).sort();
  const tenantSql = sqlFiles.map((f) => fs.readFileSync(path.join(tenantDir, f), 'utf8')).join('\n');

  const conn = await mysql.createConnection({ ...config, multipleStatements: true });
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);
  await conn.query(tenantSql);

  // Record applied migrations for future incremental upgrades
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id VARCHAR(191) NOT NULL PRIMARY KEY,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
  for (const file of sqlFiles) {
    await conn.execute(`INSERT IGNORE INTO schema_migrations (id) VALUES (?)`, [file]);
  }

  const [propResult] = await conn.execute(
    `INSERT INTO properties (name, code, email, currency) VALUES (?, 'MAIN', ?, 'GHS')`,
    [name, ownerEmail]
  );
  const propertyId = propResult.insertId;
  const passwordHash = await bcrypt.hash(ownerPassword, 12);
  await conn.execute(
    `INSERT INTO users (property_id, name, email, password_hash, role, is_active, must_change_password) VALUES (?, ?, ?, ?, 'owner', 1, 1)`,
    [propertyId, ownerName, ownerEmail, passwordHash]
  );

  await conn.query(`USE \`${config.database}\``);
  const [companyResult] = await conn.execute(
    `INSERT INTO companies (name, slug, db_host, db_name, db_user, db_pass, status)
     VALUES (?, ?, ?, ?, ?, ?, 'trial')`,
    [name, slug, config.host, dbName, config.user, config.password]
  );

  await conn.execute(
    `INSERT INTO company_subscriptions (company_id, plan_id, subscription_status, monthly_price, currency)
     SELECT ?, id, 'trialing', monthly_price, currency FROM subscription_plans WHERE id = 1`,
    [companyResult.insertId]
  );

  await conn.end();

  console.log('Hotel provisioned successfully');
  console.log('  Name:', name);
  console.log('  Slug:', slug);
  console.log('  Database:', dbName);
  console.log('  Owner:', ownerEmail, '/', ownerPassword, '(must change on first login)');
  console.log('Login: add hotel "' + name + '" on /login');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
