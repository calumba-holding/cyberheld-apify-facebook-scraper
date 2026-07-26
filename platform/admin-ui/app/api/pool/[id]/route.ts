import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { setState } from "@/lib/pool";
import { signOut } from "@/lib/signedin";
import { startLogin } from "@/lib/runner";
import type { Account } from "@/lib/pool";

export const dynamic = "force-dynamic";

async function getAccount(id: string): Promise<Account | null> {
  const rows = await q<Account>(`select * from accounts where id=$1`, [id]);
  return rows[0] ?? null;
}

// signout | release | quarantine | retire | activate
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const { action } = await req.json().catch(() => ({}));

  if (action === "signout") {
    const acct = await getAccount(params.id);
    if (!acct) return NextResponse.json({ error: "account not found" }, { status: 404 });
    const removed = signOut(acct);
    return NextResponse.json({ ok: true, signed_out: true, cleared: removed });
  }

  const map: Record<string, string> = {
    release: "active",
    activate: "active",
    quarantine: "quarantined",
    retire: "retired",
  };
  const state = map[action];
  if (!state) return NextResponse.json({ error: "unknown action" }, { status: 400 });
  await setState(params.id, state);
  return NextResponse.json({ ok: true, state });
}

// Kick off the one-time interactive sign-in (opens Chrome on the host).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const acct = await getAccount(params.id);
  if (!acct) return NextResponse.json({ error: "account not found" }, { status: 404 });
  const { pid, waitSecs } = startLogin(acct.platform, acct);
  return NextResponse.json({
    ok: true,
    pid,
    message: `Chrome is opening to sign in “${acct.account_ref}”. Log into ${acct.platform} in that window within ~${waitSecs}s — the session then saves automatically (no need to press anything).`,
  });
}
