import { describe, expect, it } from 'vitest';

import {
    REEL_ENGAGEMENT_SCRAPER,
    resolveReelEngagementUrl,
} from '../../src/facebook/scrapers/reel-engagement/index.js';

describe('facebook reel engagement', () => {
    it('declares the dedicated scraper name', () => {
        expect(REEL_ENGAGEMENT_SCRAPER).toBe('reel-engagement');
    });

    it('normalizes a reel onto the equivalent watch surface', () => {
        expect(resolveReelEngagementUrl('https://www.facebook.com/reel/1324727872632161')).toBe(
            'https://www.facebook.com/watch/?v=1324727872632161',
        );
    });
});