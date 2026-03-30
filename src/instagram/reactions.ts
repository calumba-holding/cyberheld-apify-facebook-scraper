import type { Page } from 'playwright';

import { log } from '../common/logger.js';
import type { ReactionUser } from '../common/types.js';
import { COUNT_BUTTON_SELECTOR, DIALOG_SELECTOR } from './selectors.js';

export type InstagramReactionExtractionResult = {
    users: ReactionUser[];
    extracted: boolean;
};

const normalizeProfileUrl = (href: string): string => new URL(href, 'https://www.instagram.com').toString();

type ReactionTriggerCandidate = {
    index: number;
    text: string;
    top: number;
    isLikeCount: boolean;
};

const findReactionTrigger = async (page: Page): Promise<number | null> => {
    const candidates = await page.locator(COUNT_BUTTON_SELECTOR).evaluateAll((nodes) => {
        return nodes.map((node, index) => ({
            index,
            text: (node.textContent || '').replace(/\s+/g, ' ').trim(),
            top: node.getBoundingClientRect().top,
            isLikeCount: /(^|\s)\d+(?:[.,]\d+)?\s*[KMB]?\s+likes?$/i.test((node.textContent || '').replace(/\s+/g, ' ').trim()),
        })).filter((entry) => entry.isLikeCount || /(^|\s)\d+(?:[.,]\d+)?\s*[KMB]?$/i.test(entry.text));
    });

    const sorted = (candidates as ReactionTriggerCandidate[]).sort((left, right) => {
        if (left.isLikeCount !== right.isLikeCount) return left.isLikeCount ? -1 : 1;
        return left.top - right.top;
    });
    return sorted[0]?.index ?? null;
};

const isLoginWallDialog = async (page: Page): Promise<boolean> => {
    const dialog = page.locator(DIALOG_SELECTOR).last();
    const text = await dialog.innerText().catch(() => '');
    return /sign up|log in|like this post/i.test(text);
};

const scrollReactionDialog = async (page: Page): Promise<boolean> => {
    return page.locator(DIALOG_SELECTOR).last().evaluate((dialog) => {
        const scrollable = [dialog, ...Array.from(dialog.querySelectorAll<HTMLElement>('*'))]
            .find((node) => node instanceof HTMLElement && node.scrollHeight > node.clientHeight + 24) as HTMLElement | undefined;
        if (!scrollable) return false;
        scrollable.scrollTop += Math.max(320, Math.round(scrollable.clientHeight * 0.8));
        return true;
    }).catch(() => false);
};

const collectVisibleUsers = async (page: Page): Promise<ReactionUser[]> => {
    return page.locator(DIALOG_SELECTOR).last().locator('a[href]').evaluateAll((nodes) => {
        const clean = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();
        const isProfileHref = (href: string): boolean => /^\/[^/?#]+\/$/.test(href)
            && !href.startsWith('/accounts/')
            && !href.startsWith('/explore/');

        return nodes.flatMap((node) => {
            const anchor = node as HTMLAnchorElement;
            const href = anchor.getAttribute('href') || '';
            const name = clean(anchor.textContent);
            if (!name || !isProfileHref(href)) return [];
            return [{ name, profile_url: new URL(href, 'https://www.instagram.com').toString(), reaction: 'Like' }];
        });
    });
};

export const extractInstagramReactions = async (page: Page): Promise<InstagramReactionExtractionResult> => {
    const triggerIndex = await findReactionTrigger(page);
    if (triggerIndex === null) {
        log.warning('Could not find an Instagram post like-count button.');
        return { users: [], extracted: false };
    }

    await page.locator(COUNT_BUTTON_SELECTOR).nth(triggerIndex).evaluate((node) => (node as HTMLElement).click()).catch(() => undefined);
    const dialog = page.locator(DIALOG_SELECTOR).last();
    await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);
    if (!(await dialog.isVisible().catch(() => false)) || await isLoginWallDialog(page)) {
        await page.keyboard.press('Escape').catch(() => undefined);
        log.warning('Instagram like list requires a logged-in profile.');
        return { users: [], extracted: false };
    }

    const users = new Map<string, ReactionUser>();
    let previousSize = 0;
    let stablePasses = 0;

    while (stablePasses < 3) {
        for (const user of await collectVisibleUsers(page)) {
            users.set(normalizeProfileUrl(user.profile_url), { ...user, profile_url: normalizeProfileUrl(user.profile_url) });
        }

        stablePasses = users.size === previousSize ? stablePasses + 1 : 0;
        previousSize = users.size;
        if (!(await scrollReactionDialog(page))) break;
        await page.waitForTimeout(800);
    }

    await page.keyboard.press('Escape').catch(() => undefined);
    log.info(`Extracted ${users.size} Instagram like users.`);
    return { users: Array.from(users.values()), extracted: true };
};
