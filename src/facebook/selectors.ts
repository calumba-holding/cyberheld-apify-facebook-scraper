import { REACTION_LABELS } from './constants.js';

export const PROFILE_PICTURE_SELECTOR = 'a[aria-label^="Profile picture of"]';

export const COMMENT_SELECTOR = 'div[role="article"][aria-label^="Comment by"], div[role="article"][aria-label^="Reply by"]';
export const COMMENTS_HEADING_SELECTOR = 'h2, h3';
export const COMMENT_ARTICLE_SELECTOR = COMMENT_SELECTOR;
export const COMMENT_HEADING_SELECTOR = 'h1, h2, h3, [role="heading"]';
export const FILTER_BUTTON_SELECTOR = '[role="button"][aria-haspopup="menu"]';

export const POST_REACTION_BUTTON_SELECTOR = REACTION_LABELS
    .map((reaction) => (`[role="button"][aria-label^="${reaction}:"]`))
    .join(', ');

export const REACTION_MODAL_SELECTOR = 'div[role="dialog"]:visible';
export const REACTION_MODAL_READY_SELECTOR = '[role="tab"], a[aria-label^="Profile picture of"], [aria-label="Close"][role="button"]';
export const COMMENT_REACTION_BUTTON_SELECTOR = '[role="button"][aria-label*="reaction; see who reacted to this"], [role="button"][aria-label*="reactions; see who reacted to this"]';
