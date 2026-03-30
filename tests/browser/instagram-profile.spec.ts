import { access, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { expect, test } from '@playwright/test';

import { scrapeProfile } from '../../src/instagram/scrapers/profile-scraper/index.js';

test.describe('scrapeProfile', () => {
    test('extracts visible Instagram profile metadata and captures a screenshot', async ({ page }) => {
        const artifactRootDir = await mkdtemp(join(tmpdir(), 'instagram-profile-test-'));
        try {
            await page.setContent(`
                <main>
                    <header>
                        <img src="https://cdn.example/avatar.jpg" alt="example profile picture" />
                        <h2>example_user</h2>
                        <h1>Example User</h1>
                        <span>Building useful things on the internet.</span>
                        <span>12 posts</span>
                        <span>3.4K followers</span>
                        <span>120 following</span>
                        <a href="https://example.com">https://example.com</a>
                        <svg aria-label="Verified"></svg>
                    </header>
                </main>
            `);
            await page.evaluate(() => {
                const canonical = document.createElement('link');
                canonical.rel = 'canonical';
                canonical.href = 'https://www.instagram.com/example_user/';
                document.head.append(canonical);

                const title = document.createElement('meta');
                title.setAttribute('property', 'og:title');
                title.content = 'Example User (@example_user) • Instagram';
                document.head.append(title);
            });

            const result = await scrapeProfile(page, 'https://www.instagram.com/example_user/', 'https://www.instagram.com/example_user/', {
                runId: 'run-123',
                itemIndex: 0,
                artifactRootDir,
                waitAfterNavigationMs: 0,
                requestTimeoutSecs: 240,
                screenVideo: true,
            });

            expect(result.status).toBe('SUCCEEDED');
            expect(result.profile).toMatchObject({
                url: 'https://www.instagram.com/example_user/',
                username: 'example_user',
                displayName: 'Example User',
                bio: 'Building useful things on the internet.',
                profilePictureUrl: 'https://cdn.example/avatar.jpg',
                externalLinks: ['https://example.com/'],
                counts: { posts: 12, followers: 3400, following: 120 },
                indicators: { verified: true, private: false },
            });
            expect(result.screenshots).toHaveLength(1);
            await expect(access(result.screenshots[0].localPath)).resolves.toBeUndefined();
        } finally {
            await rm(artifactRootDir, { recursive: true, force: true });
        }
    });

    test('parses compact decimal counts and does not infer verified from unrelated svg titles', async ({ page }) => {
        await page.setContent(`
            <main>
                <header>
                    <h2>example_user</h2>
                    <span>3,4K followers</span>
                    <span>120 following</span>
                    <span>12 posts</span>
                    <svg><title>Options</title></svg>
                </header>
            </main>
        `);
        await page.evaluate(() => {
            const canonical = document.createElement('link');
            canonical.rel = 'canonical';
            canonical.href = 'https://www.instagram.com/example_user/';
            document.head.append(canonical);
        });

        const result = await scrapeProfile(page, 'https://www.instagram.com/example_user/', 'https://www.instagram.com/example_user/', {
            runId: 'run-456',
            itemIndex: 0,
            artifactRootDir: tmpdir(),
            waitAfterNavigationMs: 0,
            requestTimeoutSecs: 240,
            screenVideo: false,
        });

        expect(result.profile.counts).toMatchObject({ posts: 12, followers: 3400, following: 120 });
        expect(result.profile.indicators.verified).toBe(false);
    });
});
