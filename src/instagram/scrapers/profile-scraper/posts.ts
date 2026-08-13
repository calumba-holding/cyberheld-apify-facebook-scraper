import type { Page } from 'playwright';

export type InstagramProfilePost = {
    url: string;
    shortcode?: string;
    type: 'post' | 'reel';
    thumbnailUrl?: string;
    description?: string;
};

export type InstagramProfilePostCollection = {
    posts: InstagramProfilePost[];
    discoveredLinks: number;
    sampleHrefs: string[];
};

const collectVisiblePosts = async (page: Page): Promise<{ posts: InstagramProfilePost[]; hrefs: string[] }> => page.evaluate(() => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
    const rows = links.filter((link) => /\/(p|reel|reels|tv)\/[^/?#]+/i.test(link.pathname));
    return {
      posts: rows.flatMap((link) => {
        const match = link.pathname.match(/\/(p|reel|reels|tv)\/([^/?#]+)/i);
        if (!match) return [];
        const image = link.querySelector<HTMLImageElement>('img');
        return [{
            url: link.href,
            shortcode: match[2],
            type: match[1].toLowerCase() === 'p' ? 'post' as const : 'reel' as const,
            thumbnailUrl: image?.src || undefined,
            description: image?.alt?.replace(/\s+/g, ' ').trim() || link.getAttribute('aria-label') || undefined,
        }];
      }),
      hrefs: links.map((link) => link.getAttribute('href') || link.href).filter(Boolean).slice(0, 30),
    };
});

export const collectInstagramProfilePosts = async (
    page: Page,
    maxPosts: number,
): Promise<InstagramProfilePostCollection> => {
    const posts = new Map<string, InstagramProfilePost>();
    const sampleHrefs = new Set<string>();
    let discoveredLinks = 0;
    let stableRounds = 0;

    for (let round = 0; round < 40 && posts.size < maxPosts && stableRounds < 5; round += 1) {
        const before = posts.size;
        const visible = await collectVisiblePosts(page);
        discoveredLinks = Math.max(discoveredLinks, visible.hrefs.length);
        visible.hrefs.forEach((href) => sampleHrefs.add(href));
        for (const post of visible.posts) {
            if (!posts.has(post.url)) posts.set(post.url, post);
            if (posts.size >= maxPosts) break;
        }
        stableRounds = posts.size === before ? stableRounds + 1 : 0;
        await page.evaluate(() => window.scrollBy(0, Math.max(window.innerHeight * 0.8, 600)));
        await page.waitForTimeout(750);
    }

    return {
        posts: Array.from(posts.values()).slice(0, maxPosts),
        discoveredLinks,
        sampleHrefs: Array.from(sampleHrefs).slice(0, 12),
    };
};
