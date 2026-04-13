import type { Page } from 'playwright';
import type { ScrapedComment } from '../../../common/types.js';

export interface PublicCommentTarget {
    comment: ScrapedComment;
    feedbackId: string;
}

export const extractPublicCommentTargetFromRelayStore = async (
    page: Page,
    targetCommentId: string,
): Promise<PublicCommentTarget | null> => {
    return page.evaluate((commentId) => {
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

        const asObject = (value: unknown): Record<string, unknown> | null => {
            return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
        };
        const asString = (value: unknown): string | undefined => typeof value === 'string' ? value : undefined;
        const getRelayRefId = (value: unknown): string | undefined => asString(asObject(value)?.__ref);
        const getRelayRecordByRef = (source: RelaySource, value: unknown): Record<string, unknown> | null => {
            const referenceId = getRelayRefId(value);
            return referenceId ? asObject(source.get(referenceId)) : null;
        };
        const getRelayRecordText = (source: RelaySource, value: unknown): string | undefined => {
            return asString(getRelayRecordByRef(source, value)?.text);
        };
        const buildPublicCommentTarget = (
            source: RelaySource,
            record: Record<string, unknown>,
        ): PublicCommentTarget | null => {
            const feedbackId = getRelayRefId(record.feedback);
            if (!feedbackId) return null;

            const author = getRelayRecordByRef(source, record.author);
            const content = getRelayRecordText(source, record['preferred_body(translation_type:"ORIGINAL")'])
                ?? getRelayRecordText(source, record.body)
                ?? '';
            const user = asString(author?.name) ?? 'Unknown User';
            const createdTime = typeof record.created_time === 'number' ? record.created_time : null;
            return {
                feedbackId,
                comment: {
                    id: commentId,
                    user,
                    content,
                    timestamp: createdTime ? new Date(createdTime * 1000).toISOString() : '',
                },
            };
        };

        const globalRequire = (window as Window & { require?: (name: string) => unknown }).require;
        const relayEnvironment = globalRequire?.('CometRelayEnvironment') as RelayEnvironment | undefined;
        const source = relayEnvironment?.getStore()?.getSource();
        if (!source) return null;

        for (const id of source.getRecordIDs()) {
            const record = asObject(source.get(id));
            if (!record || asString(record.legacy_fbid) !== commentId) continue;
            return buildPublicCommentTarget(source, record);
        }

        return null;
    }, targetCommentId);
};
