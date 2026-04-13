import type { ScrapedComment } from '../../../common/types.js';
import { extractCommentIdFromFacebookUrl } from '../../shared/url.js';
import { buildCommentKey } from '../../types.js';
import {
    asArray,
    asBoolean,
    asNumber,
    asObject,
    asString,
    getPath,
    normalizeText,
    parseJsonLines,
    type JsonObject,
    type JsonValue,
} from './public-post-api-json.js';

export interface PublicCommentPaginationState {
    commentsAfterCursor?: string;
    hasNextPage: boolean;
    pageSize?: number;
    totalCount?: number;
    commentsIntentToken?: string;
}

export interface PublicReplyPaginationState {
    repliesAfterCursor?: string;
    hasNextPage: boolean;
    pageSize?: number;
    totalCount?: number;
}

export interface PublicReplyPaginationTarget {
    feedbackId: string;
    expansionToken: string;
    totalReplies: number;
}

export interface PublicCommentExtraction {
    comments: ScrapedComment[];
    totalComments: number;
    hasMoreComments: boolean;
}

interface CommentConnectionSnapshot {
    comments: ScrapedComment[];
    totalCount: number;
    hasNextPage: boolean;
    endCursor?: string;
    pageSize?: number;
    commentsIntentToken?: string;
}

interface ReplyTargetCandidate {
    feedbackId: string;
    expansionToken: string;
    totalReplies: number;
}


const toIsoTimestamp = (unixSeconds: number | undefined): string => {
    if (!unixSeconds || unixSeconds <= 0) return '';
    return new Date(unixSeconds * 1000).toISOString();
};

const pickCommentUser = (node: JsonObject): string => {
    return normalizeText(asString(getPath(node, ['author', 'name'])))
        || normalizeText(asString(getPath(node, ['comet_comment_author_name_and_badges_renderer', 'comment', 'author', 'name'])))
        || normalizeText(asString(getPath(node, ['comet_comment_author_name_and_badges_renderer', 'comment', 'user', 'name'])))
        || 'Unknown User';
};

const pickCommentContent = (node: JsonObject): string => {
    return normalizeText(asString(getPath(node, ['body', 'text'])))
        || normalizeText(asString(getPath(node, ['preferred_body', 'text'])))
        || normalizeText(asString(getPath(node, ['body_renderer', 'text'])));
};

const toScrapedComments = (edges: JsonValue[]): ScrapedComment[] => {
    const seen = new Set<string>();
    const comments: ScrapedComment[] = [];

    for (const edge of edges) {
        const node = asObject(asObject(edge)?.node);
        if (!node) continue;

        const feedbackUrl = asString(getPath(node, ['feedback', 'url']));
        const comment: ScrapedComment = {
            id: normalizeText(asString(node.legacy_fbid))
                || (feedbackUrl ? extractCommentIdFromFacebookUrl(feedbackUrl) ?? '' : '')
                || normalizeText(asString(node.id))
                || 'Unknown ID',
            user: pickCommentUser(node),
            content: pickCommentContent(node),
            timestamp: toIsoTimestamp(asNumber(node.created_time)),
        };

        const key = buildCommentKey(comment);
        if (seen.has(key)) continue;
        seen.add(key);
        comments.push(comment);
    }

    return comments;
};

const mergeScrapedComments = (collections: readonly ScrapedComment[][]): ScrapedComment[] => {
    const seen = new Set<string>();
    const merged: ScrapedComment[] = [];

    for (const comments of collections) {
        for (const comment of comments) {
            const key = buildCommentKey(comment);
            if (seen.has(key)) continue;
            seen.add(key);
            merged.push(comment);
        }
    }

    return merged;
};

const buildCommentConnectionSnapshot = (commentConnection: JsonObject | null, commentsIntentToken?: string): CommentConnectionSnapshot | null => {
    if (!commentConnection) return null;

    const comments = toScrapedComments(asArray(commentConnection.edges));
    const totalCount = asNumber(commentConnection.total_count)
        ?? asNumber(commentConnection.count)
        ?? comments.length;

    return {
        comments,
        totalCount,
        hasNextPage: asBoolean(getPath(commentConnection, ['page_info', 'has_next_page'])) === true,
        endCursor: asString(getPath(commentConnection, ['page_info', 'end_cursor'])),
        pageSize: asNumber(commentConnection.page_size),
        commentsIntentToken,
    };
};

const buildReplyTargetCandidate = (node: JsonObject | null): ReplyTargetCandidate | null => {
    if (!node) return null;

    const feedbackId = normalizeText(asString(getPath(node, ['feedback', 'id'])));
    const expansionToken = normalizeText(asString(getPath(node, ['feedback', 'expansion_info', 'expansion_token'])));
    const totalReplies = asNumber(getPath(node, ['feedback', 'replies_fields', 'total_count']))
        ?? asNumber(getPath(node, ['feedback', 'replies_fields', 'count']))
        ?? 0;

    if (!feedbackId || !expansionToken || totalReplies <= 0) return null;
    return { feedbackId, expansionToken, totalReplies };
};

