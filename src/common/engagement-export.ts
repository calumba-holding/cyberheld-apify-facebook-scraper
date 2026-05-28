import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import type { ReactionUser, RunScrapeOptions, ScrapedComment, ScreenshotEngagementLabels } from './types.js';

export type EngagementExportPayload = {
    inputUrl: string;
    finalUrl: string;
    scrapedAt: string;
    engagement: {
        labels?: ScreenshotEngagementLabels;
        reactionCount: number;
        commentCount: number;
    };
    post?: {
        content?: string;
    };
    reactions: ReactionUser[];
    comments: ScrapedComment[];
    replies: ScrapedComment[];
    topLevelComments: ScrapedComment[];
    completeness: {
        commentsExtracted: boolean;
        postReactionsExtracted: boolean;
        commentsExpanded?: boolean;
    };
};

export const resolveEngagementJsonPath = (
    options: Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'>,
): string => {
    const fileName = `${options.runId}_engagement-${String(options.itemIndex + 1).padStart(2, '0')}.json`;
    if (options.outputFile) return join(dirname(options.outputFile), fileName);
    return join(options.artifactRootDir, options.runId, fileName);
};

export const writeEngagementJsonFile = async (
    options: Pick<RunScrapeOptions, 'artifactRootDir' | 'itemIndex' | 'outputFile' | 'runId'>,
    payload: EngagementExportPayload,
): Promise<string> => {
    const filePath = resolveEngagementJsonPath(options);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
    return filePath;
};
