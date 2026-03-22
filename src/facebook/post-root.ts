import type { Locator, Page } from 'playwright';

import { COMMENT_SELECTOR, POST_REACTION_BUTTON_SELECTOR } from './selectors.js';

const TARGET_ROOT_ATTR = 'data-scrape-target-root';
const MESSAGE_SELECTOR = '[data-ad-preview="message"]';
const TARGET_DIALOG_SELECTOR = 'div[role="dialog"]';

interface RootSearchParams {
    targetUrl: string;
    targetRootAttr: string;
    dialogSelector: string;
    commentSelector: string;
    messageSelector: string;
    reactionSelector: string;
}

export const findTargetPostRoot = async (page: Page, targetUrl: string): Promise<Locator | null> => {
    const marked = await page.evaluate<boolean, RootSearchParams>(({ targetUrl, targetRootAttr, dialogSelector, commentSelector, messageSelector, reactionSelector }) => {
        const isVisible = (element: Element | null): element is HTMLElement => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const normalizeUrl = (value: string): string => {
            try {
                const url = new URL(value, location.href);
                url.search = '';
                url.hash = '';
                return url.toString();
            } catch {
                return value;
            }
        };

        const normalizedTargetUrl = normalizeUrl(targetUrl);
        const targetPostId = normalizedTargetUrl.split('/').filter(Boolean).at(-1) ?? normalizedTargetUrl;
        document.querySelectorAll(`[${targetRootAttr}]`).forEach((node) => {
            node.removeAttribute(targetRootAttr);
        });

        const scoreNode = (node: HTMLElement) => {
            const rect = node.getBoundingClientRect();
            const permalinkMatches = Array.from(node.querySelectorAll<HTMLAnchorElement>('a[href]'))
                .filter((anchor) => {
                    if (!isVisible(anchor)) return false;
                    const href = normalizeUrl(anchor.href);
                    return !href.includes('comment_id=') && (href === normalizedTargetUrl || href.includes(targetPostId));
                }).length;
            const commentCount = Array.from(node.querySelectorAll(commentSelector)).filter((child: Element) => isVisible(child)).length;
            const messageCount = Array.from(node.querySelectorAll(messageSelector)).filter((child: Element) => isVisible(child)).length;
            const reactionCount = Array.from(node.querySelectorAll(reactionSelector)).filter((child: Element) => isVisible(child)).length;
            const area = rect.width * rect.height;
            const score = (permalinkMatches * 5000)
                + (messageCount * 2500)
                + (reactionCount * 2000)
                + (commentCount * 1500)
                - (area / 3000);
            return { node, permalinkMatches, commentCount, messageCount, reactionCount, area, score };
        };

        const dialogCandidates = Array.from(document.querySelectorAll<HTMLElement>(dialogSelector))
            .filter((node) => isVisible(node))
            .map(scoreNode)
            .filter((candidate) => candidate.permalinkMatches > 0 && candidate.messageCount > 0 && candidate.reactionCount > 0);

        dialogCandidates.sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return left.area - right.area;
        });

        const bestDialog = dialogCandidates[0];
        if (bestDialog) {
            bestDialog.node.setAttribute(targetRootAttr, '1');
            return true;
        }

        const divCandidates = Array.from(document.querySelectorAll<HTMLElement>('div'))
            .filter((node) => isVisible(node))
            .map(scoreNode)
            .filter((candidate) => candidate.permalinkMatches > 0 && candidate.messageCount > 0 && candidate.reactionCount > 0 && candidate.commentCount > 0);

        divCandidates.sort((left, right) => {
            if (right.score !== left.score) return right.score - left.score;
            return left.area - right.area;
        });

        const bestDiv = divCandidates[0];
        if (!bestDiv) return false;
        bestDiv.node.setAttribute(targetRootAttr, '1');
        return true;
    }, {
        targetUrl,
        targetRootAttr: TARGET_ROOT_ATTR,
        dialogSelector: TARGET_DIALOG_SELECTOR,
        commentSelector: COMMENT_SELECTOR,
        messageSelector: MESSAGE_SELECTOR,
        reactionSelector: POST_REACTION_BUTTON_SELECTOR,
    }).catch(() => false);

    if (!marked) return null;
    return page.locator(`[${TARGET_ROOT_ATTR}="1"]`).first();
};
