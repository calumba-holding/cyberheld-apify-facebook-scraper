import type { TargetPlugin } from '../common/types.js';

export interface ReactionUser {
    name: string;
    profile_url: string;
    reaction: string;
}

export interface CommentReactionUser {
    name: string;
    profile_url: string;
    reaction: string;
}

export interface CommentReactionBreakdown {
    reaction: string;
    count: number;
}

export interface CommentReactionDetails {
    count: number;
    label: string;
    breakdown: CommentReactionBreakdown[];
    users: CommentReactionUser[];
}

export interface ScrapedComment {
    user: string;
    content: string;
    timestamp: string;
    timestampLabel?: string;
    id: string;
    reactions?: CommentReactionDetails;
}

export interface FacebookScrapeResult {
    inputUrl: string;
    finalUrl: string;
    scrapedAt: string;
    reactionCount: number;
    commentCount: number;
    allCommentsFilterApplied: boolean;
    postContent?: string;
    reactions: ReactionUser[];
    comments: ScrapedComment[];
    status?: 'SUCCEEDED' | 'PARTIAL';
}

export type FacebookPlugin = TargetPlugin<FacebookScrapeResult>;

export const buildCommentKey = (comment: Pick<ScrapedComment, 'id' | 'user' | 'timestamp' | 'content'>): string => {
    return comment.id !== 'Unknown ID'
        ? comment.id
        : `${comment.user}|${comment.timestamp}|${comment.content}`;
};
