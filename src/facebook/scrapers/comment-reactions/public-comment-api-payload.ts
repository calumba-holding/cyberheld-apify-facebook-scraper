import type { CommentReactionDetails, CommentReactionUser } from '../../../common/types.js';
import { normalizeProfileUrl } from '../../reaction-helpers.js';

type JsonValue = null | boolean | number | string | JsonObject | JsonValue[];
type JsonObject = { [key: string]: JsonValue | undefined };

const REACTION_EDGE_PATHS = [
    ['data', 'node', 'reactors', 'edges'],
    ['data', 'node', 'important_reactors', 'edges'],
] as const;
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

const asObject = (value: JsonValue | undefined): JsonObject | null => {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
};
const asArray = (value: JsonValue | undefined): JsonValue[] => Array.isArray(value) ? value : [];
const asString = (value: JsonValue | undefined): string | undefined => typeof value === 'string' ? value : undefined;
const asNumber = (value: JsonValue | undefined): number | undefined => {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

const getPath = (input: JsonObject | null, path: readonly string[]): JsonValue | undefined => {
    let current: JsonValue | undefined = input;
    for (const segment of path) {
        const object = asObject(current);
        if (!object) return undefined;
        current = object[segment];
    }
    return current;
};

const parseJsonLines = (payload: string): JsonObject[] => {
    const chunks: JsonObject[] = [];
    for (const line of payload.split('\n').map((part) => part.trim()).filter(Boolean)) {
        try {
            const object = asObject(JSON.parse(line) as JsonValue);
            if (object) chunks.push(object);
        } catch {
            // Ignore malformed chunks.
        }
    }
    return chunks;
};

const normalizeReactionName = (value: string | undefined): string => {
    if (!value) return '';
    return REACTION_NAME_ALIASES[value.trim().toLowerCase()] ?? value.trim();
};
const buildReactionLabel = (count: number): string => `${String(count)} reactions`;
const extractReactionSummaryItems = (chunk: JsonObject): JsonValue[] => {
    return asArray(getPath(chunk, ['data', 'node', 'top_reactions', 'summary']));
};
const extractReactionEdgeItems = (chunk: JsonObject): JsonValue[] => {
    return REACTION_EDGE_PATHS.flatMap((path) => asArray(getPath(chunk, path)));
};

const extractTotalReactionCount = (chunk: JsonObject): number => {
    const reducedCount = asString(getPath(chunk, ['data', 'node', 'reactors', 'count_reduced']));
    if (!reducedCount) return 0;
    const parsedCount = Number.parseInt(reducedCount.replace(/\D+/gu, ''), 10);
    return Number.isFinite(parsedCount) ? parsedCount : 0;
};

const buildReactionUserProfileUrl = (node: JsonObject): string => {
    const nodeId = asString(node.id)?.trim() ?? '';
    return normalizeProfileUrl(asString(node.profile_url) || asString(node.url) || `https://www.facebook.com/${nodeId}`);
};

const buildReactionNamesById = (payload: string): Map<string, string> => {
    const reactionNames = new Map<string, string>();
    for (const chunk of parseJsonLines(payload)) {
        for (const item of extractReactionSummaryItems(chunk)) {
            const summaryEntry = asObject(item);
            const reactionId = asString(getPath(summaryEntry, ['reaction', 'id']));
            const reactionName = normalizeReactionName(asString(getPath(summaryEntry, ['reaction', 'localized_name'])));
            if (reactionId && reactionName) reactionNames.set(reactionId, reactionName);
        }
    }
    return reactionNames;
};

const resolveReactionName = (edge: JsonObject | null, reactionNames: Map<string, string>): string => {
    const reactionId = asString(getPath(edge, ['feedback_reaction_info', 'id']));
    const localizedReaction = normalizeReactionName(asString(getPath(edge, ['feedback_reaction_info', 'localized_name'])));
    return localizedReaction || reactionNames.get(reactionId ?? '') || '';
};

export const extractCommentReactionDetailsFromPayload = (payload: string): CommentReactionDetails => {
    const reactionNamesById = buildReactionNamesById(payload);
    const reactionBreakdown = new Map<string, number>();
    const sampledUsers: CommentReactionUser[] = [];
    const seenUserKeys = new Set<string>();
    let totalReactionCount = 0;

    for (const chunk of parseJsonLines(payload)) {
        for (const item of extractReactionSummaryItems(chunk)) {
            const summaryEntry = asObject(item);
            const reactionName = normalizeReactionName(asString(getPath(summaryEntry, ['reaction', 'localized_name'])));
            const reactionCount = asNumber(summaryEntry?.reaction_count);
            if (!reactionName || reactionCount == null) continue;
            reactionBreakdown.set(reactionName, Math.max(reactionBreakdown.get(reactionName) ?? 0, reactionCount));
        }

        totalReactionCount = Math.max(totalReactionCount, extractTotalReactionCount(chunk));
        for (const item of extractReactionEdgeItems(chunk)) {
            const reactionEdge = asObject(item);
            const reactorNode = asObject(reactionEdge?.node);
            const reactorName = asString(reactorNode?.name)?.trim();
            if (!reactorNode || !reactorName) continue;

            const reactionName = resolveReactionName(reactionEdge, reactionNamesById);
            if (!reactionName) continue;

            const profileUrl = buildReactionUserProfileUrl(reactorNode);
            const userKey = `${reactorName}|${profileUrl}|${reactionName}`;
            if (seenUserKeys.has(userKey)) continue;
            seenUserKeys.add(userKey);
            sampledUsers.push({ name: reactorName, profile_url: profileUrl, reaction: reactionName });
        }
    }

    const breakdown = [...reactionBreakdown.entries()].map(([reaction, count]) => ({ reaction, count }));
    const count = Math.max(totalReactionCount, breakdown.reduce((sum, item) => sum + item.count, 0), sampledUsers.length);
    return { count, label: buildReactionLabel(count), breakdown, users: sampledUsers };
};
