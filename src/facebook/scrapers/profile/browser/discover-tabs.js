/* eslint-disable no-undef */
function discoverTabsInBrowser() {
  const main = getContentRoot();
  const tablist = main.querySelector('[role="tablist"]');
  if (!tablist) return [];

  const tabs = [];
  for (const tab of tablist.querySelectorAll('[role="tab"]')) {
    const name = cleanScrapeText(tab.textContent);
    if (!name || name.toLowerCase() === "more") continue;
    const link = tab.closest("a") || (tab.matches("a") ? tab : null);
    const href = link && link.href ? link.href : tab.getAttribute("href") || undefined;
    tabs.push({ name, href: href || undefined });
  }

  return tabs;
}
