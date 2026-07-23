import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}

async function main() {
  const config = {
    host: env('CENTRAL_DB_HOST', '127.0.0.1'),
    port: Number(env('CENTRAL_DB_PORT', '3306')),
    user: env('CENTRAL_DB_USER', 'root'),
    password: env('CENTRAL_DB_PASSWORD', ''),
  };

  const sqlPath = path.join(__dirname, '..', 'database', 'central', '001_central_registry.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const conn = await mysql.createConnection({ ...config, multipleStatements: true });
  await conn.query(sql);

  const adminName = env('PLATFORM_ADMIN_NAME', 'Alex Andoh');
  const adminEmail = env('PLATFORM_ADMIN_EMAIL', 'alex.andoh@platform.local');
  const adminPassword = env('PLATFORM_ADMIN_PASSWORD', 'Q0550259458p');
  const hash = await bcrypt.hash(adminPassword, 12);

  await conn.query(
    `INSERT INTO hotel_central.platform_admins (name, email, password_hash, is_active, must_change_password)
     VALUES (?, ?, ?, 1, 0)
     ON DUPLICATE KEY UPDATE name = VALUES(name), password_hash = VALUES(password_hash), is_active = 1`,
    [adminName, adminEmail, hash]
  );

  await conn.end();
  console.log('Central database ready:', env('CENTRAL_DB_NAME', 'hotel_central'));
  console.log('Platform admin:', adminName, '/', adminPassword);
  console.log('Bypass login: type "' + adminName + '" on the login page (hotel config not required)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
