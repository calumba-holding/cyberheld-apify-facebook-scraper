import { log } from '../../../common/logger.js';
import { loadScript, markScriptBroken, saveScript } from '../../../common/script-store.js';
import { runScript } from '../../../common/script-runner.js';
import type { BrowserSessionMode } from '../../../common/types.js';
import { enrichCommentTimestamps } from '../../comment-timestamps.js';
import { extractReactionsForComment } from '../../comment-reactions.js';
import { findTargetCommentById } from '../../shared/comment-target.js';
import { getCommentLocators } from '../../shared/comments-ui.js';
import { resolvePostScope } from '../../shared/post-scope.js';
import { extractCommentIdFromFacebookUrl } from '../../shared/url.js';
import {
    COMMENT_REACTIONS_SCHEMA,
    generateExtractionScript,
    repairExtractionScript,
    takePageSnapshot,
    type RawCommentReactionsResult,
} from '../../self-healing.js';
import type { FacebookScrapeResult } from '../../types.js';
import { tryExtractPublicCommentReactionsFromApi } from './public-comment-api.js';
import type { GraphqlRequestTemplate } from '../post-engagement/public-post-api-graphql.js';
import type { Page } from 'playwright';

export const COMMENT_REACTIONS_SCRAPER = 'comment-reactions';

const tryGenerateAndSaveScript = async (page: Page): Promise<void> => {
    if (!process.env.SCRAPE_LLM_API_KEY) return;
    try {
        const snapshot = await takePageSnapshot(page);
        const script = await generateExtractionScript(snapshot, COMMENT_REACTIONS_SCHEMA);
        await saveScript('facebook', COMMENT_REACTIONS_SCRAPER, script);
        log.info('Saved new comment-reactions script for future runs.');
    } catch (genError) {
        const msg = genError instanceof Error ? genError.message : String(genError);
        log.warning(`Script generation skipped: ${msg}`);
    }
};

const trySavedScript = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
): Promise<FacebookScrapeResult | null> => {
    const saved = await loadScript('facebook', COMMENT_REACTIONS_SCRAPER);
    if (!saved) return null;

    log.info('Running saved comment-reactions script (fast path).');
    const scriptResult = await runScript(page, saved.script);

    if (scriptResult.ok && !scriptResult.empty && scriptResult.value !== null) {
        const raw = scriptResult.value as RawCommentReactionsResult;
        log.info(`Saved script succeeded: ${raw.reactions.length} reactions.`);
        await saveScript('facebook', COMMENT_REACTIONS_SCRAPER, saved.script);
        return {
            kind: 'engagement',
            inputUrl,
            finalUrl,
            scrapedAt: new Date().toISOString(),
            reactionCount: 0,
            commentCount: 0,
            commentsComplete: false,
            postReactionsComplete: false,
            commentVisibilityComplete: false,
            reactions: raw.reactions,
            comments: [],
            status: raw.reactions.length > 0 ? 'SUCCEEDED' : 'PARTIAL',
        };
    }

    log.warning('Saved comment-reactions script returned empty results — triggering self-repair.');
    await markScriptBroken('facebook', COMMENT_REACTIONS_SCRAPER);

    try {
        const snapshot = await takePageSnapshot(page);
        const repairedScript = await repairExtractionScript(snapshot, saved.script, COMMENT_REACTIONS_SCHEMA);
        await saveScript('facebook', COMMENT_REACTIONS_SCRAPER, repairedScript);
        const repairedResult = await runScript(page, repairedScript);
        if (repairedResult.ok && !repairedResult.empty && repairedResult.value !== null) {
            const raw = repairedResult.value as RawCommentReactionsResult;
            log.info(`Repaired script succeeded: ${raw.reactions.length} reactions.`);
            return {
                kind: 'engagement',
                inputUrl,
                finalUrl,
                scrapedAt: new Date().toISOString(),
                reactionCount: 0,
                commentCount: 0,
                commentsComplete: false,
                postReactionsComplete: false,
                commentVisibilityComplete: false,
                reactions: raw.reactions,
                comments: [],
                status: raw.reactions.length > 0 ? 'SUCCEEDED' : 'PARTIAL',
            };
        }
    } catch (repairError) {
        const msg = repairError instanceof Error ? repairError.message : String(repairError);
        log.warning(`Script repair failed: ${msg}. Falling through to standard extraction.`);
    }

    return null;
};

export const scrapeCommentReactions = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
    waitAfterNavigationMs: number,
    options: {
        browserSessionMode: BrowserSessionMode;
        publicGraphqlTemplate?: GraphqlRequestTemplate;
        regenerateScript?: boolean;
    },
): Promise<FacebookScrapeResult> => {
    const targetCommentId = extractCommentIdFromFacebookUrl(finalUrl) ?? extractCommentIdFromFacebookUrl(inputUrl);
    if (!targetCommentId) {
        throw new Error('comment-reactions requires a Facebook target URL with ?comment_id=...');
    }

    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(waitAfterNavigationMs);

    if (options.browserSessionMode === 'public-session') {
        log.info(`Trying public Facebook API extraction for target comment ${targetCommentId}.`);
        const publicResult = await tryExtractPublicCommentReactionsFromApi(page, targetCommentId, options.publicGraphqlTemplate);
        if (publicResult) {
            log.info(`Using public Facebook API result for target comment ${targetCommentId} with ${String(publicResult.comment.reactions?.users.length ?? 0)} reaction users.`);
            return {
                kind: 'engagement',
                inputUrl,
                finalUrl,
                scrapedAt: new Date().toISOString(),
                reactionCount: 0,
                commentCount: 1,
                commentsComplete: true,
                postReactionsComplete: false,
                commentVisibilityComplete: false,
                reactions: [],
                comments: [publicResult.comment],
                status: publicResult.complete ? 'SUCCEEDED' : 'PARTIAL',
            };
        }
    }

    if (!options.regenerateScript) {
        const savedResult = await trySavedScript(page, inputUrl, finalUrl);
        if (savedResult) return savedResult;
    }

    const scope = await resolvePostScope(page, finalUrl);
    const match = await findTargetCommentById(page, scope, targetCommentId);
    if (!match) {
        throw new Error(`Target comment not found for comment_id=${targetCommentId}`);
    }

    await enrichCommentTimestamps(page, getCommentLocators(scope), [match.record]);
    log.info(`Opening reactions only for target comment ${targetCommentId}.`);
    const reactions = await extractReactionsForComment(page, match.locator, match.record);
    if (reactions) match.record.reactions = reactions;

    await tryGenerateAndSaveScript(page);

    return {
        kind: 'engagement',
        inputUrl,
        finalUrl,
        scrapedAt: new Date().toISOString(),
        reactionCount: 0,
        commentCount: 1,
        commentsComplete: true,
        postReactionsComplete: false,
        commentVisibilityComplete: false,
        reactions: [],
        comments: [match.record],
        status: 'SUCCEEDED',
    };
};
