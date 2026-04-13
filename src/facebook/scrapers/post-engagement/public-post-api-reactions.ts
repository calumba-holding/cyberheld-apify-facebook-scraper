import type { ReactionUser } from '../../../common/types.js';
import { normalizeProfileUrl } from '../../reaction-helpers.js';
import {
    asArray,
    asObject,
    asString,
    getPath,
    parseJsonLines,
    type JsonObject,
} from './public-post-api-json.js';

interface PublicReactionExtraction {
    reactions: ReactionUser[];
}

export interface PublicReactionPaginationState {
    feedbackId: string;
    reactionId: string | null;
    hasNextPage: boolean;
    endCursor?: string;
    pageSize: number;
}

const REACTION_ID_TO_NAME: Record<string, string> = {
    '1635855486666999': 'Like',
    '1678524932434102': 'Love',
    '115940658764963': 'Haha',
    '478547315650144': 'Wow',
    '613557422527858': 'Care',
    '908563459236466': 'Sad',
    '444813342392137': 'Angry',
};

const REACTION_NAME_ALIASES: Record<string, string> = {
    like: 'Like',
    'gefällt mir': 'Like',
    love: 'Love',
    liebe: 'Love',
    care: 'Care',
    umarmt: 'Care',
    haha: 'Haha',
    wow: 'Wow',
    sad: 'Sad',
    traurig: 'Sad',
    angry: 'Angry',
    wütend: 'Angry',
};


const normalizeReactionName = (value: string | undefined): string => {
    if (!value) return '';
    return REACTION_NAME_ALIASES[value.trim().toLowerCase()] ?? value.trim();
};

const buildProfileUrl = (node: JsonObject): string => {
    const directUrl = asString(node.profile_url) || asString(node.url);
    if (directUrl) return normalizeProfileUrl(directUrl);

    const id = asString(node.id);
    if (!id) return 'https://www.facebook.com/';
    return normalizeProfileUrl(`https://www.facebook.com/${id}`);
};

const extractReactionNames = (payload: string): Map<string, string> => {
    const names = new Map<string, string>();

    for (const chunk of parseJsonLines(payload)) {
        const summary = asArray(getPath(chunk, ['data', 'node', 'top_reactions', 'summary']));
        for (const item of summary) {
            const reactionId = asString(getPath(asObject(item), ['reaction', 'id']));
            const reactionName = asString(getPath(asObject(item), ['reaction', 'localized_name']));
            if (!reactionId || !reactionName) continue;
            names.set(reactionId, reactionName);
        }
    }

    return names;
};

const extractReactionIdForChunk = (chunk: JsonObject): string | null => {
    const ids = new Set<string>();
    const edges = asArray(getPath(chunk, ['data', 'node', 'reactors', 'edges']));
    for (const edge of edges) {
        const reactionId = asString(getPath(asObject(edge), ['feedback_reaction_info', 'id']));
        if (reactionId) ids.add(reactionId);
    }

    if (ids.size === 1) return [...ids][0] ?? null;
    return null;
};

export const hasGraphqlErrors = (payload: string): boolean => {
    return parseJsonLines(payload).some((chunk) => asArray(chunk.errors).length > 0);
};

export const extractReactionIdsFromPayload = (payload: string): string[] => {
    return [...extractReactionNames(payload).keys()];
};

export const extractReactionPaginationStatesFromPayload = (payload: string): PublicReactionPaginationState[] => {
    const states: PublicReactionPaginationState[] = [];

    for (const chunk of parseJsonLines(payload)) {
        const feedbackId = asString(getPath(chunk, ['data', 'node', 'id']));
        const pageInfo = asObject(getPath(chunk, ['data', 'node', 'reactors', 'page_info']));
        const edges = asArray(getPath(chunk, ['data', 'node', 'reactors', 'edges']));
        if (!feedbackId || !pageInfo) continue;

        states.push({
            feedbackId,
            reactionId: extractReactionIdForChunk(chunk),
            hasNextPage: pageInfo.has_next_page === true,
            endCursor: asString(pageInfo.end_cursor),
            pageSize: edges.length,
        });
    }

    return states;
};

export const extractReactionDataFromPayload = (payload: string): PublicReactionExtraction => {
    const reactionNames = extractReactionNames(payload);
    const seen = new Set<string>();
    const reactions: ReactionUser[] = [];

    for (const chunk of parseJsonLines(payload)) {
        const edges = asArray(getPath(chunk, ['data', 'node', 'reactors', 'edges']));
        for (const edge of edges) {
            const edgeObject = asObject(edge);
            const node = asObject(edgeObject?.node);
            if (!node) continue;

            const name = asString(node.name)?.trim();
            if (!name) continue;

            const reactionId = asString(getPath(edgeObject, ['feedback_reaction_info', 'id'])) ?? '';
            const reaction = normalizeReactionName(reactionNames.get(reactionId) ?? REACTION_ID_TO_NAME[reactionId] ?? reactionId);
            if (!reaction) continue;

            const profileUrl = buildProfileUrl(node);
            const key = `${name}|${profileUrl}|${reaction}`;
            if (seen.has(key)) continue;
            seen.add(key);
            reactions.push({
                name,
                profile_url: profileUrl,
                reaction,
            });
        }
    }

    return { reactions };
};
