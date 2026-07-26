"use client";
import { useEffect, useState } from "react";

type Account = {
  id: string; platform: string; account_ref: string; profile_ref: string;
  state: string; health_score: number; warnings: number;
  leased_by: string | null; last_used_at: string | null;
  signed_in?: boolean; signed_in_where?: string | null;
};

const STATES = ["active", "leased", "quarantined", "retired"];

export default function PoolBoard() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [cap, setCap] = useState<Record<string, number>>({});
  const [signedIn, setSignedIn] = useState(0);
  const [msg, setMsg] = useState<string>("");
  const [form, setForm] = useState({ platform: "facebook", account_ref: "", profile_ref: "" });

  async function load() {
    const r = await fetch("/api/pool", { cache: "no-store" });
    const d = await r.json();
    setAccounts(d.accounts ?? []);
    setCap(d.capacity ?? {});
    setSignedIn(d.signed_in ?? 0);
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 4000); // live-ish refresh
    return () => clearInterval(t);
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    const r = await fetch("/api/pool", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await r.json();
    if (!r.ok) setMsg(d.error ?? "failed");
    else { setForm({ platform: form.platform, account_ref: "", profile_ref: "" }); load(); }
  }
  async function act(id: string, action: string) {
    await fetch(`/api/pool/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action }),
    });
    load();
  }
  async function signIn(a: Account) {
    setMsg("");
    const r = await fetch(`/api/pool/${a.id}`, { method: "POST" });
    const d = await r.json();
    setMsg(d.message ?? d.error ?? "");
    load();
  }

  return (
    <>
      <h1>Session Pool</h1>
      <p className="sub">Signed-in Chrome sessions the scrapers lease from. One account ↔ one profile, never swapped. Only <b>signed-in</b> sessions can run a job.</p>

      <div className="tiles">
        <div className="tile">
          <div className="n" style={{ color: "var(--accent2)" }}>{signedIn}</div>
          <div className="l">signed in</div>
        </div>
        {STATES.slice(0, 3).map((s) => (
          <div className="tile" key={s}>
            <div className="n">{cap[s] ?? 0}</div>
            <div className="l">{s}</div>
          </div>
        ))}
      </div>

      <h2>Add a Chrome session</h2>
      <form className="formrow" onSubmit={add}>
        <select value={form.platform} onChange={(e) => setForm({ ...form, platform: e.target.value })}>
          <option value="facebook">facebook</option>
          <option value="instagram">instagram</option>
          <option value="tiktok">tiktok</option>
        </select>
        <input placeholder="account label (e.g. ops-3)" value={form.account_ref}
          onChange={(e) => setForm({ ...form, account_ref: e.target.value })} />
        <input placeholder="profile name (e.g. worker-3)" value={form.profile_ref}
          onChange={(e) => setForm({ ...form, profile_ref: e.target.value })} />
        <button className="primary" type="submit">+ Add to pool</button>
      </form>
      {msg && <div className="notice">{msg}</div>}

      <h2>Sessions ({accounts.length})</h2>
      <div className="grid">
        {accounts.map((a) => (
          <div className="card" key={a.id}>
            <div className="row">
              <div><strong>{a.account_ref}</strong> <span style={{ color: "var(--muted)" }}>· {a.platform}</span></div>
              <div className="formrow">
                <span className={`badge ${a.signed_in ? "b-active" : "b-retired"}`}>
                  {a.signed_in ? "● signed in" : "○ not signed in"}
                </span>
                <span className={`badge b-${a.state}`}>{a.state}</span>
              </div>
            </div>
            <div className="meta">profile: {a.profile_ref}{a.leased_by ? ` · leased by ${a.leased_by}` : ""}</div>
            <div className="health"><span style={{ width: `${a.health_score}%` }} /></div>
            <div className="meta">health {a.health_score} · warnings {a.warnings}</div>
            <div className="row" style={{ marginTop: 10 }}>
              <div className="formrow">
                <button className="small primary" onClick={() => signIn(a)}>Sign in</button>
                <button className="small" onClick={() => window.open(`/api/pool/${a.id}/vnc`, "_blank")}>Open VNC</button>
              </div>
              <div className="formrow">
                {a.state !== "active" && <button className="small ghost" onClick={() => act(a.id, "activate")}>Activate</button>}
                <button className="small ghost" onClick={() => act(a.id, "quarantine")}>Quarantine</button>
                <button className="small ghost" onClick={() => act(a.id, "retire")}>Retire</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
