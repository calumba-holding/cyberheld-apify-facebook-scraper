import { describe, expect, it } from 'vitest';

import {
    buildInstagramPostUrl,
    extractInstagramShortcode,
    isInstagramLoginOrChallengeUrl,
    isInstagramPostOrReelUrl,
} from '../../src/instagram/shared/url.js';

describe('instagram url helpers', () => {
    it('detects post and reel URLs', () => {
        expect(isInstagramPostOrReelUrl('https://www.instagram.com/p/ABC123/')).toBe(true);
        expect(isInstagramPostOrReelUrl('https://www.instagram.com/reel/DU_bfUNDWwP/?igsh=abc')).toBe(true);
        expect(isInstagramPostOrReelUrl('https://www.instagram.com/example/')).toBe(false);
    });

    it('extracts shortcodes and builds post URLs', () => {
        expect(extractInstagramShortcode('https://www.instagram.com/reel/DU_bfUNDWwP/?igsh=abc')).toBe('DU_bfUNDWwP');
        expect(buildInstagramPostUrl('DU_bfUNDWwP')).toBe('https://www.instagram.com/p/DU_bfUNDWwP/');
    });

    it('detects login and challenge URLs', () => {
        expect(isInstagramLoginOrChallengeUrl('https://www.instagram.com/accounts/login/')).toBe(true);
        expect(isInstagramLoginOrChallengeUrl('https://www.instagram.com/challenge/abc/')).toBe(true);
        expect(isInstagramLoginOrChallengeUrl('https://www.instagram.com/reel/ABC/')).toBe(false);
    });
});
