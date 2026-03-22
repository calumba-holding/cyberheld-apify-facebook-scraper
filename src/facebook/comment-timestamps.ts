import type { Locator, Page } from 'playwright';

import { buildCommentKey, type ScrapedComment } from './types.js';
import { extractCommentRecord } from './comment-extraction.js';

const parseTooltipTimestamp = (value: string): string | undefined => {
    const normalized = value.replace(' at ', ' ');
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

export const enrichCommentTimestamps = async (page: Page, comments: Locator, records: ScrapedComment[]): Promise<void> => {
    const byKey = new Map(records.map((record) => [buildCommentKey(record), record]));

    for (let index = 0; index < await comments.count(); index++) {
        const comment = comments.nth(index);
        const extracted = await extractCommentRecord(comment).catch(() => null);
        if (!extracted) continue;

        const target = byKey.get(buildCommentKey(extracted));
        if (!target) continue;

        const timeLink = comment.locator('a[href*="comment_id="]').filter({ hasText: /\S/ }).last();
        if (!(await timeLink.isVisible().catch(() => false))) continue;

        await timeLink.hover().catch(() => undefined);
        await page.waitForTimeout(250);

        const tooltip = page.locator('[role="tooltip"]:visible').last();
        const tooltipText = (await tooltip.textContent().catch(() => ''))?.trim() ?? '';
        const absoluteTimestamp = tooltipText ? parseTooltipTimestamp(tooltipText) : undefined;
        if (absoluteTimestamp) {
            target.timestampLabel = target.timestamp;
            target.timestamp = absoluteTimestamp;
        }
    }
};
