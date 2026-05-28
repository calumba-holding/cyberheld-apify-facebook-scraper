import { randomUUID } from 'node:crypto';

import type { PostWatchState, WatchConfig, WatchIncidentSummary } from './types.js';

export type IncidentCloseReason = NonNullable<WatchIncidentSummary['closedReason']>;

export const shouldCloseIncident = (
    post: PostWatchState,
    config: WatchConfig,
    nowMs: number,
    lastEventAtMs?: number,
): IncidentCloseReason | undefined => {
    if (!post.openIncidentId || !post.openIncidentStartedAt) return undefined;

    const startedMs = Date.parse(post.openIncidentStartedAt);
    if (!Number.isFinite(startedMs)) return 'gap';

    if (post.openIncidentEventCount >= config.incident.maxEvents) return 'max_events';
    if (nowMs - startedMs >= config.incident.maxDurationSeconds * 1000) return 'max_duration';

    const gapMs = config.incident.gapSeconds * 1000;
    if (lastEventAtMs !== undefined && nowMs - lastEventAtMs >= gapMs && post.openIncidentEventCount > 0) {
        return 'gap';
    }

    return undefined;
};

export const openIncident = (post: PostWatchState, nowIso: string): string => {
    const incidentId = randomUUID();
    post.openIncidentId = incidentId;
    post.openIncidentStartedAt = nowIso;
    post.openIncidentEventCount = 0;
    return incidentId;
};

export const ensureOpenIncident = (post: PostWatchState, nowIso: string): string => {
    if (post.openIncidentId) return post.openIncidentId;
    return openIncident(post, nowIso);
};

export const closeIncident = (
    post: PostWatchState,
    reason: IncidentCloseReason,
    closedAt: string,
    eventIds: string[],
): WatchIncidentSummary | undefined => {
    if (!post.openIncidentId || !post.openIncidentStartedAt) return undefined;

    const summary: WatchIncidentSummary = {
        incidentId: post.openIncidentId,
        workerId: '',
        postUrl: '',
        openedAt: post.openIncidentStartedAt,
        closedAt,
        closedReason: reason,
        eventIds: [...eventIds],
        eventCount: post.openIncidentEventCount,
    };

    post.openIncidentId = undefined;
    post.openIncidentStartedAt = undefined;
    post.openIncidentEventCount = 0;

    return summary;
};

export const recordIncidentEvent = (post: PostWatchState): void => {
    post.openIncidentEventCount += 1;
};
