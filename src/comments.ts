import { log } from 'apify';
import type { Locator, Page } from 'playwright';

import { deduplicateComments, extractCommentRecords } from './comment-extraction.js';
import { attachCommentReactions } from './comment-reactions.js';
import type { ScrapedComment } from './comment-models.js';

const COMMENT_SELECTOR = 'div[role="article"][aria-label^="Comment by"]';
const COMMENTS_HEADING_SELECTOR = 'h2, h3';

const closeVisibleDialogIfAny = async (page: Page): Promise<boolean> => {
    const dialogCount = await page.locator('div[role="dialog"]:visible').count().catch(() => 0);
    if (!dialogCount) return false;

    await page.keyboard.press('Escape').catch(() => undefined);
    await page.waitForTimeout(700);
    return true;
};

const ensureCommentsAreVisible = async (page: Page, comments: Locator): Promise<void> => {
    if (await comments.count()) return;
    await closeVisibleDialogIfAny(page);

    const heading = page.locator(COMMENTS_HEADING_SELECTOR).filter({ hasText: 'Comments' }).first();
    if (await heading.isVisible().catch(() => false)) {
        await heading.scrollIntoViewIfNeeded().catch(() => undefined);
        await page.waitForTimeout(1000);
        if (await comments.count()) return;
    }

    for (let attempt = 0; attempt < 8; attempt++) {
        await page.mouse.wheel(0, 1400);
        await page.waitForTimeout(700);
        if (await comments.count()) return;
    }
};

const clickCommentExpansionButtons = async (page: Page): Promise<boolean> => {
    const buttons = page.locator('[role="button"]');
    let clicked = false;

    for (let index = 0; index < await buttons.count(); index++) {
        const button = buttons.nth(index);
        if (!(await button.isVisible().catch(() => false))) continue;

        const text = (await button.textContent().catch(() => '') || '').trim();
        const normalized = text.toLowerCase();
        const isExpansionButton = text === 'View more comments'
            || text === 'View more replies'
            || (text.startsWith('View') && (normalized.includes('reply') || normalized.includes('repl')));
        if (!isExpansionButton) continue;

        await button.scrollIntoViewIfNeeded().catch(() => undefined);
        await button.click({ force: true }).catch(() => undefined);
        await page.waitForTimeout(500);
        clicked = true;
    }

    return clicked;
};
export const extractAllComments = async (page: Page): Promise<ScrapedComment[]> => {
    log.info('📜 Scrolling the comments without leaving the current post...');
    const comments = page.locator(COMMENT_SELECTOR);
    await ensureCommentsAreVisible(page, comments);
    await comments.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => undefined);

    let previousCount = 0;
    let stablePasses = 0;

    for (let pass = 0; pass < 12 && stablePasses < 3; pass++) {
        log.info(`⏬ Scroll Pass ${pass + 1}/12...`);
        const expandedBefore = await clickCommentExpansionButtons(page);
        const countBefore = await comments.count();

        if (countBefore > 0) {
            await comments.nth(countBefore - 1).scrollIntoViewIfNeeded().catch(() => undefined);
        }

        await page.waitForTimeout(1500);
        const expandedAfter = await clickCommentExpansionButtons(page);
        await page.waitForTimeout(1500);

        const countAfter = await comments.count();
        log.info(`📊 Real-time check: ${countAfter} comments currently loaded on screen.`);

        if (countAfter === previousCount && !expandedBefore && !expandedAfter) {
            stablePasses += 1;
        } else {
            stablePasses = 0;
            previousCount = countAfter;
        }
    }

    log.info('🧠 Running final JSON extraction...');
    const extracted = await extractCommentRecords(comments);
    const uniqueComments = deduplicateComments(extracted.filter((comment) => (
        comment.user !== 'Unknown User'
        || comment.content !== ''
        || comment.id !== 'Unknown ID'
        || comment.timestamp !== ''
    )));
    const hydratedComments = await attachCommentReactions(page, comments, uniqueComments);

    log.info(`🎉 Successfully extracted ${hydratedComments.length} comments!`);
    return hydratedComments;
};
