import { test, expect } from '@playwright/test';

import { extractAllReactions } from '../../src/facebook/reactions.js';
import { loadFixture } from './helpers.js';

test.describe('extractAllReactions', () => {
    test('returns normalized users across reaction tabs when the reactions modal opens', async ({ page }) => {
        await page.setContent(await loadFixture('reactions-modal.html'));

        const result = await extractAllReactions(page, page.locator('body'));

        expect(result).toEqual({
            extracted: true,
            users: [
                {
                    name: 'Ada Lovelace',
                    profile_url: 'https://www.facebook.com/ada',
                    reaction: 'Like',
                },
                {
                    name: 'Grace Hopper',
                    profile_url: 'https://www.facebook.com/grace',
                    reaction: 'Like',
                },
                {
                    name: 'Linus Torvalds',
                    profile_url: 'https://www.facebook.com/linus',
                    reaction: 'Love',
                },
            ],
        });
    });

    test('returns extracted true when the target post shows an explicit zero-reaction entry', async ({ page }) => {
        await page.setContent('<div id="scope"><button role="button" aria-label="Like: 0 people">Like</button></div>');

        const result = await extractAllReactions(page, page.locator('#scope'));

        expect(result).toEqual({ extracted: true, users: [] });
    });

    test('returns extracted false when no visible post reaction entry can be confirmed', async ({ page }) => {
        await page.setContent('<div id="scope"><button role="button" aria-label="Like">Like</button></div>');

        const result = await extractAllReactions(page, page.locator('#scope'));

        expect(result).toEqual({ extracted: false, users: [] });
    });
});
