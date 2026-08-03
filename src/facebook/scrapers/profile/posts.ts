import type { Page } from "playwright";

import { runBrowserScript } from "./browser-scripts.js";
import { extractCurrentPage } from "./extract-page.js";
import { navigateToProfileTab, type ProfileTabTarget } from "./navigate.js";
import { expandTruncatedPosts, scrollUntilPostsLoaded } from "./scroll-posts.js";
import type { ProfilePost, TabExtract } from "./types.js";

const DEFAULT_POST_LIMIT = 20;

export function isPostsFeedTab(name: string, _url: string): boolean {
  const normalized = name.toLowerCase().trim();
  // "All" appears on personal-profile timelines; "Posts" on Pages and newer layouts.
  return normalized === "all" || normalized === "posts" || normalized === "beiträge";
}

export async function extractPostsFromPage(
  page: Page,
  limit: number = DEFAULT_POST_LIMIT,
): Promise<ProfilePost[]> {
  return runBrowserScript<ProfilePost[]>(page, "extract-posts", limit);
}

export async function scrapePostsSection(
  page: Page,
  tab: ProfileTabTarget,
  baseUrl: string,
  errors: string[],
  postLimit: number = DEFAULT_POST_LIMIT,
): Promise<TabExtract> {
  process.stderr.write(`  Scraping up to ${postLimit} posts from feed\n`);

  await navigateToProfileTab(page, tab, baseUrl);
  await page.waitForTimeout(2_000);

  try {
    const scrollResult = await scrollUntilPostsLoaded(page, {
      targetCount: postLimit + 5,
      maxRounds: 45,
      stableRoundsRequired: 3,
      pauseMs: 1_800,
    });

    await expandTruncatedPosts(page);

    const posts = await extractPostsFromPage(page, postLimit);
    process.stderr.write(
      `  Extracted ${posts.length} post(s) (${scrollResult.rounds} scroll rounds, ${scrollResult.articleCount} articles seen)\n`,
    );

    const pageExtract = await extractCurrentPage(page, tab.name);

    return {
      ...pageExtract,
      posts,
      postScrollRounds: scrollResult.rounds,
      postsTarget: postLimit,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    errors.push(`Posts/${tab.name}: ${message}`);
    const pageExtract = await extractCurrentPage(page, tab.name).catch(() => ({
      name: tab.name,
      url: page.url(),
      title: "",
      headings: [],
      links: [],
      sections: [],
      listItems: [],
      visibleText: "",
    }));

    return {
      ...pageExtract,
      posts: [],
      error: message,
    };
  }
}
