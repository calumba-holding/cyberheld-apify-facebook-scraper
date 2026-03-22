import { describe, expect, it } from 'vitest';

import { getTargetPlugin, isSupportedScraperForTarget, isSupportedTarget, SUPPORTED_TARGETS } from '../../src/registry.js';

describe('registry', () => {
    it('returns the list of supported targets in declaration order', () => {
        expect(SUPPORTED_TARGETS).toEqual(['facebook']);
    });

    it('returns true when the target is supported', () => {
        expect(isSupportedTarget('facebook')).toBe(true);
    });

    it('returns false when the target is unsupported', () => {
        expect(isSupportedTarget('threads')).toBe(false);
        expect(isSupportedTarget('instagram')).toBe(false);
    });

    it('returns the facebook plugin when the target is facebook', () => {
        expect(getTargetPlugin('facebook').target).toBe('facebook');
        expect(getTargetPlugin('facebook').scrapers).toEqual(['post-engagement']);
    });

    it('returns true when the scraper is supported for the target', () => {
        expect(isSupportedScraperForTarget('facebook', 'post-engagement')).toBe(true);
    });
});
