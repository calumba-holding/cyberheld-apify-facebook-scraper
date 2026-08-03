import type { Page } from "playwright";

import { extractCurrentPage, extractOverview, extractProfileHeader } from "./extract-page.js";
import {
  discoverMoreMenuItems,
  discoverProfileTabs,
  gotoProfileBase,
  navigateToMoreMenuItem,
  navigateToProfileTab,
  waitForProfileShell,
} from "./navigate.js";
import { isPhotosTab, scrapePhotosSection } from "./photos.js";
import { isPostsFeedTab, scrapePostsSection } from "./posts.js";
import { profileBaseUrl, slugifyKey } from "./text.js";
import type { ProfileScrapeResult, TabExtract } from "./types.js";

export type ScrapeProfileOptions = {
  profileUrl: string;
  navigationTimeoutMs: number;
  waitAfterNavigationMs: number;
  maxPosts?: number;
};

const safeExtract = async (
  page: Page,
  sectionName: string,
  errors: string[],
): Promise<TabExtract> => {
  try {
    return await extractCurrentPage(page, sectionName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`${sectionName}: ${message}`);
    return {
      name: sectionName,
      url: page.url(),
      title: "",
      headings: [],
      links: [],
      sections: [],
      listItems: [],
      visibleText: "",
      error: message,
    };
  }
};

export async function scrapeFacebookProfile(
  page: Page,
  profileUrl: string,
  options: Pick<
    ScrapeProfileOptions,
    "navigationTimeoutMs" | "waitAfterNavigationMs" | "maxPosts"
  >,
): Promise<ProfileScrapeResult> {
  const errors: string[] = [];
  const baseUrl = profileBaseUrl(profileUrl);

  await page.goto(profileUrl, {
    waitUntil: "domcontentloaded",
    timeout: options.navigationTimeoutMs,
  });
  await page.waitForTimeout(options.waitAfterNavigationMs);
  await waitForProfileShell(page);

  if (page.url().includes("/login") || page.url().includes("checkpoint")) {
    throw new Error(
      "Facebook redirected to login or checkpoint. Run `facebook profile login` and try again.",
    );
  }

  const header = await extractProfileHeader(page, baseUrl);
  const overview = await extractOverview(page);
  if (overview.displayName && !header.displayName) {
    header.displayName = overview.displayName;
  }

  const tabs: Record<string, TabExtract> = {};
  const tabTargets = await discoverProfileTabs(page);

  process.stderr.write(
    `Found profile tabs: ${tabTargets.map((t) => t.name).join(", ") || "(none)"}\n`,
  );

  for (const tab of tabTargets) {
    process.stderr.write(`Scraping tab: ${tab.name}\n`);
    await gotoProfileBase(page, baseUrl);
    const navigated = await navigateToProfileTab(page, tab, baseUrl);
    if (!navigated) {
      errors.push(`Tab not reachable: ${tab.name}`);
      continue;
    }
    const key = slugifyKey(tab.name);
    if (isPostsFeedTab(tab.name, page.url())) {
      tabs[key] = await scrapePostsSection(
        page,
        tab,
        baseUrl,
        errors,
        options.maxPosts ?? 20,
      );
    } else if (isPhotosTab(tab.name, page.url())) {
      tabs[key] = await scrapePhotosSection(page, tab, baseUrl, errors);
    } else {
      tabs[key] = await safeExtract(page, tab.name, errors);
    }
  }

  const moreSections: Record<string, TabExtract> = {};
  await gotoProfileBase(page, baseUrl);
  const moreItems = await discoverMoreMenuItems(page);

  const tabNames = new Set(tabTargets.map((t) => t.name.toLowerCase()));
  const uniqueMore = moreItems.filter((item) => !tabNames.has(item.name.toLowerCase()));

  process.stderr.write(
    `Found More menu items: ${uniqueMore.map((i) => i.name).join(", ") || "(none)"}\n`,
  );

  for (const item of uniqueMore) {
    process.stderr.write(`Scraping More → ${item.name}\n`);
    await gotoProfileBase(page, baseUrl);
    const navigated = await navigateToMoreMenuItem(page, item, baseUrl);
    if (!navigated) {
      errors.push(`More menu item not reachable: ${item.name}`);
      continue;
    }
    const key = slugifyKey(item.name);
    moreSections[key] = await safeExtract(page, item.name, errors);
  }

  return {
    inputUrl: profileUrl,
    profileUrl: baseUrl,
    scrapedAt: new Date().toISOString(),
    header,
    overview,
    tabs,
    moreSections,
    errors,
  };
}
