import type { Locator } from 'playwright';

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

export const extractPostContent = async (scope: Locator, anchorY?: number): Promise<string | undefined> => {
    const candidates = await scope.locator('[data-ad-preview="message"]').evaluateAll((nodes, preferredY) => {
        const isVisible = (element: Element): element is HTMLElement => {
            if (!(element instanceof HTMLElement)) return false;
            const style = window.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
        };

        return nodes
            .filter((node) => isVisible(node))
            .map((node) => {
                const element = node as HTMLElement;
                return {
                    text: (element.innerText || element.textContent || '').replace(/\s+/g, ' ').trim(),
                    top: element.getBoundingClientRect().top,
                };
            })
            .filter((entry) => entry.text.length > 20)
            .sort((left, right) => {
                if (typeof preferredY === 'number') {
                    const leftAboveAnchor = left.top <= preferredY;
                    const rightAboveAnchor = right.top <= preferredY;
                    if (leftAboveAnchor !== rightAboveAnchor) return leftAboveAnchor ? -1 : 1;
                    if (leftAboveAnchor && rightAboveAnchor && left.top !== right.top) return right.top - left.top;
                    const leftDistance = Math.abs(left.top - preferredY);
                    const rightDistance = Math.abs(right.top - preferredY);
                    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
                }
                if (left.top !== right.top) return left.top - right.top;
                return right.text.length - left.text.length;
            });
    }, anchorY);

    return candidates[0]?.text ? cleanText(candidates[0].text) : undefined;
};
