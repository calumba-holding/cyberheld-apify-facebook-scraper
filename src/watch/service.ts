import { randomUUID } from 'node:crypto';

import { log } from '../common/logger.js';
import { buildWatchCommentKey, findNewComments } from './comment-key.js';
import { loadWatchConfig } from './config.js';
import { writeCommentEvent } from './events.js';
import {
    closeIncident,
    ensureOpenIncident,
    recordIncidentEvent,
    shouldCloseIncident,
} from './incident.js';
import { writeIncidentSummary } from './incidents.js';
import { resolveWatchPaths } from './paths.js';
import { createWatchPoller, type WatchPoller } from './poller.js';
import { defaultChromeExecutable } from '../cli/help.js';
import { loadWatchState, saveWatchState } from './state.js';
import type { CommentEvent, WatchSessionHealth, WatchState } from './types.js';

export interface WatchServiceOptions {
    configPath: string;
    profileRootDir: string;
    artifactRootDir: string;
    chromeExecutable?: string;
    waitAfterNavigationMs?: number;
    requestTimeoutSecs?: number;
    /** Run a single poll tick then exit (for tests and smoke checks). */
    once?: boolean;
}

const incidentEventIds: Map<string, string[]> = new Map();

const trackIncidentEvent = (incidentId: string, eventId: string): void => {
    const list = incidentEventIds.get(incidentId) ?? [];
    list.push(eventId);
    incidentEventIds.set(incidentId, list);
};

const flushClosedIncident = async (
    state: WatchState,
    postUrl: string,
    paths: ReturnType<typeof resolveWatchPaths>,
    reason: 'gap' | 'max_events' | 'max_duration' | 'shutdown',
): Promise<void> => {
    const post = state.posts[postUrl];
    if (!post?.openIncidentId) return;

    const ids = incidentEventIds.get(post.openIncidentId) ?? [];
    const summary = closeIncident(post, reason, new Date().toISOString(), ids);
    incidentEventIds.delete(post.openIncidentId);

    if (!summary) return;
    summary.workerId = state.workerId;
    summary.postUrl = postUrl;
    await writeIncidentSummary(paths.incidentsDir, summary);
    log.info(`Closed incident ${summary.incidentId} (${reason}) with ${String(summary.eventCount)} events.`);
};

const updateSessionHealth = (
    state: WatchState,
    sessionOk: boolean,
    errorMessage?: string,
): void => {
    const previous = state.sessionHealth?.consecutivePollFailures ?? 0;
    const health: WatchSessionHealth = {
        sessionOk,
        checkedAt: new Date().toISOString(),
        consecutivePollFailures: sessionOk ? 0 : previous + 1,
        ...(errorMessage ? { lastError: errorMessage } : {}),
    };
    state.sessionHealth = health;
    if (!sessionOk) {
        process.stderr.write(
            `SESSION UNHEALTHY (${String(health.consecutivePollFailures)} failed poll(s)): ${errorMessage ?? 'unknown'}\n`,
        );
    }
};

