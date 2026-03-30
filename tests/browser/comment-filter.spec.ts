import { test, expect } from '@playwright/test';

import { switchToAllComments } from '../../src/facebook/comment-filter.js';
import { loadFixture } from './helpers.js';

test.describe('switchToAllComments', () => {
    test('returns switched when the comments filter can be changed to all comments', async ({ page }) => {
        await page.setContent(await loadFixture('comment-filter.html'));

        const result = await switchToAllComments(page, page.locator('body'));

        expect(result).toEqual({
            applied: true,
            shouldReloadComments: true,
            state: 'switched',
        });
        await expect(page.locator('#filter-button')).toHaveText('All comments');
    });

    test('returns not_available when comments are visible and no filter button is shown', async ({ page }) => {
        await page.setContent(`
            <style>
                h2, [role="article"], a, div, span { display: block; }
                [role="article"] { width: 420px; min-height: 80px; border: 1px solid #ccc; margin-top: 16px; }
            </style>
            <h2>Comments</h2>
            <div role="article" aria-label="Comment by Ada 2 h ago">
                <a href="https://www.facebook.com/story.php?comment_id=comment-1"><span dir="auto">Ada</span></a>
                <div dir="auto" style="text-align: start;">Visible comment without any filter menu.</div>
            </div>
        `);

        const result = await switchToAllComments(page, page.locator('body'));

        expect(result).toEqual({
            applied: true,
            shouldReloadComments: false,
            state: 'not_available',
        });
    });

    test('returns not_available when neither a filter button nor visible comments are present', async ({ page }) => {
        await page.setContent(`
            <style>
                h2, div, span { display: block; }
            </style>
            <h2>Comments</h2>
            <div>No comments yet.</div>
        `);

        const result = await switchToAllComments(page, page.locator('body'));

        expect(result).toEqual({
            applied: true,
            shouldReloadComments: false,
            state: 'not_available',
        });
    });
});
