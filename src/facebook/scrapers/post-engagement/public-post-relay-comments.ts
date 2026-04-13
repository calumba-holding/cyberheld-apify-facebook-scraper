import type { Page } from 'playwright';
import type { ScrapedComment } from '../../../common/types.js';
import { buildCommentKey } from '../../types.js';

const toIsoTimestamp = (unixSeconds: number | null): string => {
    return unixSeconds && unixSeconds > 0 ? new Date(unixSeconds * 1000).toISOString() : '';
};

export const extractVisiblePublicCommentsFromRelayStore = async (page: Page): Promise<ScrapedComment[]> => {
    const comments = await page.evaluate(() => {
        interface RelaySource {
            getRecordIDs(): string[];
            get(id: string): unknown;
        }

        interface RelayStore {
            getSource(): RelaySource;
        }

        interface RelayEnvironment {
            getStore(): RelayStore;
        }

        interface RelayCommentRecord {
            id: string;
            user: string;
            content: string;
            createdTime: number | null;
        }

        const asObject = (value: unknown): Record<string, unknown> | null => {
            return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
        };
        const asString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
        const getRelayRefId = (value: unknown): string | undefined => asString(asObject(value)?.__ref);
        const getRelayRecordByRef = (source: RelaySource, value: unknown): Record<string, unknown> | null => {
            const referenceId = getRelayRefId(value);
            return referenceId ? asObject(source.get(referenceId)) : null;
        };
        const getRelayRecordText = (source: RelaySource, value: unknown): string => {
            return asString(getRelayRecordByRef(source, value)?.text)?.trim() ?? '';
        };

        const globalRequire = (window as Window & { require?: (name: string) => unknown }).require;
        const relayEnvironment = globalRequire?.('CometRelayEnvironment') as RelayEnvironment | undefined;
        const source = relayEnvironment?.getStore()?.getSource();
        if (!source) return [] as RelayCommentRecord[];

        const results: RelayCommentRecord[] = [];
        const seenIds = new Set<string>();
        for (const id of source.getRecordIDs()) {
            const record = asObject(source.get(id));
            if (!record) continue;

            const commentId = asString(record.legacy_fbid)?.trim() || asString(record.id)?.trim() || '';
            const feedbackId = getRelayRefId(record.feedback);
            const author = getRelayRecordByRef(source, record.author);
            const content = getRelayRecordText(source, record['preferred_body(translation_type:"ORIGINAL")'])
                || getRelayRecordText(source, record.body);
            const user = asString(author?.name)?.trim() ?? '';
            if (!commentId || !feedbackId || !content || !user) continue;
            if (record.__typename !== 'Comment' && !('legacy_fbid' in record)) continue;
            if (seenIds.has(commentId)) continue;

            seenIds.add(commentId);
            results.push({
                id: commentId,
                user,
                content,
                createdTime: typeof record.created_time === 'number' ? record.created_time : null,
            });
        }

        return results;
    });

    const seen = new Set<string>();
    const deduped: ScrapedComment[] = [];
    for (const comment of comments) {
        const record: ScrapedComment = {
            id: comment.id,
            user: comment.user,
            content: comment.content,
            timestamp: toIsoTimestamp(comment.createdTime),
        };
        const key = buildCommentKey(record);
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push(record);
    }

    return deduped;
};
