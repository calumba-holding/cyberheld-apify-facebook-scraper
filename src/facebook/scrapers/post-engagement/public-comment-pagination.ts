import type { Page } from 'playwright';
import type { PublicCommentPaginationState, PublicReplyPaginationTarget } from './public-post-api-payload.js';
import { extractReplyPaginationState, extractTopLevelCommentsPaginationState } from './public-post-api-payload.js';
import { runGraphqlRequest, type GraphqlCapture, type GraphqlRequestTemplate } from './public-post-api-graphql.js';

type GraphqlVariableValue = string | number | boolean | null;

type GraphqlVariables = Record<string, GraphqlVariableValue>;

interface TopLevelCommentsPaginationRequest {
    page: Page;
    template: GraphqlRequestTemplate;
    feedbackId: string;
    paginationState: PublicCommentPaginationState;
    commentsIntentToken?: string | null;
    feedLocation: string;
    maxPasses: number;
    docId: string;
    commentsAfterCount?: number | null;
    extraVariables?: GraphqlVariables;
}

interface ReplyPaginationRequest {
    page: Page;
    template: GraphqlRequestTemplate;
    targets: PublicReplyPaginationTarget[];
    feedLocation: string;
    maxPassesPerTarget: number;
    docId: string;
    friendlyName?: string;
    repliesAfterCount?: number | null;
    extraVariables?: GraphqlVariables;
}

const COMMENTS_LIST_COMPONENTS_PAGINATION_QUERY_NAME = 'CommentsListComponentsPaginationQuery';
const DEPTH1_COMMENTS_LIST_PAGINATION_QUERY_NAME = 'Depth1CommentsListPaginationQuery';

const createCapture = (body: string, docId: string, friendlyName: string): GraphqlCapture => ({
    body,
    docId,
    friendlyName,
});

const calculateBoundedPasses = (maxPasses: number, totalCount: number | undefined, pageSize: number | undefined): number => {
    const normalizedPageSize = Math.max(pageSize ?? 10, 1);
    const expectedPasses = Math.max(1, Math.ceil((totalCount ?? normalizedPageSize) / normalizedPageSize));
    return Math.min(maxPasses, expectedPasses + 2);
};

const resolveNextCommentCursor = (
    payload: string,
    previousCursor: string | null | undefined,
): { hasNextPage: boolean; nextCursor?: string } => {
    const nextState = extractTopLevelCommentsPaginationState(payload);
    const hasNextPage = nextState?.hasNextPage === true;
    const nextCursor = nextState?.commentsAfterCursor;
    return {
        hasNextPage,
        nextCursor: hasNextPage && nextCursor && nextCursor !== previousCursor ? nextCursor : undefined,
    };
};

const createInitialReplyPassBudget = (maxPassesPerTarget: number, totalReplies: number): number => {
    return Math.min(maxPassesPerTarget, Math.max(1, totalReplies + 1));
};

const resolveReplyPaginationWindow = (
    payload: string,
    fallbackTotalReplies: number,
    remainingPasses: number,
    previousCursor: string | null | undefined,
): { hasNextPage: boolean; nextCursor?: string; nextRemainingPasses: number } => {
    const nextState = extractReplyPaginationState(payload);
    const nextPageSize = Math.max(nextState?.pageSize ?? 10, 1);
    const expectedPasses = Math.max(1, Math.ceil((nextState?.totalCount ?? fallbackTotalReplies) / nextPageSize));
    const nextRemainingPasses = Math.min(remainingPasses, Math.max(0, expectedPasses + 1));
    const hasNextPage = nextState?.hasNextPage === true;
    const nextCursor = nextState?.repliesAfterCursor;
    return {
        hasNextPage,
        nextCursor: hasNextPage && nextCursor && nextCursor !== previousCursor ? nextCursor : undefined,
        nextRemainingPasses,
    };
};

export const fetchPublicTopLevelCommentsPaginationPayloads = async ({
    page,
    template,
    feedbackId,
    paginationState,
    commentsIntentToken,
    feedLocation,
    maxPasses,
    docId,
    commentsAfterCount = -1,
    extraVariables,
}: TopLevelCommentsPaginationRequest): Promise<GraphqlCapture[]> => {
    const payloads: GraphqlCapture[] = [];
    let cursor: string | null | undefined = paginationState.commentsAfterCursor ?? null;
    let hasNextPage = paginationState.hasNextPage;
    const boundedPasses = calculateBoundedPasses(maxPasses, paginationState.totalCount, paginationState.pageSize);

    for (let pass = 0; pass < boundedPasses && hasNextPage; pass++) {
        const payload = await runGraphqlRequest(page, template, COMMENTS_LIST_COMPONENTS_PAGINATION_QUERY_NAME, docId, {
            commentsAfterCount,
            commentsAfterCursor: cursor,
            commentsBeforeCount: null,
            commentsBeforeCursor: null,
            commentsIntentToken: commentsIntentToken ?? paginationState.commentsIntentToken ?? null,
            feedLocation,
            focusCommentID: null,
            id: feedbackId,
            scale: 2,
            useDefaultActor: false,
            __relay_internal__pv__IsWorkUserrelayprovider: false,
            ...extraVariables,
        });
        if (!payload) break;

        payloads.push(createCapture(payload, docId, COMMENTS_LIST_COMPONENTS_PAGINATION_QUERY_NAME));
        const nextPage = resolveNextCommentCursor(payload, cursor);
        hasNextPage = nextPage.hasNextPage;
        if (!nextPage.nextCursor) break;
        cursor = nextPage.nextCursor;
    }

    return payloads;
};

export const fetchPublicReplyPaginationPayloads = async ({
    page,
    template,
    targets,
    feedLocation,
    maxPassesPerTarget,
    docId,
    friendlyName = DEPTH1_COMMENTS_LIST_PAGINATION_QUERY_NAME,
    repliesAfterCount = -1,
    extraVariables,
}: ReplyPaginationRequest): Promise<GraphqlCapture[]> => {
    const payloads: GraphqlCapture[] = [];

    for (const target of targets) {
        let cursor: string | null | undefined = null;
        let hasNextPage = true;
        let remainingPasses = createInitialReplyPassBudget(maxPassesPerTarget, target.totalReplies);

        while (hasNextPage && remainingPasses > 0) {
            const payload = await runGraphqlRequest(page, template, friendlyName, docId, {
                clientKey: null,
                expansionToken: target.expansionToken,
                feedLocation,
                focusCommentID: null,
                id: target.feedbackId,
                repliesAfterCount,
                repliesAfterCursor: cursor,
                repliesBeforeCount: null,
                repliesBeforeCursor: null,
                scale: 2,
                useDefaultActor: false,
                __relay_internal__pv__IsWorkUserrelayprovider: false,
                ...extraVariables,
            });
            if (!payload) break;

            payloads.push(createCapture(payload, docId, friendlyName));
            remainingPasses -= 1;
            const nextPage = resolveReplyPaginationWindow(payload, target.totalReplies, remainingPasses, cursor);
            remainingPasses = nextPage.nextRemainingPasses;
            hasNextPage = nextPage.hasNextPage;
            if (!nextPage.nextCursor) break;
            cursor = nextPage.nextCursor;
        }
    }

    return payloads;
};
