import { test, expect } from '@playwright/test';

import { extractAllReactions } from '../../src/facebook/reactions.js';
import { loadFixture } from './helpers.js';

test.describe('extractAllReactions', () => {
    test('returns normalized users across reaction tabs when the reactions modal opens', async ({ page }) => {
        await page.setContent(await loadFixture('reactions-modal.html'));

        const reactions = await extractAllReactions(page, page.locator('body'));

        expect(reactions).toEqual([
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
        ]);
    });
});
