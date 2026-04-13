import { log } from '../../../common/logger.js';
import { warmFacebookPublicSession } from '../../shared/guest-session.js';
import { extractFacebookPageRootUrl, isEquivalentFacebookTargetUrl, isFacebookVideoUrl } from '../../shared/url.js';
import type { Page } from 'playwright';
import {
    combineCaptures,
    runGraphqlRequest,
    waitForGraphqlBootstrap,
    type GraphqlCapture,
    type GraphqlRequestTemplate,
} from './public-post-api-graphql.js';
import {
    fetchPublicReplyPaginationPayloads,
    fetchPublicTopLevelCommentsPaginationPayloads,
} from './public-comment-pagination.js';
import type { JsonObject } from './public-post-api-json.js';
import {
    extractFocusedStoryViewRequestInputs,
    extractPublicReactionRequestInput,
    extractPublicReplyPaginationTargets,
    extractTopLevelCommentsPaginationState,
    parseTimelinePayload,
    tryExtractPublicPostEngagementFromApiPayload,
    type TimelineStoryCandidate,
} from './public-post-api-payload.js';
import {
    extractReactionIdsFromPayload,
    extractReactionPaginationStatesFromPayload,
    hasGraphqlErrors,
} from './public-post-api-reactions.js';

export interface PublicPostApiNavigationResult {
    finalUrl: string;
    singlePostPayload?: GraphqlCapture;
}

const TIMELINE_QUERY = { name: 'ProfileCometTimelineFeedRefetchQuery' } as const;
const SINGLE_POST_QUERY = {
    name: 'CometSinglePostDialogContentQuery',
    docId: '26286058541045694',
    route: 'comet.fbweb.CometSinglePostDialogRoute',
} as const;
const FOCUSED_STORY_QUERY = {
    name: 'CometFocusedStoryViewUFIQuery',
    docId: '25328202953522836',
    feedLocation: 'DEDICATED_COMMENTING_SURFACE',
} as const;
const COMMENT_PAGINATION_QUERY = {
    docId: '24321275744236128',
    feedLocation: 'DEDICATED_COMMENTING_SURFACE',
} as const;
const REPLY_PAGINATION_QUERY = {
    docId: '27441735432082384',
    feedLocation: 'DEDICATED_COMMENTING_SURFACE',
} as const;
const REACTIONS_DIALOG_QUERY = {
    name: 'CometUFIReactionsDialogQuery',
    docId: '33437545572555426',
} as const;
const REACTIONS_REFETCH_QUERY = {
    name: 'CometUFIReactionsDialogTabContentRefetchQuery',
    docId: '25576256592037408',
} as const;
const PUBLIC_REACTION_SAMPLING_PASSES = 2;
const MAX_PUBLIC_COMMENT_PAGINATION_PASSES = 100;
const MAX_PUBLIC_REPLY_PAGINATION_PASSES = 50;
const MAX_REACTION_REFETCH_PASSES = 8;
const MAX_TIMELINE_PAGINATION_PASSES = 12;

const createCapture = (body: string, docId: string, friendlyName: string): GraphqlCapture => ({
    body,
    docId,
    friendlyName,
});

const extractFocusedStoryRequestInput = (capture: GraphqlCapture | undefined) => {
    return capture ? extractFocusedStoryViewRequestInputs(capture.body) : null;
};

const extractReactionRequestTarget = (capture: GraphqlCapture | undefined) => {
    return capture ? extractPublicReactionRequestInput(capture.body) : null;
};

const findMatchingTimelineStory = async (
    page: Page,
    targetUrl: string,
    template: GraphqlRequestTemplate,
    initialCursor: string | undefined,
    hasNextPage: boolean,
): Promise<TimelineStoryCandidate | null> => {
    if (!hasNextPage || !initialCursor) return null;

    let variables = {
        ...JSON.parse(template.params.variables || '{}') as JsonObject,
        cursor: initialCursor,
    };

    for (let pass = 0; pass < MAX_TIMELINE_PAGINATION_PASSES; pass++) {
        const payload = await runGraphqlRequest(page, template, TIMELINE_QUERY.name, template.params.doc_id || '', variables);
        const timeline = parseTimelinePayload(payload || '');
        const matchedStory = timeline.stories.find((story) => isEquivalentFacebookTargetUrl(targetUrl, story.finalUrl));
        if (matchedStory) return matchedStory;
        if (!timeline.hasNextPage || !timeline.endCursor) return null;
        variables = { ...variables, cursor: timeline.endCursor };
    }

    return null;
};

