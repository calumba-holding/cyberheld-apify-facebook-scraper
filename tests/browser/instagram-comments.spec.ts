import { expect, test } from '@playwright/test';

import { extractInstagramComments } from '../../src/instagram/comments.js';

test.describe('extractInstagramComments', () => {
    test('extracts visible instagram comments with permalink ids', async ({ page }) => {
        await page.setContent(`
            <main>
                <div>
                    <div>
                        <div>
                            <a href="/ada/" role="link">Ada</a>
                            <a href="/p/post-id/c/1791/" role="link"><time datetime="2026-03-26T10:00:00.000Z">2h</time></a>
                        </div>
                        <div><span>First Instagram comment</span></div>
                        <button>Like</button>
                        <button>Reply</button>
                    </div>
                    <div>
                        <div>
                            <a href="/grace/" role="link">Grace</a>
                            <a href="/p/post-id/c/1792/" role="link"><time datetime="2026-03-26T11:00:00.000Z">1h</time></a>
                        </div>
                        <div><span>Second Instagram comment</span></div>
                        <button>Like</button>
                        <button>Reply</button>
                    </div>
                </div>
            </main>
        `);

        const result = await extractInstagramComments(page, { maxPasses: 4, settleMs: 10, clickDelayMs: 10 });

        expect(result).toEqual({
            extracted: true,
            comments: [
                {
                    user: 'Ada',
                    content: 'First Instagram comment',
                    timestamp: '2026-03-26T10:00:00.000Z',
                    timestampLabel: '2h',
                    id: '1791',
                },
                {
                    user: 'Grace',
                    content: 'Second Instagram comment',
                    timestamp: '2026-03-26T11:00:00.000Z',
                    timestampLabel: '1h',
                    id: '1792',
                },
            ],
        });
    });

    test('marks extraction partial when more comments remain actionable after the pass budget', async ({ page }) => {
        await page.setContent(`
            <main>
                <div>
                    <div>
                        <div>
                            <a href="/ada/" role="link">Ada</a>
                            <a href="/p/post-id/c/1791/" role="link"><time datetime="2026-03-26T10:00:00.000Z">2h</time></a>
                        </div>
                        <div><span>First Instagram comment</span></div>
                        <button>Like</button>
                        <button>Reply</button>
                    </div>
                    <button>Load more comments</button>
                </div>
            </main>
        `);

        await page.addScriptTag({
            content: `
                window.__clicks = 0;
                document.addEventListener('click', (event) => {
                    const element = event.target;
                    if (element instanceof HTMLElement && element.textContent?.trim() === 'Load more comments') {
                        window.__clicks += 1;
                        event.preventDefault();
                    }
                }, true);
            `,
        });

        const result = await extractInstagramComments(page, { maxPasses: 1, settleMs: 10, clickDelayMs: 10 });

        expect(result.extracted).toBe(false);
        expect(result.comments).toHaveLength(1);
    });

    test('expands View replies (N) threads and extracts nested comments', async ({ page }) => {
        await page.setContent(`
            <main>
                <ul class="_a9ym">
                    <li>
                        <a href="/naomyrodriguez.lopez/">naomyrodriguez.lopez</a>
                        <a href="/p/post-id/c/parent-1/"><time datetime="2026-05-26T04:17:35.000Z">6h</time></a>
                        <span>EW</span>
                        <button>Like</button>
                        <button>Reply</button>
                        <ul class="_a9yo">
                            <li>
                                <button type="button"><span>View replies (2)</span></button>
                            </li>
                            <li id="replies" hidden>
                                <a href="/reply-user/">reply-user</a>
                                <a href="/p/post-id/c/reply-1/"><time datetime="2026-05-26T05:00:00.000Z">5h</time></a>
                                <span>Nested reply text</span>
                                <button>Like</button>
                                <button>Reply</button>
                            </li>
                        </ul>
                    </li>
                </ul>
            </main>
            <script>
                document.querySelector('button span').closest('button').addEventListener('click', () => {
                    document.getElementById('replies').hidden = false;
                });
            </script>
        `);

        const result = await extractInstagramComments(page, { maxPasses: 4, settleMs: 50, clickDelayMs: 50 });

        expect(result.comments).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'parent-1',
                user: 'naomyrodriguez.lopez',
                content: 'EW',
            }),
            expect.objectContaining({
                id: 'reply-1',
                user: 'reply-user',
                content: 'Nested reply text',
                parentId: 'parent-1',
            }),
        ]));
    });
});
