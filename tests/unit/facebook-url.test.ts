import { describe, expect, it } from 'vitest';

import { extractCommentIdFromFacebookUrl, extractFacebookVideoId, isFacebookVideoUrl, sanitizeFacebookPostUrl } from '../../src/facebook/shared/url.js';

describe('facebook url helpers', () => {
    it('extracts comment_id when present', () => {
        expect(extractCommentIdFromFacebookUrl('https://www.facebook.com/post?comment_id=12345')).toBe('12345');
    });

    it('returns null when comment_id is missing', () => {
        expect(extractCommentIdFromFacebookUrl('https://www.facebook.com/post')).toBeNull();
    });

    it('keeps comment_id while removing known share tracking params', () => {
        expect(sanitizeFacebookPostUrl('https://www.facebook.com/post?comment_id=123&share_url=x&rdid=y')).toBe(
            'https://www.facebook.com/post?comment_id=123',
        );
    });

    it('keeps the watch video id while removing watch tracking params', () => {
        expect(sanitizeFacebookPostUrl('https://www.facebook.com/watch/?v=627375550054084&share_url=x&rdid=y')).toBe(
            'https://www.facebook.com/watch/?v=627375550054084',
        );
    });

    it('extracts a video id from watch and videos urls', () => {
        expect(extractFacebookVideoId('https://www.facebook.com/watch/?v=627375550054084')).toBe('627375550054084');
        expect(extractFacebookVideoId('https://www.facebook.com/example/videos/627375550054084/')).toBe('627375550054084');
    });

    it('rejects non-numeric video ids from watch and videos urls', () => {
        expect(extractFacebookVideoId('https://www.facebook.com/watch/?v=../../tmp/pwned')).toBeNull();
        expect(extractFacebookVideoId('https://www.facebook.com/example/videos/not-a-video-id/')).toBeNull();
    });

    it('detects facebook video urls', () => {
        expect(isFacebookVideoUrl('https://www.facebook.com/watch/?v=627375550054084')).toBe(true);
        expect(isFacebookVideoUrl('https://www.facebook.com/watch/?v=../../tmp/pwned')).toBe(false);
        expect(isFacebookVideoUrl('https://www.facebook.com/example/posts/123')).toBe(false);
    });
});
