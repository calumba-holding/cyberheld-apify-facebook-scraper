import { test, expect } from '@playwright/test';

import { findTargetPostRoot } from '../../src/facebook/post-root.js';
import { extractPostContent } from '../../src/facebook/post-extraction.js';
import { loadFixture } from './helpers.js';

test.describe('findTargetPostRoot', () => {
    test('returns the target dialog when multiple post containers are present', async ({ page }) => {
        await page.setContent(await loadFixture('post-root.html'));

        const root = await findTargetPostRoot(page, 'https://www.facebook.com/example/posts/222222222222222/');

        expect(root).not.toBeNull();
        if (!root) throw new Error('Expected target root to be found.');

        await expect(root.locator('[aria-label="Like: 12 people"]')).toBeVisible();
        await expect(root.locator('[data-ad-preview="message"]')).toHaveText(
            'Target post body with enough text to pass the minimum-length threshold and be selected.',
        );
    });
});

test.describe('extractPostContent', () => {
    test('returns the visible message closest above the reaction anchor when multiple messages exist', async ({ page }) => {
        await page.setContent(`
            <style>
                [data-ad-preview="message"] { display: block; width: 420px; min-height: 30px; margin: 12px 0; }
                [role="button"] { display: inline-block; width: 120px; height: 32px; margin-top: 12px; }
            </style>
            <div id="scope">
                <div data-ad-preview="message">This intro message is visible but belongs to the surrounding feed chrome rather than the target post content.</div>
                <div data-ad-preview="message">This is the target post content with enough detail to be selected because it sits directly above the reaction anchor.</div>
                <div role="button" aria-label="Like: 12 people">Like</div>
                <div data-ad-preview="message">This footer message sits below the anchor and should not win when an above-anchor candidate exists.</div>
            </div>
        `);

        const scope = page.locator('#scope');
        const anchorBox = await scope.locator('[role="button"]').boundingBox();
        const content = await extractPostContent(scope, anchorBox?.y);

        expect(content).toBe('This is the target post content with enough detail to be selected because it sits directly above the reaction anchor.');
    });

    test('prefers the nearest visible message above the anchor over earlier above-anchor content', async ({ page }) => {
        await page.setContent(`
            <style>
                [data-ad-preview="message"] { display: block; width: 420px; min-height: 30px; margin: 12px 0; }
                [role="button"] { display: inline-block; width: 120px; height: 32px; margin-top: 12px; }
            </style>
            <div id="scope">
                <div data-ad-preview="message">This earlier feed copy is above the anchor but should not win when a nearer post body is present.</div>
                <div style="height: 80px;"></div>
                <div data-ad-preview="message">This nearer message should win because it is the closest visible content block above the reaction anchor.</div>
                <div role="button" aria-label="Like: 12 people">Like</div>
            </div>
        `);

        const scope = page.locator('#scope');
        const anchorBox = await scope.locator('[role="button"]').boundingBox();
        const content = await extractPostContent(scope, anchorBox?.y);

        expect(content).toBe('This nearer message should win because it is the closest visible content block above the reaction anchor.');
    });
});
