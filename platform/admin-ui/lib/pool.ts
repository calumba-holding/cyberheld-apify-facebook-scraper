import { pool, q } from "./db";

export type Account = {
  id: string;
  platform: string;
  account_ref: string;
  profile_ref: string;
  state: "active" | "leased" | "quarantined" | "retired";
  health_score: number;
  warnings: number;
  leased_by: string | null;
  leased_at: string | null;
  last_used_at: string | null;
};

export async function listAccounts(): Promise<Account[]> {
  return q<Account>(
    `select id, platform, account_ref, profile_ref, state, health_score, warnings,
            leased_by, leased_at, last_used_at
       from accounts order by platform, account_ref`,
  );
}

export async function capacity(): Promise<Record<string, number>> {
  const rows = await q<{ state: string; n: string }>(
    `select state, count(*) n from accounts group by state`,
  );
  return Object.fromEntries(rows.map((r) => [r.state, Number(r.n)]));
}

export async function registerAccount(
  platform: string,
  account_ref: string,
  profile_ref: string,
): Promise<Account> {
  const rows = await q<Account>(
    `insert into accounts (platform, account_ref, profile_ref)
     values ($1,$2,$3) returning *`,
    [platform, account_ref, profile_ref],
  );
  return rows[0];
}

export async function setState(id: string, state: string): Promise<void> {
  if (state === "quarantined") {
    await q(
      `update accounts set state='quarantined', warnings=warnings+1,
              health_score=greatest(0, health_score-50), leased_by=null, leased_at=null
         where id=$1`,
      [id],
    );
  } else if (state === "active") {
    await q(`update accounts set state='active', leased_by=null, leased_at=null where id=$1`, [id]);
  } else {
    await q(`update accounts set state=$2 where id=$1`, [id, state]);
  }
}

/** Counts of active vs total (non-retired) signed-in sessions for a platform. */
export async function poolStatus(platform: string) {
  const rows = await q<{ state: string; n: string }>(
    `select state, count(*) n from accounts where platform=$1 group by state`,
    [platform],
  );
  const by = Object.fromEntries(rows.map((r) => [r.state, Number(r.n)]));
  const active = by["active"] ?? 0;
  const leased = by["leased"] ?? 0;
  const signedIn = active + leased + (by["quarantined"] ?? 0); // exists but maybe unusable
  return { active, leased, signedIn, usable: active + leased };
}

/**
 * Atomically claim a free (active) signed-in session for a platform.
 * FOR UPDATE SKIP LOCKED -> two callers never grab the same one.
 * Returns null when none are free.
 */
export async function leaseFree(
  platform: string,
  leasedBy: string,
  allowedIds?: string[],
): Promise<Account | null> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    const restrict = allowedIds ? ` and id = any($2::uuid[])` : "";
    const params: any[] = allowedIds ? [platform, allowedIds] : [platform];
    const pick = await client.query(
      `select id from accounts
        where platform=$1 and state='active'${restrict}
        order by health_score desc, last_used_at asc nulls first
        for update skip locked limit 1`,
      params,
    );
    if (pick.rowCount === 0) {
      await client.query("rollback");
      return null;
    }
    const id = pick.rows[0].id;
    const upd = await client.query(
      `update accounts set state='leased', leased_by=$2, leased_at=now(), last_used_at=now()
        where id=$1 returning *`,
      [id, leasedBy],
    );
    await client.query("commit");
    return upd.rows[0] as Account;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    client.release();
  }
}
