import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (!process.env[m[1].trim()]) process.env[m[1].trim()] = v;
  }
}

loadEnv();

const defaultPassword = (process.env.DEFAULT_PASSWORD || 'P@$$w0rd').trim();

async function main() {
  const central = await mysql.createConnection({
    host: process.env.CENTRAL_DB_HOST || '127.0.0.1',
    user: process.env.CENTRAL_DB_USER || 'root',
    password: process.env.CENTRAL_DB_PASSWORD || '',
    database: process.env.CENTRAL_DB_NAME || 'hotel_central',
  });

  const [companies] = await central.query('SELECT db_name FROM companies');
  const hash = await bcrypt.hash(defaultPassword, 12);

  for (const company of companies) {
    const tenant = await mysql.createConnection({
      host: process.env.TENANT_DB_HOST || '127.0.0.1',
      user: process.env.TENANT_DB_USER || 'root',
      password: process.env.TENANT_DB_PASSWORD || '',
      database: company.db_name,
    });

    const [result] = await tenant.execute(
      `UPDATE users SET password_hash = ?, must_change_password = 1 WHERE role != 'owner'`,
      [hash]
    );

    console.log(`${company.db_name}: reset ${result.affectedRows} staff password(s)`);
    await tenant.end();
  }

  await central.end();
  console.log(`Done. Default password is: ${defaultPassword}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
