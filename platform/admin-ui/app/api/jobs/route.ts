import { NextResponse } from "next/server";
import { leaseFree, listAccounts, poolStatus } from "@/lib/pool";
import { isSignedIn } from "@/lib/signedin";
import { createJob, listJobs, platformFromUrl } from "@/lib/jobs";
import { startScrape } from "@/lib/runner";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ jobs: await listJobs() });
}

export async function POST(req: Request) {
  const { target_url } = await req.json().catch(() => ({}));
  if (!target_url) {
    return NextResponse.json({ error: "target_url is required" }, { status: 400 });
  }
  const platform = platformFromUrl(target_url);

  // Which sessions for this platform are actually SIGNED IN (have a saved login)?
  const all = await listAccounts();
  const signedInIds = all
    .filter((a) => a.platform === platform && a.state !== "retired" && isSignedIn(a).signed_in)
    .map((a) => a.id);

  if (signedInIds.length === 0) {
    // Nothing signed in at all -> send the user to sign in.
    return NextResponse.json(
      {
        error: "no_signed_in_session",
        platform,
        message: `No signed-in ${platform} session in the pool. Sign in at least one first (Pool → Sign in).`,
      },
      { status: 409 },
    );
  }

  // A post job REQUIRES a signed-in, free session. Lease among the signed-in ones.
  const session = await leaseFree(platform, "admin-ui", signedInIds);

  if (!session) {
    // Signed-in sessions exist but all busy -> wait for a free one.
    const status = await poolStatus(platform);
    return NextResponse.json(
      {
        status: "waiting",
        platform,
        message: `All signed-in ${platform} sessions are busy (${status.leased} in use). Waiting for a free one — retry shortly.`,
      },
      { status: 202 },
    );
  }

  // Got a session -> create the job and run the scraper with that profile.
  const { job_id, case_id } = await createJob(platform, target_url);
  const { pid } = startScrape(job_id, target_url, platform, session);
  return NextResponse.json(
    {
      job_id,
      case_id,
      status: "running",
      session: { account_ref: session.account_ref, profile_ref: session.profile_ref },
      pid,
    },
    { status: 201 },
  );
}
