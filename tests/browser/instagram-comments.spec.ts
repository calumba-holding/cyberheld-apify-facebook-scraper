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

        const result = await extractInstagramComments(page, { maxPasses: 3, settleMs: 10, clickDelayMs: 10 });

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
});
