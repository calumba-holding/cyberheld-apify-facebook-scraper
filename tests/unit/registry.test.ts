import { describe, expect, it } from 'vitest';

import { getTargetPlugin, isSupportedScraperForTarget, isSupportedTarget, SUPPORTED_TARGETS } from '../../src/registry.js';

describe('registry', () => {
    it('returns the list of supported targets in declaration order', () => {
        expect(SUPPORTED_TARGETS).toEqual(['facebook', 'instagram']);
    });

    it('returns true when the target is supported', () => {
        expect(isSupportedTarget('facebook')).toBe(true);
    });

    it('returns false when the target is unsupported', () => {
        expect(isSupportedTarget('threads')).toBe(false);
    });

    it('returns true when instagram is supported', () => {
        expect(isSupportedTarget('instagram')).toBe(true);
    });

    it('returns the facebook plugin when the target is facebook', () => {
        expect(getTargetPlugin('facebook').target).toBe('facebook');
        expect(getTargetPlugin('facebook').scrapers).toEqual(['post-engagement', 'comment-reactions']);
    });

    it('returns the instagram plugin when the target is instagram', () => {
        expect(getTargetPlugin('instagram').target).toBe('instagram');
        expect(getTargetPlugin('instagram').scrapers).toEqual(['post-engagement', 'profile-scraper']);
    });

    it('returns true when the scraper is supported for the target', () => {
        expect(isSupportedScraperForTarget('facebook', 'post-engagement')).toBe(true);
        expect(isSupportedScraperForTarget('facebook', 'comment-reactions')).toBe(true);
        expect(isSupportedScraperForTarget('instagram', 'post-engagement')).toBe(true);
        expect(isSupportedScraperForTarget('instagram', 'profile-scraper')).toBe(true);
    });
});
