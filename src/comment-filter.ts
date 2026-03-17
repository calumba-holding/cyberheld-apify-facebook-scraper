import { log } from 'apify';
import type { Page } from 'playwright';

const COMMENT_FILTER_OPTIONS = ['All comments', 'Most relevant', 'Top comments'];

const normalizeText = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();

const getCurrentFilterText = async (page: Page): Promise<string> => {
    return page.evaluate((options) => {
        const normalize = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();
        const isVisible = (element: Element | null): element is HTMLElement => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const pickFilterButton = (): HTMLElement | null => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
                .filter((node) => isVisible(node) && normalize(node.textContent) === 'Comments');

            for (const heading of headings) {
                let sibling = heading.previousElementSibling;
                while (sibling) {
                    const button = sibling.matches?.('[role="button"][aria-haspopup="menu"]')
                        ? sibling as HTMLElement
                        : sibling.querySelector<HTMLElement>('[role="button"][aria-haspopup="menu"]');
                    if (isVisible(button) && options.some((option) => normalize(button.textContent).includes(option))) return button;
                    sibling = sibling.previousElementSibling;
                }
            }

            for (const button of Array.from(document.querySelectorAll<HTMLElement>('[role="button"][aria-haspopup="menu"]'))) {
                if (!isVisible(button)) continue;
                if (options.some((option) => normalize(button.textContent).includes(option))) return button;
            }

            return null;
        };

        return normalize(pickFilterButton()?.textContent);
    }, COMMENT_FILTER_OPTIONS).catch(() => '');
};

const clickCommentsFilterButton = async (page: Page): Promise<boolean> => {
    return page.evaluate((options) => {
        const normalize = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();
        const isVisible = (element: Element | null): element is HTMLElement => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const clickElement = (element: HTMLElement): boolean => {
            element.click();
            element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
            return true;
        };

        const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4'))
            .filter((node) => isVisible(node) && normalize(node.textContent) === 'Comments');

        for (const heading of headings) {
            let sibling = heading.previousElementSibling;
            while (sibling) {
                const button = sibling.matches?.('[role="button"][aria-haspopup="menu"]')
                    ? sibling as HTMLElement
                    : sibling.querySelector<HTMLElement>('[role="button"][aria-haspopup="menu"]');
                if (isVisible(button) && options.some((option) => normalize(button.textContent).includes(option))) {
                    return clickElement(button);
                }
                sibling = sibling.previousElementSibling;
            }
        }

        for (const button of Array.from(document.querySelectorAll<HTMLElement>('[role="button"][aria-haspopup="menu"]'))) {
            if (!isVisible(button)) continue;
            if (options.some((option) => normalize(button.textContent).includes(option))) return clickElement(button);
        }

        return false;
    }, COMMENT_FILTER_OPTIONS).catch(() => false);
};

const clickFilterOption = async (page: Page, targetText: string): Promise<boolean> => {
    return page.evaluate((target) => {
        const normalize = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();
        const isVisible = (element: Element | null): element is HTMLElement => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        const selectors = [
            '[role="menuitemradio"]',
            '[role="menuitem"]',
            '[role="option"]',
            '[role="button"]',
            'span',
            'div',
        ];

        for (const selector of selectors) {
            for (const element of Array.from(document.querySelectorAll(selector))) {
                if (!isVisible(element)) continue;
                if (normalize(element.textContent) !== target) continue;

                const clickable = element.closest<HTMLElement>('[role="menuitemradio"], [role="menuitem"], [role="option"], [role="button"]')
                    || (element as HTMLElement);
                if (!isVisible(clickable)) continue;

                clickable.click();
                clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                return true;
            }
        }

        return false;
    }, targetText).catch(() => false);
};

export const switchToAllComments = async (page: Page): Promise<void> => {
    log.info('🔄 Attempting to set filter to "All comments"...');
    await page.waitForTimeout(2000);

    try {
        if ((await getCurrentFilterText(page)).includes('All comments')) {
            log.info('✅ Filter is already set to "All comments"!');
            return;
        }

        for (let attempt = 0; attempt < 4; attempt++) {
            const opened = await clickCommentsFilterButton(page);
            if (!opened) {
                await page.waitForTimeout(500);
                continue;
            }

            await page.waitForTimeout(900);
            await clickFilterOption(page, 'All comments');
            await page.waitForTimeout(1400);

            if ((await getCurrentFilterText(page)).includes('All comments')) {
                log.info('✅ Filter set to "All comments"!');
                await page.waitForTimeout(1500);
                return;
            }
        }

        log.warning('⚠️ Failed to switch the filter to "All comments".');
    } catch {
        log.info('ℹ️ Could not change filter, moving on.');
    }
};
