/* eslint-disable no-undef */
function extractPhotosInBrowser() {
  const photos = [];
  const seenHref = new Set();
  const main = getContentRoot();

  const selectors = [
    'a[href*="photo.php"]',
    'a[href*="/photo/"]',
    'a[role="link"][href*="fbid="]',
  ];

  for (const selector of selectors) {
    for (const anchor of main.querySelectorAll(selector)) {
      const href = anchor.href;
      if (!href || seenHref.has(href) || href.startsWith("javascript:")) continue;
      if (isNoiseLink(href, anchor.textContent)) continue;

      const img = anchor.querySelector("img[src]");
      const imageUrl = img && img.src ? img.src : undefined;
      if (!imageUrl && !href.includes("photo")) continue;

      seenHref.add(href);
      photos.push({
        href,
        imageUrl: imageUrl || null,
        alt: img ? cleanScrapeText(img.alt) || null : null,
      });
    }
  }

  return photos;
}
