import type { EngagementScrapeResult, LocalFileArtifact, SelfHealingArtifact } from '../../../common/types.js';
import { buildPostEngagementResult, type RawPostEngagementResult } from '../../self-healing.js';

export const hasSavedScriptEngagement = (raw: RawPostEngagementResult, commentsOnly = false): boolean => (
    commentsOnly ? raw.comments.length > 0 : raw.comments.length > 0 || raw.reactions.length > 0
);

export const buildSavedScriptPostEngagementResult = (
    raw: RawPostEngagementResult,
    inputUrl: string,
    finalUrl: string,
    sourceVideo?: LocalFileArtifact,
    selfHealing?: SelfHealingArtifact[],
    commentsOnly = false,
): EngagementScrapeResult | null => {
    if (!hasSavedScriptEngagement(raw, commentsOnly)) return null;
    return buildPostEngagementResult(raw, inputUrl, finalUrl, sourceVideo, selfHealing);
};
