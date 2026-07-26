import { NextResponse } from "next/server";
import { capacity, listAccounts, registerAccount } from "@/lib/pool";
import { isSignedIn } from "@/lib/signedin";

export const dynamic = "force-dynamic";

export async function GET() {
  const [accounts, cap] = await Promise.all([listAccounts(), capacity()]);
  const annotated = accounts.map((a) => {
    const s = isSignedIn(a);
    return { ...a, signed_in: s.signed_in, signed_in_where: s.where };
  });
  const signedIn = annotated.filter((a) => a.signed_in).length;
  return NextResponse.json({ accounts: annotated, capacity: cap, signed_in: signedIn });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const { platform, account_ref, profile_ref } = body ?? {};
  if (!platform || !account_ref || !profile_ref) {
    return NextResponse.json(
      { error: "platform, account_ref and profile_ref are required" },
      { status: 400 },
    );
  }
  try {
    const acct = await registerAccount(platform, account_ref, profile_ref);
    return NextResponse.json(acct, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: String(e?.message ?? e) }, { status: 409 });
  }
}
