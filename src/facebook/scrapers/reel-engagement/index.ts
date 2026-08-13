import { rewriteFacebookReelUrlToWatchUrl } from '../../shared/url.js';

export const REEL_ENGAGEMENT_SCRAPER = 'reel-engagement';

/**
 * Reel/video adapter. Facebook's authenticated reel viewer does not expose the
 * same comment/reaction DOM as a post. Use the equivalent watch surface, then
 * reuse the maintained engagement extraction contract.
 */
export const resolveReelEngagementUrl = (targetUrl: string): string => rewriteFacebookReelUrlToWatchUrl(targetUrl);