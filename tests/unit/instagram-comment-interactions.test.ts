import { describe, expect, it } from 'vitest';
import { chromium } from 'playwright';

import {
    hasCommentsSurface,
    openInstagramCommentsPanel,
} from '../../src/instagram/scrapers/post-screenshot/interactions.js';
import { COUNT_BUTTON_SELECTOR } from '../../src/instagram/selectors.js';

describe('instagram comment interactions', () => {
    it('opens comments when the comment count button is clicked', async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(`
            <main>
                <article>
                    <section>
                        <div>
                            <div role="button" tabindex="0">
                                <svg aria-label="Like"></svg>
                            </div>
                            <span role="button" tabindex="0">625.5K</span>
                            <div role="button" tabindex="0">
                                <svg aria-label="Comment"></svg>
                            </div>
                            <span role="button" tabindex="0" id="comment-count">6.6K</span>
                        </div>
                    </section>
                </article>
                <div id="comments" hidden>
                    <ul class="_a9ym">
                        <li>
                            <a href="/p/ABC/c/123/"><time datetime="2026-05-21T07:36:33.000Z">5d</time></a>
                        </li>
                    </ul>
                </div>
            </main>
            <script>
                document.getElementById('comment-count').addEventListener('click', () => {
                    document.getElementById('comments').hidden = false;
                });
            </script>
        `);

        const article = page.locator('article').first();
        const opened = await openInstagramCommentsPanel(page, article);
        expect(opened).toBe(true);
        expect(await hasCommentsSurface(page)).toBe(true);

        await browser.close();
    });

    it('opens comments when the main comment count button is clicked', async () => {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        await page.setContent(`
            <main>
                <span role="button" tabindex="0">2,746 likes</span>
                <span role="button" tabindex="0" id="comment-count">481 comments</span>
                <div id="comments" hidden>
                    <ul class="_a9ym">
                        <li>
                            <a href="/p/ABC/c/123/"><time datetime="2026-05-21T07:36:33.000Z">5d</time></a>
                        </li>
                    </ul>
                </div>
            </main>
            <script>
                document.getElementById('comment-count').addEventListener('click', () => {
                    document.getElementById('comments').hidden = false;
                });
            </script>
        `);

        const opened = await openInstagramCommentsPanel(page, page.locator('main').first());
        expect(opened).toBe(true);
        expect(await hasCommentsSurface(page)).toBe(true);

        await browser.close();
    });
});
