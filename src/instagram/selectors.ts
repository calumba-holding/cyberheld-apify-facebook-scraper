export const COMMENT_PERMALINK_SELECTOR = 'a[href*="/c/"]';
export const LOAD_MORE_COMMENTS_LABEL = 'Load more comments';
export const COUNT_BUTTON_SELECTOR = 'main span[role="button"], main div[role="button"]';
export const DIALOG_SELECTOR = '[role="dialog"]';
export const PROFILE_HEADER_SELECTOR = 'main header, header';
export const COMMENT_LIST_SELECTOR = 'ul._a9ym, ul._a9z6';

/** Playwright accessible-name filter for reply-thread expanders. */
export const VIEW_REPLIES_BUTTON_NAME = /View(?: all)? \d+ repl|View repl(?:y|ies) \(\d+\)|View \d+ repl|Antworten anzeigen|Antworten anzeigen \(\d+\)|\d+ Antworten anzeigen/i;

/** @deprecated Use matchesViewRepliesLabel() or VIEW_REPLIES_BUTTON_NAME. */
export const VIEW_REPLIES_PATTERN = /^View (?:all )?\d+ repl(?:y|ies)|^View repl(?:y|ies) \(\d+\)$/i;

const VIEW_REPLIES_LABEL_PATTERNS = [
    /^View all \d+ repl(?:y|ies)$/i,
    /^View repl(?:y|ies) \(\d+\)$/i,
    /^View \d+ repl(?:y|ies)$/i,
    /^View more repl(?:y|ies)$/i,
    /^View previous repl(?:y|ies)$/i,
    /^Load more repl(?:y|ies)$/i,
    /^Alle \d+ Antworten anzeigen$/i,
    /^Antworten anzeigen \(\d+\)$/i,
    /^\d+ Antworten anzeigen$/i,
    /^Hide repl(?:y|ies)$/i,
    /^Antworten ausblenden$/i,
];

export const matchesViewRepliesLabel = (raw: string): boolean => {
    const text = raw.replace(/\s+/g, ' ').trim();
    return VIEW_REPLIES_LABEL_PATTERNS.some((pattern) => pattern.test(text));
};

export const isInstagramCommentPermalink = (href: string): boolean => (
    /\/(?:p|reel|reels|tv)\/[^/]+\/c\/[^/?#]+/i.test(href)
);
