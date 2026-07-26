"use client";
import { useEffect, useState } from "react";

type Job = { id: string; job_type: string; target_url: string | null; status: string; created_at: string };

export default function JobsPanel() {
  const [url, setUrl] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [notice, setNotice] = useState<{ kind: "info" | "err"; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  async function load() {
    const r = await fetch("/api/jobs", { cache: "no-store" });
    setJobs((await r.json()).jobs ?? []);
  }
  useEffect(() => { load(); const t = setInterval(load, 4000); return () => clearInterval(t); }, []);

  useEffect(() => {
    if (!openId) return;
    let live = true;
    const tick = async () => {
      const r = await fetch(`/api/jobs/${openId}`, { cache: "no-store" });
      if (live) setDetail(await r.json());
    };
    tick(); const t = setInterval(tick, 2000);
    return () => { live = false; clearInterval(t); };
  }, [openId]);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    const r = await fetch("/api/jobs", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ target_url: url }),
    });
    const d = await r.json();
    if (r.status === 201) {
      setNotice({ kind: "info", text: `Running on session ${d.session.account_ref} (${d.session.profile_ref}).` });
      setUrl(""); setOpenId(d.job_id); load();
    } else if (d.error === "no_signed_in_session") {
      setNotice({ kind: "err", text: `${d.message} → go to the Session Pool and Sign in a ${d.platform} session.` });
    } else if (d.status === "waiting") {
      setNotice({ kind: "info", text: d.message });
    } else {
      setNotice({ kind: "err", text: d.error ?? d.message ?? "failed" });
    }
  }

  return (
    <>
      <h1>Run a Job on a Post</h1>
      <p className="sub">A post job must run on a signed-in session. The pool leases a free one, waits if all are busy, or asks you to sign in if there are none.</p>

      <form className="formrow" onSubmit={run}>
        <input style={{ flex: 1, minWidth: 340 }} placeholder="https://www.facebook.com/share/p/…"
          value={url} onChange={(e) => setUrl(e.target.value)} />
        <button className="primary" type="submit">▶ Capture</button>
      </form>
      {notice && (
        <div className={`notice ${notice.kind === "err" ? "err" : ""}`}>
          {notice.text}{notice.kind === "err" && <> <a href="/">Open Session Pool →</a></>}
        </div>
      )}

      <h2>Jobs</h2>
      <div className="grid">
        {jobs.map((j) => (
          <div className="card" key={j.id} onClick={() => setOpenId(j.id)} style={{ cursor: "pointer" }}>
            <div className="row">
              <div><strong>{j.job_type}</strong></div>
              <span className={`badge b-${j.status}`}>{j.status}</span>
            </div>
            <div className="meta" style={{ wordBreak: "break-all" }}>{j.target_url}</div>
            <div className="meta">{new Date(j.created_at).toLocaleString()}</div>
          </div>
        ))}
      </div>

      {openId && detail && (
        <>
          <h2>Live — what's being scraped ({openId.slice(0, 8)})</h2>
          <div className="card">
            <div className="row">
              <div>status <span className={`badge b-${detail.job?.status}`}>{detail.job?.status}</span></div>
              <button className="small ghost" onClick={() => setOpenId(null)}>close</button>
            </div>
            <div className="meta">
              custody: {(detail.steps ?? []).map((s: any) => `${s.step_index}.${s.name}:${s.state}`).join("  ") || "—"}
            </div>
            <div className="log" style={{ marginTop: 10 }}>{detail.log || "(waiting for scraper output…)"}</div>
          </div>
        </>
      )}
    </>
  );
}