const fetchSinglePostPayload = async (
    page: Page,
    template: GraphqlRequestTemplate,
    story: TimelineStoryCandidate,
): Promise<GraphqlCapture | undefined> => {
    const payload = await runGraphqlRequest(page, template, SINGLE_POST_QUERY.name, SINGLE_POST_QUERY.docId, {
        feedbackSource: 2,
        feedLocation: 'POST_PERMALINK_DIALOG',
        focusCommentID: null,
        privacySelectorRenderLocation: 'COMET_STREAM',
        renderLocation: 'permalink',
        scale: 2,
        shouldChangeNodeFieldName: true,
        storyID: story.storyId,
        useDefaultActor: false,
        __relay_internal__pv__IsWorkUserrelayprovider: false,
    }, SINGLE_POST_QUERY.route);

    return payload ? createCapture(payload, SINGLE_POST_QUERY.docId, SINGLE_POST_QUERY.name) : undefined;
};

const fetchFocusedStoryPayload = async (
    page: Page,
    template: GraphqlRequestTemplate,
    singlePostPayload: GraphqlCapture | undefined,
): Promise<GraphqlCapture | undefined> => {
    const requestInput = extractFocusedStoryRequestInput(singlePostPayload);
    if (!requestInput) return undefined;

    const payload = await runGraphqlRequest(page, template, FOCUSED_STORY_QUERY.name, FOCUSED_STORY_QUERY.docId, {
        contextData: null,
        feedbackID: requestInput.feedbackId,
        feedbackSource: 110,
        feedLocation: FOCUSED_STORY_QUERY.feedLocation,
        focusCommentID: null,
        scale: 2,
        storyID: requestInput.storyId,
    });

    return payload ? createCapture(payload, FOCUSED_STORY_QUERY.docId, FOCUSED_STORY_QUERY.name) : undefined;
};

const fetchCommentPaginationPayloads = async (
    page: Page,
    template: GraphqlRequestTemplate,
    singlePostPayload: GraphqlCapture | undefined,
    focusedStoryPayload: GraphqlCapture | undefined,
): Promise<GraphqlCapture[]> => {
    const requestInput = extractFocusedStoryRequestInput(singlePostPayload);
    const paginationState = focusedStoryPayload ? extractTopLevelCommentsPaginationState(focusedStoryPayload.body) : null;
    if (!requestInput || !paginationState) return [];

    return fetchPublicTopLevelCommentsPaginationPayloads({
        page,
        template,
        feedbackId: requestInput.feedbackId,
        paginationState,
        feedLocation: COMMENT_PAGINATION_QUERY.feedLocation,
        maxPasses: MAX_PUBLIC_COMMENT_PAGINATION_PASSES,
        docId: COMMENT_PAGINATION_QUERY.docId,
    });
};

const fetchReplyPaginationPayloads = async (
    page: Page,
    template: GraphqlRequestTemplate,
    capture: GraphqlCapture | undefined,
): Promise<GraphqlCapture[]> => {
    if (!capture) return [];

    return fetchPublicReplyPaginationPayloads({
        page,
        template,
        targets: extractPublicReplyPaginationTargets(capture.body),
        feedLocation: REPLY_PAGINATION_QUERY.feedLocation,
        maxPassesPerTarget: MAX_PUBLIC_REPLY_PAGINATION_PASSES,
        docId: REPLY_PAGINATION_QUERY.docId,
    });
};

const fetchReactionDialogPayload = async (
    page: Page,
    template: GraphqlRequestTemplate,
    feedbackTargetId: string,
    reactionId: string | null,
): Promise<GraphqlCapture | undefined> => {
    const payload = await runGraphqlRequest(page, template, REACTIONS_DIALOG_QUERY.name, REACTIONS_DIALOG_QUERY.docId, {
        feedbackTargetID: feedbackTargetId,
        reactionID: reactionId,
        scale: 2,
    });

    return payload ? createCapture(payload, REACTIONS_DIALOG_QUERY.docId, REACTIONS_DIALOG_QUERY.name) : undefined;
};

const fetchReactionPayloads = async (
    page: Page,
    template: GraphqlRequestTemplate,
    singlePostPayload: GraphqlCapture | undefined,
): Promise<GraphqlCapture[]> => {
    const requestTarget = extractReactionRequestTarget(singlePostPayload);
    if (!requestTarget) return [];

    const firstMixedCapture = await fetchReactionDialogPayload(page, template, requestTarget.feedbackTargetId, null);
    if (!firstMixedCapture) return [];

    const captures: GraphqlCapture[] = [];
    const reactionIds = extractReactionIdsFromPayload(firstMixedCapture.body);

    for (let pass = 0; pass < PUBLIC_REACTION_SAMPLING_PASSES; pass++) {
        const mixedCapture = pass === 0
            ? firstMixedCapture
            : await fetchReactionDialogPayload(page, template, requestTarget.feedbackTargetId, null);
        if (mixedCapture) captures.push(mixedCapture);

        for (const reactionId of reactionIds) {
            const reactionCapture = await fetchReactionDialogPayload(page, template, requestTarget.feedbackTargetId, reactionId);
            if (reactionCapture) captures.push(reactionCapture);
        }
    }

    return captures;
};

