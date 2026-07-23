import fs from 'fs';

import path from 'path';

import { createServerConnection, executeCentral, getCentralDbConfig } from '@/lib/db/central';

import { DEFAULT_PASSWORD } from '@/lib/config';

import { hashPassword } from '@/lib/auth/credentials';

import {

  buildCompanyRecord,

  findCompanyByDbName,

  findCompanyBySlug,

} from '@/lib/tenant/tenant-service';

import { validateDatabaseName } from '@/lib/tenant/database-name';

import { DEFAULT_TRIAL_DAYS } from '@/lib/subscription/countdown';



function readSql(relativePath: string) {

  const fullPath = path.join(process.cwd(), relativePath);

  return fs.readFileSync(fullPath, 'utf8');

}



export async function runCentralMigrations() {

  const config = getCentralDbConfig();

  const centralDir = path.join(process.cwd(), 'database', 'central');

  const files = fs

    .readdirSync(centralDir)

    .filter((f) => f.endsWith('.sql'))

    .sort();

  const conn = await createServerConnection({ ...config, database: '' });

  try {

    await conn.query(

      `CREATE DATABASE IF NOT EXISTS \`${String(config.database).replace(/`/g, '``')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`

    );

    await conn.query(`USE \`${String(config.database).replace(/`/g, '``')}\``);

    for (const file of files) {

      const sql = fs.readFileSync(path.join(centralDir, file), 'utf8');

      await conn.query(sql);

    }

  } finally {

    await conn.end();

  }

}



export async function createTenantDatabase(dbName: string) {

  const config = getCentralDbConfig();

  const conn = await createServerConnection({ ...config, database: '' });

  try {

    const safe = dbName.replace(/`/g, '``');

    await conn.query(

      `CREATE DATABASE IF NOT EXISTS \`${safe}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`

    );

  } finally {

    await conn.end();

  }

}



async function dropTenantDatabase(dbName: string) {

  const config = getCentralDbConfig();

  const conn = await createServerConnection({ ...config, database: '' });

  try {

    const safe = dbName.replace(/`/g, '``');

    await conn.query(`DROP DATABASE IF EXISTS \`${safe}\``);

  } finally {

    await conn.end();

  }

}



