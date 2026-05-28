import type { ScrapedComment } from '../common/types.js';

export const WATCH_STATE_VERSION = 1 as const;

export interface WatchIncidentConfig {
    gapSeconds: number;
    maxEvents: number;
    maxDurationSeconds: number;
}

export interface WatchConfig {
    workerId: string;
    accountRef: string;
    pollIntervalSeconds: number;
    /** When true (default), polls skip post-reaction extraction for faster ticks. */
    commentsOnly: boolean;
    incident: WatchIncidentConfig;
    posts: Array<{ postUrl: string }>;
}

export interface WatchSessionHealth {
    sessionOk: boolean;
    lastError?: string;
    checkedAt: string;
    consecutivePollFailures: number;
}

export type CommentDetectionMethod = 'engagement_scrape' | 'graphql_poll' | 'dom_diff';

export interface CommentEvent {
    eventId: string;
    workerId: string;
    accountRef: string;
    observedAt: string;
    platform: 'facebook';
    postUrl: string;
    incidentId: string;
    comment: ScrapedComment;
    detection: {
        method: CommentDetectionMethod;
        latencyMs: number;
    };
    session: {
        profileRootDir: string;
        sessionOk: boolean;
    };
}

export interface WatchIncidentSummary {
    incidentId: string;
    workerId: string;
    postUrl: string;
    openedAt: string;
    closedAt?: string;
    closedReason?: 'gap' | 'max_events' | 'max_duration' | 'shutdown';
    eventIds: string[];
    eventCount: number;
}

export interface PostWatchState {
    lastSeenCommentKeys: string[];
    openIncidentId?: string;
    openIncidentStartedAt?: string;
    openIncidentEventCount: number;
}

export interface WatchState {
    version: typeof WATCH_STATE_VERSION;
    workerId: string;
    updatedAt: string;
    lastPollAt?: string;
    sessionHealth?: WatchSessionHealth;
    posts: Record<string, PostWatchState>;
}

export interface WatchPaths {
    watchRoot: string;
    stateFile: string;
    eventsDir: string;
    incidentsDir: string;
}
