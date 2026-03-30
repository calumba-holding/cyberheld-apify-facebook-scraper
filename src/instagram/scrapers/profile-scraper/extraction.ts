import type { Page } from 'playwright';

import type { ProfileCounts, ProfileData } from '../../../common/types.js';
import { parseInstagramCount } from '../../post-extraction.js';
import { PROFILE_HEADER_SELECTOR } from '../../selectors.js';

const TITLE_WITH_DISPLAY_PATTERN = /^(.*?)\s*\(@([A-Za-z0-9._]+)\)\s*[•-]\s*Instagram/i;
const TITLE_WITH_BIO_PATTERN = /^@([A-Za-z0-9._]+)\s+on Instagram:\s+"([\s\S]+)"$/i;
const META_COUNTS_PATTERN = /([\d.,KMB]+)\s+Followers,\s+([\d.,KMB]+)\s+Following,\s+([\d.,KMB]+)\s+Posts/i;

const cleanText = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();

const parseCountsFromMeta = (description: string | undefined): ProfileCounts => {
    if (!description) return {};
    const match = description.match(META_COUNTS_PATTERN);
    if (!match) return {};

    return {
        followers: parseInstagramCount(match[1]),
        following: parseInstagramCount(match[2]),
        posts: parseInstagramCount(match[3]),
    };
};

const parseTitle = (title: string | undefined): Partial<ProfileData> => {
    if (!title) return {};
    const withDisplay = title.match(TITLE_WITH_DISPLAY_PATTERN);
    if (withDisplay) {
        return {
            username: withDisplay[2],
            displayName: cleanText(withDisplay[1]) || undefined,
        };
    }

    const withBio = title.match(TITLE_WITH_BIO_PATTERN);
    if (withBio) {
        return {
            username: withBio[1],
            bio: cleanText(withBio[2]) || undefined,
        };
    }

    return {};
};

const parseProfileCountLabel = (label: string): Partial<ProfileCounts> => {
    const normalized = cleanText(label);
    const match = normalized.match(/^([\d.,KMB]+)\s+(posts?|followers?|following)$/i);
    if (!match) return {};

    const count = parseInstagramCount(match[1]);
    if (count === undefined) return {};
    const noun = match[2].toLowerCase();
    if (noun.startsWith('post')) return { posts: count };
    if (noun.startsWith('follower')) return { followers: count };
    return { following: count };
};

type ProfileDomSnapshot = {
    canonicalUrl: string;
    title?: string;
    metaDescription?: string;
    headerTexts: string[];
    countLabels: string[];
    profilePictureUrl?: string;
    externalLinks: string[];
    verified: boolean;
    private: boolean;
};

const collectDomSnapshot = async (page: Page): Promise<ProfileDomSnapshot> => {
    return page.evaluate((headerSelector) => {
        const clean = (value: string | null | undefined): string => (value || '').replace(/\s+/g, ' ').trim();
        const header = document.querySelector<HTMLElement>(headerSelector);
        const headerTexts = header
            ? Array.from(header.querySelectorAll<HTMLElement>('h1, h2, span, div, a'))
                .map((element) => clean(element.innerText || element.textContent))
                .filter(Boolean)
            : [];
        const countLabels = headerTexts.filter((text) => /^\d[\d.,KMB]*\s+(posts?|followers?|following)$/i.test(text));
        const externalLinks = header
            ? Array.from(header.querySelectorAll<HTMLAnchorElement>('a[href]'))
                .map((link) => link.href)
                .filter((href) => /^https?:\/\//i.test(href) && !href.startsWith('https://www.instagram.com/'))
            : [];
        const profilePictureUrl = header?.querySelector<HTMLImageElement>('img')?.src;
        const verified = Boolean(
            header?.querySelector('svg[aria-label="Verified"]')
            || Array.from(header?.querySelectorAll('svg title') || []).some((title) => clean(title.textContent) === 'Verified'),
        );
        const privateText = clean(document.body.innerText);
        const isPrivate = /this account is private/i.test(privateText);

        return {
            canonicalUrl: document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href || window.location.href,
            title: document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content
                || document.querySelector<HTMLTitleElement>('title')?.text
                || undefined,
            metaDescription: document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content
                || document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content
                || undefined,
            headerTexts,
            countLabels,
            profilePictureUrl,
            externalLinks,
            verified,
            private: isPrivate,
        };
    }, PROFILE_HEADER_SELECTOR);
};

const pickVisibleUsername = (snapshot: ProfileDomSnapshot, fallbackUrl: string): string | undefined => {
    const pathnameSource = snapshot.canonicalUrl || fallbackUrl;
    try {
        const pathname = new URL(pathnameSource).pathname;
        const match = pathname.match(/^\/([A-Za-z0-9._]+)\/?$/);
        return match?.[1];
    } catch {
        return undefined;
    }
};

const pickDisplayName = (snapshot: ProfileDomSnapshot, username: string | undefined): string | undefined => {
    return snapshot.headerTexts.find((text) => {
        if (!text) return false;
        if (text === username) return false;
        if (/^\d[\d.,KMB]*\s+(posts?|followers?|following)$/i.test(text)) return false;
        if (/^(Follow|Following|Message|Contact)$/i.test(text)) return false;
        return text.length > 1;
    });
};

const pickBio = (snapshot: ProfileDomSnapshot, username: string | undefined, displayName: string | undefined, titleBio: string | undefined): string | undefined => {
    if (titleBio) return titleBio;
    return snapshot.headerTexts.find((text) => {
        if (!text) return false;
        if (text === username || text === displayName) return false;
        if (/^\d[\d.,KMB]*\s+(posts?|followers?|following)$/i.test(text)) return false;
        if (/^(Follow|Following|Message|Contact)$/i.test(text)) return false;
        if (/^https?:\/\//i.test(text)) return false;
        return text.length > 8;
    });
};

export const extractInstagramProfileData = async (page: Page, fallbackUrl: string): Promise<ProfileData> => {
    const snapshot = await collectDomSnapshot(page);
    const parsedTitle = parseTitle(snapshot.title);
    const metaCounts = parseCountsFromMeta(snapshot.metaDescription);
    const visibleCounts = snapshot.countLabels.reduce<ProfileCounts>((counts, label) => ({ ...counts, ...parseProfileCountLabel(label) }), {});
    const username = parsedTitle.username || pickVisibleUsername(snapshot, fallbackUrl);
    const displayName = parsedTitle.displayName || pickDisplayName(snapshot, username);
    const bio = pickBio(snapshot, username, displayName, parsedTitle.bio);

    return {
        url: snapshot.canonicalUrl || fallbackUrl,
        username,
        displayName,
        bio,
        profilePictureUrl: snapshot.profilePictureUrl,
        externalLinks: Array.from(new Set(snapshot.externalLinks)),
        counts: {
            posts: visibleCounts.posts ?? metaCounts.posts,
            followers: visibleCounts.followers ?? metaCounts.followers,
            following: visibleCounts.following ?? metaCounts.following,
        },
        indicators: {
            verified: snapshot.verified,
            private: snapshot.private,
        },
    };
};
