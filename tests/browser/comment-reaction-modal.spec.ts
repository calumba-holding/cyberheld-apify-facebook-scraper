import { expect, test } from '@playwright/test';

import { findReactionButton } from '../../src/facebook/comment-reaction-modal.js';

test.describe('findReactionButton', () => {
    test('prefers the top-most visible reaction button inside a matched comment', async ({ page }) => {
        await page.setViewportSize({ width: 800, height: 600 });
        await page.setContent(`
            <main>
                <div role="article" aria-label="Comment by Ada Lovelace 2 h" style="position: relative; height: 220px;">
                    <div
                        role="button"
                        aria-label="7 reactions; see who reacted to this"
                        data-testid="reply-reactions"
                        style="position: absolute; top: 140px; left: 20px; width: 80px; height: 24px;"
                    >7</div>
                    <div
                        role="button"
                        aria-label="33 reactions; see who reacted to this"
                        data-testid="target-reactions"
                        style="position: absolute; top: 40px; left: 20px; width: 80px; height: 24px;"
                    >33</div>
                </div>
            </main>
        `);

        const button = await findReactionButton(page.locator('[role="article"]'));

        await expect(button).not.toBeNull();
        await expect(button!).toHaveAttribute('data-testid', 'target-reactions');
    });
});
