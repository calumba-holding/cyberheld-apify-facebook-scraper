#!/usr/bin/env node
/**
 * API Facebook Watch — the scraper service behind the gateway's POST /facebook/watch.
 *
 * The architecture: this is a *separate* service (docker container `watch-posting`)
 * exposing ONE API — `POST /run`. The central API Gateway forwards the request here;
 * this service does the actual observation of a posting and returns the result.
 *
 * `POST /run  { "target_url": "<facebook post url>" }`
 *   -> opens the post in a signed-in Chrome profile, scrapes its current comments,
 *      returns { session_ok, method, comment_count, comments }.
 *
 * It wraps the existing watch poller (createWatchPoller -> pollPostComments), which is
 * the same observation the always-on watch CLI runs each tick — just one shot, over HTTP.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';

import { defaultArtifactRootDir, defaultChromeExecutable } from '../cli/help.js';
import { log } from '../common/logger.js';
import { NeedsAuthenticationError, listWorkerSessions, resolveAuthenticatedWorker } from '../facebook/session.js';
import { createWatchPoller } from './poller.js';

const PORT = Number(process.env.PORT ?? 8000);
// Bind IPv4 wildcard so 127.0.0.1 reaches us (default Node bind is IPv6-only on macOS).
const HOST = process.env.HOST ?? '0.0.0.0';
// The multi-tenant session pool. The gate resolves which authenticated worker to take
// over; a fire on an unauthenticated session is refused (never scraped logged-out).
const PROFILES_ROOT = process.env.WATCH_PROFILES_ROOT ?? join(process.cwd(), 'docker/profiles');
const WORKER = process.env.WATCH_WORKER; // optional: pin a specific worker, e.g. "2"
const CHROME = process.env.SCRAPE_CHROME_EXECUTABLE ?? defaultChromeExecutable;
const ARTIFACTS = process.env.WATCH_ARTIFACT_ROOT ?? defaultArtifactRootDir;

// One observation at a time — a single profile can only drive one Chrome at a time.
let tail: Promise<unknown> = Promise.resolve();
const serialize = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = tail.then(fn, fn);
    tail = run.catch(() => undefined);
    return run;
};

interface ObservationResult {
    service: string;
    worker: string;
    target_url: string;
    session_ok: boolean;
    method: string;
    comment_count: number;
    comments: unknown[];
    error?: string;
}

const observePosting = async (targetUrl: string): Promise<ObservationResult> => {
    // GATE: resolve an authenticated worker (or throw NeedsAuthenticationError). We never
    // scrape a signed-out profile — that is what returned garbage on worker-1.
    const session = await resolveAuthenticatedWorker({ profilesRoot: PROFILES_ROOT, worker: WORKER });
    log.info(`Taking over ${session.worker} (authenticated) for ${targetUrl}`);

    const poller = await createWatchPoller({
        profileRootDir: session.profileRootDir,
        artifactRootDir: ARTIFACTS,
        chromeExecutable: CHROME,
        commentsOnly: true,
    });
    try {
        const result = await poller.pollPostComments(targetUrl);
        return {
            service: 'API Facebook Watch',
            worker: session.worker,
            target_url: targetUrl,
            session_ok: result.sessionOk,
            method: result.method,
            comment_count: result.comments.length,
            comments: result.comments,
            ...(result.error ? { error: result.error } : {}),
        };
    } finally {
        await poller.close();
    }
};

const readJson = async (req: IncomingMessage): Promise<Record<string, unknown>> => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const body = Buffer.concat(chunks).toString('utf8').trim();
    if (!body) return {};
    return JSON.parse(body) as Record<string, unknown>;
};

const send = (res: ServerResponse, status: number, payload: unknown): void => {
    const body = JSON.stringify(payload);
    res.writeHead(status, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) });
    res.end(body);
};

const server = createServer((req, res) => {
    const url = req.url ?? '/';

    if (req.method === 'GET' && (url === '/health' || url === '/')) {
        void (async () => {
            const sessions = await listWorkerSessions(PROFILES_ROOT);
            send(res, 200, {
                status: 'ok',
                service: 'API Facebook Watch',
                profiles_root: PROFILES_ROOT,
                worker: WORKER ? `worker-${WORKER.replace(/^worker-/, '')}` : '(first authenticated)',
                sessions: sessions.map((entry) => ({ worker: entry.worker, authenticated: entry.authenticated })),
            });
        })();
        return;
    }

    if (req.method === 'POST' && url === '/run') {
        void (async () => {
            let targetUrl: string;
            try {
                const body = await readJson(req);
                const value = body.target_url;
                if (typeof value !== 'string' || value.trim().length === 0) {
                    send(res, 400, { error: 'target_url is required' });
                    return;
                }
                targetUrl = value.trim();
            } catch {
                send(res, 400, { error: 'invalid JSON body' });
                return;
            }

            try {
                log.info(`/run observe: ${targetUrl}`);
                const result = await serialize(() => observePosting(targetUrl));
                send(res, 200, result);
            } catch (error) {
                if (error instanceof NeedsAuthenticationError) {
                    // The gate refused: no signed-in session. Ask the caller to authenticate first.
                    send(res, 409, {
                        service: 'API Facebook Watch',
                        error: 'needs_authentication',
                        message: error.message,
                        sessions: error.sessions.map((entry) => ({ worker: entry.worker, authenticated: entry.authenticated })),
                    });
                    return;
                }
                const message = error instanceof Error ? error.message : String(error);
                log.error(`/run failed: ${message}`);
                send(res, 500, { service: 'API Facebook Watch', target_url: targetUrl, error: message });
            }
        })();
        return;
    }

    send(res, 404, { error: 'not_found', hint: 'POST /run  { target_url }' });
});

server.on('error', (error: NodeJS.ErrnoException) => {
    if (error.code === 'EADDRINUSE') {
        process.stderr.write(
            `API Facebook Watch: port ${String(PORT)} is already in use — the service is probably `
            + `already running. Reuse it, or stop the other listener first:\n`
            + `  lsof -nP -iTCP:${String(PORT)} -sTCP:LISTEN   # find the PID\n`
            + `  kill <PID>\n`,
        );
        process.exit(1);
    }
    throw error;
});

server.listen(PORT, HOST, () => {
    process.stderr.write(`API Facebook Watch listening on ${HOST}:${String(PORT)} (profiles: ${PROFILES_ROOT}, gated)\n`);
});
