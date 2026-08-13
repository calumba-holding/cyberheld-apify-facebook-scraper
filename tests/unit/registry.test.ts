import { describe, expect, it } from 'vitest';

import { getTargetPlugin, isSupportedTarget, SUPPORTED_TARGETS } from '../../src/registry.js';

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
        expect(getTargetPlugin('facebook').scrapers).toEqual(['post-engagement', 'reel-engagement', 'post-screenshot', 'comment-reactions', 'profile-scraper']);
    });

    it('returns the instagram plugin when the target is instagram', () => {
        expect(getTargetPlugin('instagram').target).toBe('instagram');
        expect(getTargetPlugin('instagram').scrapers).toEqual(['post-engagement', 'post-screenshot', 'profile-scraper']);
    });

    it('declares supported scrapers on each target plugin', () => {
        expect(getTargetPlugin('facebook').scrapers).toEqual(['post-engagement', 'reel-engagement', 'post-screenshot', 'comment-reactions', 'profile-scraper']);
        expect(getTargetPlugin('instagram').scrapers).toEqual(['post-engagement', 'post-screenshot', 'profile-scraper']);
    });
});
