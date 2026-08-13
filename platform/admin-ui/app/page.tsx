"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { Check, ChevronRight, Copy, ExternalLink, Maximize2, Monitor, Plus, X } from "lucide-react";
import { FaFacebookF, FaInstagram } from "react-icons/fa";

type Session = {
  worker: number;
  authenticated: boolean;
  state: "available" | "leased" | "login_required";
  login_url: string;
  leased_by?: string;
  reason?: string;
  label?: string;
  novnc_port?: number;
  live_url?: string;
  platform?: "facebook" | "instagram";
  sessions?: Record<"facebook" | "instagram", Omit<Session, "sessions">>;
};

type Job = {
  job_id: string;
  status: string;
  target_url: string;
  scraper: "post-engagement" | "profile-scraper";
  continue_watching: boolean;
  worker: number;
  created_at: string;
  login_url?: string;
  watch_id?: string;
  error?: string;
  result_path?: string;
  download_url?: string;
  summary_url?: string;
  suggested_output_file?: string;
  next_actions?: Record<string, string>;
  live_url?: string;
  partial_reason?: string;
  partial_accepted?: boolean;
  partial_accepted_at?: string;
  content_type?: "reel" | "video" | "post" | "profile";
  selected_scraper?: string;
  platform?: "facebook" | "instagram";
};

type JobLogs = {
  container: string | null;
  running: boolean;
  exit_code: number | null;
  logs: string;
};

type ResultSummary = {
  job_id: string;
  status: string;
  result_path?: string;
  download_url: string;
  suggested_output_file: string;
  summary?: { succeeded: number; partial: number; failed: number };
  completeness?: {
    allCommentsFilterApplied: boolean;
    commentsExtracted: boolean;
    postReactionsExtracted: boolean;
  };
  post_url?: string;
  comments: number;
  reaction_total: number;
  reactor_records: number;
  reaction_count_matches: boolean;
  reaction_count_note?: string;
  reaction_types: Record<string, number>;
};

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080";
const terminal = new Set(["succeeded", "partial", "failed", "cancelled"]);

async function responseBody(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { detail: text };
  }
}

function statusClass(status: string) {
  if (status === "succeeded" || status === "available") return "success";
  if (status === "failed" || status === "cancelled") return "danger";
  if (status === "needs_authentication" || status === "partial" || status === "login_required") return "warning";
  return "";
}

function jobTitle(job: Job) {
  const platform = job.platform === "instagram" ? "Instagram" : "Facebook";
  if (job.scraper === "profile-scraper") return `${platform} profile`;
  if (job.content_type === "reel") return `${platform} reel`;
  if (job.content_type === "video") return `${platform} video`;
  return job.continue_watching ? `${platform} post + watch` : `${platform} post engagement`;
}

function platformLabel(platform?: Job["platform"]) {
  return platform === "instagram" ? "IG" : "FB";
}

