import type { ExecuteValues, Pool, QueryValues } from 'mysql2/promise';
import { createPool, type DbConfig } from './central';

type MysqlGlobal = {
  centralPool?: Pool;
  tenantPools?: Map<string, Pool>;
};

const globalMysql = globalThis as typeof globalThis & { __hotelMysql?: MysqlGlobal };

function mysqlGlobal(): MysqlGlobal {
  if (!globalMysql.__hotelMysql) {
    globalMysql.__hotelMysql = {};
  }
  return globalMysql.__hotelMysql;
}

function poolKey(config: DbConfig) {
  return `${config.host}:${config.port}:${config.database}:${config.user}`;
}

export async function getTenantPool(config: DbConfig) {
  const key = poolKey(config);
  const pools = mysqlGlobal().tenantPools ?? new Map<string, Pool>();
  mysqlGlobal().tenantPools = pools;

  let pool = pools.get(key);
  if (!pool) {
    pool = await createPool(config);
    pools.set(key, pool);
  }
  return pool;
}

export async function queryTenant<T = unknown>(
  config: DbConfig,
  sql: string,
  params?: QueryValues
) {
  const pool = await getTenantPool(config);
  const [rows] = await pool.query(sql, params);
  return rows as T;
}

export async function executeTenant(
  config: DbConfig,
  sql: string,
  params?: ExecuteValues
) {
  const pool = await getTenantPool(config);
  const [result] = await pool.execute(sql, params);
  return result;
}
