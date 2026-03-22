import { describe, expect, it } from 'vitest';

import { deduplicateComments } from '../../src/facebook/comment-extraction.js';
import { buildCommentKey } from '../../src/facebook/types.js';

describe('buildCommentKey', () => {
    it('returns the comment id when the comment has a known id', () => {
        const key = buildCommentKey({
            id: 'comment-1',
            user: 'Ada Lovelace',
            timestamp: '2026-03-22T10:00:00.000Z',
            content: 'Insightful comment',
        });

        expect(key).toBe('comment-1');
    });

    it('returns a composite key when the comment id is unknown', () => {
        const key = buildCommentKey({
            id: 'Unknown ID',
            user: 'Ada Lovelace',
            timestamp: '2 h',
            content: 'Insightful comment',
        });

        expect(key).toBe('Ada Lovelace|2 h|Insightful comment');
    });
});

describe('deduplicateComments', () => {
    it('keeps the first comment when duplicate known ids are present', () => {
        const deduplicated = deduplicateComments([
            {
                id: 'comment-1',
                user: 'Ada Lovelace',
                timestamp: '2 h',
                content: 'First copy',
            },
            {
                id: 'comment-1',
                user: 'Ada Lovelace',
                timestamp: '2 h',
                content: 'Second copy',
            },
        ]);

        expect(deduplicated).toEqual([
            {
                id: 'comment-1',
                user: 'Ada Lovelace',
                timestamp: '2 h',
                content: 'First copy',
            },
        ]);
    });

    it('keeps distinct comments when unknown ids differ by timestamp or content', () => {
        const deduplicated = deduplicateComments([
            {
                id: 'Unknown ID',
                user: 'Ada Lovelace',
                timestamp: '2 h',
                content: 'First copy',
            },
            {
                id: 'Unknown ID',
                user: 'Ada Lovelace',
                timestamp: '1 h',
                content: 'First copy',
            },
            {
                id: 'Unknown ID',
                user: 'Ada Lovelace',
                timestamp: '2 h',
                content: 'Different content',
            },
        ]);

        expect(deduplicated).toEqual([
            {
                id: 'Unknown ID',
                user: 'Ada Lovelace',
                timestamp: '2 h',
                content: 'First copy',
            },
            {
                id: 'Unknown ID',
                user: 'Ada Lovelace',
                timestamp: '1 h',
                content: 'First copy',
            },
            {
                id: 'Unknown ID',
                user: 'Ada Lovelace',
                timestamp: '2 h',
                content: 'Different content',
            },
        ]);
    });
});
