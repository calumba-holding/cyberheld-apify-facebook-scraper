import type { Page } from "playwright";

import { runBrowserScript } from "./browser-scripts.js";
import { extractCurrentPage } from "./extract-page.js";
import { navigateToProfileTab, type ProfileTabTarget } from "./navigate.js";
import { scrollPageToEnd } from "./scroll.js";
import type { PhotoItem, TabExtract } from "./types.js";

const PROFILE_TOP_TABS = new Set([
  "all",
  "about",
  "reels",
  "photos",
  "followers",
  "mentions",
  "more",
  "live",
  "music",
]);

function isPhotoGridSubTab(name: string, href?: string): boolean {
  const u = (href ?? "").toLowerCase();
  if (u.includes("photos_by") || u.includes("photos_of") || u.includes("photos_albums")) {
    return true;
  }
  if (u.includes("/photos") && !PROFILE_TOP_TABS.has(name.toLowerCase())) {
    return true;
  }
  const n = name.toLowerCase();
  return (
    n.includes("photo") ||
    n.includes("album") ||
    n.includes("tagged")
  );
}

export async function discoverPageSubTabs(page: Page): Promise<ProfileTabTarget[]> {
  const tabs = await runBrowserScript<ProfileTabTarget[]>(page, "discover-subtabs");
  const seen = new Set<string>();
  return tabs.filter((tab) => {
    const key = `${tab.name.toLowerCase()}|${tab.href ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function extractPhotosFromPage(page: Page): Promise<PhotoItem[]> {
  const raw = await runBrowserScript<PhotoItem[]>(page, "extract-photos");
  const seen = new Set<string>();
  return raw.filter((photo) => {
    const key = photo.href || photo.imageUrl || "";
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function scrapePhotosSection(
  page: Page,
  tab: ProfileTabTarget,
  baseUrl: string,
  errors: string[],
): Promise<TabExtract> {
  const sections: TabExtract["photoSections"] = [];
  const allPhotos: PhotoItem[] = [];

  await navigateToProfileTab(page, tab, baseUrl);
  await page.waitForTimeout(2_000);

  let subTabs = (await discoverPageSubTabs(page)).filter((t) =>
    isPhotoGridSubTab(t.name, t.href),
  );
  subTabs = subTabs.filter((t) => !PROFILE_TOP_TABS.has(t.name.toLowerCase()));

  if (subTabs.length === 0) {
    subTabs = [{ name: tab.name || "photos", href: page.url() }];
  }

  process.stderr.write(
    `  Photo sub-sections: ${subTabs.map((t) => t.name).join(", ")}\n`,
  );

  for (const subTab of subTabs) {
    process.stderr.write(`  Loading photos: ${subTab.name}\n`);

    try {
      if (subTab.href) {
        await page.goto(subTab.href, { waitUntil: "domcontentloaded", timeout: 60_000 });
      } else {
        await navigateToProfileTab(page, subTab, baseUrl);
      }
      await page.waitForTimeout(2_000);

      const scrollResult = await scrollPageToEnd(page, {
        maxRounds: 50,
        stableRoundsRequired: 3,
        pauseMs: 1_800,
      });

      const photos = await extractPhotosFromPage(page);
      process.stderr.write(
        `  Extracted ${photos.length} photos from ${subTab.name} (${scrollResult.rounds} scroll rounds)\n`,
      );

      sections.push({
        name: subTab.name,
        url: page.url(),
        scrollRounds: scrollResult.rounds,
        photos,
      });
      allPhotos.push(...photos);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(`Photos/${subTab.name}: ${message}`);
      sections.push({
        name: subTab.name,
        url: page.url(),
        scrollRounds: 0,
        photos: [],
        error: message,
      });
    }
  }

  const pageExtract = await extractCurrentPage(page, tab.name);
  const seenAll = new Set<string>();
  const dedupedAll = allPhotos.filter((p) => {
    const key = p.href || p.imageUrl || "";
    if (!key || seenAll.has(key)) return false;
    seenAll.add(key);
    return true;
  });

  return {
    ...pageExtract,
    photos: dedupedAll,
    photoSections: sections,
  };
}

export function isPhotosTab(name: string, url: string): boolean {
  const n = name.toLowerCase();
  const u = url.toLowerCase();
  return n === "photos" || u.includes("/photos");
}
