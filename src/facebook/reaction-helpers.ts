import type { Locator, Page } from 'playwright';

export const normalizeProfileUrl = (rawUrl: string): string => {
    try {
        const url = new URL(rawUrl);
        url.hash = '';
        url.hostname = 'www.facebook.com';

        const storyOwnerId = url.pathname.match(/^\/stories\/(\d+)/)?.[1];
        if (storyOwnerId) {
            return `https://www.facebook.com/profile.php?id=${storyOwnerId}`;
        }

        if (url.pathname.toLowerCase() === '/profile.php') {
            const profileId = url.searchParams.get('id');
            return profileId
                ? `https://www.facebook.com/profile.php?id=${profileId}`
                : 'https://www.facebook.com/profile.php';
        }

        const firstPath = url.pathname.split('/').filter(Boolean)[0];
        if (firstPath) return `https://www.facebook.com/${firstPath}`;
        return 'https://www.facebook.com/';
    } catch {
        return rawUrl;
    }
};

export const dispatchDomClick = async (button: Locator): Promise<void> => {
    await button.evaluate((element) => {
        const node = element as HTMLElement;
        node.scrollIntoView({ block: 'center', inline: 'center' });
        node.focus?.();
        const mouse = { bubbles: true, cancelable: true, view: window };
        const pointer = { ...mouse, pointerId: 1, pointerType: 'mouse', isPrimary: true };
        node.dispatchEvent(new PointerEvent('pointerdown', pointer));
        node.dispatchEvent(new MouseEvent('mousedown', mouse));
        node.dispatchEvent(new PointerEvent('pointerup', pointer));
        node.dispatchEvent(new MouseEvent('mouseup', mouse));
        node.dispatchEvent(new MouseEvent('click', mouse));
    });
};

export const scrollReactionModal = async (modal: Locator, page: Page): Promise<boolean> => {
    const scrolled = await modal.evaluate((dialog) => {
        const containers = Array.from(dialog.querySelectorAll<HTMLElement>('div'))
            .filter((node) => node.scrollHeight > node.clientHeight + 20)
            .sort((left, right) => (right.scrollHeight - right.clientHeight) - (left.scrollHeight - left.clientHeight));
        const target = containers[0];
        if (!target) return false;
        const previousTop = target.scrollTop;
        target.scrollTop = previousTop + Math.max(target.clientHeight * 0.8, 300);
        return target.scrollTop > previousTop;
    });

    if (scrolled) return true;

    const box = await modal.boundingBox();
    if (!box) return false;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, 1200);
    return true;
};