export async function runTenantMigrations(dbConfig: {

  host: string;

  port: number;

  user: string;

  password: string;

  database: string;

}) {

  const tenantDir = path.join(process.cwd(), 'database', 'tenant');

  const files = fs

    .readdirSync(tenantDir)

    .filter((f) => f.endsWith('.sql'))

    .sort();



  const conn = await createServerConnection(dbConfig);

  try {

    for (const file of files) {

      const sql = fs.readFileSync(path.join(tenantDir, file), 'utf8');

      await conn.query(sql);

    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id VARCHAR(191) NOT NULL PRIMARY KEY,
        applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    for (const file of files) {
      await conn.execute(`INSERT IGNORE INTO schema_migrations (id) VALUES (?)`, [file]);
    }

  } finally {

    await conn.end();

  }

}



async function seedTenantOwner(input: {

  dbHost: string;

  dbPort: number;

  dbUser: string;

  dbPass: string;

  dbName: string;

  hotelName: string;

  ownerName: string;

  ownerEmail: string;

}) {

  const passwordHash = await hashPassword(DEFAULT_PASSWORD);

  const conn = await createServerConnection({

    host: input.dbHost,

    port: input.dbPort,

    user: input.dbUser,

    password: input.dbPass,

    database: input.dbName,

  });



  try {

    const [propResult] = await conn.execute(

      `INSERT INTO properties (name, code, email, currency) VALUES (?, ?, ?, 'GHS')`,

      [input.hotelName, 'MAIN', input.ownerEmail]

    );

    const propertyId = Number((propResult as { insertId?: number }).insertId);



    await conn.execute(

      `INSERT INTO users (property_id, name, email, password_hash, role, is_active, must_change_password)

       VALUES (?, ?, ?, ?, 'owner', 1, 1)`,

      [propertyId, input.ownerName, input.ownerEmail.toLowerCase(), passwordHash]

    );

  } finally {

    await conn.end();

  }

}



export async function provisionHotel(input: {

  name: string;

  slug?: string;

  dbName?: string;

  ownerName: string;

  ownerEmail: string;

  planId?: number;

  status?: 'active' | 'trial' | 'suspended';

}) {

  const record = buildCompanyRecord({

    name: input.name,

    slug: input.slug,

    dbName: input.dbName,

  });

  const dbNameError = validateDatabaseName(record.db_name);

  if (dbNameError) {

    throw new Error(dbNameError);

  }



  const existingByDb = await findCompanyByDbName(record.db_name);

  if (existingByDb) {

    throw new Error(

      `Database name "${record.db_name}" is already registered to ${existingByDb.name}.`

    );

  }



  const existingBySlug = await findCompanyBySlug(record.slug);

  if (existingBySlug) {

    throw new Error(`Slug "${record.slug}" is already used by ${existingBySlug.name}.`);

  }



  const dbPort = Number(process.env.TENANT_DB_PORT || 3306);

  let tenantDbCreated = false;



  try {

    await createTenantDatabase(record.db_name);

    tenantDbCreated = true;



    await runTenantMigrations({

      host: record.db_host,

      port: dbPort,

      user: record.db_user,

      password: record.db_pass,

      database: record.db_name,

    });



    await seedTenantOwner({

      dbHost: record.db_host,

      dbPort,

      dbUser: record.db_user,

      dbPass: record.db_pass,

      dbName: record.db_name,

      hotelName: input.name,

      ownerName: input.ownerName,

      ownerEmail: input.ownerEmail,

    });



    const result = await executeCentral(

      `INSERT INTO companies (name, slug, db_host, db_name, db_user, db_pass, status)

       VALUES (:name, :slug, :db_host, :db_name, :db_user, :db_pass, :status)`,

      { ...record, status: input.status || 'trial' }

    );



    const companyId = Number((result as { insertId?: number }).insertId);

    const planId = input.planId ?? 1;

    const companyStatus = input.status || 'trial';

    const isTrial = companyStatus === 'trial';

    const isSuspended = companyStatus === 'suspended';



    await executeCentral(

      `INSERT INTO company_subscriptions (

         company_id, plan_id, subscription_status, monthly_price, currency,

         billing_interval, trial_ends_at, current_period_end

       )

       SELECT :companyId,

              id,

              CASE

                WHEN :isSuspended = 1 THEN 'suspended'

                WHEN :isTrial = 1 THEN 'trialing'

                ELSE 'active'

              END,

              monthly_price,

              currency,

              'monthly',

              CASE

                WHEN :isTrial = 1 THEN DATE_ADD(CURDATE(), INTERVAL :trialDays DAY)

                ELSE NULL

              END,

              CASE

                WHEN :isTrial = 1 OR :isSuspended = 1 THEN NULL

                ELSE DATE_ADD(CURDATE(), INTERVAL 1 MONTH)

              END

       FROM subscription_plans WHERE id = :planId`,

      {

        companyId,

        planId,

        isTrial: isTrial ? 1 : 0,

        isSuspended: isSuspended ? 1 : 0,

        trialDays: DEFAULT_TRIAL_DAYS,

      }

    );



    return {

      companyId,

      slug: record.slug,

      dbName: record.db_name,

      defaultPassword: DEFAULT_PASSWORD,

    };

  } catch (error) {

    if (tenantDbCreated) {

      try {

        await dropTenantDatabase(record.db_name);

      } catch (cleanupError) {

        console.error('Failed to roll back tenant database after provision error:', cleanupError);

      }

    }

    throw error;

  }

}



export async function seedPlatformAdmin(

  name: string,

  password: string,

  email = 'alex.andoh@hotel.local'

) {

  const passwordHash = await hashPassword(password);

  await executeCentral(

    `INSERT INTO platform_admins (name, email, password_hash, is_active, must_change_password)

     VALUES (:name, :email, :passwordHash, 1, 0)

     ON DUPLICATE KEY UPDATE

       name = VALUES(name),

       password_hash = VALUES(password_hash),

       is_active = 1`,

    { name, email: email.toLowerCase(), passwordHash }

  );

}