export default function Dashboard() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState("");
  const [platform, setPlatform] = useState<"facebook" | "instagram">("facebook");
  const [scraper, setScraper] = useState<Job["scraper"]>("post-engagement");
  const [continueWatching, setContinueWatching] = useState(false);
  const [worker, setWorker] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [openJob, setOpenJob] = useState<string | null>(null);
  const [jobSummary, setJobSummary] = useState<ResultSummary | null>(null);
  const [jobEvents, setJobEvents] = useState<unknown[]>([]);
  const [jobSearch, setJobSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [workerFilter, setWorkerFilter] = useState("all");
  const [platformFilter, setPlatformFilter] = useState("all");
  const [jobSort, setJobSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [jobLogs, setJobLogs] = useState<JobLogs | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [monitorWorker, setMonitorWorker] = useState<Session | null>(null);
  const [addingWorker, setAddingWorker] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [monitorLoaded, setMonitorLoaded] = useState(false);
  const [monitorVersion, setMonitorVersion] = useState(0);
  const [monitorStarting, setMonitorStarting] = useState(false);
  const [monitorError, setMonitorError] = useState<string | null>(null);
  const [monitorFullscreen, setMonitorFullscreen] = useState(false);
  const [mobileView, setMobileView] = useState<"workers" | "jobs" | "capture">("workers");
  const [captureExpanded, setCaptureExpanded] = useState(false);
  const [selectedWorker, setSelectedWorker] = useState<number | null>(null);
  const [curlCopied, setCurlCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      const [sessionResponse, jobsResponse] = await Promise.all([
        fetch(`${API}/v1/workers`, { cache: "no-store" }),
        fetch(`${API}/v1/jobs`, { cache: "no-store" }),
      ]);
      if (!sessionResponse.ok || !jobsResponse.ok) throw new Error("Control API is unavailable.");
      setSessions((await sessionResponse.json()).workers ?? []);
      setJobs((await jobsResponse.json()).jobs ?? []);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = window.setInterval(() => void load(), 3000);
    return () => window.clearInterval(interval);
  }, [load]);

  useEffect(() => {
    if (sessions.length === 0) return;
    setSelectedWorker((current) => current && sessions.some((session) => session.worker === current) ? current : sessions[0].worker);
  }, [sessions]);

  useEffect(() => {
    if (!monitorWorker) return;
    setMonitorLoaded(false);
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMonitorWorker(null);
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [monitorWorker, monitorVersion]);

  const stats = useMemo(() => ({
    authenticated: sessions.reduce((count, session) => count + (["facebook", "instagram"] as const).filter((name) => session.sessions?.[name]?.authenticated ?? (name === "facebook" && session.authenticated)).length, 0),
    available: sessions.filter((session) => session.state === "available").length,
    active: jobs.filter((job) => !terminal.has(job.status)).length,
    watching: jobs.filter((job) => job.status === "watching").length,
  }), [jobs, sessions]);

  const activeSession = useMemo(
    () => sessions.find((session) => session.worker === selectedWorker) ?? sessions[0],
    [selectedWorker, sessions],
  );
  const selectedWorkerJobs = useMemo(
    () => jobs.filter((job) => job.worker === activeSession?.worker),
    [activeSession?.worker, jobs],
  );
  const selectedWorkerActiveJob = selectedWorkerJobs.find((job) => !terminal.has(job.status));
  const selectedAuthCount = activeSession
    ? (["facebook", "instagram"] as const).filter((name) => activeSession.sessions?.[name]?.authenticated ?? (name === "facebook" && activeSession.authenticated)).length
    : 0;
  const composedCurl = useMemo(() => {
    const payload = {
      platform,
      action: scraper === "profile-scraper" ? "profile" : (platform === "facebook" && continueWatching ? "watch" : "scrape"),
      target_url: targetUrl || (platform === "instagram" ? "https://www.instagram.com/reel/SHORTCODE/" : "https://www.facebook.com/PROFILE/posts/POST_ID"),
      worker: activeSession?.worker ?? (worker ? Number(worker) : 1),
      ...(scraper === "profile-scraper" ? { max_posts: 20 } : {}),
      ...(platform === "facebook" && continueWatching ? { poll_interval_seconds: 90 } : {}),
    };
    return `curl -sS -X POST ${API}/v1/jobs \\\n  -H 'Content-Type: application/json' \\\n  -d '${JSON.stringify(payload, null, 2)}' | jq`;
  }, [activeSession?.worker, continueWatching, platform, scraper, targetUrl, worker]);

  const visibleJobs = useMemo(() => {
    const query = jobSearch.trim().toLocaleLowerCase();
    return jobs
      .filter((job) => !activeSession || job.worker === activeSession.worker)
      .filter((job) => statusFilter === "all" || job.status === statusFilter)
      .filter((job) => platformFilter === "all" || (job.platform ?? "facebook") === platformFilter)
      .filter((job) => workerFilter === "all" || String(job.worker) === workerFilter)
      .filter((job) => !query || `${job.job_id} ${job.target_url} ${job.scraper}`.toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        if (jobSort === "oldest") return Date.parse(left.created_at) - Date.parse(right.created_at);
        if (jobSort === "status") return left.status.localeCompare(right.status) || Date.parse(right.created_at) - Date.parse(left.created_at);
        return Date.parse(right.created_at) - Date.parse(left.created_at);
      });
  }, [activeSession, jobSearch, jobSort, jobs, platformFilter, statusFilter, workerFilter]);

  const pageCount = Math.max(1, Math.ceil(visibleJobs.length / pageSize));
  const paginatedJobs = visibleJobs.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [jobSearch, jobSort, pageSize, platformFilter, statusFilter, workerFilter]);
  useEffect(() => setPage((current) => Math.min(current, pageCount)), [pageCount]);

  useEffect(() => {
    if (!openJob) {
      setJobLogs(null);
      return;
    }
    let active = true;
    const refreshLogs = async () => {
      const response = await fetch(`${API}/v1/jobs/${openJob}/logs?tail=250`, { cache: "no-store" });
      if (active && response.ok) setJobLogs(await response.json());
    };
    void refreshLogs();
    const interval = window.setInterval(() => void refreshLogs(), 2000);
    return () => { active = false; window.clearInterval(interval); };
  }, [openJob]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`${API}/v1/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          target_url: targetUrl,
          platform,
          scraper,
          continue_watching: platform === "facebook" && scraper === "post-engagement" && continueWatching,
          worker: activeSession?.worker ?? (worker ? Number(worker) : null),
          max_posts: 20,
          poll_interval_seconds: 90,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? "Could not create the capture job.");
      setTargetUrl("");
      await load();
      setOpenJob(body.job_id);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : String(submitError));
    } finally {
      setSubmitting(false);
    }
  }

  async function openDetail(job: Job) {
    setOpenJob(openJob === job.job_id ? null : job.job_id);
    setJobSummary(null);
    setJobEvents([]);
    setJobLogs(null);
    if (openJob === job.job_id) return;
    const [summaryResponse, eventResponse] = await Promise.all([
      fetch(`${API}/v1/jobs/${job.job_id}/result/summary`, { cache: "no-store" }),
      fetch(`${API}/v1/jobs/${job.job_id}/events`, { cache: "no-store" }),
    ]);
    if (summaryResponse.ok) setJobSummary(await summaryResponse.json());
    if (eventResponse.ok) setJobEvents((await eventResponse.json()).events ?? []);
  }

  async function stopWatch(job: Job) {
    const response = await fetch(`${API}/v1/jobs/${job.job_id}/watch`, { method: "DELETE" });
    if (!response.ok) setError((await response.json()).detail ?? "Could not stop the watch.");
    await load();
  }

  async function runJobAction(job: Job, action: "authentication/start" | "authentication-complete" | "watch/restart" | "restart" | "cancel") {
    setActionBusy(action);
    setError(null);
    try {
      const response = await fetch(`${API}/v1/jobs/${job.job_id}/${action}`, { method: "POST" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.detail ?? `Could not run ${action}.`);
      if (action === "restart") {
        setJobs((current) => current.map((item) => item.job_id === job.job_id ? { ...item, ...body, error: undefined, result_path: undefined } : item));
        setJobSummary(null);
        setJobLogs(null);
        setSuccess(`${jobTitle(job)} resumed on worker-${job.worker}.`);
      }
      await load();
      if (action === "restart") {
        const deadline = Date.now() + 30_000;
        while (Date.now() < deadline) {
          await new Promise((resolve) => window.setTimeout(resolve, 1000));
          const currentResponse = await fetch(`${API}/v1/jobs/${job.job_id}`, { cache: "no-store" });
          if (!currentResponse.ok) continue;
          const currentJob = await currentResponse.json() as Job;
          setJobs((items) => items.map((item) => item.job_id === job.job_id ? currentJob : item));
          if (terminal.has(currentJob.status)) {
            if (currentJob.status === "succeeded") {
              const summaryResponse = await fetch(`${API}/v1/jobs/${job.job_id}/result/summary`, { cache: "no-store" });
              if (summaryResponse.ok) setJobSummary(await summaryResponse.json());
            }
            break;
          }
        }
      }
      if (action === "authentication/start" && body.login_url) window.open(body.login_url, "_blank", "noopener,noreferrer");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setActionBusy(null);
    }
  }

  async function addWorker() {
    setAddingWorker(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`${API}/v1/workers`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(String(body.detail ?? "Could not add worker."));
      await load();
      setSuccess(`worker-${body.worker} is ready. Authenticate it to create a persistent Facebook session.`);
      setMobileView("workers");
    } catch (workerError) {
      setError(workerError instanceof Error ? workerError.message : String(workerError));
    } finally {
      setAddingWorker(false);
    }
  }

  async function authenticateWorker(session: Session, finish = false, authPlatform: "facebook" | "instagram" = "facebook") {
    setActionBusy(`worker-${session.worker}`);
    setError(null);
    setSuccess(null);
    if (!finish) {
      setMonitorLoaded(false);
      setMonitorStarting(true);
      setMonitorError(null);
      setMonitorWorker(session);
    }
    try {
      const response = await fetch(`${API}/v1/workers/${session.worker}/authentication/${finish ? "finish" : "start"}?platform=${authPlatform}`, { method: "POST" });
      const body = await responseBody(response);
      if (!response.ok) throw new Error(String(body.detail ?? "Worker authentication failed."));
      await load();
      if (!finish) {
        const liveSession = { ...session, platform: authPlatform, live_url: String(body.live_url ?? session.login_url) };
        setMonitorVersion((current) => current + 1);
        setMonitorWorker(liveSession);
        setMonitorStarting(false);
      } else if (body.authenticated) {
        setSuccess(`worker-${session.worker} is authenticated to ${authPlatform} and available.`);
        setMonitorWorker(null);
      } else {
        throw new Error(String(body.reason ?? `${authPlatform} login is not complete yet. Keep the monitor open and finish signing in.`));
      }
    } catch (workerError) {
      const message = workerError instanceof Error ? workerError.message : String(workerError);
      setError(message);
      if (!finish) {
        setMonitorStarting(false);
        setMonitorError(message);
      }
    } finally {
      setActionBusy(null);
    }
  }

  async function openSelectedMonitor() {
    if (!activeSession) return;
    setMonitorFullscreen(false);
    if (selectedWorkerActiveJob?.live_url) {
      setMonitorLoaded(false);
      setMonitorError(null);
      setMonitorWorker({
        ...activeSession,
        platform: selectedWorkerActiveJob.platform ?? "facebook",
        live_url: selectedWorkerActiveJob.live_url,
      });
      return;
    }
    await authenticateWorker(activeSession, false, platform);
  }

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">EC</div>
          <div><h1>Evidence Control</h1><p>Browser worker operations</p></div>
        </div>
        <div className="live"><span className="live-dot" aria-hidden="true" />Control plane live</div>
      </header>

      <main className="page">
        <div className="worker-workspace-head">
          <div className="worker-workspace-title"><div className="selected-worker-avatar" aria-hidden="true">W{activeSession?.worker ?? "–"}</div><div><span className="eyebrow">Selected worker</span><h2>{activeSession?.label ?? "No worker selected"}</h2><p>{selectedWorkerActiveJob ? `${selectedWorkerActiveJob.status.replaceAll("_", " ")} · ${jobTitle(selectedWorkerActiveJob)}` : "Idle · ready for a new capture"}</p></div></div>
          <div className="worker-head-actions"><div className="platform-provision" aria-label="Worker platform sessions">{(["facebook", "instagram"] as const).map((name) => { const state = activeSession?.sessions?.[name] ?? (name === "facebook" ? activeSession : undefined); const ready = state?.authenticated ?? false; return <button type="button" className={`${name} ${ready ? "provisioned" : ""}`} disabled={!activeSession || actionBusy !== null || state?.state === "leased"} onClick={() => { if (!activeSession) return; setPlatform(name); void authenticateWorker(activeSession, false, name); }} aria-pressed={ready}>{name === "facebook" ? <FaFacebookF aria-hidden="true" /> : <FaInstagram aria-hidden="true" />}<span><strong>{name}</strong><small>{ready ? "Provisioned" : "Provision session"}</small></span>{ready && <Check size={13} aria-hidden="true" />}</button>; })}</div><div className="worker-head-status"><div><span>State</span><strong className={selectedWorkerActiveJob ? "busy" : "idle"}>{selectedWorkerActiveJob ? "Busy" : "Idle"}</strong></div><div><span>Auth</span><strong>{selectedAuthCount}/2</strong></div><div><span>Jobs</span><strong>{selectedWorkerJobs.length}</strong></div><button className="monitor-primary" type="button" disabled={!activeSession || actionBusy !== null} onClick={() => void openSelectedMonitor()}><Monitor size={15} aria-hidden="true" />Open monitor</button></div></div>
        </div>

        <div className="notices">
          {error && <p className="notice error" role="alert">{error} <button className="button secondary" type="button" onClick={() => void load()}>Retry</button></p>}
          {success && <p className="notice success-notice" role="status">{success}<button className="notice-close" type="button" aria-label="Dismiss message" onClick={() => setSuccess(null)}>×</button></p>}
        </div>

        <div className={`grid workspace-grid ${monitorWorker && !monitorFullscreen ? "has-monitor" : ""}`}>
          <div className="stack">
            <section className={`panel capture-panel mobile-section ${captureExpanded ? "expanded" : "collapsed"} ${mobileView === "capture" ? "mobile-active" : ""}`}>
              <div className="panel-head capture-panel-head"><div><h3>New capture</h3><span>Container per job</span></div><button className="panel-toggle" type="button" aria-expanded={captureExpanded} aria-controls="capture-panel-content" onClick={() => setCaptureExpanded((current) => !current)}><span aria-hidden="true">{captureExpanded ? "−" : "+"}</span>{captureExpanded ? "Minimize" : "Expand"}</button></div>
              <div id="capture-panel-content" className="panel-body capture-panel-content" hidden={!captureExpanded}>
                <form className="form" onSubmit={submit}>
                  <div className="field">
                    <label htmlFor="platform">Platform</label>
                    <select id="platform" className="select" value={platform} onChange={(event) => { const next = event.target.value as "facebook" | "instagram"; setPlatform(next); setContinueWatching(false); setScraper("post-engagement"); }}>
                      <option value="facebook">Facebook</option>
                      <option value="instagram">Instagram</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="target-url">{platform === "instagram" ? "Instagram" : "Facebook"} URL</label>
                    <input id="target-url" className="input" type="url" inputMode="url" autoComplete="url" spellCheck={false} required placeholder={platform === "instagram" ? "https://www.instagram.com/..." : "https://www.facebook.com/..."} value={targetUrl} onChange={(event) => setTargetUrl(event.target.value)} />
                    <small>{platform === "instagram" ? "Post, reel, TV, or profile URL." : "Post, share link, reel, video, or profile URL."}</small>
                  </div>
                  <div className="field">
                    <label htmlFor="scraper">Capture type</label>
                    <select id="scraper" className="select" value={scraper} onChange={(event) => setScraper(event.target.value as Job["scraper"])}>
                      <option value="post-engagement">{platform === "instagram" ? "Post or reel · comments, replies, likes" : "Post · comments, replies, reactions"}</option>
                      <option value="profile-scraper">{platform === "instagram" ? "Profile · metadata and 20 recent posts" : "Profile · about tabs and 20 recent posts"}</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="worker">Session slot</label>
                    <select id="worker" className="select" value={worker} onChange={(event) => setWorker(event.target.value)}>
                      <option value="">Select automatically</option>
                      {sessions.filter((session) => (session.sessions?.[platform]?.state ?? session.state) !== "leased").map((session) => <option key={session.worker} value={session.worker}>worker-{session.worker} · {(session.sessions?.[platform]?.authenticated ?? (platform === "facebook" && session.authenticated)) ? "signed in" : "login required"}</option>)}
                    </select>
                  </div>
                  {platform === "facebook" && scraper === "post-engagement" && <label className="checkbox-row" htmlFor="continue-watching"><input id="continue-watching" type="checkbox" checked={continueWatching} onChange={(event) => setContinueWatching(event.target.checked)} /><span><strong>Continue watching</strong><span>Keep a watch container running and emit an event for each new comment.</span></span></label>}
                  <button className="button" type="submit" disabled={submitting} aria-busy={submitting}>{submitting ? "Creating worker…" : "Start capture"}</button>
                  <section className="curl-composer" aria-label="Generated curl command"><header><div><strong>API curl composer</strong><span>Uses this URL, action, and worker</span></div><button type="button" onClick={async () => { await navigator.clipboard.writeText(composedCurl); setCurlCopied(true); window.setTimeout(() => setCurlCopied(false), 1500); }}><Copy size={13} aria-hidden="true" />{curlCopied ? "Copied" : "Copy curl"}</button></header><pre>{composedCurl}</pre></section>
                </form>
              </div>
            </section>

            <aside className={`worker-sidebar mobile-section ${mobileView === "workers" ? "mobile-active" : ""}`} aria-label="Worker threads">
              <div className="worker-sidebar-head"><div><span>Workers</span><strong>{sessions.length} identities</strong></div><button type="button" disabled={addingWorker} onClick={() => void addWorker()} aria-label="Add worker">{addingWorker ? <span className="mini-loader" /> : <Plus size={16} aria-hidden="true" />}</button></div>
              <div className="worker-threads">{sessions.map((session) => { const fb = session.sessions?.facebook ?? session; const ig = session.sessions?.instagram; const activeJob = jobs.find((job) => job.worker === session.worker && !terminal.has(job.status)); return <button className={`worker-thread ${activeSession?.worker === session.worker ? "selected" : ""}`} key={session.worker} type="button" onClick={() => { setSelectedWorker(session.worker); setWorker(String(session.worker)); setMobileView("jobs"); }}><span className="thread-avatar">W{session.worker}</span><span className="thread-copy"><strong>{session.label ?? `worker-${session.worker}`}</strong><small>{activeJob ? `${activeJob.status.replaceAll("_", " ")} · ${jobTitle(activeJob)}` : "Idle"}</small></span><span className="thread-platforms"><i className={fb.authenticated ? "ready facebook" : "facebook"} aria-label={`Facebook ${fb.authenticated ? "authenticated" : "not authenticated"}`}><FaFacebookF aria-hidden="true" /></i><i className={ig?.authenticated ? "ready instagram" : "instagram"} aria-label={`Instagram ${ig?.authenticated ? "authenticated" : "not authenticated"}`}><FaInstagram aria-hidden="true" /></i></span><ChevronRight className="thread-chevron" size={14} aria-hidden="true" /><span className="thread-tooltip"><strong>{session.label ?? `worker-${session.worker}`}</strong><span><FaFacebookF aria-hidden="true" /> Facebook · {fb.authenticated ? "signed in" : "login required"}</span><span><FaInstagram aria-hidden="true" /> Instagram · {ig?.authenticated ? "signed in" : "login required"}</span><span>State · {activeJob ? "busy" : "idle"}</span></span></button>; })}</div>
              <div className="worker-sidebar-foot"><span>{stats.available} available</span><span>{stats.active} active</span></div>
            </aside>
          </div>

          <section className={`panel jobs-panel mobile-section ${mobileView === "jobs" ? "mobile-active" : ""}`}>
            <div className="panel-head"><h3>Jobs and results</h3><span>{visibleJobs.length} of {jobs.length}</span></div>
            <div className="job-controls">
              <div className="field search-field"><label htmlFor="job-search">Search jobs</label><input id="job-search" className="input" type="search" placeholder="URL or job ID" value={jobSearch} onChange={(event) => setJobSearch(event.target.value)} /></div>
              <div className="field"><label htmlFor="status-filter">Status</label><select id="status-filter" className="select" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option>{[...new Set(jobs.map((job) => job.status))].sort().map((status) => <option key={status} value={status}>{status.replaceAll("_", " ")}</option>)}</select></div>
              <div className="field"><label htmlFor="platform-filter">Platform</label><select id="platform-filter" className="select" value={platformFilter} onChange={(event) => setPlatformFilter(event.target.value)}><option value="all">All platforms</option><option value="facebook">Facebook</option><option value="instagram">Instagram</option></select></div>
              <div className="field"><label htmlFor="worker-filter">Worker</label><select id="worker-filter" className="select" value={workerFilter} onChange={(event) => setWorkerFilter(event.target.value)}><option value="all">All workers</option>{sessions.map((session) => <option key={session.worker} value={session.worker}>worker-{session.worker}</option>)}</select></div>
              <div className="field"><label htmlFor="job-sort">Sort</label><select id="job-sort" className="select" value={jobSort} onChange={(event) => setJobSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="status">Status</option></select></div>
              <div className="field"><label htmlFor="page-size">Rows</label><select id="page-size" className="select" value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}><option value="5">5</option><option value="10">10</option><option value="20">20</option><option value="50">50</option></select></div>
            </div>
              {loading ? <><div className="skeleton" /><div className="skeleton" /><div className="skeleton" /></> : jobs.length === 0 ? <div className="empty">No captures yet. Submit a supported social URL to start.</div> : visibleJobs.length === 0 ? <div className="empty">No jobs match the current filters.</div> : <><div className="job-list">{paginatedJobs.map((job) => <div key={job.job_id}><button className="job" type="button" onClick={() => void openDetail(job)} aria-expanded={openJob === job.job_id}><div className="job-top"><div><strong><span className={`platform-chip ${(job.platform ?? "facebook")}`}>{platformLabel(job.platform)}</span>{jobTitle(job)}</strong><div className="meta">{job.platform ?? "facebook"} · {job.content_type ?? "unknown"} → {job.selected_scraper ?? job.scraper} · worker-{job.worker} · {new Date(job.created_at).toLocaleString()}</div></div><span className={`badge ${statusClass(job.status)}`}>{job.status.replaceAll("_", " ")}</span></div><div className="url">{job.target_url}</div></button>{openJob === job.job_id && <div className="detail"><div className="detail-heading"><div><div className="meta">JOB {job.job_id}</div><div className="meta">Detected {job.content_type ?? "unknown"} · scraper {job.selected_scraper ?? job.scraper} · worker-{job.worker} · {jobLogs?.container ?? "no active container"}</div></div>{job.live_url && <a className="live-link" href={job.live_url} target="_blank" rel="noreferrer">Live browser ↗</a>}</div>{job.error && <p className="notice error">{job.error}</p>}{job.status === "succeeded" && job.partial_reason && <p className="notice warning"><strong>Completeness note:</strong> {job.partial_reason}</p>}<div className="detail-actions">{!terminal.has(job.status) && <button className="button cancel-button" type="button" disabled={actionBusy !== null} onClick={() => { if (window.confirm("Cancel this process and release its worker?")) void runJobAction(job, "cancel"); }}>Cancel process</button>}{job.status === "needs_authentication" && <><button className="button" type="button" disabled={actionBusy !== null} onClick={() => void runJobAction(job, "authentication/start")}>Start authentication</button><a className="button secondary" href={job.live_url ?? job.login_url} target="_blank" rel="noreferrer">Open login browser</a><button className="button secondary" type="button" disabled={actionBusy !== null} onClick={() => void runJobAction(job, "authentication-complete")}>Resume after login</button></>}{(job.status === "failed" || job.status === "cancelled") && <button className="button" type="button" disabled={actionBusy !== null} onClick={() => void runJobAction(job, "restart")}>Resume job</button>}{job.status === "watching" && <button className="button secondary danger" type="button" onClick={() => void stopWatch(job)}>Stop watching</button>}{job.continue_watching && job.result_path && job.status !== "watching" && <button className="button secondary" type="button" disabled={actionBusy !== null} onClick={() => void runJobAction(job, "watch/restart")}>Restart watch</button>}{job.result_path && <><a className="button" href={`${API}/v1/jobs/${job.job_id}/result/download`}>Download JSON</a><a className="button secondary" href={`${API}/v1/jobs/${job.job_id}/result`} target="_blank" rel="noreferrer">Open full JSON</a></>}</div>{job.status === "needs_authentication" && <p className="sub">Start authentication, sign in through the live browser, then resume the queued job.</p>}{jobSummary && <div className="result-summary"><div className="result-stats"><div><span>Comments</span><strong>{jobSummary.comments}</strong></div><div><span>Displayed reactions</span><strong>{jobSummary.reaction_total}</strong></div><div><span>Reactor records</span><strong>{jobSummary.reactor_records}</strong></div></div>{!jobSummary.reaction_count_matches && jobSummary.reaction_count_note && <p className="notice warning">{jobSummary.reaction_count_note}</p>}<div className="reaction-breakdown">{Object.entries(jobSummary.reaction_types).map(([reaction, count]) => <span key={reaction}>{reaction} <strong>{count}</strong></span>)}</div><div className="result-location"><span>Saved result</span><code>{jobSummary.result_path ?? job.result_path}</code><small>Download filename: {jobSummary.suggested_output_file}</small></div></div>}<section className="log-panel" aria-live="polite"><div className="log-head"><strong>Live logs</strong><span>{jobLogs?.running ? "streaming" : jobLogs?.container ? `stopped · ${jobLogs.exit_code ?? "?"}` : "waiting"}</span></div><pre>{jobLogs?.logs || "No container logs available yet."}</pre></section>{jobEvents.length > 0 && <details className="event-details"><summary>{jobEvents.length} watch events</summary><pre>{JSON.stringify({ watchEvents: jobEvents }, null, 2)}</pre></details>}{jobSummary === null && !job.error && job.status !== "needs_authentication" && <p className="sub">The structured result and download link appear here when the worker finishes.</p>}</div>}</div>)}</div><nav className="pagination" aria-label="Job pages"><button className="button secondary" type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</button><span>Page {page} of {pageCount}</span><button className="button secondary" type="button" disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>Next</button></nav></>}
          </section>
          {monitorWorker && !monitorFullscreen && <aside className="monitor-dock" aria-label={`${monitorWorker.label ?? `worker-${monitorWorker.worker}`} live monitor`}><header><div><span>Live TV preview</span><strong>{monitorWorker.label ?? `worker-${monitorWorker.worker}`}</strong></div><div><button type="button" aria-label="Expand monitor fullscreen" onClick={() => setMonitorFullscreen(true)}><Maximize2 size={15} aria-hidden="true" /></button><button type="button" aria-label="Close monitor" onClick={() => setMonitorWorker(null)}><X size={16} aria-hidden="true" /></button></div></header><div className="monitor-dock-frame">{monitorError ? <div className="monitor-loading monitor-failed"><strong>Browser could not start</strong><span>{monitorError}</span></div> : (!monitorLoaded || monitorStarting) && <div className="monitor-loading"><span className="monitor-spinner" aria-hidden="true" /><strong>{monitorStarting ? `Preparing ${monitorWorker.platform ?? "browser"}…` : "Connecting to live browser…"}</strong></div>}{!monitorStarting && !monitorError && <iframe key={`dock-${monitorWorker.worker}-${monitorVersion}`} title={`Worker ${monitorWorker.worker} docked live browser`} src={monitorWorker.live_url ?? monitorWorker.login_url} allow="clipboard-read; clipboard-write; fullscreen" onLoad={() => setMonitorLoaded(true)} />}</div><footer><span>noVNC :{monitorWorker.novnc_port ?? 6080 + monitorWorker.worker}</span><a href={monitorWorker.live_url ?? monitorWorker.login_url} target="_blank" rel="noreferrer"><ExternalLink size={13} aria-hidden="true" />New tab</a></footer></aside>}
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Dashboard sections">
        <button type="button" className={mobileView === "workers" ? "active" : ""} aria-current={mobileView === "workers" ? "page" : undefined} onClick={() => setMobileView("workers")}><span aria-hidden="true">▣</span>Workers</button>
        <button type="button" className={mobileView === "jobs" ? "active" : ""} aria-current={mobileView === "jobs" ? "page" : undefined} onClick={() => setMobileView("jobs")}><span aria-hidden="true">≡</span>Jobs</button>
        <button type="button" className={mobileView === "capture" ? "active" : ""} aria-current={mobileView === "capture" ? "page" : undefined} onClick={() => { setMobileView("capture"); setCaptureExpanded(true); }}><span aria-hidden="true">＋</span>Capture</button>
      </nav>
      {monitorWorker && monitorFullscreen && <div className="tv-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !monitorStarting) setMonitorFullscreen(false); }}><section className="tv-modal" role="dialog" aria-modal="true" aria-labelledby="tv-title"><header><div><span>{monitorStarting ? "STARTING BROWSER" : "LIVE MONITOR"}</span><h2 id="tv-title">{monitorWorker.label ?? `worker-${monitorWorker.worker}`}</h2></div><button className="tv-close" type="button" aria-label="Exit fullscreen monitor" disabled={monitorStarting} onClick={() => setMonitorFullscreen(false)}><X size={20} aria-hidden="true" /></button></header><div className="tv-frame">{monitorError ? <div className="monitor-loading monitor-failed"><strong>Browser could not start</strong><span>{monitorError}</span><button type="button" onClick={() => void authenticateWorker(monitorWorker, false, monitorWorker.platform ?? "facebook")}>Try again</button></div> : (!monitorLoaded || monitorStarting) && <div className="monitor-loading"><span className="monitor-spinner" aria-hidden="true" /><strong>{monitorStarting ? `Preparing ${monitorWorker.platform ?? "facebook"} sign-in…` : "Connecting to the browser…"}</strong><span>{monitorStarting ? "Starting the worker, noVNC, and Chrome. This normally takes 5–15 seconds." : "The browser is running. Establishing the live monitor connection."}</span><div className="monitor-steps" aria-label="Authentication startup progress"><span className="done">Worker requested</span><span className={monitorStarting ? "active" : "done"}>Chrome starting</span><span className={!monitorStarting ? "active" : ""}>{monitorWorker.platform ?? "facebook"} sign-in</span></div></div>}{!monitorStarting && !monitorError && <iframe key={`${monitorWorker.worker}-${monitorVersion}`} title={`Worker ${monitorWorker.worker} live browser`} src={monitorWorker.live_url ?? monitorWorker.login_url} allow="clipboard-read; clipboard-write; fullscreen" onLoad={() => setMonitorLoaded(true)} />}</div><footer><span>{monitorStarting ? "Launching…" : `noVNC · port ${monitorWorker.novnc_port ?? 6080 + monitorWorker.worker}`}</span><div>{!monitorStarting && !monitorError && <button type="button" onClick={() => { setMonitorLoaded(false); setMonitorVersion((current) => current + 1); }}>Reconnect</button>}<a href={monitorWorker.live_url ?? monitorWorker.login_url} target="_blank" rel="noreferrer">Open full screen ↗</a></div></footer></section></div>}
    </div>
  );
}
