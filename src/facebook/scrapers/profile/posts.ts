import type { Page } from "playwright";

import { runBrowserScript } from "./browser-scripts.js";
import { extractCurrentPage } from "./extract-page.js";
import { navigateToProfileTab, type ProfileTabTarget } from "./navigate.js";
import { expandTruncatedPosts } from "./scroll-posts.js";
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
    const collected = new Map<string, ProfilePost>();
    let stableRounds = 0;
    let previousCount = 0;
    let rounds = 0;
    let articleCount = 0;

    for (let round = 0; round < 45 && collected.size < postLimit; round++) {
      rounds = round + 1;
      await expandTruncatedPosts(page);
      const visiblePosts = await extractPostsFromPage(page, postLimit);
      for (const post of visiblePosts) {
        const key = post.permalink
          ?? `${post.authorUrl ?? post.authorName ?? "unknown"}|${post.timestamp ?? ""}|${post.text?.slice(0, 160) ?? post.rawText?.slice(0, 160) ?? ""}`;
        if (!collected.has(key)) collected.set(key, post);
      }
      articleCount = await page.locator('[role="article"]').count();
      process.stderr.write(`  Feed round ${round + 1}/45: ${collected.size} unique post(s), ${articleCount} article(s) mounted\n`);
      stableRounds = collected.size === previousCount ? stableRounds + 1 : 0;
      previousCount = collected.size;
      if (stableRounds >= 5) break;
      await page.evaluate(() => window.scrollTo(0, Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)));
      await page.waitForTimeout(1_800);
    }

    const posts = [...collected.values()].slice(0, postLimit).map((post, index) => ({ ...post, index: index + 1 }));
    process.stderr.write(
      `  Extracted ${posts.length} unique post(s) (${rounds} scroll rounds, ${articleCount} articles currently mounted)\n`,
    );

    const pageExtract = await extractCurrentPage(page, tab.name);

    return {
      ...pageExtract,
      posts,
      postScrollRounds: rounds,
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
