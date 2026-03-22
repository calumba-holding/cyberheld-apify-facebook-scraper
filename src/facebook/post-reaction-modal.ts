import type { Locator, Page } from 'playwright';

import { dispatchDomClick, scrollReactionModal } from './reaction-helpers.js';
import { REACTION_MODAL_READY_SELECTOR, REACTION_MODAL_SELECTOR } from './selectors.js';

const waitForReactionModal = async (page: Page, baselineDialogs: number): Promise<Locator | null> => {
    const dialogs = page.locator(REACTION_MODAL_SELECTOR);

    for (let attempt = 0; attempt < 20; attempt++) {
        const count = await dialogs.count().catch(() => 0);
        if (count > baselineDialogs) {
            const modal = dialogs.last();
            const ready = await modal.locator(REACTION_MODAL_READY_SELECTOR).first().isVisible().catch(() => false);
            if (ready) return modal;
        }
        await page.waitForTimeout(250);
    }

    return null;
};

export const openPostReactionModal = async (page: Page, button: Locator): Promise<Locator | null> => {
    const baselineDialogs = await page.locator(REACTION_MODAL_SELECTOR).count().catch(() => 0);

    for (let attempt = 0; attempt < 3; attempt++) {
        await button.scrollIntoViewIfNeeded().catch(() => undefined);
        await page.waitForTimeout(200);
        await button.click({ force: true, delay: 100 }).catch(() => undefined);
        if (attempt >= 1) await dispatchDomClick(button).catch(() => undefined);
        if (attempt >= 2) {
            const box = await button.boundingBox();
            if (box) await page.mouse.click(box.x + (box.width / 2), box.y + (box.height / 2)).catch(() => undefined);
        }

        const modal = await waitForReactionModal(page, baselineDialogs);
        if (modal) return modal;
        await page.waitForTimeout(350);
    }

    return null;
};

export const scrollPostReactionList = scrollReactionModal;

export const closePostReactionModal = async (page: Page, modal?: Locator): Promise<void> => {
    const activeDialog = modal && await modal.isVisible().catch(() => false)
        ? modal
        : page.locator(REACTION_MODAL_SELECTOR).last();

    const closeButton = activeDialog.locator('[aria-label="Close"][role="button"], [aria-label="Schließen"][role="button"]').first();
    if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click({ force: true }).catch(() => undefined);
    } else {
        await page.keyboard.press('Escape').catch(() => undefined);
    }

    await page.waitForTimeout(700);
};
