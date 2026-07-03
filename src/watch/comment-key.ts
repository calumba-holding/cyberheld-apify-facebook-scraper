import type { ScrapedComment } from '../common/types.js';

/** Stable dedup key per comment within a post watch scope. */
export const buildWatchCommentKey = (comment: Pick<ScrapedComment, 'id' | 'user' | 'timestamp' | 'content'>): string => {
    if (comment.id && comment.id !== 'Unknown ID') return comment.id;
    return `${comment.user}|${comment.timestamp}|${comment.content}`;
};

export const findNewComments = (
    comments: ScrapedComment[],
    lastSeenKeys: string[],
): { newComments: ScrapedComment[]; nextSeenKeys: string[] } => {
    const seen = new Set(lastSeenKeys);
    const newComments: ScrapedComment[] = [];
    const nextSeenKeys = [...lastSeenKeys];

    for (const comment of comments) {
        const key = buildWatchCommentKey(comment);
        if (seen.has(key)) continue;
        seen.add(key);
        nextSeenKeys.push(key);
        newComments.push(comment);
    }

    return { newComments, nextSeenKeys };
};
