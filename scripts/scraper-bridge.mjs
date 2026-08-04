#!/usr/bin/env node
/**
 * Scraper bridge — the scraper's ONE api (POST /run) that the central API Gateway calls.
 *
 * Pascal's architecture: the gateway forwards a request to the scraper service; the
 * scraper does the work. Here the "work" runs INSIDE the live docker worker (its native
 * signed-in Chrome + noVNC), via `docker exec`, so it's safe and watchable in real time.
 *
 *   POST /run  { "target_url": "...", "mode": "post" | "profile" }
 *   GET  /health
 */
import http from 'node:http';
import { execFile } from 'node:child_process';

const PORT = Number(process.env.PORT || 8000);
const WORKER = process.env.WORKER_CONTAINER || 'fb-live';
const DEFAULT_MODE = process.env.SCRAPER_MODE || 'post';

const buildScript = (mode, url) => {
  const q = JSON.stringify(url);
  const clean = 'rm -f /data/profiles/facebook/Singleton*;';
  if (mode === 'profile') {
    return `${clean} SCRAPE_SCREEN_VIDEO=0 SCRAPE_MAX_POSTS=20 node /app/dist/facebook/scrapers/profile/run.js ${q}`;
  }
  return `${clean} SCRAPE_SCREEN_VIDEO=0 node /app/dist/main.js --target facebook --scraper post-engagement`
    + ` --target-url ${q} --concurrency 1 --profile-root-dir /data/profiles`
    + ` --chrome-executable /usr/bin/google-chrome-stable --artifact-root-dir /data/artifacts`;
};

const scrape = (mode, url) => new Promise((resolve) => {
  const args = ['exec', '-e', 'DISPLAY=:99', WORKER, 'bash', '-lc', buildScript(mode, url)];
  execFile('docker', args, { maxBuffer: 128 * 1024 * 1024, timeout: 300_000 }, (err, stdout, stderr) => {
    let data = null;
    try { data = JSON.parse(stdout); } catch { /* not JSON */ }
    if (data) return resolve({ status: 200, body: data });
    resolve({
      status: 502,
      body: {
        error: 'scrape_failed', mode, target_url: url, worker: WORKER,
        detail: (err && err.message) || 'no JSON on stdout',
        stderr: String(stderr || '').slice(-1500),
      },
    });
  });
});

const send = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
  res.end(body);
};

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/health' || req.url === '/')) {
    return send(res, 200, { status: 'ok', service: 'scraper-bridge', worker: WORKER, default_mode: DEFAULT_MODE });
  }
  if (req.method === 'POST' && req.url === '/run') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', async () => {
      let payload = {};
      try { payload = body ? JSON.parse(body) : {}; } catch { /* ignore */ }
      const url = payload.target_url;
      const mode = payload.mode || DEFAULT_MODE;
      if (!url) return send(res, 400, { error: 'target_url required' });
      process.stderr.write(`[bridge] ${new Date().toISOString()}  ${mode}  <-  ${url}\n`);
      const { status, body: out } = await scrape(mode, url);
      process.stderr.write(`[bridge] ${new Date().toISOString()}  ${mode}  ->  HTTP ${status}\n`);
      send(res, status, out);
    });
    return;
  }
  send(res, 404, { error: 'not_found', hint: 'POST /run { target_url, mode }' });
});

server.listen(PORT, () => process.stderr.write(`scraper-bridge on :${PORT} -> docker exec ${WORKER}\n`));
