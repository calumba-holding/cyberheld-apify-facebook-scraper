import { log } from '../common/logger.js';
import type { Locator, Page } from 'playwright';

import { extractCommentRecord } from './comment-extraction.js';
import { closeCommentReactionModal, findReactionButton, openCommentReactionModal } from './comment-reaction-modal.js';
import { normalizeProfileUrl, scrollReactionModal } from './reaction-helpers.js';
import { buildCommentKey, type CommentReactionBreakdown, type CommentReactionDetails, type CommentReactionUser, type ScrapedComment } from './types.js';

const PROFILE_PICTURE_LINK = 'a[aria-label^="Profile picture of"]';

const parseCount = (label: string): number => Number.parseInt(label.trim().split(' ')[0] || '0', 10) || 0;

const parseReactionTab = (ariaLabel: string): CommentReactionBreakdown | null => {
    const marker = 'reacted with ';
    const start = ariaLabel.indexOf('Show ');
    const markerIndex = ariaLabel.lastIndexOf(marker);
    if (start !== 0 || markerIndex < 0) return null;
    const count = Number.parseInt(ariaLabel.slice(5, markerIndex).trim().split(' ')[0] || '0', 10);
    const reaction = ariaLabel.slice(markerIndex + marker.length).trim();
    if (!Number.isFinite(count) || !reaction) return null;
    return { reaction, count };
};

const collectReactionTabs = async (modal: Locator): Promise<CommentReactionBreakdown[]> => {
    const labels = await modal.locator('[role="tab"]').evaluateAll((nodes) => {
        return nodes.map((node) => node.getAttribute('aria-label') || '').filter(Boolean);
    });
    return labels.map((label) => parseReactionTab(label)).filter((tab): tab is CommentReactionBreakdown => Boolean(tab));
};

const collectUsersFromCurrentTab = async (modal: Locator, reaction: string): Promise<CommentReactionUser[]> => {
    const links = modal.locator(PROFILE_PICTURE_LINK);
    return links.evaluateAll((nodes, currentReaction) => {
        const results: CommentReactionUser[] = [];
        for (const node of nodes) {
            const anchor = node as HTMLAnchorElement;
            const ariaLabel = anchor.getAttribute('aria-label') || '';
            const name = ariaLabel.replace('Profile picture of ', '').trim();
            if (name && anchor.href) results.push({ name, profile_url: anchor.href, reaction: currentReaction });
        }
        return results;
    }, reaction);
};

const collectUsersForReaction = async (page: Page, modal: Locator, reaction: string): Promise<CommentReactionUser[]> => {
    const tab = modal.locator(`[role="tab"][aria-label*="reacted with ${reaction}"]`).first();
    if (!(await tab.isVisible().catch(() => false))) return [];

    for (let attempt = 0; attempt < 3; attempt++) {
        await tab.scrollIntoViewIfNeeded().catch(() => undefined);
        await page.waitForTimeout(200);
        await tab.click({ force: true, delay: 100 }).catch(() => undefined);
        await page.waitForTimeout(700);
        if ((await tab.getAttribute('aria-selected').catch(() => 'false')) === 'true') break;
    }

    const users: CommentReactionUser[] = [];
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
        await scrollReactionModal(modal, page);
        await page.waitForTimeout(700);
    }

    return users;
};

export const attachCommentReactions = async (page: Page, comments: Locator, records: ScrapedComment[]): Promise<ScrapedComment[]> => {
    const byKey = new Map(records.map((record) => [buildCommentKey(record), record]));
    const processed = new Set<string>();
    for (let index = 0; index < await comments.count(); index++) {
        const comment = comments.nth(index);
        const record = await extractCommentRecord(comment);
        if (!record) continue;
        const key = buildCommentKey(record);
        const target = byKey.get(key);
        if (!target || processed.has(key)) continue;
        processed.add(key);
        const button = await findReactionButton(comment);
        if (!button) continue;
        const label = (await button.getAttribute('aria-label').catch(() => '')) || '';
        if (!label) continue;
        const modal = await openCommentReactionModal(page, comment);
        if (!modal) {
            log.warning(`Could not open nested reaction modal for comment ${target.id}.`);
            continue;
        }
        await page.waitForTimeout(500);
        const breakdown = (await collectReactionTabs(modal)).filter((tab) => tab.reaction !== 'All');
        const users: CommentReactionUser[] = [];
        for (const tab of breakdown) users.push(...await collectUsersForReaction(page, modal, tab.reaction));
        const reactions: CommentReactionDetails = { count: parseCount(label), label, breakdown, users };
        target.reactions = reactions;
        await closeCommentReactionModal(page, modal);
    }

    return records;
};
