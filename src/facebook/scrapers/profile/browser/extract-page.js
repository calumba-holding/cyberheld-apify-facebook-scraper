/* eslint-disable no-undef */
function extractPageInBrowser(maxText) {
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

  const headings = Array.from(main.querySelectorAll("h1, h2, h3, h4"))
    .map((el) => cleanScrapeText(el.textContent))
    .filter((text) => text.length > 0 && text.length < 200);

  const links = collectProfileLinks(main, 150);

  const sectionTitles = ["Links", "Contact info", "About", "Posts", "Intro", "Details", "Overview"];
  const sections = [];

  for (const title of sectionTitles) {
    const root = findSectionByHeading(title, main);
    if (!root) continue;

    const lines = [];
    for (const item of root.querySelectorAll('[role="listitem"], li')) {
      const text = cleanScrapeText(item.textContent);
      if (!text || text === title || text.length > 400) continue;
      uniquePush(lines, text);
      if (lines.length >= 40) break;
    }

    const sectionLinks = collectProfileLinks(root, 30);

    if (lines.length > 0 || sectionLinks.length > 0) {
      sections.push({ title, lines, links: sectionLinks });
    }
  }

  const listItems = Array.from(main.querySelectorAll('[role="listitem"], li'))
    .map((el) => cleanScrapeText(el.textContent))
    .filter((text) => text.length > 2 && text.length < 400)
    .slice(0, 80);

  const postsPreview = Array.from(main.querySelectorAll('[role="article"]'))
    .map((el) => cleanScrapeText(el.textContent))
    .filter((text) => text.length > 20)
    .slice(0, 15);

  const visibleText = cleanScrapeText(main.textContent).slice(0, maxText);

  return {
    title: document.title,
    metaDescription:
      (document.querySelector('meta[name="description"]') || {}).content ||
      (document.querySelector('meta[property="og:description"]') || {}).content,
    headings: Array.from(new Set(headings)),
    links,
    sections,
    listItems: Array.from(new Set(listItems)),
    visibleText,
    postsPreview,
  };
}
