/* eslint-disable no-undef */
function discoverSubtabsInBrowser() {
  function clean(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  const tabs = [];
  const seen = new Set();

  for (const tablist of document.querySelectorAll('[role="tablist"]')) {
    for (const tab of tablist.querySelectorAll('[role="tab"]')) {
      const name = clean(tab.textContent);
      if (!name || name.toLowerCase() === "more") continue;

      const link = tab.tagName === "A" ? tab : tab.closest("a");
      const href = link && link.href ? link.href : tab.getAttribute("href") || undefined;
      const key = `${name}|${href || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);

      tabs.push({ name, href: href || undefined });
    }
  }

  return tabs;
}
