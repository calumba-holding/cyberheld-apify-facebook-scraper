import type { Locator, Page } from 'playwright';

import { log } from '../common/logger.js';
import type { ScrapedComment } from '../common/types.js';
import { DIALOG_SELECTOR, LOAD_MORE_COMMENTS_LABEL } from './selectors.js';

export type InstagramCommentExtractionResult = {
    comments: ScrapedComment[];
    extracted: boolean;
};

type InstagramCommentExtractionOptions = {
    maxPasses?: number;
    clickDelayMs?: number;
    settleMs?: number;
};

const VIEW_REPLIES_EVAL_PATTERNS = [
    /^View all \d+ repl(?:y|ies)$/i,
    /^View repl(?:y|ies) \(\d+\)$/i,
    /^View \d+ repl(?:y|ies)$/i,
    /^Alle \d+ Antworten anzeigen$/i,
    /^Antworten anzeigen \(\d+\)$/i,
    /^\d+ Antworten anzeigen$/i,
];

const isViewRepliesText = (text: string): boolean => VIEW_REPLIES_EVAL_PATTERNS.some((p) => p.test(text));

const resolveCommentPanel = async (page: Page): Promise<Locator> => {
    const dialog = page.locator(DIALOG_SELECTOR).first();
    if (await dialog.isVisible().catch(() => false)) return dialog;
    return page.locator('main').first();
};

const scrollCommentPanel = async (page: Page, direction: 'up' | 'down'): Promise<void> => {
    await page.evaluate(({ dir }) => {
        const list = document.querySelector('ul._a9ym, ul._a9z6');
        if (!list) return;

        let scrollable: HTMLElement | null = list as HTMLElement;
        while (scrollable) {
            if (scrollable.scrollHeight > scrollable.clientHeight + 8) break;
            scrollable = scrollable.parentElement;
        }
        if (!scrollable) return;

        const delta = Math.max(280, Math.floor(scrollable.clientHeight * 0.9));
        scrollable.scrollTop += dir === 'down' ? delta : -delta;
    }, { dir: direction });
};

const loadAllTopLevelComments = async (page: Page, clickDelayMs: number, maxClicks: number): Promise<number> => {
    let clicks = 0;

    for (let attempt = 0; attempt < maxClicks; attempt++) {
        const loadMore = page.getByRole('button', { name: new RegExp(`^${LOAD_MORE_COMMENTS_LABEL}$`, 'i') }).first();
        if (!(await loadMore.isVisible().catch(() => false))) break;

        await loadMore.scrollIntoViewIfNeeded().catch(() => undefined);
        await loadMore.click({ timeout: 5000 }).catch(() => undefined);
        clicks += 1;
        await page.waitForTimeout(clickDelayMs);
    }

    if (clicks > 0) {
        log.info(`Clicked "Load more comments" ${String(clicks)} time(s).`);
    }

    return clicks;
};

/** Click one visible "View replies" control at a time (DOM mutates after each click). */
const clickNextViewRepliesButton = async (page: Page): Promise<boolean> => (
    page.evaluate((patterns) => {
        const isViewReplies = (text: string): boolean => {
            const normalized = text.replace(/\s+/g, ' ').trim();
            return patterns.some((source) => new RegExp(source, 'i').test(normalized));
        };

        const roots = Array.from(document.querySelectorAll('ul._a9ym, ul._a9z6, [role="dialog"]'));
        for (const root of roots) {
            const buttons = Array.from(root.querySelectorAll<HTMLElement>('button, [role="button"]'));
            for (const button of buttons) {
                if (!button.offsetParent) continue;
                const text = (button.textContent || '').replace(/\s+/g, ' ').trim();
                if (!isViewReplies(text)) continue;
                if (/^Hide /i.test(text) || /^Ausblenden/i.test(text)) continue;
                button.scrollIntoView({ block: 'center', inline: 'nearest' });
                button.click();
                return true;
            }
        }
        return false;
    }, VIEW_REPLIES_EVAL_PATTERNS.map((p) => p.source))
);

