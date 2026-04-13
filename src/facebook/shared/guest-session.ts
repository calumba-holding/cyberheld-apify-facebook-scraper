import type { Frame, Page } from 'playwright';

import { log } from '../../common/logger.js';

const randomBetween = (min: number, max: number): number => Math.round(min + (Math.random() * (max - min)));

const PRIMARY_DISMISS_PATTERNS = [
    /allow all cookies/i,
    /accept all/i,
    /accept essential and optional cookies/i,
    /allow essential and optional cookies/i,
    /alle cookies erlauben/i,
    /optional cookies ablehnen/i,
    /nur erforderliche cookies/i,
] as const;

const SECONDARY_DISMISS_PATTERNS = [
    /close/i,
    /schließen/i,
    /not now/i,
    /jetzt nicht/i,
    /dismiss/i,
] as const;

const normalizeText = (value: string | null | undefined): string => value?.replace(/\s+/g, ' ').trim() ?? '';

const tryClickMatchingControlInFrame = async (
    frame: Frame,
    patterns: readonly RegExp[],
): Promise<boolean> => {
    const controls = frame.locator('button, [role="button"], a[role="button"]');

    for (let index = 0; index < await controls.count(); index++) {
        const control = controls.nth(index);
        if (!(await control.isVisible().catch(() => false))) continue;

        const label = normalizeText([
            await control.textContent().catch(() => ''),
            await control.getAttribute('aria-label').catch(() => ''),
            await control.getAttribute('title').catch(() => ''),
        ].join(' '));
        if (!label) continue;
        if (!patterns.some((pattern) => pattern.test(label))) continue;

        await control.scrollIntoViewIfNeeded().catch(() => undefined);
        const clicked = await control.click({ delay: 120, force: true }).then(() => true).catch(() => false);
        if (!clicked) continue;

        await frame.page().waitForTimeout(700);
        return true;
    }

    return false;
};

const tryDismissGuestUi = async (page: Page, patterns: readonly RegExp[]): Promise<boolean> => {
    for (const frame of page.frames()) {
        const clicked = await tryClickMatchingControlInFrame(frame, patterns);
        if (clicked) return true;
    }

    return false;
};

export const prepareFacebookPublicPage = async (page: Page): Promise<void> => {
    log.info('Preparing Facebook public session page.');
    await page.waitForTimeout(1000);

    let changed = false;
    for (let attempt = 0; attempt < 4; attempt++) {
        const clickedPrimary = await tryDismissGuestUi(page, PRIMARY_DISMISS_PATTERNS);
        const clickedSecondary = !clickedPrimary && await tryDismissGuestUi(page, SECONDARY_DISMISS_PATTERNS);
        if (!clickedPrimary && !clickedSecondary) break;
        changed = true;
    }

    await page.keyboard.press('Escape').catch(() => undefined);
    if (changed) await page.waitForTimeout(700);
};

export const warmFacebookPublicSession = async (
    page: Page,
    landingUrl: string,
    timeoutMs: number,
): Promise<void> => {
    log.info('Warming Facebook public session before target navigation.');
    await page.goto(landingUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    await prepareFacebookPublicPage(page);
    await page.mouse.move(randomBetween(80, 240), randomBetween(120, 260), { steps: randomBetween(8, 18) }).catch(() => undefined);
    await page.waitForTimeout(randomBetween(350, 900));
    await page.mouse.wheel(0, randomBetween(160, 520)).catch(() => undefined);
    await page.waitForTimeout(randomBetween(300, 700));
};

export const prepareFacebookGuestPage = prepareFacebookPublicPage;
