/* eslint-disable no-undef */
function discoverMoreMenuInBrowser() {
  function clean(value) {
    return (value || "").replace(/\s+/g, " ").trim();
  }

  return Array.from(document.querySelectorAll('[role="menuitem"]'))
    .map((item) => ({
      name: clean(item.textContent),
      href: item.querySelector("a")?.href || item.getAttribute("href") || undefined,
    }))
    .filter((item) => item.name.length > 0);
}
