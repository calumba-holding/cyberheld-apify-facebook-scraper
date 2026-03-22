import { log } from '../common/logger.js';
import type { Locator, Page } from 'playwright';

import { REACTION_LABELS } from './constants.js';
import { closePostReactionModal, openPostReactionModal, scrollPostReactionList } from './post-reaction-modal.js';
import { normalizeProfileUrl } from './reaction-helpers.js';
import { PROFILE_PICTURE_SELECTOR } from './selectors.js';
import type { ReactionUser } from './types.js';

type ReactionBreakdown = {
    reaction: string;
    count: number;
};

type ReactionButtonCandidate = ReactionBreakdown & {
    index: number;
    x: number;
    y: number;
};

const parseReactionButton = (ariaLabel: string): ReactionBreakdown | null => {
    for (const reaction of REACTION_LABELS) {
        if (!ariaLabel.startsWith(`${reaction}:`)) continue;
        const count = Number.parseInt(ariaLabel.slice(reaction.length + 1).trim().split(' ')[0] || '0', 10);
        if (Number.isFinite(count) && count > 0) return { reaction, count };
    }
    return null;
};

const parseReactionTab = (ariaLabel: string): ReactionBreakdown | null => {
    const match = ariaLabel.match(/^Show\s+(\d+).*reacted with\s+(.+)$/i);
    if (!match) return null;

    const count = Number.parseInt(match[1], 10);
    const reaction = match[2]?.trim();
    if (!Number.isFinite(count) || !reaction) return null;
    return { reaction, count };
};

const collectReactionButtons = async (scope: Locator): Promise<ReactionButtonCandidate[]> => {
    const buttons = scope.locator('[role="button"][aria-label]');
    const candidates: ReactionButtonCandidate[] = [];

    for (let index = 0; index < await buttons.count(); index++) {
        const button = buttons.nth(index);
        if (!(await button.isVisible().catch(() => false))) continue;

        const ariaLabel = (await button.getAttribute('aria-label').catch(() => '')) || '';
        const parsed = parseReactionButton(ariaLabel);
        if (!parsed) continue;

        const box = await button.boundingBox();
        if (!box) continue;
        candidates.push({ ...parsed, index, x: box.x, y: box.y });
    }

    candidates.sort((left, right) => (left.y - right.y) || (left.x - right.x));
    return candidates;
};

const collectReactionTabs = async (modal: Locator): Promise<ReactionBreakdown[]> => {
    const labels = await modal.locator('[role="tab"]').evaluateAll((nodes) => {
        return nodes.map((node) => node.getAttribute('aria-label') || '').filter(Boolean);
    });

    const tabs = labels.map((label) => parseReactionTab(label)).filter((tab): tab is ReactionBreakdown => Boolean(tab));
    return tabs.length ? tabs : [];
};

const collectUsersFromCurrentTab = async (modal: Locator, reaction: string): Promise<ReactionUser[]> => {
    const links = modal.locator(PROFILE_PICTURE_SELECTOR);
    return links.evaluateAll((nodes, currentReaction) => {
        const results: ReactionUser[] = [];
        for (const node of nodes) {
            const anchor = node as HTMLAnchorElement;
            const ariaLabel = anchor.getAttribute('aria-label') || '';
            const name = ariaLabel.replace('Profile picture of ', '').trim();
            if (name && anchor.href) results.push({ name, profile_url: anchor.href, reaction: currentReaction });
        }
        return results;
    }, reaction);
};

const collectUsersForReaction = async (page: Page, modal: Locator, reaction: string): Promise<ReactionUser[]> => {
    const tab = modal.locator(`[role="tab"][aria-label*="reacted with ${reaction}"]`).first();
    if (await tab.isVisible().catch(() => false)) {
        for (let attempt = 0; attempt < 3; attempt++) {
            await tab.scrollIntoViewIfNeeded().catch(() => undefined);
            await page.waitForTimeout(200);
            await tab.click({ force: true, delay: 100 }).catch(() => undefined);
            await page.waitForTimeout(700);
            if ((await tab.getAttribute('aria-selected').catch(() => 'false')) === 'true') break;
        }
    }

    const users: ReactionUser[] = [];
    const seenProfiles = new Set<string>();
    let previousCount = 0;
    let stablePasses = 0;

    while (stablePasses < 3) {
        for (const user of await collectUsersFromCurrentTab(modal, reaction)) {
            const profileUrl = normalizeProfileUrl(user.profile_url);
            if (seenProfiles.has(profileUrl)) continue;
            seenProfiles.add(profileUrl);
            users.push({ ...user, profile_url: profileUrl });
        }

        stablePasses = seenProfiles.size === previousCount ? stablePasses + 1 : 0;
        previousCount = seenProfiles.size;
        if (stablePasses >= 3) break;

        await scrollPostReactionList(modal, page);
        await page.waitForTimeout(700);
    }

    return users;
};

const extractUsersFromModal = async (page: Page, modal: Locator, fallbackReaction: string): Promise<ReactionUser[]> => {
    await modal.locator(PROFILE_PICTURE_SELECTOR).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => undefined);

    const tabs = await collectReactionTabs(modal);
    const breakdown = tabs.length ? tabs : [{ reaction: fallbackReaction, count: 0 }];
    const users: ReactionUser[] = [];

    for (const tab of breakdown) {
        users.push(...await collectUsersForReaction(page, modal, tab.reaction));
    }

    return users;
};

export const extractAllReactions = async (page: Page, scope: Locator = page.locator('body')): Promise<ReactionUser[]> => {
    log.info('Hunting for post reactions inside the target post only...');

    const candidates = await collectReactionButtons(scope);
    if (!candidates.length) {
        log.warning('Could not find a post reaction entry inside the target post.');
        return [];
    }

    const primary = candidates[0];
    const button = scope.locator('[role="button"][aria-label]').nth(primary.index);
    const modal = await openPostReactionModal(page, button);
    if (!modal) {
        log.warning('Could not open the post reactions modal.');
        return [];
    }

    try {
        const reactions = await extractUsersFromModal(page, modal, primary.reaction);
        log.info(`Done. Extracted ${reactions.length} post reaction users.`);
        return reactions;
    } finally {
        await closePostReactionModal(page, modal);
    }
};

