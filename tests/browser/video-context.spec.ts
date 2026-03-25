import { expect, test } from '@playwright/test';

import { slowlyScrollToTop } from '../../src/facebook/shared/video-context.js';

test.describe('slowlyScrollToTop', () => {
    test('returns the page to the top after deep scrolling', async ({ page }) => {
        await page.setViewportSize({ width: 800, height: 600 });
        await page.setContent(`
            <main style="height: 5000px; background: linear-gradient(#fff, #ddd);">
                <div style="margin-top: 4600px;">Bottom content</div>
            </main>
        `);

        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await expect.poll(async () => page.evaluate(() => window.scrollY)).toBeGreaterThan(1000);

        await slowlyScrollToTop(page);

        await expect.poll(async () => page.evaluate(() => window.scrollY)).toBe(0);
    });
});
