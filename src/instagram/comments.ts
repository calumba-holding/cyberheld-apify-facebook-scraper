import type { Page } from 'playwright';

import { log } from '../common/logger.js';
import type { ScrapedComment } from '../common/types.js';
import { COMMENT_PERMALINK_SELECTOR, LOAD_MORE_COMMENTS_LABEL, VIEW_REPLIES_PATTERN } from './selectors.js';

export type InstagramCommentExtractionResult = {
    comments: ScrapedComment[];
    extracted: boolean;
};

type InstagramCommentExtractionOptions = {
    maxPasses?: number;
    clickDelayMs?: number;
    settleMs?: number;
};

const clickVisibleElements = async (
    page: Page,
    selector: string,
    clickDelayMs: number,
    textPattern?: RegExp,
): Promise<boolean> => {
    const locator = textPattern
        ? page.locator(selector).filter({ hasText: textPattern })
        : page.locator(selector);
    let clicked = false;

    for (let index = 0; index < await locator.count(); index++) {
        const element = locator.nth(index);
        if (!(await element.isVisible().catch(() => false))) continue;
        await element.scrollIntoViewIfNeeded().catch(() => undefined);
        await element.evaluate((node) => (node as HTMLElement).click()).catch(() => undefined);
        await page.waitForTimeout(clickDelayMs);
        clicked = true;
    }

    return clicked;
};

const countVisibleActionButtons = async (page: Page): Promise<{ loadMore: number; replies: number }> => {
    const loadMore = await page.locator('button')
        .filter({ hasText: new RegExp(`^${LOAD_MORE_COMMENTS_LABEL}$`, 'i') })
        .evaluateAll((nodes) => nodes.filter((node) => node instanceof HTMLElement && node.offsetParent !== null).length)
        .catch(() => 0);

    const replies = await page.locator('[role="button"]')
        .filter({ hasText: VIEW_REPLIES_PATTERN })
        .evaluateAll((nodes) => nodes.filter((node) => node instanceof HTMLElement && node.offsetParent !== null).length)
        .catch(() => 0);

    return { loadMore, replies };
};

const deduplicateComments = (comments: ScrapedComment[]): ScrapedComment[] => {
    const seen = new Set<string>();
    return comments.filter((comment) => {
        const key = comment.id || `${comment.user}|${comment.timestamp}|${comment.content}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

const extractVisibleComments = async (page: Page): Promise<ScrapedComment[]> => {
    const extracted = await page.locator('main').evaluate((main, options) => {
        const clean = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();
        const isProfileHref = (href: string): boolean => /^\/[^/?#]+\/$/.test(href)
            && !href.startsWith('/accounts/')
            && !href.startsWith('/explore/');
        const repliesPattern = new RegExp(options.viewRepliesPattern, 'i');
        const resolveContainer = (anchor: HTMLAnchorElement): HTMLElement | null => {
            let current = anchor.parentElement;
            while (current && current !== main) {
                const text = clean(current.textContent);
                if (text.includes('Like') && text.includes('Reply')) return current;
                current = current.parentElement;
            }
            return anchor.parentElement;
        };

        return Array.from(main.querySelectorAll<HTMLAnchorElement>(options.permalinkSelector)).map((anchor) => {
            const container = resolveContainer(anchor);
            if (!container) return null;

            const userAnchor = Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href]'))
                .find((link) => isProfileHref(link.getAttribute('href') || ''));
            const timeElement = anchor.querySelector('time');
            const user = clean(userAnchor?.textContent) || 'Unknown User';
            const timestampLabel = clean(timeElement?.textContent || anchor.textContent);
            const timestamp = clean(timeElement?.getAttribute('datetime')) || timestampLabel;
            const content = Array.from(container.querySelectorAll<HTMLElement>('div, span'))
                .map((element) => clean(element.innerText || element.textContent))
                .find((text) => Boolean(text)
                    && text !== user
                    && text !== timestampLabel
                    && !(text.includes(user) && text.includes(timestampLabel))
                    && text !== 'Like'
                    && text !== 'Reply'
                    && text !== 'Follow'
                    && text !== 'Edited'
                    && !repliesPattern.test(text)
                    && text !== options.loadMoreCommentsLabel) || '';
            const id = (anchor.getAttribute('href') || '').match(/\/c\/([^/?#]+)/)?.[1] || '';

            return {
                user,
                content,
                timestamp,
                timestampLabel: timestampLabel || '',
                id,
            };
        }).filter((comment): comment is NonNullable<typeof comment> => Boolean(comment?.id));
    }, {
        permalinkSelector: COMMENT_PERMALINK_SELECTOR,
        loadMoreCommentsLabel: LOAD_MORE_COMMENTS_LABEL,
        viewRepliesPattern: VIEW_REPLIES_PATTERN.source,
    });

    return extracted.map((comment) => ({
        ...comment,
        timestampLabel: comment.timestampLabel || undefined,
    }));
};

export const extractInstagramComments = async (
    page: Page,
    options: InstagramCommentExtractionOptions = {},
): Promise<InstagramCommentExtractionResult> => {
    const maxPasses = options.maxPasses ?? 12;
    const clickDelayMs = options.clickDelayMs ?? 500;
    const settleMs = options.settleMs ?? 1000;
    let previousCount = 0;
    let stablePasses = 0;

    for (let pass = 0; pass < maxPasses && stablePasses < 3; pass++) {
        log.info(`Instagram comment pass ${pass + 1}/${maxPasses}...`);
        const clickedLoadMore = await clickVisibleElements(page, 'button', clickDelayMs, new RegExp(`^${LOAD_MORE_COMMENTS_LABEL}$`, 'i'));
        const clickedReplies = await clickVisibleElements(page, '[role="button"]', clickDelayMs, VIEW_REPLIES_PATTERN);
        const comments = await page.locator(COMMENT_PERMALINK_SELECTOR).count();
        const actionable = await countVisibleActionButtons(page);

        if (comments > 0) await page.locator(COMMENT_PERMALINK_SELECTOR).last().scrollIntoViewIfNeeded().catch(() => undefined);
        await page.waitForTimeout(settleMs);

        if (comments === previousCount && !clickedLoadMore && !clickedReplies && actionable.loadMore === 0 && actionable.replies === 0) {
            stablePasses += 1;
        } else {
            previousCount = comments;
            stablePasses = 0;
        }
    }

    const actionable = await countVisibleActionButtons(page);
    const extracted = stablePasses >= 3 || (actionable.loadMore === 0 && actionable.replies === 0);
    const comments = deduplicateComments(await extractVisibleComments(page));
    log.info(`Extracted ${comments.length} Instagram comments.`);
    return { comments, extracted };
};
