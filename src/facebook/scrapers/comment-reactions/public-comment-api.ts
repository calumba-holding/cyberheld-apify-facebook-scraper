import type { Page } from 'playwright';
import type { ScrapedComment } from '../../../common/types.js';
import { extractCommentReactionDetailsFromPayload } from './public-comment-api-payload.js';
import { extractPublicCommentTargetFromRelayStore } from './public-comment-api-target.js';
import type { GraphqlRequestTemplate } from '../post-engagement/public-post-api-graphql.js';
import { runGraphqlRequest } from '../post-engagement/public-post-api-graphql.js';
import {
    extractReactionIdsFromPayload,
    extractReactionPaginationStatesFromPayload,
    hasGraphqlErrors,
} from '../post-engagement/public-post-api-reactions.js';

interface PublicCommentReactionApiResult {
    comment: ScrapedComment;
    complete: boolean;
}

const UFI_REACTIONS_DIALOG_QUERY_DOC_ID = '33437545572555426';
const UFI_REACTIONS_DIALOG_TAB_CONTENT_REFETCH_QUERY_DOC_ID = '25576256592037408';
const PUBLIC_COMMENT_REACTION_SAMPLING_PASSES = 2;
const MIN_REACTION_PAGE_SIZE = 10;
const DEFAULT_GRAPHQL_TEMPLATE_PARAMS = { fb_api_caller_class: 'RelayModern', server_timestamps: 'true' };

const buildFallbackGraphqlTemplate = (): GraphqlRequestTemplate => ({
    params: { ...DEFAULT_GRAPHQL_TEMPLATE_PARAMS },
    requestCount: 0,
});

const fetchReactionDialogPayload = async (
    page: Page,
    template: GraphqlRequestTemplate,
    feedbackId: string,
    reactionId: string | null,
): Promise<string | null> => {
    return runGraphqlRequest(page, template, 'CometUFIReactionsDialogQuery', UFI_REACTIONS_DIALOG_QUERY_DOC_ID, {
        feedbackTargetID: feedbackId,
        reactionID: reactionId,
        scale: 2,
    });
};

const fetchSampleReactionPayloads = async (
    page: Page,
    template: GraphqlRequestTemplate,
    feedbackId: string,
): Promise<string[] | null> => {
    const firstMixedPayload = await fetchReactionDialogPayload(page, template, feedbackId, null);
    if (!firstMixedPayload) return null;

    const payloads = [firstMixedPayload];
    for (let pass = 0; pass < PUBLIC_COMMENT_REACTION_SAMPLING_PASSES; pass++) {
        const mixedPayload = pass === 0 ? firstMixedPayload : await fetchReactionDialogPayload(page, template, feedbackId, null);
        if (!mixedPayload) continue;
        if (pass > 0) payloads.push(mixedPayload);

        for (const reactionId of extractReactionIdsFromPayload(mixedPayload)) {
            const payload = await fetchReactionDialogPayload(page, template, feedbackId, reactionId);
            if (payload) payloads.push(payload);
        }
    }
    return payloads;
};

const fetchPaginatedReactionPayloads = async (
    page: Page,
    template: GraphqlRequestTemplate,
    feedbackId: string,
    sourcePayloads: string[],
): Promise<{ payloads: string[]; complete: boolean }> => {
    const paginationPayloads: string[] = [];
    let complete = true;

    for (const payload of sourcePayloads) {
        for (const state of extractReactionPaginationStatesFromPayload(payload)) {
            if (!state.hasNextPage || !state.endCursor) continue;
            const refetchPayload = await runGraphqlRequest(
                page,
                template,
                'CometUFIReactionsDialogTabContentRefetchQuery',
                UFI_REACTIONS_DIALOG_TAB_CONTENT_REFETCH_QUERY_DOC_ID,
                {
                    count: Math.max(state.pageSize, MIN_REACTION_PAGE_SIZE),
                    cursor: state.endCursor,
                    feedbackTargetID: feedbackId,
                    id: state.feedbackId,
                    reactionID: state.reactionId,
                    scale: 2,
                },
            );
            if (!refetchPayload || hasGraphqlErrors(refetchPayload)) {
                complete = false;
                continue;
            }
            paginationPayloads.push(refetchPayload);
        }
    }

    return { payloads: paginationPayloads, complete };
};

export const tryExtractPublicCommentReactionsFromApi = async (
    page: Page,
    targetCommentId: string,
    template: GraphqlRequestTemplate | undefined,
): Promise<PublicCommentReactionApiResult | null> => {
    const requestTemplate = template ?? buildFallbackGraphqlTemplate();
    const targetComment = await extractPublicCommentTargetFromRelayStore(page, targetCommentId);
    if (!targetComment) return null;

    const sampledPayloads = await fetchSampleReactionPayloads(page, requestTemplate, targetComment.feedbackId);
    if (!sampledPayloads) return null;

    const { payloads: paginatedPayloads, complete: paginationComplete } = await fetchPaginatedReactionPayloads(
        page,
        requestTemplate,
        targetComment.feedbackId,
        sampledPayloads,
    );
    const reactions = extractCommentReactionDetailsFromPayload([...sampledPayloads, ...paginatedPayloads].join('\n'));
    const complete = paginationComplete && reactions.users.length >= reactions.count;

    return {
        comment: {
            ...targetComment.comment,
            reactions,
        },
        complete,
    };
};

export { extractCommentReactionDetailsFromPayload };
