import type {
    CommentReactionBreakdown,
    CommentReactionDetails,
    CommentReactionUser,
    EngagementScrapeResult,
    ReactionUser,
    ScrapedComment,
    TargetPlugin,
} from '../common/types.js';

export type {
    CommentReactionBreakdown,
    CommentReactionDetails,
    CommentReactionUser,
    ReactionUser,
    ScrapedComment,
};

export type FacebookScrapeResult = EngagementScrapeResult;

export type FacebookPlugin = TargetPlugin;

export const buildCommentKey = (comment: Pick<ScrapedComment, 'id' | 'user' | 'timestamp' | 'content'>): string => {
    return comment.id !== 'Unknown ID'
        ? comment.id
        : `${comment.user}|${comment.timestamp}|${comment.content}`;
};
