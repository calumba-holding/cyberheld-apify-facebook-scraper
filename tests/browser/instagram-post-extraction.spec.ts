import { expect, test } from '@playwright/test';

import { extractInstagramPostDetails } from '../../src/instagram/post-extraction.js';

test.describe('extractInstagramPostDetails', () => {
    test('maps visible like and comment counts by label instead of DOM order', async ({ page }) => {
        await page.setContent(`
            <main>
                <div role="button"><span>48 comments</span></div>
                <div role="button"><span>120 likes</span></div>
            </main>
        `);
        await page.evaluate(() => {
            const canonical = document.createElement('link');
            canonical.rel = 'canonical';
            canonical.href = 'https://www.instagram.com/p/canonical-post/';
            document.head.append(canonical);

            const meta = document.createElement('meta');
            meta.name = 'description';
            meta.content = '12 likes, 3 comments - profile on Instagram: "Caption from metadata".';
            document.head.append(meta);
        });

        const details = await extractInstagramPostDetails(page, 'https://www.instagram.com/p/fallback-post/');

        expect(details).toEqual({
            finalUrl: 'https://www.instagram.com/p/canonical-post/',
            postContent: 'Caption from metadata',
            reactionCount: 120,
            commentCount: 48,
        });
    });

    test('falls back to metadata counts when visible labels are absent', async ({ page }) => {
        await page.setContent(`
            <main>
                <div role="button"><span>Share</span></div>
            </main>
        `);
        await page.evaluate(() => {
            const meta = document.createElement('meta');
            meta.setAttribute('property', 'og:description');
            meta.content = '12 likes, 3 comments - profile on Instagram: "Caption from metadata".';
            document.head.append(meta);
        });

        const details = await extractInstagramPostDetails(page, 'https://www.instagram.com/p/fallback-post/');

        expect(details).toEqual({
            finalUrl: 'https://www.instagram.com/p/fallback-post/',
            postContent: 'Caption from metadata',
            reactionCount: 12,
            commentCount: 3,
        });
    });
});
