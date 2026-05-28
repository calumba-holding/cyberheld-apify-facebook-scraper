import { readFileSync } from 'node:fs';

import type { WatchConfig, WatchIncidentConfig } from './types.js';

const DEFAULT_INCIDENT: WatchIncidentConfig = {
    gapSeconds: 120,
    maxEvents: 50,
    maxDurationSeconds: 600,
};

const ensureUrl = (value: string, label: string): string => {
    if (!URL.canParse(value)) throw new Error(`${label} must be a valid URL.`);
    return new URL(value).toString();
};

const parsePositiveInt = (value: unknown, label: string, fallback: number): number => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 1) {
        throw new Error(`${label} must be a positive number.`);
    }
    return Math.floor(parsed);
};

export const loadWatchConfig = (configPath: string): WatchConfig => {
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as Record<string, unknown>;

    const workerId = raw.workerId;
    if (typeof workerId !== 'string' || workerId.trim().length === 0) {
        throw new Error('watch config: workerId is required.');
    }

    const accountRef = raw.accountRef;
    if (typeof accountRef !== 'string' || accountRef.trim().length === 0) {
        throw new Error('watch config: accountRef is required.');
    }

    const postsRaw = raw.posts;
    if (!Array.isArray(postsRaw) || postsRaw.length === 0) {
        throw new Error('watch config: posts must be a non-empty array.');
    }

    const posts = postsRaw.map((entry, index) => {
        if (!entry || typeof entry !== 'object' || !('postUrl' in entry)) {
            throw new Error(`watch config: posts[${String(index)}] must have postUrl.`);
        }
        const postUrl = (entry as { postUrl: unknown }).postUrl;
        if (typeof postUrl !== 'string') {
            throw new Error(`watch config: posts[${String(index)}].postUrl must be a string.`);
        }
        return { postUrl: ensureUrl(postUrl, `posts[${String(index)}].postUrl`) };
    });

    const incidentRaw = (raw.incident ?? {}) as Record<string, unknown>;

    const commentsOnly = raw.commentsOnly !== false;

    return {
        workerId: workerId.trim(),
        accountRef: accountRef.trim(),
        pollIntervalSeconds: parsePositiveInt(raw.pollIntervalSeconds, 'pollIntervalSeconds', 90),
        commentsOnly,
        incident: {
            gapSeconds: parsePositiveInt(incidentRaw.gapSeconds, 'incident.gapSeconds', DEFAULT_INCIDENT.gapSeconds),
            maxEvents: parsePositiveInt(incidentRaw.maxEvents, 'incident.maxEvents', DEFAULT_INCIDENT.maxEvents),
            maxDurationSeconds: parsePositiveInt(
                incidentRaw.maxDurationSeconds,
                'incident.maxDurationSeconds',
                DEFAULT_INCIDENT.maxDurationSeconds,
            ),
        },
        posts,
    };
};
