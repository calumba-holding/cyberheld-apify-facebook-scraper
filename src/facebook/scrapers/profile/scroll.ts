import type { Page } from "playwright";

export type ScrollToEndResult = {
  rounds: number;
  finalHeight: number;
  finalPhotoLinks: number;
};

export type ScrollToEndOptions = {
  maxRounds?: number;
  stableRoundsRequired?: number;
  pauseMs?: number;
};

export async function scrollPageToEnd(
  page: Page,
  options: ScrollToEndOptions = {},
): Promise<ScrollToEndResult> {
  const maxRounds = options.maxRounds ?? 45;
  const stableRoundsRequired = options.stableRoundsRequired ?? 3;
  const pauseMs = options.pauseMs ?? 1_500;

  let lastHeight = 0;
  let stableCount = 0;
  let finalPhotoLinks = 0;
  let rounds = 0;

  for (let round = 0; round < maxRounds; round++) {
    rounds = round + 1;
    await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(pauseMs);

    const metrics = await page.evaluate(() => ({
      height: Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      ),
      photoLinks: document.querySelectorAll('a[href*="photo.php"]').length,
    }));

    process.stderr.write(
      `  Scroll ${round + 1}/${maxRounds}: height=${metrics.height}, photo links=${metrics.photoLinks}\n`,
    );

    if (metrics.height === lastHeight && metrics.photoLinks === finalPhotoLinks) {
      stableCount += 1;
      if (stableCount >= stableRoundsRequired) break;
    } else {
      stableCount = 0;
    }

    lastHeight = metrics.height;
    finalPhotoLinks = metrics.photoLinks;
  }

  return { rounds, finalHeight: lastHeight, finalPhotoLinks };
}
