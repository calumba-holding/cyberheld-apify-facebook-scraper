import { describe, expect, it } from 'vitest';

import { extractCommentIdFromFacebookUrl, sanitizeFacebookPostUrl } from '../../src/facebook/shared/url.js';

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
});
