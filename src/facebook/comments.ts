import { log } from '../common/logger.js';
import type { Locator, Page } from 'playwright';

import { enrichCommentTimestamps } from './comment-timestamps.js';
import { deduplicateComments, extractCommentRecords } from './comment-extraction.js';
import { attachCommentReactions } from './comment-reactions.js';
import type { ScrapedComment } from './types.js';
import { clickCommentExpansionButtons, ensureCommentsAreVisible, getCommentLocators } from './shared/comments-ui.js';

export const extractAllComments = async (page: Page, scope: Locator = page.locator('body')): Promise<ScrapedComment[]> => {
    log.info('Scrolling the comments without leaving the current post...');
    const comments = getCommentLocators(scope);
    await ensureCommentsAreVisible(page, scope, comments);
    await comments.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);

    let previousCount = 0;
    let stablePasses = 0;

    for (let pass = 0; pass < 12 && stablePasses < 3; pass++) {
        log.info(`Scroll pass ${pass + 1}/12...`);
        const expandedBefore = await clickCommentExpansionButtons(page, scope);
        const countBefore = await comments.count();

        if (countBefore > 0) {
            await comments.nth(countBefore - 1).scrollIntoViewIfNeeded().catch(() => undefined);
        }

        await page.waitForTimeout(1500);
        const expandedAfter = await clickCommentExpansionButtons(page, scope);
        await page.waitForTimeout(1500);

        const countAfter = await comments.count();
        log.info(`${countAfter} comments currently loaded on screen.`);

        if (countAfter === previousCount && !expandedBefore && !expandedAfter) {
            stablePasses += 1;
        } else {
            stablePasses = 0;
            previousCount = countAfter;
        }
    }

    log.info('Running final JSON extraction...');
    const extracted = await extractCommentRecords(comments);
    const uniqueComments = deduplicateComments(extracted.filter((comment) => (
        comment.user !== 'Unknown User'
        || comment.content !== ''
        || comment.id !== 'Unknown ID'
        || comment.timestamp !== ''
    )));
    await enrichCommentTimestamps(page, comments, uniqueComments);
    const hydratedComments = await attachCommentReactions(page, comments, uniqueComments);

    log.info(`Extracted ${hydratedComments.length} comments.`);
    return hydratedComments;
};
