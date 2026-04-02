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
