export const PROFILE_PICTURE_SELECTOR = 'a[aria-label^="Profile picture of"]';

export const COMMENT_SELECTOR = [
    'div[role="article"][aria-label^="Comment by"]',
    'div[role="article"][aria-label^="Reply by"]',
    'div[role="article"][aria-label^="Kommentar von"]',
    'div[role="article"][aria-label^="Antwort von"]',
    'div[role="article"]:has(a[href*="comment_id="])',
    'div[role="article"]:has(a[href*="reply_comment_id="])',
].join(', ');
export const COMMENTS_HEADING_SELECTOR = 'h2, h3';
export const COMMENT_ARTICLE_SELECTOR = COMMENT_SELECTOR;
export const COMMENT_HEADING_SELECTOR = 'h1, h2, h3, [role="heading"]';
export const FILTER_BUTTON_SELECTOR = '[role="button"][aria-haspopup="menu"], [role="button"][aria-expanded], [role="button"]';

export const POST_REACTION_BUTTON_SELECTOR = [
    '[role="button"][aria-label*=":"][aria-label*=" people"]',
    '[role="button"][aria-label*=":"][aria-label*=" person"]',
    '[role="button"][aria-label*=":"][aria-label*=" Personen"]',
    '[role="button"][aria-label*=":"][aria-label*=" Person"]',
].join(', ');

export const REACTION_MODAL_SELECTOR = 'div[role="dialog"]:visible';
export const REACTION_MODAL_READY_SELECTOR = [
    '[role="tab"]',
    'a[aria-label^="Profile picture of"]',
    '[aria-label="Close"][role="button"]',
    '[aria-label="Schließen"][role="button"]',
    '[aria-label="Bei Facebook anmelden"][role="button"]',
    '[aria-label="Log in to Facebook"][role="button"]',
].join(', ');
export const COMMENT_REACTION_BUTTON_SELECTOR = '[role="button"][aria-label*="reaction; see who reacted to this"], [role="button"][aria-label*="reactions; see who reacted to this"]';