const expandAllReplyThreads = async (page: Page, clickDelayMs: number): Promise<number> => {
    let expanded = 0;
    let idleRounds = 0;

    for (let sweep = 0; sweep < 4; sweep++) {
        await scrollCommentPanel(page, 'up');
        await page.waitForTimeout(200);

        for (let step = 0; step < 120; step++) {
            const clicked = await clickNextViewRepliesButton(page);
            if (clicked) {
                expanded += 1;
                idleRounds = 0;
                await page.waitForTimeout(clickDelayMs);
                continue;
            }

            const beforeScroll = await page.evaluate(() => {
                const list = document.querySelector('ul._a9ym, ul._a9z6');
                if (!list) return { top: 0, height: 0, scrollHeight: 0 };
                let scrollable: HTMLElement | null = list as HTMLElement;
                while (scrollable) {
                    if (scrollable.scrollHeight > scrollable.clientHeight + 8) break;
                    scrollable = scrollable.parentElement;
                }
                if (!scrollable) return { top: 0, height: 0, scrollHeight: 0 };
                return {
                    top: scrollable.scrollTop,
                    height: scrollable.clientHeight,
                    scrollHeight: scrollable.scrollHeight,
                };
            });

            await scrollCommentPanel(page, 'down');
            await page.waitForTimeout(150);

            const afterScroll = await page.evaluate(() => {
                const list = document.querySelector('ul._a9ym, ul._a9z6');
                if (!list) return { top: 0 };
                let scrollable: HTMLElement | null = list as HTMLElement;
                while (scrollable) {
                    if (scrollable.scrollHeight > scrollable.clientHeight + 8) break;
                    scrollable = scrollable.parentElement;
                }
                return { top: scrollable?.scrollTop ?? 0 };
            });

            const atBottom = beforeScroll.top + beforeScroll.height >= beforeScroll.scrollHeight - 6;
            if (atBottom || afterScroll.top === beforeScroll.top) {
                idleRounds += 1;
                if (idleRounds >= 2) break;
            } else {
                idleRounds = 0;
            }
        }
    }

    if (expanded > 0) {
        log.info(`Expanded ${String(expanded)} Instagram reply thread(s).`);
    } else {
        log.warning('No "View replies" buttons were clicked — nested replies may be missing.');
    }

    return expanded;
};

