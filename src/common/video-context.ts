import type { Page } from 'playwright';

import { log } from './logger.js';

export const slowlyScrollToTop = async (page: Page): Promise<void> => {
    const initialScrollY = await page.evaluate(() => window.scrollY).catch(() => 0);
    if (initialScrollY <= 0) return;

    log.info('Slowly scrolling back to the top to capture post context in the video.');
    for (let step = 0; step < 20; step++) {
        const currentScrollY = await page.evaluate(() => window.scrollY).catch(() => 0);
        if (currentScrollY <= 0) break;

        await page.mouse.wheel(0, -Math.min(900, Math.max(240, Math.ceil(currentScrollY / 3))));
        await page.waitForTimeout(250);
    }

    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => undefined);
    await page.waitForTimeout(900);
};
