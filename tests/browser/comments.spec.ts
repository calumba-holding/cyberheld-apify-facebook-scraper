import { test, expect } from '@playwright/test';

import { extractCommentRecord, extractCommentRecords } from '../../src/facebook/comment-extraction.js';
import { loadFixture } from './helpers.js';

test.describe('extractCommentRecord', () => {
    test('returns normalized comment fields when comment markup contains ids, user names, and content', async ({ page }) => {
        await page.setContent(await loadFixture('comment-thread.html'));

        const comment = page.locator('[role="article"]').first();
        const record = await extractCommentRecord(comment);

        expect(record).toEqual({
            user: 'Ada Lovelace',
            content: 'First line of the comment. With more detail.',
            timestamp: '2 h',
            id: 'comment-1',
        });
    });

    test('returns null when comment markup has no user, content, id, or timestamp', async ({ page }) => {
        await page.setContent('<div role="article" aria-label=""></div>');

        const record = await extractCommentRecord(page.locator('[role="article"]'));

        expect(record).toBeNull();
    });
});

test.describe('extractCommentRecords', () => {
    test('returns cleaned records for visible comments and replies', async ({ page }) => {
        await page.setContent(await loadFixture('comment-thread.html'));

        const records = await extractCommentRecords(page.locator('[role="article"]'));

        expect(records).toEqual([
            {
                user: 'Ada Lovelace',
                content: 'First line of the comment. With more detail.',
                timestamp: '2 h',
                id: 'comment-1',
            },
            {
                user: 'Grace Hopper',
                content: 'Reply body with trailing whitespace.',
                timestamp: '1 h',
                id: 'comment-2',
            },
        ]);
    });
});
