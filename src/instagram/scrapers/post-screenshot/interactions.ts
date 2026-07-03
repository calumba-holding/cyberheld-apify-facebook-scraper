import type { Locator, Page } from 'playwright';

import { log } from '../../../common/logger.js';
import { COUNT_BUTTON_SELECTOR, DIALOG_SELECTOR } from '../../selectors.js';

export const INSTAGRAM_EVIDENCE_VIEWPORT = { width: 1280, height: 900 };

const COMMENT_ICON_SELECTOR = [
    'svg[aria-label="Comment"]',
    'svg[aria-label="Kommentar"]',
    'svg[aria-label="Comentario"]',
    'svg[aria-label="Commentaire"]',
].join(', ');

const isReelOrTvPath = (pathname: string): boolean => (
    /^\/(?:reel|reels|tv)\//i.test(pathname)
);

export const ensureInstagramPostLayout = async (page: Page, shortcode: string | null): Promise<void> => {
    if (!shortcode) return;

    let pathname = '';
    try {
        pathname = new URL(page.url()).pathname;
    } catch {
        return;
    }

    if (!isReelOrTvPath(pathname)) return;

    const postUrl = `https://www.instagram.com/p/${shortcode}/`;
    log.info(`Reel/TV layout detected; opening desktop post view: ${postUrl}`);
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
};

export const hasCommentsSurface = async (page: Page): Promise<boolean> => {
    const dialog = page.locator(DIALOG_SELECTOR).first();
    if (await dialog.isVisible().catch(() => false)) return true;

    const list = page.locator('ul._a9ym, ul._a9z6').first();
    if (await list.isVisible().catch(() => false)) return true;

    const permalinkCount = await page.locator('a[href*="/p/"][href*="/c/"]').count().catch(() => 0);
    return permalinkCount > 0;
};

const clickCommentCountButton = async (page: Page): Promise<boolean> => {
    const index = await page.locator(COUNT_BUTTON_SELECTOR).evaluateAll((nodes) => {
        const clean = (value: string): string => value.replace(/\s+/g, ' ').trim();
        const candidates = nodes.map((node, nodeIndex) => ({
            index: nodeIndex,
            text: clean(node.textContent || ''),
            top: node.getBoundingClientRect().top,
            isCommentCount: /(^|\s)\d[\d.,]*\s*[KMB]?\s+comments?$/i.test(clean(node.textContent || '')),
            isNumericOnly: /^\d[\d.,]*[KMB]?$/i.test(clean(node.textContent || '')),
        }));

        const commentLabel = candidates.find((entry) => entry.isCommentCount);
        if (commentLabel) return commentLabel.index;

        const numeric = candidates
            .filter((entry) => entry.isNumericOnly)
            .sort((left, right) => left.top - right.top);
        return numeric[1]?.index ?? numeric[0]?.index ?? null;
    }).catch(() => null);

    if (index === null) return false;

    const button = page.locator(COUNT_BUTTON_SELECTOR).nth(index);
    if (!(await button.isVisible().catch(() => false))) return false;

    await button.scrollIntoViewIfNeeded().catch(() => undefined);
    await button.click({ timeout: 5000 }).catch(async () => {
        await button.evaluate((node) => (node as HTMLElement).click());
    });
    return true;
};

const clickCommentControlInRoot = async (root: Locator): Promise<boolean> => {
    const section = root.locator('section').filter({ has: root.page().locator(COMMENT_ICON_SELECTOR) }).first();
    if (await section.count() === 0) return false;

    const commentIcon = section.locator(COMMENT_ICON_SELECTOR).first();
    if (await commentIcon.count() === 0) return false;

    const iconButton = commentIcon.locator('xpath=ancestor::*[@role="button" or self::button][1]').first();
    const buttons = section.locator('[role="button"], button');
    const buttonCount = await buttons.count();

    for (let index = 0; index < buttonCount; index++) {
        const button = buttons.nth(index);
        const hasIcon = await button.locator(COMMENT_ICON_SELECTOR).count() > 0;
        if (!hasIcon) continue;

        const next = buttons.nth(index + 1);
        if (await next.count() > 0) {
            const nextText = ((await next.textContent().catch(() => '')) || '').replace(/\s+/g, '').trim();
            if (/^\d/.test(nextText)) {
                await next.click({ timeout: 5000, force: true }).catch(() => undefined);
                return true;
            }
        }

        await iconButton.click({ timeout: 5000, force: true }).catch(() => undefined);
        return true;
    }

    return false;
};

export const openInstagramCommentsPanel = async (page: Page, root: Locator): Promise<boolean> => {
    if (await hasCommentsSurface(page)) {
        log.info('Instagram comments surface already visible.');
        return true;
    }

    const attempts: Array<{ name: string; run: () => Promise<boolean> }> = [
        {
            name: 'comment-count-button',
            run: () => clickCommentCountButton(page),
        },
        {
            name: 'post-section',
            run: () => clickCommentControlInRoot(root),
        },
        {
            name: 'main-section',
            run: () => clickCommentControlInRoot(page.locator('main').first()),
        },
        {
            name: 'comment-icon',
            run: async () => {
                const icon = page.locator(COMMENT_ICON_SELECTOR).first();
                if (!(await icon.isVisible().catch(() => false))) return false;
                const button = icon.locator('xpath=ancestor::*[@role="button" or self::button][1]').first();
                await button.click({ timeout: 5000, force: true }).catch(async () => {
                    await icon.click({ timeout: 5000, force: true });
                });
                return true;
            },
        },
        {
            name: 'view-all-comments',
            run: async () => {
                const viewAll = page.getByRole('button', { name: /view all .* comments?/i }).first();
                if (!(await viewAll.isVisible().catch(() => false))) return false;
                await viewAll.click({ timeout: 5000, force: true });
                return true;
            },
        },
    ];

    for (const attempt of attempts) {
        log.info(`Trying to open Instagram comments via ${attempt.name}...`);
        const clicked = await attempt.run();
        if (!clicked) continue;

        await page.waitForTimeout(1200);
        if (await hasCommentsSurface(page)) {
            log.info(`Instagram comments opened via ${attempt.name}.`);
            return true;
        }
    }

    return false;
};

export const dismissInstagramOverlays = async (page: Page): Promise<void> => {
    const labels = [
        'Allow all cookies',
        'Allow essential and optional cookies',
        'Decline optional cookies',
        'Only allow essential cookies',
        'Accept',
        'Alle Cookies erlauben',
        'Optionale Cookies ablehnen',
    ];

    for (const label of labels) {
        const button = page.getByRole('button', { name: label, exact: true });
        if (await button.first().isVisible().catch(() => false)) {
            await button.first().click({ timeout: 3000 }).catch(() => undefined);
            await page.waitForTimeout(400);
        }
    }

    await page.keyboard.press('Escape').catch(() => undefined);
};
