import { Pool } from "pg";

// Single shared pool. Uses the same Postgres as the platform services.
const globalForPg = globalThis as unknown as { _pgPool?: Pool };

export const pool =
  globalForPg._pgPool ??
  new Pool({
    connectionString:
      process.env.DATABASE_URL ??
      "postgresql://postgres:dev@localhost:55432/evidence",
    max: 5,
  });

if (process.env.NODE_ENV !== "production") globalForPg._pgPool = pool;

export async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