const extractCommentConnectionSnapshots = (payload: string): CommentConnectionSnapshot[] => {
    const snapshots: CommentConnectionSnapshot[] = [];

    for (const chunk of parseJsonLines(payload)) {
        const focusedFeedbackTarget = asObject(getPath(chunk, ['data', 'feedback', 'ufi_renderer', 'feedback']));
        const singlePostFeedbackTarget = asObject(getPath(chunk, ['data', 'node_v2', 'comet_sections', 'feedback', 'story', 'story_ufi_container', 'story', 'feedback_context', 'feedback_target_with_context']));
        const feedbackTarget = singlePostFeedbackTarget ?? focusedFeedbackTarget;
        const feedbackTargetConnection = asObject(getPath(feedbackTarget, ['comment_list_renderer', 'feedback', 'comment_rendering_instance_for_feed_location', 'comments']));
        const feedbackTargetIntentToken = asString(getPath(feedbackTarget, ['comment_list_renderer', 'feedback', 'comment_rendering_instance_for_feed_location', 'selected_intent', 'intent_token']));
        const feedbackTargetSnapshot = buildCommentConnectionSnapshot(feedbackTargetConnection, feedbackTargetIntentToken);
        if (feedbackTargetSnapshot) snapshots.push(feedbackTargetSnapshot);

        const paginationConnection = asObject(getPath(chunk, ['data', 'node', 'comment_rendering_instance_for_feed_location', 'comments']));
        const paginationIntentToken = asString(getPath(chunk, ['data', 'node', 'comment_rendering_instance_for_feed_location', 'selected_intent', 'intent_token']));
        const paginationSnapshot = buildCommentConnectionSnapshot(paginationConnection, paginationIntentToken);
        if (paginationSnapshot) snapshots.push(paginationSnapshot);

        const repliesConnection = asObject(getPath(chunk, ['data', 'node', 'replies_connection']));
        const repliesSnapshot = buildCommentConnectionSnapshot(repliesConnection);
        if (repliesSnapshot) snapshots.push(repliesSnapshot);
    }

    return snapshots;
};

export const extractCommentDataFromPayload = (payload: string): PublicCommentExtraction => {
    const snapshots = extractCommentConnectionSnapshots(payload);
    const comments = mergeScrapedComments(snapshots.map((snapshot) => snapshot.comments));
    const totalComments = Math.max(
        comments.length,
        ...snapshots.map((snapshot) => snapshot.totalCount),
    );
    const hasMoreComments = snapshots.some((snapshot) => snapshot.hasNextPage)
        || totalComments > comments.length;

    return { comments, totalComments, hasMoreComments };
};

export const extractTopLevelCommentsPaginationState = (payload: string): PublicCommentPaginationState | null => {
    const snapshots = extractCommentConnectionSnapshots(payload);
    const latestSnapshot = snapshots.at(-1);
    if (!latestSnapshot) return null;

    return {
        commentsAfterCursor: latestSnapshot.endCursor,
        hasNextPage: latestSnapshot.hasNextPage,
        pageSize: latestSnapshot.pageSize,
        totalCount: latestSnapshot.totalCount,
        commentsIntentToken: snapshots.map((snapshot) => snapshot.commentsIntentToken).find((value) => normalizeText(value) !== ''),
    };
};

export const extractReplyPaginationState = (payload: string): PublicReplyPaginationState | null => {
    for (const chunk of parseJsonLines(payload).reverse()) {
        const repliesConnection = asObject(getPath(chunk, ['data', 'node', 'replies_connection']));
        const snapshot = buildCommentConnectionSnapshot(repliesConnection);
        if (!snapshot) continue;

        return {
            repliesAfterCursor: snapshot.endCursor,
            hasNextPage: snapshot.hasNextPage,
            pageSize: snapshot.pageSize,
            totalCount: snapshot.totalCount,
        };
    }

    return null;
};

export const extractPublicReplyPaginationTargets = (payload: string): PublicReplyPaginationTarget[] => {
    const seen = new Set<string>();
    const targets: PublicReplyPaginationTarget[] = [];

    for (const chunk of parseJsonLines(payload)) {
        const candidateEdges = [
            ...asArray(getPath(chunk, ['data', 'feedback', 'ufi_renderer', 'feedback', 'comment_list_renderer', 'feedback', 'comment_rendering_instance_for_feed_location', 'comments', 'edges'])),
            ...asArray(getPath(chunk, ['data', 'node_v2', 'comet_sections', 'feedback', 'story', 'story_ufi_container', 'story', 'feedback_context', 'feedback_target_with_context', 'comment_list_renderer', 'feedback', 'comment_rendering_instance_for_feed_location', 'comments', 'edges'])),
            ...asArray(getPath(chunk, ['data', 'node', 'comment_rendering_instance_for_feed_location', 'comments', 'edges'])),
        ];

        for (const edge of candidateEdges) {
            const candidate = buildReplyTargetCandidate(asObject(asObject(edge)?.node));
            if (!candidate) continue;

            const key = `${candidate.feedbackId}:${candidate.expansionToken}`;
            if (seen.has(key)) continue;
            seen.add(key);
            targets.push(candidate);
        }
    }

    return targets;
};
