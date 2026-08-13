import { describe, expect, it } from 'vitest';

import { isInstagramCommentPermalink, matchesViewRepliesLabel } from '../../src/instagram/selectors.js';

describe('matchesViewRepliesLabel', () => {
    it('matches current Instagram reply button copy', () => {
        expect(matchesViewRepliesLabel('View replies (37)')).toBe(true);
        expect(matchesViewRepliesLabel('View all 37 replies')).toBe(true);
        expect(matchesViewRepliesLabel('View 2 replies')).toBe(true);
        expect(matchesViewRepliesLabel('View more replies')).toBe(true);
        expect(matchesViewRepliesLabel('View previous replies')).toBe(true);
        expect(matchesViewRepliesLabel('Antworten anzeigen (12)')).toBe(true);
    });

    it('does not match unrelated buttons', () => {
        expect(matchesViewRepliesLabel('37 likes')).toBe(false);
        expect(matchesViewRepliesLabel('Reply')).toBe(false);
        expect(matchesViewRepliesLabel('Load more comments')).toBe(false);
    });

    it('matches reel and post comment permalinks', () => {
        expect(isInstagramCommentPermalink('/p/ABC/c/123/')).toBe(true);
        expect(isInstagramCommentPermalink('/reel/ABC/c/123/')).toBe(true);
        expect(isInstagramCommentPermalink('/accounts/login/')).toBe(false);
    });
});
