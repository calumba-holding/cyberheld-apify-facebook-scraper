import type { Page } from "playwright";

import { runBrowserScript } from "./browser-scripts.js";
import type { ProfileLink, ProfileSection, TabExtract } from "./types.js";

const MAX_VISIBLE_TEXT = 12_000;

type RawPageExtract = {
  title: string;
  metaDescription?: string;
  headings: string[];
  links: ProfileLink[];
  sections: ProfileSection[];
  listItems: string[];
  visibleText: string;
  postsPreview: string[];
};

export async function extractCurrentPage(page: Page, sectionName: string): Promise<TabExtract> {
  const url = page.url();
  const raw = await runBrowserScript<RawPageExtract>(page, "extract-page", MAX_VISIBLE_TEXT);

  return {
    name: sectionName,
    url,
    title: raw.title,
    metaDescription: raw.metaDescription,
    headings: raw.headings,
    links: raw.links,
    sections: raw.sections,
    listItems: raw.listItems,
    visibleText: raw.visibleText,
  };
}

export async function extractOverview(page: Page): Promise<{
  url: string;
  displayName?: string;
  sections: ProfileSection[];
  links: ProfileLink[];
  postsPreview: string[];
}> {
  const raw = await runBrowserScript<{
    sections: ProfileSection[];
    links: ProfileLink[];
    postsPreview: string[];
    displayName?: string;
  }>(page, "extract-overview");

  return { url: page.url(), ...raw };
}

export async function extractProfileHeader(
  page: Page,
  profileUrl: string,
): Promise<import("./types.js").ProfileHeader> {
  const snapshot = await runBrowserScript<{
    displayName?: string;
    profilePictureUrl?: string;
    coverPhotoUrl?: string;
    counts: { followers?: string; following?: string; friends?: string };
    metaTitle?: string;
    metaDescription?: string;
  }>(page, "extract-header");

  const username = profileUrl.split("/").filter(Boolean).pop();

  return {
    profileUrl,
    username,
    displayName: snapshot.displayName,
    profilePictureUrl: snapshot.profilePictureUrl,
    coverPhotoUrl: snapshot.coverPhotoUrl,
    counts: snapshot.counts,
    metaTitle: snapshot.metaTitle,
    metaDescription: snapshot.metaDescription,
  };
}
