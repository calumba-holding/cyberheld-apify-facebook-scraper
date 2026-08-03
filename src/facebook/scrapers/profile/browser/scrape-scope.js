/* eslint-disable no-undef */
/* Shared helpers for in-page extraction (prepended to other browser scripts). */

function cleanScrapeText(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function getContentRoot() {
  return (
    document.querySelector('[role="main"]') ||
    document.querySelector("#screen-root") ||
    document.body
  );
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

function isNoiseLink(href, text) {
  if (!href) return true;

  const h = href.toLowerCase();
  const t = cleanScrapeText(text).toLowerCase();

  if (/^unread\b/i.test(text || "")) return true;
  if (t.startsWith("unread")) return true;
  if (h.includes("notif_id=") || h.includes("notif_t=")) return true;
  if (h.includes("ref=notif")) return true;
  if (h.includes("multi_permalinks=")) return true;

  if (h === "https://www.facebook.com/" || h === "https://facebook.com/") return true;
  if (/\/friends\/?($|\?)/.test(h)) return true;
  if (/\/messages\/?($|\?)/.test(h)) return true;
  if (/\/reel\/\?s=tab/.test(h)) return true;
  if (/\/marketplace\/?($|\?|\/)/.test(h) && !h.includes("/profile")) return true;
  if (/\/groups\/?$/.test(h)) return true;
  if (/\/watch\/?($|\?)/.test(h)) return true;
  if (/\/gaming\/?($|\?)/.test(h)) return true;
  if (/\/notifications\/?($|\?)/.test(h)) return true;

  if (/create a pin to access your chats/i.test(t)) return true;
  if (t === "chats" || t === "messenger") return true;

  return false;
}

function collectProfileLinks(root, limit) {
  const links = [];
  const seen = new Set();
  const scope = root || getContentRoot();

  for (const anchor of scope.querySelectorAll("a[href]")) {
    const href = decodeFacebookRedirect(anchor.href);
    if (!href || seen.has(href) || href.startsWith("javascript:")) continue;

    const text = cleanScrapeText(anchor.innerText || anchor.textContent);
    if (isNoiseLink(href, text)) continue;

    seen.add(href);
    links.push({ text: text || href, href });
    if (links.length >= limit) break;
  }

  return links;
}