const runPollTick = async (
    state: WatchState,
    config: ReturnType<typeof loadWatchConfig>,
    paths: ReturnType<typeof resolveWatchPaths>,
    profileRootDir: string,
    poller: WatchPoller,
): Promise<void> => {
    const now = Date.now();
    const nowIso = new Date(now).toISOString();
    let tickSessionOk = true;
    let tickSessionError: string | undefined;

    for (let postIndex = 0; postIndex < config.posts.length; postIndex++) {
        const { postUrl } = config.posts[postIndex];
        const post = state.posts[postUrl];
        if (!post) continue;

        process.stderr.write(`Post ${String(postIndex + 1)}/${String(config.posts.length)}: ${postUrl}\n`);

        const closeReason = shouldCloseIncident(post, config, now);
        if (closeReason) {
            await flushClosedIncident(state, postUrl, paths, closeReason);
        }

        const pollStarted = Date.now();
        const pollResult = await poller.pollPostComments(postUrl);
        const latencyMs = Date.now() - pollStarted;
        const { comments, method, sessionOk, error: pollError } = pollResult;

        if (pollError) {
            process.stderr.write(`Poll error (${postUrl}): ${pollError}\n`);
        }
        if (!sessionOk) {
            tickSessionOk = false;
            tickSessionError = pollError ?? 'Session not OK (login wall or scrape failure)';
        }

        if (post.lastSeenCommentKeys.length === 0 && comments.length > 0) {
            post.lastSeenCommentKeys = comments.map((comment) => buildWatchCommentKey(comment));
            process.stderr.write(
                `Baselined ${String(comments.length)} existing comment(s) on post (no events emitted).\n`,
            );
            state.lastPollAt = nowIso;
            continue;
        }

        const { newComments, nextSeenKeys } = findNewComments(comments, post.lastSeenCommentKeys);
        post.lastSeenCommentKeys = nextSeenKeys;

        if (newComments.length > 0) {
            process.stderr.write(`New comments: ${String(newComments.length)} on ${postUrl}\n`);
        }

        for (const comment of newComments) {
            const incidentId = ensureOpenIncident(post, nowIso);
            const event: CommentEvent = {
                eventId: randomUUID(),
                workerId: config.workerId,
                accountRef: config.accountRef,
                observedAt: nowIso,
                platform: 'facebook',
                postUrl,
                incidentId,
                comment,
                detection: { method, latencyMs },
                session: { profileRootDir, sessionOk },
            };

            await writeCommentEvent(paths.eventsDir, event);
            trackIncidentEvent(incidentId, event.eventId);
            recordIncidentEvent(post);

            log.info(`Event ${event.eventId} — new comment on ${postUrl} (${comment.user})`);

            const capReason = shouldCloseIncident(post, config, Date.now(), Date.now());
            if (capReason === 'max_events' || capReason === 'max_duration') {
                await flushClosedIncident(state, postUrl, paths, capReason);
            }
        }
    }

    updateSessionHealth(state, tickSessionOk, tickSessionError);
    state.lastPollAt = nowIso;
};

export const runWatchService = async (options: WatchServiceOptions): Promise<void> => {
    const config = loadWatchConfig(options.configPath);
    const paths = resolveWatchPaths(options.artifactRootDir, config.workerId);

    const state = await loadWatchState(paths.stateFile, config);

    process.stderr.write(
        `Watch service: ${config.workerId}, ${String(config.posts.length)} post(s), poll every ${String(config.pollIntervalSeconds)}s`
        + `${config.commentsOnly ? ' (comments-only)' : ' (full engagement)'}\n`,
    );
    process.stderr.write(`Artifacts: ${paths.watchRoot}\n`);
    if (options.once) {
        process.stderr.write('Mode: --once (single tick, then exit)\n');
    }
    log.info(`Watch service starting for ${config.workerId}`);

    const chromeExecutable = options.chromeExecutable
        ?? process.env.SCRAPE_CHROME_EXECUTABLE
        ?? defaultChromeExecutable;

    const poller = await createWatchPoller({
        profileRootDir: options.profileRootDir,
        artifactRootDir: options.artifactRootDir,
        chromeExecutable,
        waitAfterNavigationMs: options.waitAfterNavigationMs,
        requestTimeoutSecs: options.requestTimeoutSecs,
        commentsOnly: config.commentsOnly,
    });

    let tickInFlight = false;
    const tick = async (): Promise<void> => {
        if (tickInFlight) {
            log.warning('Skipping watch tick — previous poll still running.');
            return;
        }
        tickInFlight = true;
        try {
            await runPollTick(state, config, paths, options.profileRootDir, poller);
            await saveWatchState(paths.stateFile, state);
        } finally {
            tickInFlight = false;
        }
    };

    try {
        await tick();

        if (options.once) {
            for (const { postUrl } of config.posts) {
                await flushClosedIncident(state, postUrl, paths, 'shutdown');
            }
            await saveWatchState(paths.stateFile, state);
            await poller.close();
            return;
        }
    } catch (error) {
        await poller.close();
        throw error;
    }

    const intervalMs = config.pollIntervalSeconds * 1000;
    const handle = setInterval(() => {
        tick().catch((error: unknown) => {
            const message = error instanceof Error ? error.message : String(error);
            log.error(`Watch tick failed: ${message}`);
        });
    }, intervalMs);

    const shutdown = async (): Promise<void> => {
        clearInterval(handle);
        for (const { postUrl } of config.posts) {
            await flushClosedIncident(state, postUrl, paths, 'shutdown');
        }
        await saveWatchState(paths.stateFile, state);
        await poller.close();
        process.stderr.write('Watch service stopped.\n');
    };

    process.on('SIGINT', () => {
        shutdown()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    });
    process.on('SIGTERM', () => {
        shutdown()
            .then(() => process.exit(0))
            .catch(() => process.exit(1));
    });
};
