import { describe, expect, it } from 'vitest';

import { extractCommentReactionDetailsFromPayload } from '../../src/facebook/scrapers/comment-reactions/public-comment-api-payload.js';

const buildMixedPayload = (): string => {
    return JSON.stringify({
        data: {
            node: {
                top_reactions: {
                    summary: [
                        {
                            reaction_count: 3,
                            reaction: {
                                id: '1635855486666999',
                                localized_name: 'Gefällt mir',
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
                    count_reduced: '4',
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

const buildBucketPayload = (): string => {
    return JSON.stringify({
        data: {
            node: {
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
                    count_reduced: '3',
                    edges: [
                        {
                            feedback_reaction_info: {
                                id: '1635855486666999',
                            },
                            node: {
                                id: 'user-3',
                                name: 'Linus Reactor',
                                url: 'https://www.facebook.com/linus.reactor',
                            },
                        },
                    ],
                },
                important_reactors: {
                    edges: [
                        {
                            feedback_reaction_info: {
                                id: '1635855486666999',
                                localized_name: 'Like',
                            },
                            node: {
                                id: 'user-4',
                                name: 'Margaret Reactor',
                                profile_url: 'https://www.facebook.com/margaret.reactor?foo=bar',
                            },
                        },
                    ],
                },
            },
        },
    });
};

describe('facebook public comment reactions parser', () => {
    it('merges reaction breakdown and user samples from mixed and bucket payloads', () => {
        const result = extractCommentReactionDetailsFromPayload(`${buildMixedPayload()}\n${buildBucketPayload()}`);

        expect(result).toEqual({
            count: 4,
            label: '4 reactions',
            breakdown: [
                {
                    reaction: 'Like',
                    count: 3,
                },
                {
                    reaction: 'Haha',
                    count: 1,
                },
            ],
            users: [
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
                {
                    name: 'Margaret Reactor',
                    profile_url: 'https://www.facebook.com/margaret.reactor?foo=bar',
                    reaction: 'Like',
                },
            ],
        });
    });
});
