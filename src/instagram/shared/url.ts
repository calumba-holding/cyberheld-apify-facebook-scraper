const INSTAGRAM_HOST_PATTERN = /(^|\.)instagram\.com$/i;

export const isInstagramHost = (url: string): boolean => {
    try {
        return INSTAGRAM_HOST_PATTERN.test(new URL(url).hostname);
    } catch {
        return false;
    }
};

export const isInstagramLoginOrChallengeUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        if (!isInstagramHost(url)) return false;
        const path = parsed.pathname.toLowerCase();
        return path.startsWith('/accounts/login')
            || path.startsWith('/challenge/')
            || path.startsWith('/consent/');
    } catch {
        return false;
    }
};

export const isInstagramPostOrReelUrl = (url: string): boolean => {
    try {
        const parsed = new URL(url);
        if (!isInstagramHost(url)) return false;
        return /^\/(p|reel|reels|tv)\/[^/]+\/?$/i.test(parsed.pathname);
    } catch {
        return false;
    }
};

export const extractInstagramShortcode = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        if (!isInstagramHost(url)) return null;
        const match = parsed.pathname.match(/^\/(?:p|reel|reels|tv)\/([^/?#]+)\/?$/i);
        return match?.[1] ?? null;
    } catch {
        return null;
    }
};

export const buildInstagramPostUrl = (shortcode: string): string => (
    `https://www.instagram.com/p/${shortcode}/`
);
