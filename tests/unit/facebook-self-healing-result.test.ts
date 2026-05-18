import { describe, expect, it } from 'vitest';

import {
    buildSavedScriptPostEngagementResult,
    hasSavedScriptEngagement,
} from '../../src/facebook/scrapers/post-engagement/self-healing-result.js';
import type { RawPostEngagementResult } from '../../src/facebook/self-healing.js';

const raw = (overrides: Partial<RawPostEngagementResult>): RawPostEngagementResult => ({
    postContent: null,
    comments: [],
    reactions: [],
    ...overrides,
});

describe('saved post-engagement script results', () => {
    it('rejects post-only results so the standard scraper can confirm engagement state', () => {
        const result = raw({ postContent: 'Only the post body was found.' });

        expect(hasSavedScriptEngagement(result)).toBe(false);
        expect(buildSavedScriptPostEngagementResult(result, 'https://example.test/in', 'https://example.test/final')).toBeNull();
    });

    it('accepts saved-script results with comments', () => {
        const result = raw({
            comments: [{ id: 'c1', user: 'Sam', content: 'Nice', timestamp: 'Today' }],
        });

        expect(hasSavedScriptEngagement(result)).toBe(true);
        expect(buildSavedScriptPostEngagementResult(result, 'https://example.test/in', 'https://example.test/final')?.commentCount).toBe(1);
    });

    it('accepts saved-script results with reactions', () => {
        const result = raw({
            reactions: [{ name: 'Sam', profile_url: 'https://facebook.com/sam', reaction: 'Like' }],
        });

        expect(hasSavedScriptEngagement(result)).toBe(true);
        expect(buildSavedScriptPostEngagementResult(result, 'https://example.test/in', 'https://example.test/final')?.reactionCount).toBe(1);
    });
});
