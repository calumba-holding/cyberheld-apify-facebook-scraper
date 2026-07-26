import { NextResponse } from "next/server";
import { connect } from "net";
import { q } from "@/lib/db";
import { NOVNC_BASE } from "@/lib/config";
import type { Account } from "@/lib/pool";

export const dynamic = "force-dynamic";

function portOpen(port: number, host = "localhost", timeout = 500): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = connect({ port, host });
    const done = (ok: boolean) => { sock.destroy(); resolve(ok); };
    sock.setTimeout(timeout);
    sock.once("connect", () => done(true));
    sock.once("timeout", () => done(false));
    sock.once("error", () => done(false));
  });
}

function page(title: string, body: string) {
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><body style="font:14px/1.6 system-ui;background:#0e1116;color:#e6edf3;padding:32px;max-width:720px">
     <h2>${title}</h2>${body}
     <p><a href="javascript:history.back()" style="color:#4c8dff">← back to console</a></p></body>`,
    { headers: { "content-type": "text/html" } },
  );
}

// Open a live view of the session's Chrome. Dockerized worker sessions run Chrome
// behind noVNC (port 6080+N); local profiles open Chrome on this machine directly.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const rows = await q<Account>(`select * from accounts where id=$1`, [params.id]);
  const acct = rows[0];
  if (!acct) return NextResponse.json({ error: "account not found" }, { status: 404 });

  const m = acct.profile_ref.match(/worker-(\d+)/);
  if (m) {
    const port = 6080 + Number(m[1]);
    if (await portOpen(port)) {
      return NextResponse.redirect(`${NOVNC_BASE}${port}/vnc.html?autoconnect=1`);
    }
    return page(
      `VNC not running for “${acct.account_ref}”`,
      `<p>No noVNC server on <code>localhost:${port}</code> — the Dockerized Chrome worker for
       <code>${acct.profile_ref}</code> isn't started, so the live view is unavailable
       (that's the "dead site" you saw).</p>
       <p>Start the worker container (Chrome + Xvfb + noVNC) so it serves port
       <code>${port}</code>, then this button embeds its screen. Until then, use a
       <b>local</b> session, which opens Chrome directly on this Mac.</p>`,
    );
  }

  return page(
    `No VNC for “${acct.account_ref}”`,
    `<p>This session uses the <b>local</b> Chrome profile <code>${acct.profile_ref}</code> —
     it opens a Chrome window <b>on this machine</b> (no VNC needed). VNC is only for
     Dockerized <code>worker-N</code> sessions.</p>`,
  );
}
