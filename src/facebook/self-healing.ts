import type { Page } from 'playwright';

import { generateText } from '../common/llm-client.js';
import type {
    EngagementScrapeResult,
    LocalFileArtifact,
    ReactionUser,
    ScrapedComment,
    SelfHealingArtifact,
} from '../common/types.js';

export interface RawEngagementItem {
    id: string | null;
    user: string;
    content: string;
    timestamp: string | null;
}

export interface RawPostEngagementResult {
    postContent: string | null;
    comments: RawEngagementItem[];
    reactions: Array<{ name: string; profile_url: string; reaction: string }>;
}

export interface RawCommentReactionsResult {
    reactions: Array<{ name: string; profile_url: string; reaction: string }>;
}

export const POST_ENGAGEMENT_SCHEMA = `{
  postContent: string | null;
  comments: Array<{
    id: string | null;
    user: string;
    content: string;
    timestamp: string | null;
  }>;
  reactions: Array<{
    name: string;
    profile_url: string;
    reaction: string;
  }>;
}`;

export const COMMENT_REACTIONS_SCHEMA = `{
  reactions: Array<{
    name: string;
    profile_url: string;
    reaction: string;
  }>;
}`;

const SCRIPT_INSTRUCTIONS = `Write ONLY the JavaScript function body (no function declaration, no arrow function wrapper).
The code runs inside a live browser page via: (function(){ <your code> })()
Rules:
- Use stable selectors: aria-label, data-testid, role — never obfuscated CSS class names
- Wrap all code in try/catch — return null fields on any error, never throw
- Return a plain JSON-serializable object matching the schema exactly
- Use document, window, and standard DOM APIs only
- If data is not found, use null for string fields and [] for array fields`;

const cleanScript = (raw: string): string => {
    const text = raw
        .replace(/^```(?:javascript|js|typescript|ts)?\n?/i, '')
        .replace(/\n?```\s*$/, '')
        .trim();

    const fnBodyMatch = /^(?:async\s+)?function\s*\w*\s*\([^)]*\)\s*\{([\s\S]*)\}\s*$/.exec(text);
    if (fnBodyMatch?.[1]) return fnBodyMatch[1].trim();

    const arrowBodyMatch = /^\([^)]*\)\s*=>\s*\{([\s\S]*)\}\s*$/.exec(text);
    if (arrowBodyMatch?.[1]) return arrowBodyMatch[1].trim();

    return text;
};

export const takePageSnapshot = async (page: Page): Promise<string> => {
    const html = await page.evaluate<string>(`(function(){
        var container = document.querySelector('[role="main"]') || document.querySelector('main') || document.body;
        var clone = container.cloneNode(true);
        clone.querySelectorAll('script,style,svg,img,video,noscript').forEach(function(el){ el.remove(); });
        return clone.innerHTML;
    })()`);
    return html.slice(0, 40_000);
};

export const generateExtractionScript = async (snapshot: string, schema: string): Promise<string> => {
    const prompt = `You are writing a JavaScript extraction script for a Playwright browser automation tool.

The script runs inside a live Facebook page and must extract structured engagement data.

Target output schema (TypeScript interface):
${schema}

${SCRIPT_INSTRUCTIONS}

Current page HTML (may be truncated):
${snapshot}

Write the function body now:`;

    return cleanScript(await generateText(prompt));
};

export const repairExtractionScript = async (
    snapshot: string,
    brokenScript: string,
    schema: string,
): Promise<string> => {
    const prompt = `You are repairing a broken JavaScript extraction script for a Playwright browser automation tool.

The script runs inside a Facebook page but is returning empty results because Facebook changed its page structure.

Target output schema (TypeScript interface):
${schema}

${SCRIPT_INSTRUCTIONS}

Current page HTML (the new structure — may be truncated):
${snapshot}

Broken script (returns empty results with the old structure):
${brokenScript}

Write the repaired function body now:`;

    return cleanScript(await generateText(prompt));
};

export const buildPostEngagementResult = (
    raw: RawPostEngagementResult,
    inputUrl: string,
    finalUrl: string,
    sourceVideo?: LocalFileArtifact,
    selfHealing?: SelfHealingArtifact[],
): EngagementScrapeResult => {
    const comments: ScrapedComment[] = raw.comments.map((c) => ({
        id: c.id ?? 'Unknown ID',
        user: c.user || 'Unknown User',
        content: c.content,
        timestamp: c.timestamp ?? '',
    }));
    const reactions: ReactionUser[] = raw.reactions;
    return {
        kind: 'engagement',
        inputUrl,
        finalUrl,
        scrapedAt: new Date().toISOString(),
        reactionCount: reactions.length,
        commentCount: comments.length,
        commentsComplete: false,
        postReactionsComplete: reactions.length > 0,
        commentVisibilityComplete: false,
        postContent: raw.postContent ?? undefined,
        reactions,
        comments,
        sourceVideo,
        selfHealing: selfHealing && selfHealing.length > 0 ? selfHealing : undefined,
        status: 'PARTIAL',
    };
};
