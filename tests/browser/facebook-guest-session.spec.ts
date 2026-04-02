import { expect, test } from '@playwright/test';

import { prepareFacebookGuestPage } from '../../src/facebook/shared/guest-session.js';

test.describe('prepareFacebookGuestPage', () => {
    test('dismisses a visible cookie banner in the main document', async ({ page }) => {
        await page.setContent(`
            <div id="cookie-banner" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: block;">
                <div role="dialog" aria-label="Cookie banner" style="width: 320px; margin: 40px auto; background: white; padding: 16px;">
                    <button id="allow-all" onclick="document.getElementById('cookie-banner')?.remove()">Allow all cookies</button>
                </div>
            </div>
            <div id="post">Public facebook post</div>
        `);

        await prepareFacebookGuestPage(page);

        await expect(page.locator('#cookie-banner')).toHaveCount(0);
        await expect(page.locator('#post')).toHaveText('Public facebook post');
    });

    test('dismisses a visible cookie banner inside an iframe', async ({ page }) => {
        await page.setContent('<iframe id="cookie-frame"></iframe><div id="post">Public facebook post</div>');
        await page.locator('#cookie-frame').evaluate((node) => {
            if (!(node instanceof HTMLIFrameElement)) return;
            node.srcdoc = `
                <div id="cookie-banner" style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); display: block;">
                    <div role="dialog" aria-label="Cookie banner" style="width: 320px; margin: 40px auto; background: white; padding: 16px;">
                        <button id="allow-all" onclick="document.getElementById('cookie-banner')?.remove()">Alle Cookies erlauben</button>
                    </div>
                </div>
            `;
        });

        const frame = page.frameLocator('#cookie-frame');
        await expect(frame.locator('#allow-all')).toBeVisible();

        await prepareFacebookGuestPage(page);

        await expect(frame.locator('#cookie-banner')).toHaveCount(0);
        await expect(page.locator('#post')).toHaveText('Public facebook post');
    });
});