const fetchReactionRefetchPayloads = async (
    page: Page,
    template: GraphqlRequestTemplate,
    singlePostPayload: GraphqlCapture | undefined,
    reactionPayloads: GraphqlCapture[],
): Promise<GraphqlCapture[]> => {
    const requestTarget = extractReactionRequestTarget(singlePostPayload);
    if (!requestTarget || reactionPayloads.length === 0) return [];

    const payloads: GraphqlCapture[] = [];
    const seenStates = new Set<string>();

    for (const capture of reactionPayloads) {
        for (const state of extractReactionPaginationStatesFromPayload(capture.body)) {
            if (!state.hasNextPage || !state.endCursor || state.pageSize <= 0) continue;

            const stateKey = `${state.feedbackId}|${state.reactionId ?? 'all'}|${state.endCursor}`;
            if (seenStates.has(stateKey)) continue;
            seenStates.add(stateKey);

            let cursor: string | undefined = state.endCursor;
            for (let pass = 0; pass < MAX_REACTION_REFETCH_PASSES && cursor; pass++) {
                const payload = await runGraphqlRequest(page, template, REACTIONS_REFETCH_QUERY.name, REACTIONS_REFETCH_QUERY.docId, {
                    count: Math.max(state.pageSize, 10),
                    cursor,
                    feedbackTargetID: requestTarget.feedbackTargetId,
                    id: state.feedbackId,
                    reactionID: state.reactionId,
                    scale: 2,
                });
                if (!payload || hasGraphqlErrors(payload)) break;

                payloads.push(createCapture(payload, REACTIONS_REFETCH_QUERY.docId, REACTIONS_REFETCH_QUERY.name));
                const nextState = extractReactionPaginationStatesFromPayload(payload)[0];
                if (!nextState?.hasNextPage || !nextState.endCursor || nextState.endCursor === cursor) break;
                cursor = nextState.endCursor;
            }
        }
    }

    return payloads;
};

const fetchPublicPostPayloadBundle = async (
    page: Page,
    template: GraphqlRequestTemplate,
    singlePostPayload: GraphqlCapture | undefined,
): Promise<GraphqlCapture | undefined> => {
    const focusedStoryPayload = await fetchFocusedStoryPayload(page, template, singlePostPayload);
    const commentPayloads = await fetchCommentPaginationPayloads(page, template, singlePostPayload, focusedStoryPayload);
    const combinedCommentPayload = combineCaptures(singlePostPayload, focusedStoryPayload, ...commentPayloads);
    const replyPayloads = await fetchReplyPaginationPayloads(page, template, combinedCommentPayload);
    const reactionPayloads = await fetchReactionPayloads(page, template, singlePostPayload);
    const reactionRefetchPayloads = await fetchReactionRefetchPayloads(page, template, singlePostPayload, reactionPayloads);
    return combineCaptures(combinedCommentPayload, ...replyPayloads, ...reactionPayloads, ...reactionRefetchPayloads);
};

export { tryExtractPublicPostEngagementFromApiPayload };

export const tryOpenFacebookPublicPostViaPageRoot = async (
    page: Page,
    targetUrl: string,
    timeoutMs: number,
): Promise<PublicPostApiNavigationResult | null> => {
    if (isFacebookVideoUrl(targetUrl)) return null;

    const pageRootUrl = extractFacebookPageRootUrl(targetUrl);
    if (!pageRootUrl) return null;

    log.info(`Trying API-first public Facebook post navigation via page root: ${pageRootUrl}`);
    const bootstrapPromise = waitForGraphqlBootstrap(page, TIMELINE_QUERY.name);
    await warmFacebookPublicSession(page, pageRootUrl, timeoutMs);
    const bootstrap = await bootstrapPromise;
    if (!bootstrap) return null;

    const timeline = parseTimelinePayload(bootstrap.body);
    const matchedStory = timeline.stories.find((story) => isEquivalentFacebookTargetUrl(targetUrl, story.finalUrl))
        ?? await findMatchingTimelineStory(page, targetUrl, bootstrap.template, timeline.endCursor, timeline.hasNextPage);
    if (!matchedStory) return null;

    const singlePostPayload = await fetchSinglePostPayload(page, bootstrap.template, matchedStory);
    const firstPassPayload = await fetchPublicPostPayloadBundle(page, bootstrap.template, singlePostPayload);
    const secondPassPayload = await fetchPublicPostPayloadBundle(page, bootstrap.template, singlePostPayload);

    return {
        finalUrl: matchedStory.finalUrl,
        singlePostPayload: combineCaptures(firstPassPayload, secondPassPayload),
    };
};
