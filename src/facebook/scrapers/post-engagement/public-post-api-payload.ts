import type { EngagementScrapeResult } from '../../../common/types.js';
import { sanitizeFacebookPostUrl } from '../../shared/url.js';
import {
    extractCommentDataFromPayload,
    type PublicCommentPaginationState,
    type PublicReplyPaginationState,
    type PublicReplyPaginationTarget,
    extractPublicReplyPaginationTargets,
    extractReplyPaginationState,
    extractTopLevelCommentsPaginationState,
} from './public-post-api-comments.js';
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
} from './public-post-api-json.js';
import { extractReactionDataFromPayload } from './public-post-api-reactions.js';

export interface TimelineStoryCandidate {
    finalUrl: string;
    storyId: string;
}

export interface TimelineQueryResult {
    stories: TimelineStoryCandidate[];
    endCursor?: string;
    hasNextPage: boolean;
}

export type { PublicCommentPaginationState, PublicReplyPaginationState, PublicReplyPaginationTarget };
export { extractTopLevelCommentsPaginationState, extractReplyPaginationState, extractPublicReplyPaginationTargets };


const pickPostContent = (story: JsonObject): string | undefined => {
    const content = normalizeText(asString(getPath(story, ['message', 'text'])))
        || normalizeText(asString(getPath(story, ['comet_sections', 'content', 'story', 'message', 'text'])))
        || normalizeText(asString(getPath(story, ['comet_sections', 'content', 'story', 'comet_sections', 'message', 'story', 'message', 'text'])))
        || normalizeText(asString(getPath(story, ['comet_sections', 'feedback', 'story', 'story_ufi_container', 'story', 'message', 'text'])));
    return content || undefined;
};

const findFirstPayloadRoot = (payload: string): JsonObject | null => {
    for (const chunk of parseJsonLines(payload)) {
        if (asObject(getPath(chunk, ['data', 'node_v2']))) return chunk;
        if (asObject(getPath(chunk, ['data', 'story_card'])) && asObject(getPath(chunk, ['data', 'feedback']))) return chunk;
        if (asObject(getPath(chunk, ['data', 'feedback', 'ufi_renderer', 'feedback']))) return chunk;
    }

    return null;
};

const resolveSinglePostStory = (payload: string): JsonObject | null => {
    const chunk = findFirstPayloadRoot(payload);
    if (!chunk) return null;
    return asObject(getPath(chunk, ['data', 'node_v2']))
        ?? asObject(getPath(chunk, ['data', 'story_card']))
        ?? asObject(getPath(chunk, ['data', 'feedback', 'ufi_renderer', 'feedback', 'associated_video']));
};

const resolveFeedbackTarget = (payload: string): JsonObject | null => {
    const chunk = findFirstPayloadRoot(payload);
    if (!chunk) return null;

    return asObject(getPath(chunk, ['data', 'node_v2', 'comet_sections', 'feedback', 'story', 'story_ufi_container', 'story', 'feedback_context', 'feedback_target_with_context']))
        ?? asObject(getPath(chunk, ['data', 'feedback', 'ufi_renderer', 'feedback']));
};

export const extractFocusedStoryViewRequestInputs = (payload: string): { feedbackId: string; storyId: string } | null => {
    const story = resolveSinglePostStory(payload);
    if (!story) return null;

    const feedbackId = normalizeText(asString(getPath(story, ['feedback', 'id'])));
    const storyId = normalizeText(asString(getPath(story, ['id'])));
    return feedbackId && storyId ? { feedbackId, storyId } : null;
};

export const extractPublicReactionRequestInput = (payload: string): { feedbackTargetId: string } | null => {
    const feedbackTarget = resolveFeedbackTarget(payload);
    const feedbackTargetId = normalizeText(asString(feedbackTarget?.id));
    return feedbackTargetId ? { feedbackTargetId } : null;
};

const buildTimelineStoryCandidate = (node: JsonObject | null): TimelineStoryCandidate | null => {
    const finalUrl = sanitizeFacebookPostUrl(asString(node?.permalink_url) || '');
    const storyId = normalizeText(asString(node?.id));
    if (!finalUrl || !storyId) return null;
    return { finalUrl, storyId };
};

export const parseTimelinePayload = (payload: string): TimelineQueryResult => {
    const stories: TimelineStoryCandidate[] = [];
    let endCursor: string | undefined;
    let hasNextPage = false;

    for (const chunk of parseJsonLines(payload)) {
        const rootEdges = asArray(getPath(chunk, ['data', 'node', 'timeline_list_feed_units', 'edges']));
        for (const edge of rootEdges) {
            const story = buildTimelineStoryCandidate(asObject(asObject(edge)?.node));
            if (story) stories.push(story);
        }

        const streamedEdgePath = asArray(chunk.path).map((segment) => asString(segment) ?? '');
        if (streamedEdgePath[0] === 'node' && streamedEdgePath[1] === 'timeline_list_feed_units' && streamedEdgePath[2] === 'edges') {
            const story = buildTimelineStoryCandidate(asObject(getPath(chunk, ['data', 'node'])));
            if (story) stories.push(story);
        }

        const pageInfo = asObject(getPath(chunk, ['data', 'page_info']))
            ?? asObject(getPath(chunk, ['data', 'node', 'timeline_list_feed_units', 'page_info']))
            ?? (streamedEdgePath[0] === 'node' && streamedEdgePath[1] === 'timeline_list_feed_units'
                ? asObject(getPath(chunk, ['data', 'page_info']))
                : null);
        if (pageInfo) {
            endCursor = asString(pageInfo.end_cursor) ?? endCursor;
            hasNextPage = asBoolean(pageInfo.has_next_page) ?? hasNextPage;
        }
    }

    return { stories, endCursor, hasNextPage };
};

export const tryExtractPublicPostEngagementFromApiPayload = (
    payload: string,
    inputUrl: string,
    fallbackFinalUrl: string,
): EngagementScrapeResult | null => {
    const story = resolveSinglePostStory(payload);
    const feedbackTarget = resolveFeedbackTarget(payload);
    if (!story || !feedbackTarget) return null;

    const summaryFeedback = asObject(getPath(feedbackTarget, ['comet_ufi_summary_and_actions_renderer', 'feedback']));
    const commentData = extractCommentDataFromPayload(payload);
    const reactionData = extractReactionDataFromPayload(payload);
    const reactionCount = asNumber(getPath(summaryFeedback, ['reaction_count', 'count'])) ?? 0;

    return {
        kind: 'engagement',
        inputUrl,
        finalUrl: sanitizeFacebookPostUrl(
            asString(story.permalink_url)
            || asString(story.url)
            || asString(getPath(story, ['comet_sections', 'feedback', 'story', 'story_ufi_container', 'story', 'url']))
            || fallbackFinalUrl,
        ),
        scrapedAt: new Date().toISOString(),
        status: 'PARTIAL',
        reactionCount,
        commentCount: commentData.comments.length,
        commentsComplete: !commentData.hasMoreComments,
        postReactionsComplete: reactionCount === 0 || reactionData.reactions.length >= reactionCount,
        commentVisibilityComplete: false,
        postContent: pickPostContent(story),
        reactions: reactionData.reactions,
        comments: commentData.comments,
    };
};
