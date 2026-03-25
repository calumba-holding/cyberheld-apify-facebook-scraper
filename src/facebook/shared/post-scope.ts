import { log } from '../../common/logger.js';
import { findTargetPostRoot } from '../post-root.js';
import type { Locator, Page } from 'playwright';

export const resolvePostScope = async (page: Page, targetUrl: string): Promise<Locator> => {
    const root = await findTargetPostRoot(page, targetUrl);
    if (!root) {
        log.warning('Could not isolate the target Facebook post container. Falling back to page scope.');
        return page.locator('body');
    }

    log.info('Scoped extraction to the target Facebook post container.');
    return root;
};
