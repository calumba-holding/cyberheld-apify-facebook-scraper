import type { Page } from "playwright";

import { runBrowserScript } from "./browser-scripts.js";

const TAB_WAIT_MS = 2_000;
const MENU_WAIT_MS = 800;

export type ProfileTabTarget = {
  name: string;
  href?: string;
};

export type MoreMenuTarget = {
  name: string;
  href?: string;
};

export async function waitForProfileShell(page: Page): Promise<void> {
  await page.waitForLoadState("domcontentloaded").catch(() => undefined);
  await page.locator('[role="tablist"], [role="main"], h1').first().waitFor({ timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1_500);
}

export async function discoverProfileTabs(page: Page): Promise<ProfileTabTarget[]> {
  const tabs = await runBrowserScript<ProfileTabTarget[]>(page, "discover-tabs");
  const seen = new Set<string>();
  return tabs.filter((tab) => {
    const key = tab.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function navigateToProfileTab(
  page: Page,
  tab: ProfileTabTarget,
  baseUrl: string,
): Promise<boolean> {
  if (tab.href) {
    await page.goto(tab.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(TAB_WAIT_MS);
    return true;
  }

  const tabLocator = page.getByRole("tab", { name: tab.name, exact: true });
  if ((await tabLocator.count()) > 0) {
    await tabLocator.first().click({ timeout: 10_000 });
    await page.waitForTimeout(TAB_WAIT_MS);
    return true;
  }

  const tabLink = page.locator(`[role="tablist"] a[role="tab"]`).filter({ hasText: tab.name });
  if ((await tabLink.count()) > 0) {
    await tabLink.first().click({ timeout: 10_000 });
    await page.waitForTimeout(TAB_WAIT_MS);
    return true;
  }

  const fallbackPath = tab.name.toLowerCase() === "all" ? baseUrl : `${baseUrl}/${tab.name.toLowerCase()}`;
  await page.goto(fallbackPath, { waitUntil: "domcontentloaded", timeout: 60_000 }).catch(() => undefined);
  await page.waitForTimeout(TAB_WAIT_MS);
  return page.url().includes(tab.name.toLowerCase()) || tab.name.toLowerCase() === "all";
}

export async function discoverMoreMenuItems(page: Page): Promise<MoreMenuTarget[]> {
  const opened = await openMoreMenu(page);
  if (!opened) return [];

  const items = await runBrowserScript<MoreMenuTarget[]>(page, "discover-more-menu");

  await page.keyboard.press("Escape").catch(() => undefined);
  await page.waitForTimeout(300);

  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.name.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function openMoreMenu(page: Page): Promise<boolean> {
  const candidates = [
    page.getByRole("tab", { name: "More profile sections" }),
    page.getByRole("tab", { name: "More", exact: true }),
    page.getByRole("button", { name: "More profile sections" }),
    page.getByRole("button", { name: "More", exact: true }),
  ];

  for (const locator of candidates) {
    if ((await locator.count()) === 0) continue;
    await locator.first().click({ timeout: 10_000 });
    await page.waitForTimeout(MENU_WAIT_MS);
    if ((await page.getByRole("menuitem").count()) > 0) return true;
  }

  return false;
}

export async function navigateToMoreMenuItem(
  page: Page,
  item: MoreMenuTarget,
  baseUrl: string,
): Promise<boolean> {
  if (item.href) {
    await page.goto(item.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForTimeout(TAB_WAIT_MS);
    return true;
  }

  const opened = await openMoreMenu(page);
  if (!opened) return false;

  const menuItem = page.getByRole("menuitem", { name: item.name, exact: true });
  if ((await menuItem.count()) === 0) {
    await page.keyboard.press("Escape").catch(() => undefined);
    return false;
  }

  await menuItem.first().click({ timeout: 10_000 });
  await page.waitForTimeout(TAB_WAIT_MS);
  return !page.url().split("?")[0].endsWith(baseUrl.split("?")[0].replace(/\/$/, ""));
}

export async function gotoProfileBase(page: Page, baseUrl: string): Promise<void> {
  const normalizedBase = baseUrl.replace(/\/$/, "");
  const current = page.url().split("?")[0].replace(/\/$/, "");
  if (current === normalizedBase) return;
  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await waitForProfileShell(page);
}
