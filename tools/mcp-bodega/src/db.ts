/**
 * Database client for the MCP server.
 * Uses raw pg (node-postgres) for direct SQL queries with positional params.
 * Avoids Prisma dependency to keep the MCP server lightweight and standalone.
 */

import pg from "pg";

let pool: pg.Pool | null = null;

/**
 * Returns a shared connection pool. Creates one on first call.
 * Uses DATABASE_URL from environment.
 */
export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is required");
    }
    pool = new pg.Pool({
      connectionString,
      max: 3,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 15_000,
      ssl: connectionString.includes("localhost") || connectionString.includes("127.0.0.1")
        ? false
        : { rejectUnauthorized: false },
    });
  }
  return pool;
}

/**
 * Execute a parameterized query. All params are positional ($1, $2, ...).
 * NEVER use string interpolation for SQL — rule #11 from CLAUDE.md.
 */
export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params: unknown[] = []
): Promise<T[]> {
  const result = await getPool().query<T>(sql, params);
  return result.rows;
}

/** Gracefully close the pool on shutdown */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
