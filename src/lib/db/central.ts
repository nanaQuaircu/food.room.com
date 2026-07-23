import mysql, { type ExecuteValues, type QueryValues } from 'mysql2/promise';

export type DbConfig = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
};

export function getCentralDbConfig(): DbConfig {
  return {
    host: process.env.CENTRAL_DB_HOST || '127.0.0.1',
    port: Number(process.env.CENTRAL_DB_PORT || 3306),
    user: process.env.CENTRAL_DB_USER || 'root',
    password: process.env.CENTRAL_DB_PASSWORD || '',
    database: process.env.CENTRAL_DB_NAME || 'hotel_central',
  };
}

export function getDefaultTenantDbConfig(database?: string): DbConfig {
  return {
    host: process.env.TENANT_DB_HOST || process.env.CENTRAL_DB_HOST || '127.0.0.1',
    port: Number(process.env.TENANT_DB_PORT || process.env.CENTRAL_DB_PORT || 3306),
    user: process.env.TENANT_DB_USER || process.env.CENTRAL_DB_USER || 'root',
    password: process.env.TENANT_DB_PASSWORD ?? process.env.CENTRAL_DB_PASSWORD ?? '',
    database: database || '',
  };
}

export async function createPool(config: DbConfig) {
  return mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database || undefined,
    waitForConnections: true,
    connectionLimit: 5,
    maxIdle: 2,
    idleTimeout: 60_000,
    namedPlaceholders: true,
  });
}

type MysqlGlobal = {
  centralPool?: mysql.Pool;
  tenantPools?: Map<string, mysql.Pool>;
};

const globalMysql = globalThis as typeof globalThis & { __hotelMysql?: MysqlGlobal };

function mysqlGlobal(): MysqlGlobal {
  if (!globalMysql.__hotelMysql) {
    globalMysql.__hotelMysql = {};
  }
  return globalMysql.__hotelMysql;
}

let centralPool: mysql.Pool | null = null;

export async function getCentralPool() {
  const cached = mysqlGlobal().centralPool;
  if (cached) return cached;

  if (!centralPool) {
    centralPool = await createPool(getCentralDbConfig());
    mysqlGlobal().centralPool = centralPool;
  }
  return centralPool;
}

export async function queryCentral<T = unknown>(
  sql: string,
  params?: QueryValues
) {
  const pool = await getCentralPool();
  const [rows] = await pool.query(sql, params);
  return rows as T;
}

export async function executeCentral(
  sql: string,
  params?: ExecuteValues
) {
  const pool = await getCentralPool();
  const [result] = await pool.execute(sql, params);
  return result;
}

export async function createServerConnection(config: DbConfig) {
  return mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database || undefined,
    multipleStatements: true,
  });
}
