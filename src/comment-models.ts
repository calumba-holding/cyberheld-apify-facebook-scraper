export type CommentReactionUser = {
    name: string;
    profile_url: string;
    reaction: string;
};

export type CommentReactionBreakdown = {
    reaction: string;
    count: number;
};

export type CommentReactionDetails = {
    count: number;
    label: string;
    breakdown: CommentReactionBreakdown[];
    users: CommentReactionUser[];
};

export type ScrapedComment = {
    user: string;
    content: string;
    timestamp: string;
    id: string;
    reactions?: CommentReactionDetails;
};

export const buildCommentKey = (comment: Pick<ScrapedComment, 'id' | 'user' | 'timestamp' | 'content'>): string => {
    return comment.id !== 'Unknown ID'
        ? comment.id
        : `${comment.user}|${comment.timestamp}|${comment.content}`;
};
