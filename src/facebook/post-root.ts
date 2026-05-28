import type { Locator, Page } from 'playwright';

import { extractFacebookVideoId } from './shared/url.js';
import { COMMENT_SELECTOR, POST_REACTION_BUTTON_SELECTOR } from './selectors.js';

const TARGET_ROOT_ATTR = 'data-scrape-target-root';
const MESSAGE_SELECTOR = '[data-ad-preview="message"]';
const COMMENTS_HEADING_SELECTOR = 'h1, h2, h3, [role="heading"]';
const TARGET_DIALOG_SELECTOR = 'div[role="dialog"]';
const VIDEO_SELECTOR = 'video';

interface RootSearchParams {
    targetUrl: string;
    targetVideoId: string | null;
    targetRootAttr: string;
    dialogSelector: string;
    commentSelector: string;
    messageSelector: string;
    headingSelector: string;
    reactionSelector: string;
    videoSelector: string;
}

export const findTargetPostRoot = async (page: Page, targetUrl: string): Promise<Locator | null> => {
    const targetVideoId = extractFacebookVideoId(targetUrl);
    const watchFeed = page.locator('#watch_feed').first();
    if (targetVideoId && await watchFeed.isVisible().catch(() => false)) return watchFeed;

    const marked = await page.evaluate<boolean, RootSearchParams>(({ targetUrl, targetVideoId, targetRootAttr, dialogSelector, commentSelector, messageSelector, headingSelector, reactionSelector, videoSelector }) => {
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
        const targetPostId = targetVideoId || normalizedTargetUrl.split('/').filter(Boolean).at(-1) || normalizedTargetUrl;
        const isWatchVideoTarget = Boolean(targetVideoId);
        document.querySelectorAll(`[${targetRootAttr}]`).forEach((node) => {
            node.removeAttribute(targetRootAttr);
        });

        const scoreNode = (node: HTMLElement) => {
            const rect = node.getBoundingClientRect();
            const permalinkMatches = Array.from(node.querySelectorAll<HTMLAnchorElement>('a[href]'))
                .filter((anchor) => {
                    if (!isVisible(anchor)) return false;
                    const href = normalizeUrl(anchor.href);
                    if (isWatchVideoTarget) return href.includes(targetPostId);
                    return !href.includes('comment_id=') && (href === normalizedTargetUrl || href.includes(targetPostId));
                }).length;
            const commentCount = Array.from(node.querySelectorAll(commentSelector)).filter((child: Element) => isVisible(child)).length;
            const messageCount = Array.from(node.querySelectorAll(messageSelector)).filter((child: Element) => isVisible(child)).length;
            const headingCount = Array.from(node.querySelectorAll(headingSelector)).filter((child: Element) => {
                if (!isVisible(child)) return false;
                const text = ((child as HTMLElement).innerText || child.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
                return text === 'comments' || text === 'kommentare';
            }).length;
            const reactionCount = Array.from(node.querySelectorAll(reactionSelector)).filter((child: Element) => isVisible(child)).length;
            const videoCount = Array.from(node.querySelectorAll(videoSelector)).filter((child: Element) => isVisible(child)).length;
            const area = rect.width * rect.height;
            const score = (permalinkMatches * 5000)
                + (messageCount * 2500)
                + (reactionCount * 2000)
                + (commentCount * 1500)
                + (headingCount * 1200)
                + (videoCount * 1000)
                - (area / 3000);
            return { node, permalinkMatches, commentCount, headingCount, messageCount, reactionCount, videoCount, area, score };
        };

        const dialogCandidates = Array.from(document.querySelectorAll<HTMLElement>(dialogSelector))
            .filter((node) => isVisible(node))
            .map(scoreNode)
            .filter((candidate) => candidate.permalinkMatches > 0 && (
                isWatchVideoTarget
                    ? (candidate.commentCount > 0 || candidate.headingCount > 0 || candidate.videoCount > 0)
                    : candidate.messageCount > 0
            ));

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
            .filter((candidate) => candidate.permalinkMatches > 0 && (
                isWatchVideoTarget
                    ? (candidate.commentCount > 0 || candidate.headingCount > 0 || candidate.videoCount > 0)
                    : (candidate.messageCount > 0 && candidate.commentCount > 0)
            ));

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
        targetVideoId,
        targetRootAttr: TARGET_ROOT_ATTR,
        dialogSelector: TARGET_DIALOG_SELECTOR,
        commentSelector: COMMENT_SELECTOR,
        messageSelector: MESSAGE_SELECTOR,
        headingSelector: COMMENTS_HEADING_SELECTOR,
        reactionSelector: POST_REACTION_BUTTON_SELECTOR,
        videoSelector: VIDEO_SELECTOR,
    }).catch(() => false);

    if (!marked) return null;
    return page.locator(`[${TARGET_ROOT_ATTR}="1"]`).first();
};
