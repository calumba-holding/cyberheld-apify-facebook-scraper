import type { EngagementScrapeResult } from '../../../common/types.js';
import type { Page } from 'playwright';
import {
    combineCaptures,
    runGraphqlRequest,
    type GraphqlCapture,
    type GraphqlRequestTemplate,
} from './public-post-api-graphql.js';
import {
    asArray,
    asObject,
    asString,
    getPath,
    type JsonValue,
} from './public-post-api-json.js';
import {
    fetchPublicReplyPaginationPayloads,
    fetchPublicTopLevelCommentsPaginationPayloads,
} from './public-comment-pagination.js';
import {
    extractPublicReplyPaginationTargets,
    extractTopLevelCommentsPaginationState,
    tryExtractPublicPostEngagementFromApiPayload,
} from './public-post-api-payload.js';

interface PublicVideoGraphqlContext {
    storyId: string;
    feedbackId: string;
}

interface CommentIntentSelection {
    preferredToken?: string;
    selectedToken?: string;
}

interface CommentPaginationConfig {
    feedLocation: 'DEDICATED_COMMENTING_SURFACE' | 'TAHOE';
    docId: string;
    commentsIntentToken?: string | null;
    extraVariables?: Record<string, string | number | boolean | null>;
}

interface ReplyPaginationConfig {
    feedLocation: 'DEDICATED_COMMENTING_SURFACE' | 'TAHOE';
    docId: string;
    friendlyName: string;
    repliesAfterCount: number | null;
    extraVariables?: Record<string, string | number | boolean | null>;
}

const FOCUSED_STORY_QUERY = {
    name: 'CometFocusedStoryViewUFIQuery',
    docId: '25328202953522836',
    feedLocation: 'DEDICATED_COMMENTING_SURFACE',
} as const;
const DEFAULT_COMMENT_PAGINATION: CommentPaginationConfig = {
    feedLocation: 'DEDICATED_COMMENTING_SURFACE',
    docId: '24321275744236128',
};
const DEFAULT_REPLY_PAGINATION: ReplyPaginationConfig = {
    feedLocation: 'DEDICATED_COMMENTING_SURFACE',
    docId: '27441735432082384',
    friendlyName: 'Depth1CommentsListPaginationQuery',
    repliesAfterCount: -1,
};
const TAHOE_PROVIDER_VARIABLES = {
    __relay_internal__pv__CometUFICommentAutoTranslationTyperelayprovider: 'ORIGINAL',
    __relay_internal__pv__CometUFICommentAvatarStickerAnimatedImagerelayprovider: false,
    __relay_internal__pv__CometUFICommentActionLinksRewriteEnabledrelayprovider: false,
    __relay_internal__pv__IsWorkUserrelayprovider: false,
} as const;
const TAHOE_COMMENT_PAGINATION: CommentPaginationConfig = {
    feedLocation: 'TAHOE',
    docId: '25955876334112275',
    commentsIntentToken: null,
    extraVariables: TAHOE_PROVIDER_VARIABLES,
};
const TAHOE_REPLY_PAGINATION: ReplyPaginationConfig = {
    feedLocation: 'TAHOE',
    docId: '26206270059031692',
    friendlyName: 'TahoeDepth1CommentsListPaginationQuery',
    repliesAfterCount: null,
    extraVariables: TAHOE_PROVIDER_VARIABLES,
};
const DEFAULT_GRAPHQL_TEMPLATE: GraphqlRequestTemplate = {
    params: {
        fb_api_caller_class: 'RelayModern',
        server_timestamps: 'true',
    },
    requestCount: 0,
};
const MAX_PUBLIC_VIDEO_COMMENT_PAGINATION_PASSES = 100;
const MAX_PUBLIC_VIDEO_REPLY_PAGINATION_PASSES = 50;

const createGraphqlTemplate = (): GraphqlRequestTemplate => ({ ...DEFAULT_GRAPHQL_TEMPLATE, requestCount: 0 });

