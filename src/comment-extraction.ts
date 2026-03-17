import type { Locator } from 'playwright';

import { buildCommentKey, type ScrapedComment } from './comment-models.js';

const cleanContent = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const deduplicateComments = (comments: ScrapedComment[]): ScrapedComment[] => {
    const uniqueComments = new Map<string, ScrapedComment>();

    for (const comment of comments) {
        const key = buildCommentKey(comment);
        if (!uniqueComments.has(key)) uniqueComments.set(key, comment);
    }

    return Array.from(uniqueComments.values());
};

export const extractCommentRecord = async (comment: Locator): Promise<ScrapedComment | null> => {
    return comment.evaluate((node) => {
        const article = node as HTMLElement;
        const linkWithId = article.querySelector<HTMLAnchorElement>('a[href*="comment_id="]');
        const userElement = article.querySelector('a[href*="comment_id="] span[dir="auto"], a span[dir="auto"]');
        const user = userElement?.textContent?.trim() || 'Unknown User';

        const contentNodes = Array.from(article.querySelectorAll<HTMLElement>('div[dir="auto"][style*="text-align"]'));
        let content = '';

        for (const contentNode of contentNodes) {
            const text = (contentNode.innerText || contentNode.textContent || '').replace(/\s+/g, ' ').trim();
            if (text.length > content.length) content = text;
        }

        let timestamp = '';
        if (linkWithId?.textContent?.trim()) timestamp = linkWithId.textContent.trim();

        if (!timestamp) {
            const ariaLabel = article.getAttribute('aria-label') || '';
            if (ariaLabel.startsWith(`Comment by ${user} `)) {
                timestamp = ariaLabel.slice(`Comment by ${user} `.length).trim();
            }
        }

        let id = 'Unknown ID';
        if (linkWithId) {
            try {
                id = new URL(linkWithId.href).searchParams.get('comment_id') || 'Unknown ID';
            } catch {
                id = 'Unknown ID';
            }
        }

        if (user === 'Unknown User' && !content && id === 'Unknown ID' && !timestamp) return null;
        return { user, content, timestamp, id };
    });
};

export const extractCommentRecords = async (comments: Locator): Promise<ScrapedComment[]> => {
    const count = await comments.count();
    const results: ScrapedComment[] = [];

    for (let index = 0; index < count; index++) {
        const record = await extractCommentRecord(comments.nth(index));
        if (!record) continue;

        const cleaned = {
            ...record,
            user: cleanContent(record.user),
            content: cleanContent(record.content),
            timestamp: cleanContent(record.timestamp),
            id: cleanContent(record.id),
        };

        if (cleaned.user !== 'Unknown User' || cleaned.content || cleaned.id !== 'Unknown ID' || cleaned.timestamp) {
            results.push(cleaned);
        }
    }

    return results;
};
