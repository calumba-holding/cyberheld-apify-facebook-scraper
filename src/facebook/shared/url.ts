const FACEBOOK_HOST_PATTERN = /(^|\.)facebook\.com$/i;
const GENERIC_FACEBOOK_PATH_SEGMENTS = new Set(['watch', 'posts', 'videos', 'permalink', 'story.php', 'photo.php', 'photos', 'reel']);

const normalizeFacebookPath = (value: string): string => {
    const normalized = value.replace(/\/+$/, '');
    return normalized || '/';
};

const getFacebookPathSegments = (url: string): string[] => {
    try {
        return new URL(url).pathname.split('/').map((segment) => segment.trim()).filter(Boolean);
    } catch {
        return [];
    }
};

const isFacebookHost = (hostname: string): boolean => FACEBOOK_HOST_PATTERN.test(hostname);

const extractFacebookTargetToken = (url: string): string | null => {
    try {
        const videoId = extractFacebookVideoId(url);
        if (videoId) return videoId;

        const segments = getFacebookPathSegments(url);
        for (let index = segments.length - 1; index >= 0; index--) {
            const segment = segments[index];
            if (!segment || GENERIC_FACEBOOK_PATH_SEGMENTS.has(segment.toLowerCase())) continue;
            return segment;
        }

        return null;
    } catch {
        return null;
    }
};

export const sanitizeFacebookPostUrl = (url: string): string => {
    try {
        const parsed = new URL(url);
        parsed.searchParams.delete('rdid');
        parsed.searchParams.delete('share_url');
        return parsed.toString();
    } catch {
        return url;
    }
};

export const extractCommentIdFromFacebookUrl = (url: string): string | null => {
    try {
        const commentId = new URL(url).searchParams.get('comment_id')?.trim();
        return commentId ? commentId : null;
    } catch {
        return null;
    }
};

const normalizeFacebookNumericId = (value: string | null | undefined): string | null => {
    const normalized = value?.trim();
    return normalized && /^\d+$/.test(normalized) ? normalized : null;
};

export const extractFacebookVideoId = (url: string): string | null => {
    try {
        const parsed = new URL(url);
        const queryVideoId = normalizeFacebookNumericId(parsed.searchParams.get('v'));
        if (queryVideoId) return queryVideoId;

        const videoMatch = parsed.pathname.match(/\/videos\/([^/?#]+)\/?/i);
        return normalizeFacebookNumericId(videoMatch?.[1]);
    } catch {
        return null;
    }
};

export const isFacebookVideoUrl = (url: string): boolean => extractFacebookVideoId(url) !== null;

export const extractFacebookPageRootUrl = (url: string): string | null => {
    try {
        const parsed = new URL(sanitizeFacebookPostUrl(url));
        if (!isFacebookHost(parsed.hostname)) return null;

        const firstSegment = getFacebookPathSegments(parsed.toString())[0];
        if (!firstSegment || GENERIC_FACEBOOK_PATH_SEGMENTS.has(firstSegment.toLowerCase())) return null;

        return `${parsed.protocol}//${parsed.host}/${firstSegment}`;
    } catch {
        return null;
    }
};

export const isEquivalentFacebookTargetUrl = (expectedUrl: string, actualUrl: string): boolean => {
    const sanitizedExpected = sanitizeFacebookPostUrl(expectedUrl);
    const sanitizedActual = sanitizeFacebookPostUrl(actualUrl);
    if (sanitizedExpected === sanitizedActual) return true;

    try {
        const expected = new URL(sanitizedExpected);
        const actual = new URL(sanitizedActual);
        if (!isFacebookHost(expected.hostname) || !isFacebookHost(actual.hostname)) return false;

        const expectedPath = normalizeFacebookPath(expected.pathname);
        const actualPath = normalizeFacebookPath(actual.pathname);
        if (expectedPath !== '/' && expectedPath === actualPath) {
            const expectedVideoId = extractFacebookVideoId(sanitizedExpected);
            const actualVideoId = extractFacebookVideoId(sanitizedActual);
            const expectedCommentId = extractCommentIdFromFacebookUrl(sanitizedExpected);
            const actualCommentId = extractCommentIdFromFacebookUrl(sanitizedActual);

            if ((!expectedVideoId || expectedVideoId === actualVideoId)
                && (!expectedCommentId || !actualCommentId || expectedCommentId === actualCommentId)) {
                return true;
            }
        }

        const expectedTargetToken = extractFacebookTargetToken(sanitizedExpected);
        const actualTargetToken = extractFacebookTargetToken(sanitizedActual);
        return Boolean(expectedTargetToken && actualTargetToken && expectedTargetToken === actualTargetToken);
    } catch {
        return false;
    }
};

export const isFacebookLoginOrHomeUrl = (url: string): boolean => {
    try {
        const parsed = new URL(sanitizeFacebookPostUrl(url));
        if (!isFacebookHost(parsed.hostname)) return false;

        const normalizedPath = normalizeFacebookPath(parsed.pathname).toLowerCase();
        return normalizedPath === '/'
            || normalizedPath === '/login'
            || normalizedPath === '/login.php'
            || normalizedPath.startsWith('/checkpoint/')
            || normalizedPath.startsWith('/recover/');
    } catch {
        return false;
    }
};

export const resolveFacebookPostUrl = async (url: string): Promise<string> => {
    let current = url;
    for (let redirect = 0; redirect < 5; redirect++) {
        try {
            const response = await fetch(current, { method: 'HEAD', redirect: 'manual' });
            if (response.status < 300 || response.status >= 400) return sanitizeFacebookPostUrl(current);

            const location = response.headers.get('location');
            if (!location) return sanitizeFacebookPostUrl(current);
            current = new URL(location, current).toString();
        } catch {
            return sanitizeFacebookPostUrl(current);
        }
    }

    return sanitizeFacebookPostUrl(current);
};
