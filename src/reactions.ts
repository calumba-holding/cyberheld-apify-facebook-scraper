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
    console.log('\n👍 Hunting for the main post reaction counter...');

    const reactionCounter = page.locator(REACTION_COUNTER_SELECTOR).first();
    if (!(await reactionCounter.isVisible())) {
        console.log('⚠️ Could not find the reaction counter.');
        return [];
    }

    console.log('👆 Found it! Clicking to open the modal...');
    await reactionCounter.click({ force: true });

    console.log('⏳ Waiting specifically for the Reaction Modal...');
    await page.waitForSelector('div[role="dialog"]:visible', { timeout: 10000 });
    const modal = page.locator('div[role="dialog"]:visible').last();
    await modal.waitFor({ state: 'visible', timeout: 10000 });
    await page.waitForTimeout(1500);

    const tabLabels = await modal.locator('[role="tab"], [role="button"]').evaluateAll((tabs) => {
        return tabs
            .map((tab) => {
                const role = tab.getAttribute('role') || '';
                const ariaLabel = tab.getAttribute('aria-label') || '';
                const text = tab.textContent?.trim() || '';
                return `${role} | ${ariaLabel || text}`;
            })
            .filter(Boolean);
    });
    console.log('🔎 Tabs in modal:', tabLabels);

    console.log('🎯 Locating the "All" tab inside the modal...');
    const allTab = await findAllTab(modal);

    if (await allTab.count()) {
        console.log('👆 Clicking "All" tab now...');
        await allTab.click({ force: true });
        await page.waitForTimeout(3000);
        console.log('✅ "All" tab selected.');
    } else {
        console.log('⚠️ Could not find "All" tab. It might already be selected.');
    }

    console.log('📜 Scrolling and scraping users from "All"...');
    await modal.locator(PROFILE_PICTURE_SELECTOR).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
        console.log('⚠️ No visible profile links found yet in the All tab.');
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
            console.log(`   📊 Extracted ${seenProfiles.size} total unique users so far...`);
        }

        if (retries >= 3) break;

        const didScroll = await scrollReactionList(modal, page);
        if (!didScroll) {
            retries += 1;
            console.log('⚠️ Could not find a scrollable container in the reactions modal.');
        }

        await page.waitForTimeout(1500);
    }

    console.log(`\n🎉 Done! Extracted ${reactions.length} users.`);
    return reactions;
};

export const closeReactionModal = async (page: Page): Promise<void> => {
    console.log('\n❌ Closing the reactions modal...');

    const modal = page.locator('div[role="dialog"]:visible').last();
    const closeBtn = modal.locator('[aria-label="Close"][role="button"]').first();

    if (await closeBtn.isVisible().catch(() => false)) {
        await closeBtn.click({ force: true });
        await page.waitForTimeout(2000);
        return;
    }

    console.log('⚠️ Close button not found, falling back to Escape key.');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);
};
