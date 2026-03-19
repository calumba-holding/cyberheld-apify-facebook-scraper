import { log } from 'apify';
import type { Locator, Page } from 'playwright';
export type ReactionUser = {
    name: string;
    profile_url: string;
    reaction: 'All';
};
const REACTION_COUNTER_SELECTOR = '[aria-label*="reacted to this"], [aria-label*="reactions"]';
const PROFILE_PICTURE_SELECTOR = 'a[aria-label^="Profile picture of"]';

const extractVisibleReactionUsers = async (modal: Locator): Promise<ReactionUser[]> => {
    const profileLinks = modal.locator(PROFILE_PICTURE_SELECTOR);

    return profileLinks.evaluateAll((nodes) => {
        const results: ReactionUser[] = [];

        nodes.forEach((node) => {
            const anchor = node as HTMLAnchorElement;
            const ariaLabel = anchor.getAttribute('aria-label') || '';
            const name = ariaLabel.replace('Profile picture of ', '').trim();
            let url = anchor.href || '';

            if (url.includes('&__cft__')) url = url.split('&__cft__')[0];
            if (url.includes('?__cft__')) url = url.split('?__cft__')[0];

            if (name && url) {
                results.push({ name, profile_url: url, reaction: 'All' });
            }
        });

        return results;
    });
};

const scrollReactionList = async (modal: Locator, page: Page): Promise<boolean> => {
    const scrolledInsideModal = await modal.evaluate((dialog) => {
        const scrollableContainers = Array.from(dialog.querySelectorAll<HTMLElement>('div'))
            .filter((node) => {
                const { overflowY } = window.getComputedStyle(node);
                const supportsScroll = overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
                return supportsScroll && node.scrollHeight > node.clientHeight + 20;
            })
            .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight));

        const target = scrollableContainers[0];
        if (!target) return false;

        const previousTop = target.scrollTop;
        target.scrollTop = previousTop + Math.max(target.clientHeight * 0.8, 400);
        return target.scrollTop > previousTop;
    });

    if (scrolledInsideModal) {
        return true;
    }

    const modalBox = await modal.boundingBox();
    if (!modalBox) {
        return false;
    }

    await page.mouse.move(modalBox.x + modalBox.width / 2, modalBox.y + modalBox.height / 2);
    await page.mouse.wheel(0, 1500);
    return true;
};

const findAllTab = async (modal: Locator): Promise<Locator> => {
    let allTab = modal.locator('[role="tab"][aria-label*="reacted with All"], [role="button"][aria-label*="reacted with All"]').first();
    if (await allTab.count()) return allTab;

    allTab = modal.locator('[role="tab"]').filter({ hasText: 'All' }).first();
    if (await allTab.count()) return allTab;

    return modal.locator('[role="button"]').filter({ hasText: 'All' }).first();
};

export const extractAllReactions = async (page: Page): Promise<ReactionUser[]> => {
    log.info('Hunting for the main post reaction counter...');
    let modal: Locator | null = null;

    try {
        const reactionCounter = page.locator(REACTION_COUNTER_SELECTOR).first();
        if (!(await reactionCounter.isVisible())) {
            log.warning('Could not find the reaction counter.');
            return [];
        }

        log.info('Found reaction counter. Opening modal...');
        let modalOpened = false;
        for (let attempt = 0; attempt < 3; attempt++) {
            await reactionCounter.scrollIntoViewIfNeeded().catch(() => undefined);
            await page.waitForTimeout(250);
            await reactionCounter.click({ force: true, delay: 80 }).catch(() => undefined);
            try {
                await page.waitForSelector('div[role="dialog"]:visible', { timeout: 5000 });
                modalOpened = true;
                break;
            } catch {
                await page.waitForTimeout(500);
            }
        }
        if (!modalOpened) {
            log.warning('Could not open the main reactions modal.');
            return [];
        }

        modal = page.locator('div[role="dialog"]:visible').last();
        await modal.waitFor({ state: 'visible', timeout: 10000 });
        await page.waitForTimeout(1500);

        log.info('Locating the "All" tab inside the reaction modal...');
        const allTab = await findAllTab(modal);

        if (await allTab.count()) {
            log.info('Clicking "All" tab...');
            await allTab.click({ force: true });
            await page.waitForTimeout(3000);
            log.info('"All" tab selected.');
        } else {
            log.warning('Could not find "All" tab. It may already be selected.');
        }

        log.info('Scrolling and scraping users from "All"...');
        await modal.locator(PROFILE_PICTURE_SELECTOR).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
            log.warning('No visible profile links found yet in the All tab.');
        });

        const reactions: ReactionUser[] = [];
        const seenProfiles = new Set<string>();
        let previousCount = 0;
        let retries = 0;

        while (retries < 3) {
            const currentBatch = await extractVisibleReactionUsers(modal);

            for (const user of currentBatch) {
                if (!seenProfiles.has(user.profile_url)) {
                    seenProfiles.add(user.profile_url);
                    reactions.push(user);
                }
            }

            if (seenProfiles.size === previousCount) {
                retries += 1;
            } else {
                retries = 0;
                previousCount = seenProfiles.size;
                log.info(`Extracted ${seenProfiles.size} total unique users so far.`);
            }

            if (retries >= 3) break;

            const didScroll = await scrollReactionList(modal, page);
            if (!didScroll) {
                retries += 1;
                log.warning('Could not find a scrollable container in the reactions modal.');
            }

            await page.waitForTimeout(1500);
        }

        log.info(`Done. Extracted ${reactions.length} users.`);
        return reactions;
    } finally {
        if (modal) await closeReactionModal(page, modal);
    }
};

export const closeReactionModal = async (page: Page, modal?: Locator): Promise<void> => {
    log.info('Closing reactions modal...');
    const resolveActiveDialog = async (): Promise<Locator | null> => {
        if (modal && await modal.isVisible().catch(() => false)) return modal;
        const visibleDialogs = page.locator('div[role="dialog"]:visible');
        if (!(await visibleDialogs.count().catch(() => 0))) return null;
        return visibleDialogs.last();
    };

    for (let attempt = 0; attempt < 5; attempt++) {
        const activeDialog = await resolveActiveDialog();
        if (!activeDialog) return;

        const closeButton = activeDialog
            .locator('[aria-label="Close"][role="button"], [aria-label="Schließen"][role="button"]')
            .first();

        if (!(await closeButton.isVisible().catch(() => false))) break;
        await closeButton.click({ force: true }).catch(() => undefined);

        await page.waitForTimeout(700);
        if (!(await activeDialog.isVisible().catch(() => false))) return;
    }

    log.warning('Could not confirm reaction modal close via close button.');
};
