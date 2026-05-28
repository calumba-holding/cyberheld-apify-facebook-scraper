import { describe, expect, it } from 'vitest';

import { emptyPostState } from '../../src/watch/state.js';
import { shouldCloseIncident } from '../../src/watch/incident.js';
import type { WatchConfig } from '../../src/watch/types.js';

const baseConfig: WatchConfig = {
    workerId: 'fb-worker-1',
    accountRef: 'cm-001',
    pollIntervalSeconds: 15,
    incident: { gapSeconds: 120, maxEvents: 3, maxDurationSeconds: 600 },
    posts: [{ postUrl: 'https://www.facebook.com/example' }],
};

describe('shouldCloseIncident', () => {
    it('closes when max events reached', () => {
        const post = emptyPostState();
        post.openIncidentId = 'inc-1';
        post.openIncidentStartedAt = new Date().toISOString();
        post.openIncidentEventCount = 3;

        expect(shouldCloseIncident(post, baseConfig, Date.now())).toBe('max_events');
    });

    it('does not close an empty open incident before gap without events', () => {
        const post = emptyPostState();
        post.openIncidentId = 'inc-1';
        post.openIncidentStartedAt = new Date().toISOString();
        post.openIncidentEventCount = 0;

        expect(shouldCloseIncident(post, baseConfig, Date.now())).toBeUndefined();
    });
});
