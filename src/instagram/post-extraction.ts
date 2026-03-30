import type { Page } from 'playwright';

import { COUNT_BUTTON_SELECTOR } from './selectors.js';

const DESCRIPTION_PATTERN = /([\d.,KMB]+)\s+likes?,\s+([\d.,KMB]+)\s+comments?\s+-[\s\S]*?"([\s\S]+)"\.\s*$/i;

type VisibleInstagramCounts = {
    reactionCount?: number;
    commentCount?: number;
};

export const parseInstagramCount = (value: string): number | undefined => {
    const normalized = value.replace(/\s+/g, '').toUpperCase();
    const match = normalized.match(/^(\d[\d.,]*)([KMB])?(?:LIKES?|COMMENTS?)?$/);
    if (!match) return undefined;

    const rawAmount = match[1];
    const suffix = match[2];
    const normalizedAmount = suffix
        ? rawAmount.replace(',', '.')
        : rawAmount.replace(/[.,]/g, '');
    const amount = Number.parseFloat(normalizedAmount);
    if (!Number.isFinite(amount)) return undefined;
    const multipliers: Record<string, number> = { K: 1_000, M: 1_000_000, B: 1_000_000_000 };
    const multiplier = suffix ? (multipliers[suffix] ?? 1) : 1;
    return Math.round(amount * multiplier);
};

const parseVisibleCountLabel = (label: string): { kind: keyof VisibleInstagramCounts; count: number } | null => {
    const normalized = label.replace(/\s+/g, ' ').trim();
    if (/likes?$/i.test(normalized)) {
        const count = parseInstagramCount(normalized);
        return count === undefined ? null : { kind: 'reactionCount', count };
    }

    if (/comments?$/i.test(normalized)) {
        const count = parseInstagramCount(normalized);
        return count === undefined ? null : { kind: 'commentCount', count };
    }

    return null;
};

const parseMetaDescription = (description: string | undefined): {
    reactionCount?: number;
    commentCount?: number;
    postContent?: string;
} => {
    if (!description) return {};
    const match = description.match(DESCRIPTION_PATTERN);
    if (!match) return {};

    return {
        reactionCount: parseInstagramCount(match[1]),
        commentCount: parseInstagramCount(match[2]),
        postContent: match[3].trim(),
    };
};

export const extractVisibleInstagramCounts = async (page: Page): Promise<VisibleInstagramCounts> => {
    const labels = await page.locator(COUNT_BUTTON_SELECTOR).evaluateAll((nodes) => {
        return nodes.map((node) => (node.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean);
    });

    return labels.reduce<VisibleInstagramCounts>((counts, label) => {
        const parsed = parseVisibleCountLabel(label);
        if (!parsed || counts[parsed.kind] !== undefined) return counts;

        counts[parsed.kind] = parsed.count;
        return counts;
    }, {});
};

export const extractInstagramPostDetails = async (page: Page, fallbackUrl: string): Promise<{
    finalUrl: string;
    postContent?: string;
    reactionCount: number;
    commentCount: number;
}> => {
    const meta = await page.evaluate(() => ({
        canonicalUrl: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || window.location.href,
        description: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content,
        ogDescription: document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content,
    }));
    const parsedMeta = parseMetaDescription(meta.description || meta.ogDescription);
    const visibleCounts = await extractVisibleInstagramCounts(page);

    return {
        finalUrl: !meta.canonicalUrl || meta.canonicalUrl === 'about:blank' ? fallbackUrl : meta.canonicalUrl,
        postContent: parsedMeta.postContent,
        reactionCount: visibleCounts.reactionCount ?? parsedMeta.reactionCount ?? 0,
        commentCount: visibleCounts.commentCount ?? parsedMeta.commentCount ?? 0,
    };
};
