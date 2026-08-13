import { describe, expect, it } from 'vitest';

import { tryExtractPublicPostEngagementFromApiPayload } from '../../src/facebook/scrapers/post-engagement/public-post-api.js';
import { extractReplyPaginationState, extractTopLevelCommentsPaginationState } from '../../src/facebook/scrapers/post-engagement/public-post-api-payload.js';
import { extractReactionPaginationStatesFromPayload, hasGraphqlErrors } from '../../src/facebook/scrapers/post-engagement/public-post-api-reactions.js';

const buildPayload = (): string => {
    const root = {
        data: {
            node_v2: {
                permalink_url: 'https://www.facebook.com/example/posts/pfbid123?rdid=tracking',
                comet_sections: {
                    content: {
                        story: {
                            message: {
                                text: 'Hello from public API',
                            },
                        },
                    },
                    feedback: {
                        story: {
                            story_ufi_container: {
                                story: {
                                    url: 'https://www.facebook.com/example/posts/pfbid123',
                                    message: {
                                        text: 'Hello from public API',
                                    },
                                    feedback_context: {
                                        feedback_target_with_context: {
                                            comment_list_renderer: {
                                                feedback: {
                                                    comment_rendering_instance_for_feed_location: {
                                                        comments: {
                                                            total_count: 3,
                                                            count: 3,
                                                            page_info: {
                                                                has_next_page: false,
                                                            },
                                                            edges: [
                                                                {
                                                                    node: {
                                                                        id: 'comment-1',
                                                                        legacy_fbid: '111',
                                                                        author: { name: 'Ada' },
                                                                        body: { text: 'First public comment' },
                                                                        created_time: 1700000000,
                                                                        feedback: {
                                                                            url: 'https://www.facebook.com/example/posts/pfbid123?comment_id=111',
                                                                        },
                                                                    },
                                                                },
                                                                {
                                                                    node: {
                                                                        id: 'comment-2',
                                                                        author: { name: 'Grace' },
                                                                        preferred_body: { text: 'Second public comment' },
                                                                        created_time: 1700000010,
                                                                        feedback: {
                                                                            url: 'https://www.facebook.com/example/posts/pfbid123?comment_id=222',
                                                                        },
                                                                    },
                                                                },
                                                            ],
                                                        },
                                                    },
                                                },
                                            },
                                            comet_ufi_summary_and_actions_renderer: {
                                                feedback: {
                                                    reaction_count: {
                                                        count: 5,
                                                    },
                                                },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
            },
        },
    };

    const deferred = {
        label: 'CometSinglePostDialogContentQuery$defer$example',
        path: ['node_v2'],
        data: {
            ignored: true,
        },
    };

    return `${JSON.stringify(root)}\n${JSON.stringify(deferred)}`;
};

const buildFocusedStoryViewPayload = (): string => {
    return JSON.stringify({
        data: {
            story_card: {
                id: 'story-123',
                url: 'https://www.facebook.com/example/posts/pfbid123',
                message: {
                    text: 'Hello from focused story view',
                },
                feedback: {
                    id: 'feedback-123',
                },
            },
            feedback: {
                ufi_renderer: {
                    feedback: {
                        comment_list_renderer: {
                            feedback: {
                                comment_rendering_instance_for_feed_location: {
                                    selected_intent: {
                                        intent_token: 'intent-123',
                                    },
                                    comments: {
                                        total_count: 3,
                                        count: 3,
                                        page_size: 10,
                                        page_info: {
                                            has_next_page: true,
                                            end_cursor: 'cursor-1',
                                        },
                                        edges: [
                                            {
                                                node: {
                                                    id: 'focused-comment-1',
                                                    legacy_fbid: '333',
                                                    author: { name: 'Linus' },
                                                    body: { text: 'Focused comment' },
                                                    created_time: 1700000020,
                                                    feedback: {
                                                        url: 'https://www.facebook.com/example/posts/pfbid123?comment_id=333',
                                                    },
                                                },
                                            },
                                        ],
                                    },
                                },
                            },
                        },
                        comet_ufi_summary_and_actions_renderer: {
                            feedback: {
                                reaction_count: {
                                    count: 9,
                                },
                            },
                        },
                    },
                },
            },
        },
    });
};

const buildCommentsPaginationPayload = (): string => {
    return JSON.stringify({
        data: {
            node: {
                comment_rendering_instance_for_feed_location: {
                    comments: {
                        total_count: 3,
                        count: 3,
                        page_info: {
                            has_next_page: false,
                            end_cursor: 'cursor-2',
                        },
                        edges: [
                            {
                                node: {
                                    id: 'focused-comment-2',
                                    legacy_fbid: '444',
                                    author: { name: 'Margaret' },
                                    body: { text: 'Paged comment' },
                                    created_time: 1700000030,
                                    feedback: {
                                        url: 'https://www.facebook.com/example/posts/pfbid123?comment_id=444',
                                        id: 'feedback-comment-444',
                                        replies_fields: { total_count: 1 },
                                        expansion_info: { expansion_token: 'reply-expansion-token' },
                                    },
                                },
                            },
                        ],
                    },
                },
            },
        },
    });
};

const buildRepliesPaginationPayload = (): string => {
    return JSON.stringify({
        data: {
            node: {
                replies_connection: {
                    total_count: 1,
                    count: 1,
                    page_info: {
                        has_next_page: false,
                    },
                    edges: [
                        {
                            node: {
                                id: 'reply-comment-1',
                                legacy_fbid: '555',
                                author: { name: 'Reply User' },
                                body: { text: 'Nested reply' },
                                created_time: 1700000040,
                                feedback: {
                                    url: 'https://www.facebook.com/example/posts/pfbid123?comment_id=444&reply_comment_id=555',
                                },
                            },
                        },
                    ],
                },
            },
        },
    });
};

const buildReactionsPayload = (): string => {
    return JSON.stringify({
        data: {
            node: {
                id: 'feedback-123',
                top_reactions: {
                    summary: [
                        {
                            reaction_count: 2,
                            reaction: {
                                id: '1635855486666999',
                                localized_name: 'Like',
                            },
                        },
                        {
                            reaction_count: 1,
                            reaction: {
                                id: '115940658764963',
                                localized_name: 'Haha',
                            },
                        },
                    ],
                },
                reactors: {
                    page_info: {
                        has_next_page: true,
                        end_cursor: 'reactor-cursor-1',
                    },
                    edges: [
                        {
                            feedback_reaction_info: {
                                id: '1635855486666999',
                            },
                            node: {
                                id: 'user-1',
                                name: 'Ada Reactor',
                                profile_url: 'https://www.facebook.com/ada?__tn__=x',
                            },
                        },
                        {
                            feedback_reaction_info: {
                                id: '115940658764963',
                            },
                            node: {
                                id: 'user-2',
                                name: 'Grace Reactor',
                            },
                        },
                    ],
                },
            },
        },
    });
};

const buildReactionPaginationPayload = (): string => {
    return JSON.stringify({
        data: {
            node: {
                id: 'feedback-123',
                reactors: {
                    page_info: {
                        has_next_page: false,
                        end_cursor: 'reactor-cursor-2',
                    },
                    edges: [
                        {
                            feedback_reaction_info: {
                                id: '1635855486666999',
                            },
                            node: {
                                id: 'user-3',
                                name: 'Linus Reactor',
                                url: 'https://www.facebook.com/linus.reactor?ref=profile',
                            },
                        },
                    ],
                },
            },
        },
    });
};

const buildReactionErrorPayload = (): string => {
    return JSON.stringify({
        errors: [
            {
                message: 'Unauthorized logged out query.',
            },
        ],
    });
};

describe('facebook public post api payload parser', () => {
    it('extracts useful post data from the single-post graphql payload', () => {
        const result = tryExtractPublicPostEngagementFromApiPayload(
            buildPayload(),
            'https://www.facebook.com/example/posts/pfbid123',
            'https://www.facebook.com/example/posts/pfbid123?rdid=tracking',
        );

        expect(result).not.toBeNull();
        expect(result).toMatchObject({
            kind: 'engagement',
            inputUrl: 'https://www.facebook.com/example/posts/pfbid123',
            finalUrl: 'https://www.facebook.com/example/posts/pfbid123',
            status: 'PARTIAL',
            reactionCount: 5,
            commentCount: 2,
            commentsComplete: false,
            postReactionsComplete: false,
            commentVisibilityComplete: false,
            postContent: 'Hello from public API',
            reactions: [],
        });
        expect(result?.comments).toEqual([
            {
                id: '111',
                user: 'Ada',
                content: 'First public comment',
                timestamp: '2023-11-14T22:13:20.000Z',
            },
            {
                id: '222',
                user: 'Grace',
                content: 'Second public comment',
                timestamp: '2023-11-14T22:13:30.000Z',
            },
        ]);
    });

    it('extracts useful post data from the focused-story-view graphql payload', () => {
        const result = tryExtractPublicPostEngagementFromApiPayload(
            buildFocusedStoryViewPayload(),
            'https://www.facebook.com/example/posts/pfbid123',
            'https://www.facebook.com/example/posts/pfbid123',
        );

        expect(result).not.toBeNull();
        expect(result).toMatchObject({
            finalUrl: 'https://www.facebook.com/example/posts/pfbid123',
            reactionCount: 9,
            commentCount: 1,
            postContent: 'Hello from focused story view',
        });
        expect(result?.comments[0]).toMatchObject({
            id: '333',
            user: 'Linus',
            content: 'Focused comment',
        });
    });

    it('merges focused-story, pagination, reply, and reaction payload data', () => {
        const result = tryExtractPublicPostEngagementFromApiPayload(
            `${buildFocusedStoryViewPayload()}\n${buildCommentsPaginationPayload()}\n${buildRepliesPaginationPayload()}\n${buildReactionsPayload()}\n${buildReactionPaginationPayload()}`,
            'https://www.facebook.com/example/posts/pfbid123',
            'https://www.facebook.com/example/posts/pfbid123',
        );

        expect(result).not.toBeNull();
        expect(result?.commentCount).toBe(3);
        expect(result?.comments).toEqual([
            {
                id: '333',
                user: 'Linus',
                content: 'Focused comment',
                timestamp: '2023-11-14T22:13:40.000Z',
            },
            {
                id: '444',
                user: 'Margaret',
                content: 'Paged comment',
                timestamp: '2023-11-14T22:13:50.000Z',
            },
            {
                id: '555',
                user: 'Reply User',
                content: 'Nested reply',
                timestamp: '2023-11-14T22:14:00.000Z',
            },
        ]);
        expect(result?.reactions).toEqual([
            {
                name: 'Ada Reactor',
                profile_url: 'https://www.facebook.com/ada',
                reaction: 'Like',
            },
            {
                name: 'Grace Reactor',
                profile_url: 'https://www.facebook.com/user-2',
                reaction: 'Haha',
            },
            {
                name: 'Linus Reactor',
                profile_url: 'https://www.facebook.com/linus.reactor',
                reaction: 'Like',
            },
        ]);
    });

    it('extracts comment and reaction pagination state and graphql errors', () => {
        expect(extractTopLevelCommentsPaginationState(buildFocusedStoryViewPayload())).toEqual({
            commentsAfterCursor: 'cursor-1',
            hasNextPage: true,
            pageSize: 10,
            totalCount: 3,
            commentsIntentToken: 'intent-123',
        });
        expect(extractReplyPaginationState(buildRepliesPaginationPayload())).toEqual({
            repliesAfterCursor: undefined,
            hasNextPage: false,
            pageSize: undefined,
            totalCount: 1,
        });
        expect(extractReactionPaginationStatesFromPayload(buildReactionsPayload())).toEqual([
            {
                feedbackId: 'feedback-123',
                reactionId: null,
                hasNextPage: true,
                endCursor: 'reactor-cursor-1',
                pageSize: 2,
            },
        ]);
        expect(hasGraphqlErrors(buildReactionErrorPayload())).toBe(true);
    });

    it('returns null for malformed payloads', () => {
        expect(tryExtractPublicPostEngagementFromApiPayload('not json', 'https://www.facebook.com/example/posts/1', 'https://www.facebook.com/example/posts/1')).toBeNull();
    });
});
