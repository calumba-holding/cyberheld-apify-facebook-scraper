import type { Locator } from 'playwright';

const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

interface PostContentCandidate {
    text: string;
    top: number;
}

const compareCandidates = (left: PostContentCandidate, right: PostContentCandidate, preferredY?: number): number => {
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
};

export const extractPostContent = async (scope: Locator, anchorY?: number): Promise<string | undefined> => {
    const messages = scope.locator('[data-ad-preview="message"]');
    const messageCount = await messages.count();
    const candidates: PostContentCandidate[] = [];

    for (let index = 0; index < messageCount; index++) {
        const message = messages.nth(index);
        if (!(await message.isVisible().catch(() => false))) continue;

        const text = cleanText((await message.textContent().catch(() => '')) || '');
        if (text.length <= 20) continue;

        const box = await message.boundingBox();
        if (!box) continue;
        candidates.push({ text, top: box.y });
    }

    candidates.sort((left, right) => compareCandidates(left, right, anchorY));
    return candidates[0]?.text;
};
