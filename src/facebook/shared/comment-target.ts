import { log } from '../../common/logger.js';
import { extractCommentRecord } from '../comment-extraction.js';
import { clickCommentExpansionButtons, ensureCommentsAreVisible, getCommentLocators } from './comments-ui.js';
import type { Locator, Page } from 'playwright';
import type { ScrapedComment } from '../types.js';

export interface TargetCommentMatch {
    locator: Locator;
    record: ScrapedComment;
}

const commentContainsTargetId = async (comment: Locator, targetCommentId: string): Promise<boolean> => {
    return comment.evaluate((node, expectedCommentId) => {
        const article = node as HTMLElement;
        const links = Array.from(article.querySelectorAll<HTMLAnchorElement>('a[href*="comment_id="]'));
        return links.some((link) => {
            try {
                return new URL(link.href).searchParams.get('comment_id') === expectedCommentId;
            } catch {
                return false;
            }
        });
    }, targetCommentId).catch(() => false);
};

const findMatchingLoadedComment = async (comments: Locator, targetCommentId: string): Promise<TargetCommentMatch | null> => {
    for (let index = 0; index < await comments.count(); index++) {
        const locator = comments.nth(index);
        const record = await extractCommentRecord(locator).catch(() => null);
        if (record?.id === targetCommentId) return { locator, record };
        if (record && await commentContainsTargetId(locator, targetCommentId)) {
            return { locator, record: { ...record, id: targetCommentId } };
        }
    }

    return null;
};

export const findTargetCommentById = async (
    page: Page,
    scope: Locator,
    targetCommentId: string,
): Promise<TargetCommentMatch | null> => {
    const comments = getCommentLocators(scope);
    await ensureCommentsAreVisible(page, scope, comments);
    await comments.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);

    const firstVisible = await findMatchingLoadedComment(comments, targetCommentId);
    if (firstVisible) {
        log.info(`Found target comment ${targetCommentId} without a full comment crawl.`);
        return firstVisible;
    }

    let previousCount = 0;
    let stablePasses = 0;

    for (let pass = 0; pass < 8 && stablePasses < 3; pass++) {
        log.info(`Searching for target comment ${targetCommentId}, pass ${pass + 1}/8...`);

        const expandedBefore = await clickCommentExpansionButtons(page, scope);
        const countBefore = await comments.count();
        if (countBefore > 0) {
            await comments.nth(countBefore - 1).scrollIntoViewIfNeeded().catch(() => undefined);
        }

        await page.waitForTimeout(1200);
        const match = await findMatchingLoadedComment(comments, targetCommentId);
        if (match) return match;

        const expandedAfter = await clickCommentExpansionButtons(page, scope);
        await page.waitForTimeout(1200);

        const countAfter = await comments.count();
        stablePasses = countAfter === previousCount && !expandedBefore && !expandedAfter
            ? stablePasses + 1
            : 0;
        previousCount = countAfter;
    }

    return null;
};
