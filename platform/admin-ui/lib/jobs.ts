import { q } from "./db";

export type Job = {
  id: string;
  case_id: string;
  job_type: string;
  target_url: string | null;
  status: string;
  created_at: string;
};

export function platformFromUrl(url: string): "facebook" | "instagram" | "tiktok" {
  const u = url.toLowerCase();
  if (u.includes("instagram.com")) return "instagram";
  if (u.includes("tiktok.com")) return "tiktok";
  return "facebook";
}

export async function createJob(
  platform: string,
  target_url: string,
  externalRef?: string,
): Promise<{ job_id: string; case_id: string }> {
  const [c] = await q<{ id: string }>(
    `insert into cases (external_ref) values ($1) returning id`,
    [externalRef ?? null],
  );
  const [j] = await q<{ id: string }>(
    `insert into jobs (case_id, job_type, target_url, status)
     values ($1,$2,$3,'running') returning id`,
    [c.id, `${platform === "facebook" ? "fb" : platform === "instagram" ? "ig" : "tiktok"}/post`, target_url],
  );
  return { job_id: j.id, case_id: c.id };
}

export async function setJobStatus(id: string, status: string): Promise<void> {
  await q(`update jobs set status=$2 where id=$1`, [id, status]);
}

export async function listJobs(limit = 25): Promise<Job[]> {
  return q<Job>(
    `select id, case_id, job_type, target_url, status, created_at
       from jobs order by created_at desc limit $1`,
    [limit],
  );
}

export async function getJob(id: string): Promise<Job | null> {
  const rows = await q<Job>(
    `select id, case_id, job_type, target_url, status, created_at from jobs where id=$1`,
    [id],
  );
  return rows[0] ?? null;
}
