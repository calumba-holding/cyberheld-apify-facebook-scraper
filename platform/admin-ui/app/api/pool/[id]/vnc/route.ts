import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { NOVNC_BASE } from "@/lib/config";
import type { Account } from "@/lib/pool";

export const dynamic = "force-dynamic";

// Open a live view of the session's Chrome. Dockerized worker sessions run Chrome
// behind noVNC (port 6080+N); the local headful profile has no VNC (Chrome opens
// on this machine directly).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rows = await q<Account>(`select * from accounts where id=$1`, [params.id]);
  const acct = rows[0];
  if (!acct) return NextResponse.json({ error: "account not found" }, { status: 404 });

  const m = acct.profile_ref.match(/worker-(\d+)/);
  if (m) {
    const port = 6080 + Number(m[1]);
    return NextResponse.redirect(`${NOVNC_BASE}${port}/vnc.html?autoconnect=1`);
  }

  const html = `<!doctype html><meta charset="utf-8">
  <body style="font:14px/1.6 system-ui;background:#0e1116;color:#e6edf3;padding:32px">
    <h2>No VNC for “${acct.account_ref}”</h2>
    <p>This session uses the <b>local</b> Chrome profile <code>${acct.profile_ref}</code> —
    it opens a Chrome window <b>on this machine</b> directly (no VNC needed).</p>
    <p>Live VNC is available for <b>Dockerized worker</b> sessions (profile <code>worker-N</code>),
    where Chrome runs headless behind noVNC on port <code>6080+N</code>. Start the worker container
    (see <code>docker/</code>) and this button will embed its screen.</p>
  </body>`;
  return new NextResponse(html, { headers: { "content-type": "text/html" } });
}
