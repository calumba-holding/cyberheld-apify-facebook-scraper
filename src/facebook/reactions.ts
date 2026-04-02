import { log } from '../common/logger.js';
import type { Locator, Page } from 'playwright';

import { closePostReactionModal, openPostReactionModal, scrollPostReactionList } from './post-reaction-modal.js';
import { normalizeProfileUrl } from './reaction-helpers.js';
import { PROFILE_PICTURE_SELECTOR } from './selectors.js';
import type { ReactionUser } from './types.js';

export interface PostReactionExtractionResult {
    users: ReactionUser[];
    extracted: boolean;
    visibleTotal?: number;
}

type ReactionBreakdown = {
    reaction: string;
    count: number;
};

const REACTION_NAME_ALIASES: Record<string, string> = {
    like: 'Like',
    'gefällt mir': 'Like',
    love: 'Love',
    liebe: 'Love',
    care: 'Care',
    umarmt: 'Care',
    haha: 'Haha',
    wow: 'Wow',
    sad: 'Sad',
    traurig: 'Sad',
    angry: 'Angry',
    wütend: 'Angry',
};

type ReactionButtonCandidate = ReactionBreakdown & {
    index: number;
    x: number;
    y: number;
};

const normalizeReactionName = (value: string): string => {
    return REACTION_NAME_ALIASES[value.trim().toLowerCase()] ?? value.trim();
};

const parseReactionButton = (ariaLabel: string, allowZeroCount = false): ReactionBreakdown | null => {
    const match = ariaLabel.match(/^([^:]+):\s*(\d+)/u);
    if (!match) return null;

    const reaction = normalizeReactionName(match[1] || '');
    const count = Number.parseInt(match[2] || '0', 10);
    if (!Number.isFinite(count) || count < 0 || !reaction) return null;
    if (count > 0 || (allowZeroCount && count === 0)) return { reaction, count };
    return null;
};

const parseReactionTab = (ariaLabel: string): ReactionBreakdown | null => {
    const englishMatch = ariaLabel.match(/^Show\s+(\d+).*reacted with\s+(.+)$/i);
    if (englishMatch) {
        const count = Number.parseInt(englishMatch[1], 10);
        const reaction = normalizeReactionName(englishMatch[2] || '');
        if (!Number.isFinite(count) || !reaction) return null;
        return { reaction, count };
    }

    const genericMatch = ariaLabel.match(/(\d+)/u);
    if (!genericMatch) return null;
    const count = Number.parseInt(genericMatch[1], 10);
    const reaction = normalizeReactionName(ariaLabel.replace(/\d+/gu, '').replace(/[–—:]/gu, ' ').trim());
    if (!Number.isFinite(count) || !reaction) return null;
    return { reaction, count };
};

const collectReactionButtons = async (
    scope: Locator,
    options: { allowZeroCount?: boolean } = {},
): Promise<ReactionButtonCandidate[]> => {
    const buttons = scope.locator('[role="button"][aria-label]');
    const candidates: ReactionButtonCandidate[] = [];

    for (let index = 0; index < await buttons.count(); index++) {
        const button = buttons.nth(index);
        if (!(await button.isVisible().catch(() => false))) continue;

        const ariaLabel = (await button.getAttribute('aria-label').catch(() => '')) || '';
        const parsed = parseReactionButton(ariaLabel, options.allowZeroCount);
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
        const isVisible = (element: Element): element is HTMLElement => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const results: ReactionUser[] = [];
        for (const node of nodes) {
            if (!(node instanceof HTMLAnchorElement) || !isVisible(node)) continue;
            const ariaLabel = node.getAttribute('aria-label') || '';
            const name = ariaLabel.replace('Profile picture of ', '').trim();
            if (name && node.href) results.push({ name, profile_url: node.href, reaction: currentReaction });
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

const isLoginRequiredReactionModal = async (modal: Locator): Promise<boolean> => {
    const loginCta = modal.locator('[aria-label="Bei Facebook anmelden"], [aria-label="Log in to Facebook"], [aria-label="Anmelden"], [aria-label="Neues Konto erstellen"], [aria-label="Create new account"]');
    if (await loginCta.first().isVisible().catch(() => false)) return true;

    const emailInput = modal.locator('[aria-label="E-Mail-Adresse oder Handynummer"], [aria-label="Email address or phone number"]');
    return emailInput.first().isVisible().catch(() => false);
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

export const extractAllReactions = async (
    page: Page,
    scope: Locator = page.locator('body'),
): Promise<PostReactionExtractionResult> => {
    log.info('Hunting for post reactions inside the target post only...');

    const candidates = await collectReactionButtons(scope);
    if (!candidates.length) {
        const zeroReactionCandidates = await collectReactionButtons(scope, { allowZeroCount: true });
        if (zeroReactionCandidates.length) {
            log.info('The target post shows an explicit zero-reaction entry. Treating post reaction extraction as complete.');
            return { users: [], extracted: true, visibleTotal: 0 };
        }

        log.warning('Could not confirm a visible post reaction entry inside the target post. Leaving post reaction extraction as incomplete.');
        return { users: [], extracted: false };
    }

    const visibleTotal = candidates.reduce((sum, candidate) => sum + candidate.count, 0);

    const primary = candidates[0];
    const button = scope.locator('[role="button"][aria-label]').nth(primary.index);
    const modal = await openPostReactionModal(page, button);
    if (!modal) {
        log.warning('Could not open the post reactions modal.');
        return { users: [], extracted: false };
    }

    try {
        if (await isLoginRequiredReactionModal(modal)) {
            log.warning(`Facebook opened a login-gated reactions dialog. Keeping visible reaction total ${String(visibleTotal)} but marking user extraction incomplete.`);
            return { users: [], extracted: false, visibleTotal };
        }

        const reactions = await extractUsersFromModal(page, modal, primary.reaction);
        log.info(`Done. Extracted ${reactions.length} post reaction users.`);
        return { users: reactions, extracted: true, visibleTotal };
    } finally {
        await closePostReactionModal(page, modal);
    }
};

