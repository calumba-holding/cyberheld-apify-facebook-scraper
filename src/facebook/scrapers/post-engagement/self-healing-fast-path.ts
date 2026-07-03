import type { Page } from 'playwright';

import { log } from '../../../common/logger.js';
import { runScript } from '../../../common/script-runner.js';
import { loadScript, markScriptBroken, saveScript } from '../../../common/script-store.js';
import type { EngagementScrapeResult, LocalFileArtifact, SelfHealingArtifact } from '../../../common/types.js';
import { captureSelfHealingArtifact, type SelfHealingArtifactOptions } from '../../self-healing-artifacts.js';
import {
    generateExtractionScript,
    POST_ENGAGEMENT_SCHEMA,
    repairExtractionScript,
    takePageSnapshot,
    type RawPostEngagementResult,
} from '../../self-healing.js';
import { buildSavedScriptPostEngagementResult } from './self-healing-result.js';

const TARGET = 'facebook';

export const trySavedPostEngagementScript = async (
    page: Page,
    scraper: string,
    inputUrl: string,
    finalUrl: string,
    sourceVideo?: LocalFileArtifact,
    artifactOptions?: SelfHealingArtifactOptions,
    selfHealing: SelfHealingArtifact[] = [],
    commentsOnly = false,
): Promise<EngagementScrapeResult | null> => {
    const saved = await loadScript(TARGET, scraper);
    if (!saved) return null;

    log.info('Running saved extraction script (fast path).');
    const scriptResult = await runScript(page, saved.script);

    if (scriptResult.ok && !scriptResult.empty && scriptResult.value !== null) {
        const raw = scriptResult.value as RawPostEngagementResult;
        const fastResult = buildSavedScriptPostEngagementResult(raw, inputUrl, finalUrl, sourceVideo, selfHealing, commentsOnly);
        if (fastResult) {
            log.info(
                commentsOnly
                    ? `Saved script succeeded: ${String(raw.comments.length)} comments (comments-only).`
                    : `Saved script succeeded: ${raw.comments.length} comments, ${raw.reactions.length} reactions.`,
            );
            await saveScript(TARGET, scraper, saved.script);
            return fastResult;
        }
        log.warning('Saved script did not extract comments or reactions — triggering self-repair.');
    } else {
        log.warning('Saved script returned empty results — triggering self-repair.');
    }

    await markScriptBroken(TARGET, scraper);

    let snapshot: string | undefined;
    try {
        snapshot = await takePageSnapshot(page);
        const repairedScript = await repairExtractionScript(snapshot, saved.script, POST_ENGAGEMENT_SCHEMA);
        await saveScript(TARGET, scraper, repairedScript);
        if (artifactOptions) {
            selfHealing.push(await captureSelfHealingArtifact(
                page,
                snapshot,
                artifactOptions,
                'repair',
                'saved',
                selfHealing.length + 1,
            ));
        }
        const repairedResult = await runScript(page, repairedScript);
        if (repairedResult.ok && !repairedResult.empty && repairedResult.value !== null) {
            const raw = repairedResult.value as RawPostEngagementResult;
            const repairedFastResult = buildSavedScriptPostEngagementResult(
                raw,
                inputUrl,
                finalUrl,
                sourceVideo,
                selfHealing,
                commentsOnly,
            );
            if (repairedFastResult) {
                log.info(`Repaired script succeeded: ${raw.comments.length} comments, ${raw.reactions.length} reactions.`);
                return repairedFastResult;
            }
            log.warning('Repaired script still did not extract comments or reactions. Falling through to standard extraction.');
        }
    } catch (repairError) {
        if (snapshot && artifactOptions) {
            selfHealing.push(await captureSelfHealingArtifact(
                page,
                snapshot,
                artifactOptions,
                'repair',
                'failed',
                selfHealing.length + 1,
            ));
        }
        const msg = repairError instanceof Error ? repairError.message : String(repairError);
        log.warning(`Script repair failed: ${msg}. Falling through to standard extraction.`);
    }

    return null;
};

export const tryGenerateAndSavePostEngagementScript = async (
    page: Page,
    scraper: string,
    artifactOptions?: SelfHealingArtifactOptions,
    selfHealing: SelfHealingArtifact[] = [],
): Promise<void> => {
    if (!process.env.SCRAPE_LLM_API_KEY) return;
    let snapshot: string | undefined;
    try {
        snapshot = await takePageSnapshot(page);
        const script = await generateExtractionScript(snapshot, POST_ENGAGEMENT_SCHEMA);
        await saveScript(TARGET, scraper, script);
        if (artifactOptions) {
            selfHealing.push(await captureSelfHealingArtifact(
                page,
                snapshot,
                artifactOptions,
                'generate',
                'saved',
                selfHealing.length + 1,
            ));
        }
        log.info('Saved new extraction script for future runs.');
    } catch (genError) {
        if (snapshot && artifactOptions) {
            selfHealing.push(await captureSelfHealingArtifact(
                page,
                snapshot,
                artifactOptions,
                'generate',
                'failed',
                selfHealing.length + 1,
            ));
        }
        const msg = genError instanceof Error ? genError.message : String(genError);
        log.warning(`Script generation skipped: ${msg}`);
    }
};
