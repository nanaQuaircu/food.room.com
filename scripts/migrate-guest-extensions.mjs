import fs from 'fs';
import path from 'path';
import mysql from 'mysql2/promise';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function env(name, fallback = '') {
  return process.env[name] ?? fallback;
}

// Simple parser for dotenv in script execution
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (match) {
        let val = match[2].trim();
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.slice(1, -1);
        } else if (val.startsWith("'") && val.endsWith("'")) {
          val = val.slice(1, -1);
        }
        process.env[match[1]] = val;
      }
    }
  }
}

async function main() {
  loadEnv();

  const config = {
    host: env('CENTRAL_DB_HOST', '127.0.0.1'),
    port: Number(env('CENTRAL_DB_PORT', '3306')),
    user: env('CENTRAL_DB_USER', 'root'),
    password: env('CENTRAL_DB_PASSWORD', ''),
    database: env('CENTRAL_DB_NAME', 'hotel_central'),
  };

  const sqlPath = path.join(__dirname, '..', 'database', 'tenant', '015_guest_extensions.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  console.log('Connecting to central registry database...');
  const conn = await mysql.createConnection(config);
  
  const [companies] = await conn.query('SELECT name, slug, db_name FROM companies WHERE status IN ("active", "trial")');
  console.log(`Found ${companies.length} active/trial companies.`);

  for (const company of companies) {
    console.log(`Migrating company: ${company.name} (DB: ${company.db_name})...`);
    try {
      const tenantConn = await mysql.createConnection({
        host: config.host,
        port: config.port,
        user: config.user,
        password: config.password,
        database: company.db_name,
        multipleStatements: true,
      });

      await tenantConn.query(sql);
      await tenantConn.end();
      console.log(`Successfully migrated ${company.name}`);
    } catch (err) {
      console.error(`Failed to migrate ${company.name}:`, err);
    }
  }

  await conn.end();
  console.log('All migrations completed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
