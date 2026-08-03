import type { Page } from "playwright";

export type ScrollPostsResult = {
  rounds: number;
  articleCount: number;
};

export type ScrollPostsOptions = {
  targetCount?: number;
  maxRounds?: number;
  stableRoundsRequired?: number;
  pauseMs?: number;
};

export async function scrollUntilPostsLoaded(
  page: Page,
  options: ScrollPostsOptions = {},
): Promise<ScrollPostsResult> {
  const targetCount = options.targetCount ?? 20;
  const maxRounds = options.maxRounds ?? 40;
  const stableRoundsRequired = options.stableRoundsRequired ?? 3;
  const pauseMs = options.pauseMs ?? 1_800;

  let lastCount = 0;
  let stableCount = 0;
  let rounds = 0;
  let finalCount = 0;

  for (let round = 0; round < maxRounds; round++) {
    rounds = round + 1;

    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(pauseMs);

    const articleCount = await page.evaluate(() => {
      const main =
        document.querySelector('[role="main"]') ??
        document.querySelector("#screen-root") ??
        document.body;
      return main.querySelectorAll('[role="article"]').length;
    });

    finalCount = articleCount;
    process.stderr.write(
      `  Feed scroll ${round}/${maxRounds}: articles=${articleCount} (target ${targetCount})\n`,
    );

    if (articleCount >= targetCount) break;

    if (articleCount === lastCount) {
      stableCount += 1;
      if (stableCount >= stableRoundsRequired) break;
    } else {
      stableCount = 0;
    }

    lastCount = articleCount;
  }

  return { rounds, articleCount: finalCount };
}

export async function expandTruncatedPosts(page: Page): Promise<number> {
  let totalClicked = 0;

  for (let pass = 0; pass < 5; pass++) {
    const clicked = await page.evaluate(() => {
      let count = 0;
      const buttons = document.querySelectorAll('[role="button"], span[role="button"], div[role="button"]');
      for (const btn of Array.from(buttons)) {
        const label = (btn.textContent || "").replace(/\s+/g, " ").trim();
        if (label === "See more" || label === "Mehr anzeigen" || label === "See More") {
          (btn as HTMLElement).click();
          count++;
        }
      }
      return count;
    });

    totalClicked += clicked;
    if (clicked === 0) break;
    await page.waitForTimeout(600);
  }

  if (totalClicked > 0) {
    process.stderr.write(`  Expanded ${totalClicked} truncated post(s) via "See more"\n`);
  }

  return totalClicked;
}
