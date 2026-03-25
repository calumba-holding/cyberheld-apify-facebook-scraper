import type { Locator, Page } from 'playwright';

import { dispatchDomClick } from './reaction-helpers.js';
import { COMMENT_REACTION_BUTTON_SELECTOR, REACTION_MODAL_READY_SELECTOR, REACTION_MODAL_SELECTOR } from './selectors.js';

const waitForReactionModal = async (page: Page, baselineDialogs: number): Promise<Locator | null> => {
    const dialogs = page.locator(REACTION_MODAL_SELECTOR);

    for (let attempt = 0; attempt < 18; attempt++) {
        const count = await dialogs.count().catch(() => 0);
        if (count > baselineDialogs || count > 0) {
            const modal = dialogs.last();
            const ready = await modal.locator(REACTION_MODAL_READY_SELECTOR).first().isVisible().catch(() => false);
            if (ready) return modal;
        }
        await page.waitForTimeout(250);
    }

    return null;
};

export const findReactionButton = async (comment: Locator): Promise<Locator | null> => {
    const buttons = comment.locator(COMMENT_REACTION_BUTTON_SELECTOR);
    let selectedButton: Locator | null = null;
    let selectedTop = Number.POSITIVE_INFINITY;

    for (let index = 0; index < await buttons.count(); index++) {
        const button = buttons.nth(index);
        if (!(await button.isVisible().catch(() => false))) continue;

        const box = await button.boundingBox().catch(() => null);
        const top = box?.y ?? Number.POSITIVE_INFINITY;
        if (top < selectedTop) {
            selectedButton = button;
            selectedTop = top;
        }
    }

    if (selectedButton) return selectedButton;
    return (await buttons.count()) ? buttons.first() : null;
};

export const openCommentReactionModal = async (page: Page, comment: Locator): Promise<Locator | null> => {
    const button = await findReactionButton(comment);
    if (!button) return null;

    const baselineDialogs = await page.locator(REACTION_MODAL_SELECTOR).count().catch(() => 0);

    for (let attempt = 0; attempt < 3; attempt++) {
        await button.scrollIntoViewIfNeeded().catch(() => undefined);
        await page.waitForTimeout(250);
        await button.click({ force: true, delay: 100 }).catch(() => undefined);
        if (attempt >= 1) await dispatchDomClick(button).catch(() => undefined);
        if (attempt >= 2) {
            const box = await button.boundingBox();
            if (box) await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2));
        }

        const modal = await waitForReactionModal(page, baselineDialogs);
        if (modal) return modal;
        await page.waitForTimeout(350);
    }

    return null;
};

export const closeCommentReactionModal = async (page: Page, modal: Locator): Promise<void> => {
    const close = modal.locator('[aria-label="Close"][role="button"]').first();
    if (await close.isVisible().catch(() => false)) {
        await close.click({ force: true }).catch(() => undefined);
    } else {
        await page.keyboard.press('Escape').catch(() => undefined);
    }

    await page.waitForTimeout(700);
};
