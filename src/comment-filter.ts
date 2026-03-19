import { log } from 'apify';
import type { Page } from 'playwright';

type PointCandidate = { index: number; text: string; x: number; y: number };
type PointTarget = { text: string; x: number; y: number };

const COMMENT_ARTICLE_SELECTOR = 'div[role="article"][aria-label^="Comment by"]';
const COMMENT_HEADING_SELECTOR = 'h1, h2, h3, [role="heading"]';
const FILTER_BUTTON_SELECTOR = '[role="button"][aria-haspopup="menu"]';

const COMMENT_HEADING_LABELS = ['comments', 'kommentare'];
const FILTER_LABELS = ['most relevant', 'top comments', 'all comments', 'relevanteste', 'alle kommentare'];
const TARGET_FILTER_LABELS = ['all comments', 'alle kommentare'];

const normalizeText = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
const hasAnyLabel = (text: string, labels: string[]): boolean => labels.some((label) => text.includes(label));

const locateFilterCandidate = async (page: Page): Promise<PointCandidate | null> => {
    return page.evaluate(({ buttonSelector, commentSelector, headingSelector, filterLabels, headingLabels }) => {
        const normalize = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const isVisible = (element: Element | null): element is HTMLElement => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const headingTop = Array.from(document.querySelectorAll(headingSelector))
            .filter((node) => isVisible(node))
            .map((node) => {
                const element = node as HTMLElement;
                const text = normalize(element.innerText || element.textContent || element.getAttribute('aria-label'));
                return { top: element.getBoundingClientRect().top, text };
            })
            .filter((entry) => headingLabels.some((label) => entry.text.includes(label)))
            .sort((left, right) => left.top - right.top)[0]?.top ?? Number.POSITIVE_INFINITY;

        const commentTop = Array.from(document.querySelectorAll(commentSelector))
            .filter((node) => isVisible(node))
            .map((node) => (node as HTMLElement).getBoundingClientRect().top)
            .sort((left, right) => left - right)[0] ?? Number.POSITIVE_INFINITY;

        const anchorTop = Number.isFinite(headingTop) ? headingTop : commentTop;
        if (!Number.isFinite(anchorTop)) return null;

        const candidates = Array.from(document.querySelectorAll(buttonSelector))
            .map((node, index) => ({ node, index }))
            .filter((entry) => isVisible(entry.node))
            .map((entry) => {
                const element = entry.node as HTMLElement;
                const rect = element.getBoundingClientRect();
                const text = normalize(element.innerText || element.textContent || element.getAttribute('aria-label'));
                return { index: entry.index, text, rect };
            })
            .filter((entry) => filterLabels.some((label) => entry.text.includes(label)));

        if (!candidates.length) return null;

        const best = candidates.sort((left, right) => {
            const leftDistance = Math.abs(left.rect.top - anchorTop);
            const rightDistance = Math.abs(right.rect.top - anchorTop);
            return leftDistance - rightDistance;
        })[0];

        return {
            index: best.index,
            text: best.text,
            x: Math.round(best.rect.left + (best.rect.width / 2)),
            y: Math.round(best.rect.top + (best.rect.height / 2)),
        };
    }, {
        buttonSelector: FILTER_BUTTON_SELECTOR,
        commentSelector: COMMENT_ARTICLE_SELECTOR,
        headingSelector: COMMENT_HEADING_SELECTOR,
        filterLabels: FILTER_LABELS,
        headingLabels: COMMENT_HEADING_LABELS,
    }).catch(() => null);
};

const locateAllCommentsOption = async (page: Page, anchor: PointCandidate): Promise<PointTarget | null> => {
    return page.evaluate(({ anchorX, anchorY, targetLabels }) => {
        const normalize = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim().toLowerCase();
        const isVisible = (element: Element | null): element is HTMLElement => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const selectors = ['[role="menuitemradio"]', '[role="menuitem"]', '[role="option"]', '[role="button"]', 'a', 'li', 'span'];
        const seen = new Set<HTMLElement>();
        const matches: Array<{ text: string; x: number; y: number; score: number }> = [];

        for (const selector of selectors) {
            for (const node of Array.from(document.querySelectorAll(selector))) {
                if (!isVisible(node)) continue;

                const current = node as HTMLElement;
                if (seen.has(current)) continue;
                seen.add(current);

                const text = normalize(current.innerText || current.textContent || current.getAttribute('aria-label'));
                if (!targetLabels.some((label) => text.includes(label))) continue;

                const clickable = current.closest('[role="menuitemradio"], [role="menuitem"], [role="option"], [role="button"], a, li') as HTMLElement | null;
                const target = clickable && isVisible(clickable) ? clickable : current;
                const rect = target.getBoundingClientRect();
                const x = Math.round(rect.left + (rect.width / 2));
                const y = Math.round(rect.top + (rect.height / 2));
                const penalty = y < anchorY - 24 ? 400 : 0;
                const score = Math.abs(x - anchorX) + Math.abs(y - anchorY) + penalty;
                matches.push({ text, x, y, score });
            }
        }

        if (!matches.length) return null;
        matches.sort((left, right) => left.score - right.score);
        return { text: matches[0].text, x: matches[0].x, y: matches[0].y };
    }, {
        anchorX: anchor.x,
        anchorY: anchor.y,
        targetLabels: TARGET_FILTER_LABELS,
    }).catch(() => null);
};

const clickPoint = async (page: Page, point: { x: number; y: number }): Promise<void> => {
    await page.mouse.move(point.x, point.y).catch(() => undefined);
    await page.mouse.click(point.x, point.y, { delay: 120 }).catch(() => undefined);
};

const isAllCommentsSelected = async (page: Page): Promise<boolean> => {
    const candidate = await locateFilterCandidate(page);
    if (!candidate) return false;
    return hasAnyLabel(normalizeText(candidate.text), TARGET_FILTER_LABELS);
};

export const switchToAllComments = async (page: Page): Promise<boolean> => {
    log.info('🔄 Attempting to set filter to "All comments"...');

    if (await isAllCommentsSelected(page)) {
        log.info('✅ Filter is already set to "All comments"!');
        return true;
    }

    for (let attempt = 0; attempt < 6; attempt++) {
        log.debug(`All-comments switch attempt ${attempt + 1}/6`);
        const candidate = await locateFilterCandidate(page);
        if (!candidate) {
            log.debug('Could not locate comments filter button in viewport yet.');
            await page.mouse.wheel(0, -900).catch(() => undefined);
            await page.waitForTimeout(350);
            continue;
        }

        log.debug(`Filter candidate found: "${candidate.text}" at (${candidate.x}, ${candidate.y})`);

        const filterButtons = page.locator(FILTER_BUTTON_SELECTOR);
        const button = filterButtons.nth(candidate.index);
        await button.scrollIntoViewIfNeeded().catch(() => undefined);
        await button.click({ force: true, delay: 120 }).catch(() => undefined);
        await clickPoint(page, candidate);
        await page.waitForTimeout(450);

        const option = await locateAllCommentsOption(page, candidate);
        if (option) {
            log.debug(`All-comments menu option found: "${option.text}" at (${option.x}, ${option.y})`);
            await clickPoint(page, option);
            await page.waitForTimeout(900);
            if (await isAllCommentsSelected(page)) {
                log.info('✅ Filter set to "All comments"!');
                return true;
            }
        }

        await page.keyboard.press('Escape').catch(() => undefined);
        await page.waitForTimeout(250);
    }

    log.warning('⚠️ Failed to switch the filter to "All comments".');
    return false;
};
