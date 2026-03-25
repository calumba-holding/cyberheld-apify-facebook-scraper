import { expect, test } from '@playwright/test';

import { findTargetCommentById } from '../../src/facebook/shared/comment-target.js';

test.describe('findTargetCommentById', () => {
    test('finds the highlighted target comment from already visible comments', async ({ page }) => {
        await page.setContent(`
            <main>
                <div role="article" aria-label="Comment by Ada Lovelace 2 h">
                    <a href="https://www.facebook.com/story.php?comment_id=comment-1">2 h</a>
                    <a href="https://www.facebook.com/ada"><span dir="auto">Ada Lovelace</span></a>
                    <div dir="auto" style="text-align: start;">Visible target comment</div>
                    <div role="button" aria-label="12 reactions; see who reacted to this">12</div>
                </div>
                <div role="article" aria-label="Comment by Grace Hopper 1 h">
                    <a href="https://www.facebook.com/story.php?comment_id=comment-2">1 h</a>
                    <a href="https://www.facebook.com/grace"><span dir="auto">Grace Hopper</span></a>
                    <div dir="auto" style="text-align: start;">Other visible comment</div>
                </div>
            </main>
        `);

        const match = await findTargetCommentById(page, page.locator('main'), 'comment-1');

        expect(match).not.toBeNull();
        expect(match?.record).toMatchObject({
            id: 'comment-1',
            user: 'Ada Lovelace',
            content: 'Visible target comment',
        });
    });

    test('falls back to any matching comment_id link inside the target comment container', async ({ page }) => {
        await page.setContent(`
            <main>
                <div role="article" aria-label="Comment by Pepo Posti 1 y">
                    <a href="https://www.facebook.com/story.php?comment_id=parent-comment">1 y</a>
                    <a href="https://www.facebook.com/pepo"><span dir="auto">Pepo Posti</span></a>
                    <div dir="auto" style="text-align: start;">Glückwunsch</div>
                    <a href="https://www.facebook.com/story.php?comment_id=target-comment">View highlighted target</a>
                </div>
            </main>
        `);

        const match = await findTargetCommentById(page, page.locator('main'), 'target-comment');

        expect(match).not.toBeNull();
        expect(match?.record).toMatchObject({
            id: 'target-comment',
            user: 'Pepo Posti',
            content: 'Glückwunsch',
        });
    });
});