const extractCommentIntentSelection = (payload: string): CommentIntentSelection => {
    for (const line of payload.split('\n').map((part) => part.trim()).filter(Boolean)) {
        try {
            const chunk = asObject(JSON.parse(line) as JsonValue);
            const renderer = asObject(getPath(chunk, ['data', 'feedback', 'ufi_renderer', 'feedback', 'comment_list_renderer', 'feedback', 'comment_rendering_instance_for_feed_location']));
            if (!renderer) continue;

            const selectedToken = asString(getPath(renderer, ['selected_intent', 'intent_token']));
            const preferredToken = asArray(renderer.selectable_intents)
                .map((item) => asString(asObject(item)?.intent_token))
                .find((token) => token?.includes('UNFILTERED'));
            return { preferredToken, selectedToken };
        } catch {
            // Ignore malformed chunks.
        }
    }
    return {};
};

const extractPublicVideoGraphqlContext = async (page: Page, finalUrl: string): Promise<PublicVideoGraphqlContext | null> => {
    const payload = await page.evaluate((url) => {
        interface RelaySource { get(id: string): unknown; getRecordIDs?(): string[]; }
        interface RelayStore { getSource(): RelaySource; }
        interface RelayEnvironment { getStore(): RelayStore; }

        const asObject = (value: unknown): Record<string, unknown> | null => {
            return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
        };
        const asString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
        const globalRequire = (window as Window & { require?: (name: string) => unknown }).require;
        const relayEnvironment = globalRequire?.('CometRelayEnvironment') as RelayEnvironment | undefined;
        const source = relayEnvironment?.getStore()?.getSource();
        const videoId = new URL(url).searchParams.get('v') ?? url.match(/\/videos\/([^/?#]+)/i)?.[1] ?? url.match(/\/reel\/([^/?#]+)/i)?.[1] ?? null;
        if (!source || !videoId) return null;

        const candidateIds = [videoId, ...(source.getRecordIDs?.() ?? [])];
        for (const candidateId of candidateIds) {
            const record = asObject(source.get(candidateId));
            if (!record) continue;
            const legacyId = asString(record.legacy_fbid);
            const canonicalUrl = asString(record.url) ?? asString(record.canonical_url) ?? '';
            const recordId = asString(record.id);
            if (candidateId !== videoId && legacyId !== videoId && recordId !== videoId && !canonicalUrl.includes(videoId)) continue;
            const feedbackId = asString(asObject(record.feedback)?.__ref);
            if (recordId && feedbackId) return { storyId: recordId, feedbackId };
        }
        return null;
    }, finalUrl);

    return payload && typeof payload.storyId === 'string' && typeof payload.feedbackId === 'string' ? payload : null;
};

const fetchFocusedStoryPayload = async (
    page: Page,
    template: GraphqlRequestTemplate,
    context: PublicVideoGraphqlContext,
): Promise<GraphqlCapture | undefined> => {
    const payload = await runGraphqlRequest(page, template, FOCUSED_STORY_QUERY.name, FOCUSED_STORY_QUERY.docId, {
        contextData: null,
        feedbackID: context.feedbackId,
        feedbackSource: 110,
        feedLocation: FOCUSED_STORY_QUERY.feedLocation,
        focusCommentID: null,
        scale: 2,
        storyID: context.storyId,
    });
    return payload ? { body: payload, docId: FOCUSED_STORY_QUERY.docId, friendlyName: FOCUSED_STORY_QUERY.name } : undefined;
};

const buildCommentPaginationState = (
    focusedStoryPayload: GraphqlCapture,
    commentsIntentToken?: string | null,
): ReturnType<typeof extractTopLevelCommentsPaginationState> => {
    const paginationState = extractTopLevelCommentsPaginationState(focusedStoryPayload.body);
    if (!paginationState) return null;

    const { preferredToken, selectedToken } = extractCommentIntentSelection(focusedStoryPayload.body);
    const shouldRestartFromFirstPage = Boolean(preferredToken) && preferredToken !== selectedToken;
    return {
        ...paginationState,
        commentsAfterCursor: shouldRestartFromFirstPage ? undefined : paginationState.commentsAfterCursor,
        hasNextPage: paginationState.hasNextPage || shouldRestartFromFirstPage,
        commentsIntentToken: commentsIntentToken ?? preferredToken ?? paginationState.commentsIntentToken,
    };
};

const fetchCommentPaginationPayloads = async (
    page: Page,
    template: GraphqlRequestTemplate,
    context: PublicVideoGraphqlContext,
    focusedStoryPayload: GraphqlCapture,
    config: CommentPaginationConfig,
): Promise<GraphqlCapture[]> => {
    const paginationState = buildCommentPaginationState(focusedStoryPayload, config.commentsIntentToken);
    if (!paginationState) return [];

    return fetchPublicTopLevelCommentsPaginationPayloads({
        page,
        template,
        feedbackId: context.feedbackId,
        paginationState,
        commentsIntentToken: paginationState.commentsIntentToken,
        feedLocation: config.feedLocation,
        maxPasses: MAX_PUBLIC_VIDEO_COMMENT_PAGINATION_PASSES,
        docId: config.docId,
        extraVariables: config.extraVariables,
    });
};

const fetchReplyPaginationPayloads = async (
    page: Page,
    template: GraphqlRequestTemplate,
    capture: GraphqlCapture | undefined,
    config: ReplyPaginationConfig,
): Promise<GraphqlCapture[]> => {
    if (!capture) return [];

    return fetchPublicReplyPaginationPayloads({
        page,
        template,
        targets: extractPublicReplyPaginationTargets(capture.body),
        feedLocation: config.feedLocation,
        maxPassesPerTarget: MAX_PUBLIC_VIDEO_REPLY_PAGINATION_PASSES,
        docId: config.docId,
        friendlyName: config.friendlyName,
        repliesAfterCount: config.repliesAfterCount,
        extraVariables: config.extraVariables,
    });
};

const fetchPublicVideoPayloadBundle = async (
    page: Page,
    template: GraphqlRequestTemplate,
    context: PublicVideoGraphqlContext,
): Promise<GraphqlCapture | undefined> => {
    const focusedStoryPayload = await fetchFocusedStoryPayload(page, template, context);
    if (!focusedStoryPayload) return undefined;

    const defaultCommentPayloads = await fetchCommentPaginationPayloads(page, template, context, focusedStoryPayload, DEFAULT_COMMENT_PAGINATION);
    const tahoeCommentPayloads = await fetchCommentPaginationPayloads(page, template, context, focusedStoryPayload, TAHOE_COMMENT_PAGINATION);
    const combinedCommentPayload = combineCaptures(focusedStoryPayload, ...defaultCommentPayloads, ...tahoeCommentPayloads);
    const defaultReplyPayloads = await fetchReplyPaginationPayloads(page, template, combinedCommentPayload, DEFAULT_REPLY_PAGINATION);
    const combinedPayload = combineCaptures(combinedCommentPayload, ...defaultReplyPayloads);
    const tahoeReplyPayloads = await fetchReplyPaginationPayloads(page, template, combinedPayload, TAHOE_REPLY_PAGINATION);
    return combineCaptures(combinedPayload, ...tahoeReplyPayloads);
};

const fetchCombinedPublicVideoPayload = async (
    page: Page,
    context: PublicVideoGraphqlContext,
): Promise<GraphqlCapture | undefined> => {
    const firstPassPayload = await fetchPublicVideoPayloadBundle(page, createGraphqlTemplate(), context);
    const secondPassPayload = await fetchPublicVideoPayloadBundle(page, createGraphqlTemplate(), context);
    return combineCaptures(firstPassPayload, secondPassPayload);
};

export const tryExtractPublicVideoPostEngagement = async (
    page: Page,
    inputUrl: string,
    finalUrl: string,
): Promise<EngagementScrapeResult | null> => {
    const context = await extractPublicVideoGraphqlContext(page, finalUrl);
    if (!context) return null;

    const combinedPayload = await fetchCombinedPublicVideoPayload(page, context);
    if (!combinedPayload) return null;

    return tryExtractPublicPostEngagementFromApiPayload(combinedPayload.body, inputUrl, finalUrl);
};
