/* eslint-disable no-undef */
function extractPostsInBrowser(maxPosts) {
  function clean(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  function normalizePostText(value) {
    return clean(value)
      .replace(/\s*See less\s*$/i, "")
      .replace(/\s*See more\s*$/i, "")
      .replace(/\s*Mehr anzeigen\s*$/i, "")
      .replace(/\s*See translation\s*$/i, "")
      .replace(/\s*Übersetzung anzeigen\s*$/i, "")
      .trim();
  }

  function decodeFacebookRedirect(href) {
    try {
      const url = new URL(href);
      if (!url.hostname.includes("facebook.com") || !url.pathname.includes("/l.php")) {
        return href;
      }
      const target = url.searchParams.get("u");
      return target ? decodeURIComponent(target) : href;
    } catch {
      return href;
    }
  }

  function pickPermalink(article) {
    for (const anchor of article.querySelectorAll('a[href*="/posts/"], a[href*="pfbid"]')) {
      const href = decodeFacebookRedirect(anchor.href);
      if (href && (href.includes("/posts/") || href.includes("pfbid"))) {
        return href.split("?")[0];
      }
    }
    for (const anchor of article.querySelectorAll('a[href*="story_fbid"], a[href*="/permalink/"]')) {
      const href = decodeFacebookRedirect(anchor.href);
      if (href) return href.split("?")[0];
    }
    for (const anchor of article.querySelectorAll('a[href*="photo"], a[href*="photo.php"]')) {
      const href = decodeFacebookRedirect(anchor.href);
      if (href && (href.includes("fbid=") || href.includes("/photo/"))) {
        return href.split("?")[0];
      }
    }
    return null;
  }

  function extractAuthorName(profileEl) {
    if (!profileEl) return null;
    const anchor = profileEl.querySelector("a[href]");
    if (anchor) {
      const fromLink = clean(anchor.textContent);
      if (fromLink && fromLink.length < 120) return fromLink;
    }
    const raw = clean(profileEl.textContent);
    const withoutCheckIn = raw.replace(/\s+is at\s+.+$/i, "").replace(/\s+ist in\s+.+$/i, "");
    return withoutCheckIn || raw || null;
  }

  function extractImages(article) {
    const images = [];
    const seen = new Set();
    for (const img of article.querySelectorAll('img[src][data-imgperflogname="feedImage"], img[src]')) {
      const src = img.getAttribute("src");
      if (!src || src.startsWith("data:") || src.includes("emoji.php") || seen.has(src)) continue;
      const parentLink = img.closest("a[href]");
      const href = parentLink ? decodeFacebookRedirect(parentLink.href) : null;
      seen.add(src);
      images.push({
        href: href ? href.split("?")[0] : null,
        imageUrl: src,
        alt: clean(img.getAttribute("alt")) || null,
      });
      if (images.length >= 12) break;
    }
    return images;
  }

  function extractLinkPreview(article) {
    const meta = article.querySelector('[data-ad-rendering-role="meta"]');
    const titleEl = article.querySelector('[data-ad-rendering-role="title"]');
    const root = meta?.closest("a[href]") || titleEl?.closest("a[href]");
    if (!root && !titleEl) return null;

    const linkRoot = root || titleEl.parentElement;
    const descriptionEl = linkRoot?.querySelector('[data-ad-rendering-role="description"]');

    return {
      url: linkRoot && linkRoot.href ? decodeFacebookRedirect(linkRoot.href).split("?")[0] : null,
      title: titleEl ? clean(titleEl.textContent) : null,
      description: descriptionEl ? clean(descriptionEl.textContent) : null,
      siteName: meta ? clean(meta.textContent) : null,
    };
  }

  function extractEngagement(article) {
    const engagement = {};
    const shareBtn = article.querySelector('[data-ad-rendering-role="share_button"]');
    if (shareBtn) {
      const shareText = clean(shareBtn.parentElement?.textContent || shareBtn.textContent);
      const match = shareText.match(/\b(\d+)\b/);
      if (match) engagement.shares = match[1];
    }

    for (const el of article.querySelectorAll('[aria-label]')) {
      const label = el.getAttribute("aria-label") || "";
      if (/like/i.test(label) && !engagement.likes) {
        const m = label.match(/(\d[\d,.]*[KMB]?)/i);
        if (m) engagement.likes = m[1];
      }
      if (/comment/i.test(label) && !engagement.comments) {
        const m = label.match(/(\d[\d,.]*[KMB]?)/i);
        if (m) engagement.comments = m[1];
      }
    }
    return Object.keys(engagement).length > 0 ? engagement : undefined;
  }

  function isFeedPostArticle(article) {
    const hasStory =
      article.querySelector('[data-ad-rendering-role="story_message"]') ||
      article.querySelector('[data-ad-rendering-role="profile_name"]');
    if (!hasStory) return false;

    const text = clean(article.textContent);
    if (text.length < 30) return false;

    const isCommentThread =
      article.querySelector('[aria-label="Write a comment"]') &&
      !article.querySelector('[data-ad-rendering-role="story_message"]');
    return !isCommentThread;
  }

  const main = getContentRoot();

  const candidates = Array.from(main.querySelectorAll('[role="article"]')).filter(isFeedPostArticle);

  const posts = [];
  const seenPermalinks = new Set();
  const seenFallbackKeys = new Set();

  for (const article of candidates) {
    if (posts.length >= maxPosts) break;

    const profileEl = article.querySelector('[data-ad-rendering-role="profile_name"]');
    const authorAnchor = profileEl?.querySelector("a[href]") || profileEl?.closest("a[href]");
    const storyEl = article.querySelector('[data-ad-rendering-role="story_message"]');

    let text = "";
    if (storyEl) {
      const clone = storyEl.cloneNode(true);
      for (const btn of clone.querySelectorAll('[role="button"]')) {
        if (/see more|mehr anzeigen|see less|see translation/i.test(clean(btn.textContent))) {
          btn.remove();
        }
      }
      text = normalizePostText(clone.textContent);
    }

    const permalink = pickPermalink(article);
    if (permalink) {
      if (seenPermalinks.has(permalink)) continue;
      seenPermalinks.add(permalink);
    } else {
      const fallbackKey = `${extractAuthorName(profileEl)}|${text.slice(0, 120)}|${clean(article.textContent).slice(0, 80)}`;
      if (fallbackKey && seenFallbackKeys.has(fallbackKey)) continue;
      if (fallbackKey) seenFallbackKeys.add(fallbackKey);
    }

    let timestamp = null;
    let location = null;
    for (const anchor of article.querySelectorAll("a[href]")) {
      const t = clean(anchor.textContent);
      if (!t || t.length > 80) continue;
      if (
        /^\d+[mhdw]$|^\d+\s*(min|std|h|d|w)|yesterday|heute|gestern|ago|vor\s+\d/i.test(t) &&
        !timestamp
      ) {
        timestamp = t;
      }
    }

    const heading = profileEl ? clean(profileEl.textContent) : "";
    const checkIn = heading.match(/\bis at\s+(.+)$/i) || heading.match(/\bist in\s+(.+)$/i);
    if (checkIn) location = clean(checkIn[1]);

    const linkPreview = extractLinkPreview(article);
    const engagement = extractEngagement(article);

    posts.push({
      index: posts.length + 1,
      authorName: extractAuthorName(profileEl),
      authorUrl: authorAnchor ? decodeFacebookRedirect(authorAnchor.href).split("?")[0] : null,
      text: text || null,
      timestamp,
      location,
      permalink,
      images: extractImages(article),
      linkPreview: linkPreview?.title || linkPreview?.url ? linkPreview : undefined,
      engagement,
      rawText: clean(article.textContent).slice(0, 2000),
    });
  }

  return posts;
}