const countRemainingViewReplies = async (page: Page): Promise<number> => (
    page.evaluate((patterns) => {
        const isViewReplies = (text: string): boolean => (
            patterns.some((source) => new RegExp(source, 'i').test(text.replace(/\s+/g, ' ').trim()))
        );
        return Array.from(document.querySelectorAll<HTMLElement>('ul._a9ym button, ul._a9ym [role="button"], ul._a9z6 button'))
            .filter((button) => button.offsetParent && isViewReplies(button.textContent || ''))
            .length;
    }, VIEW_REPLIES_EVAL_PATTERNS.map((p) => p.source))
);

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
    const panel = await resolveCommentPanel(page);
    const extracted = await panel.evaluate((container, options) => {
        const clean = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();
        const isProfileHref = (href: string): boolean => /^\/[^/?#]+\/$/.test(href)
            && !href.startsWith('/accounts/')
            && !href.startsWith('/explore/');

        const isCommentPermalink = (href: string): boolean => (
            /\/(?:p|reel|reels|tv)\/[^/]+\/c\/[^/?#]+/i.test(href)
        );

        const isViewReplies = (text: string): boolean => (
            options.viewRepliesPatterns.some((source) => new RegExp(source, 'i').test(clean(text)))
        );

        const isNoiseText = (text: string): boolean => {
            if (!text) return true;
            if (isViewReplies(text)) return true;
            if (text === options.loadMoreCommentsLabel) return true;
            if (/^See translation$/i.test(text)) return true;
            if (/^Comment Options$/i.test(text)) return true;
            if (/^\d[\d.,]*\s*likes?$/i.test(text)) return true;
            if (/^(Like|Reply|Follow|Edited|Verified)$/i.test(text)) return true;
            if (/^\d+\s*[hdwm]\s*·\s*Edited$/i.test(text)) return true;
            if (/^\d+\s*[hdwm](?:\s+·\s+Edited)?$/i.test(text) && text.length < 12) return true;
            if (/^\S+\s+\d+\s*[hdwm]\s+@/i.test(text)) return true;
            if (/\d+\s*likes?\s+Reply/i.test(text)) return true;
            return false;
        };

        const resolveContainer = (anchor: HTMLAnchorElement): HTMLElement | null => {
            let current = anchor.parentElement;
            while (current && current !== container) {
                const text = clean(current.textContent);
                if (text.includes('Like') && text.includes('Reply')) return current;
                current = current.parentElement;
            }
            return anchor.parentElement;
        };

        const resolveParentCommentId = (anchor: HTMLAnchorElement): string | undefined => {
            const replyList = anchor.closest('ul._a9yo, ul._a9yp');
            if (replyList) {
                const hostLi = replyList.closest('li');
                if (hostLi) {
                    const parentLink = Array.from(hostLi.querySelectorAll<HTMLAnchorElement>('a[href*="/c/"]'))
                        .find((link) => {
                            const href = link.getAttribute('href') || '';
                            return isCommentPermalink(href) && !replyList.contains(link);
                        });
                    const parentId = (parentLink?.getAttribute('href') || '').match(/\/c\/([^/?#]+)/)?.[1];
                    if (parentId) return parentId;
                }
            }

            const commentLi = anchor.closest('li');
            if (!commentLi) return undefined;

            const ancestorLis = [];
            let node: Element | null = commentLi.parentElement;
            while (node && node !== container) {
                if (node instanceof HTMLLIElement) ancestorLis.push(node);
                node = node.parentElement;
            }

            for (const ancestorLi of ancestorLis) {
                const parentLink = Array.from(ancestorLi.querySelectorAll<HTMLAnchorElement>('a[href*="/c/"]'))
                    .find((link) => {
                        const href = link.getAttribute('href') || '';
                        return isCommentPermalink(href) && link !== anchor && !commentLi.contains(link);
                    });
                const parentId = (parentLink?.getAttribute('href') || '').match(/\/c\/([^/?#]+)/)?.[1];
                if (parentId) return parentId;
            }

            return undefined;
        };

        const resolveLikeCount = (containerEl: HTMLElement): string | undefined => {
            const labels = Array.from(containerEl.querySelectorAll('button, [role="button"]'))
                .map((element) => clean(element.textContent))
                .filter(Boolean);
            const match = labels.find((label) => /^\d[\d.,]*\s*likes?$/i.test(label));
            return match?.match(/^([\d.,]+[KMB]?)/i)?.[1] || match;
        };

        return Array.from(container.querySelectorAll<HTMLAnchorElement>('a[href*="/c/"]'))
            .filter((anchor) => isCommentPermalink(anchor.getAttribute('href') || ''))
            .map((anchor) => {
                const containerEl = resolveContainer(anchor);
                if (!containerEl) return null;

                const userAnchor = Array.from(containerEl.querySelectorAll<HTMLAnchorElement>('a[href]'))
                    .find((link) => isProfileHref(link.getAttribute('href') || ''));
                const timeElement = anchor.querySelector('time');
                const user = clean(userAnchor?.textContent) || 'Unknown User';
                const timestampLabel = clean(timeElement?.textContent || anchor.textContent);
                const timestamp = clean(timeElement?.getAttribute('datetime')) || timestampLabel;
                const content = Array.from(containerEl.querySelectorAll<HTMLElement>('div, span'))
                    .map((element) => clean(element.innerText || element.textContent))
                    .find((text) => Boolean(text)
                        && text !== user
                        && text !== timestampLabel
                        && !(text.includes(user) && text.includes(timestampLabel))
                        && !isNoiseText(text)) || '';
                const id = (anchor.getAttribute('href') || '').match(/\/c\/([^/?#]+)/)?.[1] || '';
                const parentId = resolveParentCommentId(anchor);
                const likeCount = resolveLikeCount(containerEl);
                const isReply = Boolean(anchor.closest('ul._a9yo, ul._a9yp') || parentId);

                return {
                    user,
                    content,
                    timestamp,
                    timestampLabel: timestampLabel || '',
                    id,
                    parentId,
                    likeCount,
                    isReply,
                };
            }).filter((comment): comment is NonNullable<typeof comment> => Boolean(comment?.id));
    }, {
        loadMoreCommentsLabel: LOAD_MORE_COMMENTS_LABEL,
        viewRepliesPatterns: VIEW_REPLIES_EVAL_PATTERNS.map((p) => p.source),
    });

    return extracted.map((comment) => ({
        user: comment.user,
        content: comment.content,
        timestamp: comment.timestamp,
        timestampLabel: comment.timestampLabel || undefined,
        id: comment.id,
        parentId: comment.parentId || undefined,
        likeCount: comment.likeCount || undefined,
    }));
};

export const extractInstagramComments = async (
    page: Page,
    options: InstagramCommentExtractionOptions = {},
): Promise<InstagramCommentExtractionResult> => {
    const clickDelayMs = options.clickDelayMs ?? 500;
    const settleMs = options.settleMs ?? 700;

    log.info('Loading top-level Instagram comments...');
    await loadAllTopLevelComments(page, clickDelayMs, options.maxPasses ?? 24);

    const remainingBefore = await countRemainingViewReplies(page);
    log.info(`Visible "View replies" controls before expansion: ${String(remainingBefore)}`);

    await expandAllReplyThreads(page, clickDelayMs);
    await page.waitForTimeout(settleMs);

    const remainingAfter = await countRemainingViewReplies(page);
    const comments = deduplicateComments(await extractVisibleComments(page));
    const replyCount = comments.filter((comment) => comment.parentId).length;

    log.info(
        `Extracted ${comments.length} Instagram comments (${replyCount} nested replies, `
        + `${String(remainingAfter)} "View replies" still visible).`,
    );

    const loadMoreVisible = await page.getByRole('button', { name: new RegExp(`^${LOAD_MORE_COMMENTS_LABEL}$`, 'i') })
        .first()
        .isVisible()
        .catch(() => false);
    const extracted = remainingAfter === 0 && !loadMoreVisible && comments.length > 0;
    return { comments, extracted };
};
