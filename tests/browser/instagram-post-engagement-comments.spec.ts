import { expect, test } from '@playwright/test';

import { scrapePostEngagement } from '../../src/instagram/scrapers/post-engagement/index.js';

test.describe('Instagram post engagement comments', () => {
    test('opens comments and extracts a nested reply', async ({ page }) => {
        await page.setContent(`
            <base href="https://www.instagram.com/" />
            <main>
                <article>
                    <section>
                        <button id="comments"><svg aria-label="Comment"></svg></button>
                    </section>
                    <ul id="thread" class="_a9ym" hidden>
                        <li>
                            <a href="/parent-user/">parent-user</a>
                            <a href="/p/ABC/c/parent-1/"><time datetime="2026-08-13T01:00:00Z">1h</time></a>
                            <span>Parent text</span><button>Like</button><button>Reply</button>
                            <ul class="_a9yo">
                                <li><button id="view-replies">View replies (1)</button></li>
                                <li id="reply" hidden>
                                    <a href="/reply-user/">reply-user</a>
                                    <a href="/p/ABC/c/reply-1/"><time datetime="2026-08-13T01:30:00Z">30m</time></a>
                                    <span>Nested reply</span><button>Like</button><button>Reply</button>
                                </li>
                            </ul>
                        </li>
                    </ul>
                </article>
            </main>
            <script>
                document.getElementById('comments').addEventListener('click', () => {
                    document.getElementById('thread').hidden = false;
                });
                document.getElementById('view-replies').addEventListener('click', () => {
                    document.getElementById('reply').hidden = false;
                });
            </script>
        `);

        const result = await scrapePostEngagement(
            page,
            'https://www.instagram.com/p/ABC/',
            'https://www.instagram.com/p/ABC/',
            0,
        );

        expect(result.kind).toBe('engagement');
        if (result.kind !== 'engagement') return;
        expect(result.comments).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'parent-1', content: 'Parent text' }),
            expect.objectContaining({ id: 'reply-1', content: 'Nested reply', parentId: 'parent-1' }),
        ]));
    });
});