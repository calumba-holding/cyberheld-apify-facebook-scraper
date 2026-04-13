import { describe, expect, it } from 'vitest';

import {
    extractCommentIdFromFacebookUrl,
    extractFacebookPageRootUrl,
    extractFacebookVideoId,
    isEquivalentFacebookTargetUrl,
    isFacebookLoginOrHomeUrl,
    isFacebookVideoUrl,
    rewriteFacebookReelUrlToWatchUrl,
    sanitizeFacebookPostUrl,
} from '../../src/facebook/shared/url.js';

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

    it('extracts a video id from watch, videos, and reel urls', () => {
        expect(extractFacebookVideoId('https://www.facebook.com/watch/?v=627375550054084')).toBe('627375550054084');
        expect(extractFacebookVideoId('https://www.facebook.com/example/videos/627375550054084/')).toBe('627375550054084');
        expect(extractFacebookVideoId('https://www.facebook.com/reel/627375550054084/')).toBe('627375550054084');
    });

    it('rejects non-numeric video ids from watch and videos urls', () => {
        expect(extractFacebookVideoId('https://www.facebook.com/watch/?v=../../tmp/pwned')).toBeNull();
        expect(extractFacebookVideoId('https://www.facebook.com/example/videos/not-a-video-id/')).toBeNull();
    });

    it('detects facebook video urls', () => {
        expect(isFacebookVideoUrl('https://www.facebook.com/watch/?v=627375550054084')).toBe(true);
        expect(isFacebookVideoUrl('https://www.facebook.com/reel/627375550054084/')).toBe(true);
        expect(isFacebookVideoUrl('https://www.facebook.com/watch/?v=../../tmp/pwned')).toBe(false);
        expect(isFacebookVideoUrl('https://www.facebook.com/example/posts/123')).toBe(false);
    });

    it('rewrites public reel urls to watch urls while preserving the comment id when present', () => {
        expect(rewriteFacebookReelUrlToWatchUrl('https://www.facebook.com/reel/1641010317209602/?comment_id=1261563952195229&__tn__=R')).toBe(
            'https://www.facebook.com/watch/?v=1641010317209602&comment_id=1261563952195229',
        );
        expect(rewriteFacebookReelUrlToWatchUrl('https://www.facebook.com/reel/650824614790236')).toBe(
            'https://www.facebook.com/watch/?v=650824614790236',
        );
        expect(rewriteFacebookReelUrlToWatchUrl('https://www.facebook.com/watch/?v=1641010317209602&comment_id=1261563952195229')).toBe(
            'https://www.facebook.com/watch/?v=1641010317209602&comment_id=1261563952195229',
        );
    });

    it('treats canonical facebook post urls with the same target token as equivalent', () => {
        expect(isEquivalentFacebookTargetUrl(
            'https://www.facebook.com/derStandardat/posts/pfbid02FL4r5EAvs8HzNMrSoVtSzibgZZJ3ZCjckbc5WTGQnRdKPJjcpsv8cuphbJrmvDEEl',
            'https://www.facebook.com/derStandardat/posts/pfbid02FL4r5EAvs8HzNMrSoVtSzibgZZJ3ZCjckbc5WTGQnRdKPJjcpsv8cuphbJrmvDEEl/',
        )).toBe(true);
    });

    it('extracts a page-root url for page-scoped post targets', () => {
        expect(extractFacebookPageRootUrl('https://www.facebook.com/derStandardat/posts/pfbid02FL4r5EAvs8HzNMrSoVtSzibgZZJ3ZCjckbc5WTGQnRdKPJjcpsv8cuphbJrmvDEEl')).toBe(
            'https://www.facebook.com/derStandardat',
        );
        expect(extractFacebookPageRootUrl('https://www.facebook.com/presseteam.austria/videos/627375550054084/')).toBe(
            'https://www.facebook.com/presseteam.austria',
        );
        expect(extractFacebookPageRootUrl('https://www.facebook.com/watch/?v=627375550054084')).toBeNull();
    });

    it('treats facebook home and login urls as login-wall redirects', () => {
        expect(isFacebookLoginOrHomeUrl('https://www.facebook.com/')).toBe(true);
        expect(isFacebookLoginOrHomeUrl('https://www.facebook.com/login/')).toBe(true);
        expect(isFacebookLoginOrHomeUrl('https://www.facebook.com/login.php')).toBe(true);
        expect(isFacebookLoginOrHomeUrl('https://www.facebook.com/derStandardat/posts/pfbid02FL4r5EAvs8HzNMrSoVtSzibgZZJ3ZCjckbc5WTGQnRdKPJjcpsv8cuphbJrmvDEEl')).toBe(false);
    });

    it('rejects redirects away from the requested facebook target', () => {
        expect(isEquivalentFacebookTargetUrl(
            'https://www.facebook.com/derStandardat/posts/pfbid02FL4r5EAvs8HzNMrSoVtSzibgZZJ3ZCjckbc5WTGQnRdKPJjcpsv8cuphbJrmvDEEl',
            'https://www.facebook.com/',
        )).toBe(false);
    });
});
