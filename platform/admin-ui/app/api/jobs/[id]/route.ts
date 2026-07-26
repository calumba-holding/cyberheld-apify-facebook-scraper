import { NextResponse } from "next/server";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { RUNS_DIR } from "@/lib/config";
import { getJob } from "@/lib/jobs";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const job = await getJob(params.id);
  if (!job) return NextResponse.json({ error: "job not found" }, { status: 404 });

  const steps = await q(
    `select step_index, name, state from job_steps where job_id=$1 order by step_index`,
    [params.id],
  );

  // tail the run log so the UI can show "what's being scraped"
  let log = "";
  const logPath = join(RUNS_DIR, params.id, "run.log");
  if (existsSync(logPath)) {
    const all = readFileSync(logPath, "utf8").split("\n");
    log = all.slice(-80).join("\n");
  }

  // the captured result JSON (once the scraper finishes)
  let result: any = null;
  const resPath = join(RUNS_DIR, params.id, "result.json");
  if (existsSync(resPath)) {
    try { result = JSON.parse(readFileSync(resPath, "utf8")); } catch { /* mid-write */ }
  }

  // artifact files (screenshots, video) written for this run
  let artifacts: string[] = [];
  try {
    const { readdirSync } = require("fs");
    artifacts = readdirSync(join(RUNS_DIR, params.id))
      .filter((f: string) => /\.(png|jpg|jpeg|webm|mp4)$/i.test(f));
  } catch { /* dir not created yet */ }

  return NextResponse.json({ job, steps, log, result, artifacts });
}
