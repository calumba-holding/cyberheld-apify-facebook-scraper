import type { Locator, Page } from 'playwright';

import { COMMENT_SELECTOR, COMMENTS_HEADING_SELECTOR } from '../selectors.js';

const closeVisibleDialogIfAny = async (page: Page): Promise<boolean> => {
    const dialogCount = await page.locator('div[role="dialog"]:visible').count().catch(() => 0);
    if (!dialogCount) return false;

    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(700);
    return true;
};

export const getCommentLocators = (scope: Locator): Locator => scope.locator(COMMENT_SELECTOR);

export const ensureCommentsAreVisible = async (page: Page, scope: Locator, comments: Locator): Promise<void> => {
    if (await comments.count()) return;
    await closeVisibleDialogIfAny(page);

    const heading = scope.locator(COMMENTS_HEADING_SELECTOR).filter({ hasText: /Comments|Kommentare/i }).first();
    if (await heading.isVisible().catch(() => false)) {
        await heading.scrollIntoViewIfNeeded().catch(() => undefined);
        await page.waitForTimeout(1000);
        if (await comments.count()) return;
    }

    for (let attempt = 0; attempt < 8; attempt++) {
        await page.mouse.wheel(0, 1400);
        await page.waitForTimeout(700);
        if (await comments.count()) return;
    }
};

export const clickCommentExpansionButtons = async (page: Page, scope: Locator): Promise<boolean> => {
    const buttons = scope.locator('[role="button"]');
    const count = await buttons.count();

    for (let index = 0; index < count; index++) {
        const button = buttons.nth(index);
        if (!(await button.isVisible().catch(() => false))) continue;

        const text = [
            await button.textContent().catch(() => ''),
            await button.getAttribute('aria-label').catch(() => ''),
        ].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
        const normalized = text.toLocaleLowerCase();
        const isExpansionButton = /(?:view|see|show).*(?:comment|repl)|(?:more|previous).*(?:comment|repl)|(?:weitere|mehr|vorherige).*(?:kommentar|antwort)|(?:kommentar|antwort).*(?:anzeigen|ansehen)/i.test(normalized);
        if (!isExpansionButton) continue;

        await button.scrollIntoViewIfNeeded().catch(() => undefined);
        const clicked = await button.click({ force: true, timeout: 3_000 }).then(() => true).catch(() => false);
        if (!clicked) continue;
        await page.waitForTimeout(500);
        return true;
    }

    return false;
};
