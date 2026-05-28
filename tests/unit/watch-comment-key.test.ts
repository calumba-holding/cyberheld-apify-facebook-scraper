import { describe, expect, it } from 'vitest';

import { buildWatchCommentKey, findNewComments } from '../../src/watch/comment-key.js';

describe('buildWatchCommentKey', () => {
    it('prefers comment id when present', () => {
        expect(buildWatchCommentKey({
            id: '123',
            user: 'Alice',
            timestamp: '1h',
            content: 'Hi',
        })).toBe('123');
    });

    it('falls back to composite key when id unknown', () => {
        expect(buildWatchCommentKey({
            id: 'Unknown ID',
            user: 'Alice',
            timestamp: '1h',
            content: 'Hi',
        })).toBe('Alice|1h|Hi');
    });
});

describe('findNewComments', () => {
    it('returns only comments not seen before', () => {
        const comments = [
            { id: 'a', user: 'U1', content: 'one', timestamp: '1h' },
            { id: 'b', user: 'U2', content: 'two', timestamp: '2h' },
        ];
        const first = findNewComments(comments, []);
        expect(first.newComments).toHaveLength(2);

        const second = findNewComments(comments, first.nextSeenKeys);
        expect(second.newComments).toHaveLength(0);
    });
});
