/* eslint-disable no-undef */
function extractOverviewInBrowser() {
  function uniquePush(list, value) {
    if (!value || list.includes(value)) return;
    list.push(value);
  }

  function findSectionByHeading(title, root) {
    const heading = Array.from(root.querySelectorAll("h2, h3")).find(
      (el) => cleanScrapeText(el.textContent) === title,
    );
    if (!heading) return null;

    if (heading.id) {
      const labelled = root.querySelector(`[aria-labelledby="${heading.id}"]`);
      if (labelled) return labelled;
    }

    return (
      heading.closest('[role="list"]')?.parentElement ??
      heading.closest("div")?.parentElement?.parentElement ??
      heading.parentElement
    );
  }

  const main = getContentRoot();
  const sectionTitles = ["Links", "Contact info", "Intro", "About"];
  const sections = [];

  for (const title of sectionTitles) {
    const root = findSectionByHeading(title, main);
    if (!root) continue;

    const lines = [];
    for (const item of root.querySelectorAll('[role="listitem"], li')) {
      const text = cleanScrapeText(item.textContent);
      if (!text || text === title || text.length > 400) continue;
      uniquePush(lines, text);
    }

    const links = collectProfileLinks(root, 20);

    if (lines.length > 0 || links.length > 0) {
      sections.push({ title, lines: lines.slice(0, 30), links });
    }
  }

  const allLinks = collectProfileLinks(main, 80);

  const postsPreview = Array.from(main.querySelectorAll('[role="article"]'))
    .map((el) => cleanScrapeText(el.textContent))
    .filter((text) => text.length > 20)
    .slice(0, 15);

  const displayName =
    cleanScrapeText(main.querySelector("h1")?.textContent) ||
    cleanScrapeText(document.querySelector("h1")?.textContent);

  return { sections, links: allLinks, postsPreview, displayName };
}
