import { describe, expect, it } from 'vitest';

import { buildFailedOutput, buildRunOutput, buildSuccessOutput } from '../../src/common/output-item.js';
import type { FacebookScrapeResult } from '../../src/facebook/types.js';
import type { ProfileScrapeResult, ScreenshotScrapeResult } from '../../src/common/types.js';

const buildResult = (overrides: Partial<FacebookScrapeResult> = {}): FacebookScrapeResult => ({
    kind: 'engagement',
    inputUrl: 'https://www.facebook.com/example/posts/123',
    finalUrl: 'https://www.facebook.com/example/posts/123',
    scrapedAt: '2026-03-22T10:00:00.000Z',
    reactionCount: 2,
    commentCount: 1,
    commentsComplete: true,
    postReactionsComplete: true,
    commentVisibilityComplete: true,
    postContent: 'Target post content',
    reactions: [
        { name: 'Ada Lovelace', profile_url: 'https://www.facebook.com/ada', reaction: 'Like' },
        { name: 'Grace Hopper', profile_url: 'https://www.facebook.com/grace', reaction: 'Love' },
    ],
    comments: [
        {
            user: 'Ada Lovelace',
            content: 'Insightful comment',
            timestamp: '2026-03-22T09:59:00.000Z',
            id: 'comment-1',
        },
    ],
    ...overrides,
});

describe('buildSuccessOutput', () => {
    it('returns SUCCEEDED when comments, reactions, and all-comments completeness are present', () => {
        const output = buildSuccessOutput(buildResult(), 'job-1');

        expect(output.scrape.status).toBe('SUCCEEDED');
        expect(output.scrape.browser).toBe('persistent-chrome-profile');
        expect(output.completeness).toEqual({
            allCommentsFilterApplied: true,
            commentsExtracted: true,
            postReactionsExtracted: true,
        });
        expect(output.post.reactionSummary.total).toBe(2);
        expect(output.comments).toHaveLength(1);
    });

    it('returns SUCCEEDED when reaction extraction completes but the post has zero visible reactions', () => {
        const output = buildSuccessOutput(buildResult({ reactionCount: 0, reactions: [] }), 'job-2');

        expect(output.scrape.status).toBe('SUCCEEDED');
        expect(output.completeness.postReactionsExtracted).toBe(true);
        expect(output.post.reactions).toEqual([]);
        expect(output.post.reactionSummary.total).toBe(0);
    });

    it('returns SUCCEEDED when comment extraction completes but the post has zero visible comments', () => {
        const output = buildSuccessOutput(buildResult({ commentCount: 0, comments: [] }), 'job-3');

        expect(output.scrape.status).toBe('SUCCEEDED');
        expect(output.completeness.commentsExtracted).toBe(true);
        expect(output.comments).toEqual([]);
    });

    it('includes a source-video artifact when the scraper downloaded the original facebook video', () => {
        const output = buildSuccessOutput(buildResult({
            sourceVideo: { localPath: '/tmp/run-1_item-1_video-627375550054084.mp4' },
        }), 'job-source-video');

        expect(output.artifacts?.sourceVideo).toEqual({ localPath: '/tmp/run-1_item-1_video-627375550054084.mp4' });
    });

    it('includes self-healing diagnostic artifacts when a script was generated or repaired', () => {
        const output = buildSuccessOutput(buildResult({
            selfHealing: [{
                action: 'repair',
                status: 'saved',
                screenshot: { localPath: '/tmp/run-1/self-healing/item-1_repair.png' },
                html: { localPath: '/tmp/run-1/self-healing/item-1_repair.html' },
            }],
        }), 'job-self-healing');

        expect(output.artifacts?.selfHealing).toEqual([{
            action: 'repair',
            status: 'saved',
            screenshot: { localPath: '/tmp/run-1/self-healing/item-1_repair.png' },
            html: { localPath: '/tmp/run-1/self-healing/item-1_repair.html' },
        }]);
    });

    it('returns PARTIAL when post reaction extraction did not complete', () => {
        const output = buildSuccessOutput(buildResult({ reactionCount: 0, reactions: [], postReactionsComplete: false }), 'job-2b');

        expect(output.scrape.status).toBe('PARTIAL');
        expect(output.completeness.postReactionsExtracted).toBe(false);
        expect(output.post.reactions).toEqual([]);
    });

    it('uses the guest browser label for guest-session runs', () => {
        const output = buildSuccessOutput(buildResult(), 'job-guest', 'guest-session');

        expect(output.scrape.browser).toBe('guest-chrome-session');
    });

    it('respects an explicit scraper status override', () => {
        const output = buildSuccessOutput(buildResult({
            commentVisibilityComplete: false,
            reactionCount: 0,
            reactions: [],
            status: 'SUCCEEDED',
        }), 'job-4');

        expect(output.scrape.status).toBe('SUCCEEDED');
        expect(output.completeness).toEqual({
            allCommentsFilterApplied: false,
            commentsExtracted: true,
            postReactionsExtracted: true,
        });
    });
});

describe('buildSuccessOutput for profile scrapes', () => {
    it('returns profile metadata and screenshot artifacts', () => {
        const output = buildSuccessOutput({
            kind: 'profile',
            inputUrl: 'https://www.instagram.com/example/',
            finalUrl: 'https://www.instagram.com/example/',
            scrapedAt: '2026-03-22T10:00:00.000Z',
            profile: {
                url: 'https://www.instagram.com/example/',
                username: 'example',
                displayName: 'Example Account',
                bio: 'Bio text',
                profilePictureUrl: 'https://cdn.example/avatar.jpg',
                externalLinks: ['https://example.com'],
                counts: { posts: 12, followers: 3400, following: 120 },
                indicators: { verified: true, private: false },
            },
            screenshots: [{ localPath: '/tmp/run-profile-01.png' }],
        } satisfies ProfileScrapeResult, 'job-profile');

        expect(output.scrape.status).toBe('SUCCEEDED');
        expect(output.profile).toMatchObject({
            username: 'example',
            displayName: 'Example Account',
            counts: { posts: 12, followers: 3400, following: 120 },
        });
        expect(output.artifacts?.screenshots).toEqual([{ localPath: '/tmp/run-profile-01.png' }]);
        expect(output.completeness).toBeUndefined();
        expect(output.post).toBeUndefined();
        expect(output.comments).toBeUndefined();
    });
});

describe('buildSuccessOutput for screenshot scrapes', () => {
    it('returns post url, caption preview, and screenshot artifacts', () => {
        const output = buildSuccessOutput({
            kind: 'screenshot',
            inputUrl: 'https://www.instagram.com/reel/ABC/',
            finalUrl: 'https://www.instagram.com/reel/ABC/',
            scrapedAt: '2026-03-22T10:00:00.000Z',
            screenshots: [{ localPath: '/tmp/run-post-01.png' }],
            captionPreview: 'Caption text',
        } satisfies ScreenshotScrapeResult, 'job-screenshot');

        expect(output.scrape.status).toBe('SUCCEEDED');
        expect(output.post).toMatchObject({
            url: 'https://www.instagram.com/reel/ABC/',
            content: 'Caption text',
        });
        expect(output.artifacts?.screenshots).toEqual([{ localPath: '/tmp/run-post-01.png' }]);
        expect(output.completeness).toBeUndefined();
    });

    it('returns structured engagement, comments, and engagement json artifact', () => {
        const output = buildSuccessOutput({
            kind: 'screenshot',
            inputUrl: 'https://www.instagram.com/reel/ABC/',
            finalUrl: 'https://www.instagram.com/p/ABC/',
            scrapedAt: '2026-03-22T10:00:00.000Z',
            screenshots: [{ localPath: '/tmp/run-post-01.png' }],
            captionPreview: 'Caption text',
            reactionCount: 2749,
            commentCount: 481,
            reactions: [{ name: 'Ada', profile_url: 'https://www.instagram.com/ada/', reaction: 'Like' }],
            comments: [{
                user: 'Bob',
                content: 'Nice',
                timestamp: '2026-03-22T10:00:00.000Z',
                id: '1',
            }],
            commentsComplete: true,
            postReactionsComplete: true,
            engagementJsonPath: '/tmp/run_engagement-01.json',
            sessionVideo: { localPath: '/tmp/run_session-01.webm' },
        } satisfies ScreenshotScrapeResult, 'job-screenshot');

        expect(output.scrape.status).toBe('SUCCEEDED');
        expect(output.post?.reactionSummary.total).toBe(2749);
        expect(output.comments).toHaveLength(1);
        expect(output.artifacts?.engagementJson).toEqual({ localPath: '/tmp/run_engagement-01.json' });
        expect(output.artifacts?.sessionVideo).toEqual({ localPath: '/tmp/run_session-01.webm' });
    });
});

describe('buildFailedOutput', () => {
    it('returns FAILED output with empty collections when scraping errors', () => {
        const output = buildFailedOutput('https://www.facebook.com/example/posts/123', 'job-3', 'Navigation timed out');

        expect(output.scrape.status).toBe('FAILED');
        expect(output.scrape.browser).toBe('persistent-chrome-profile');
        expect(output.scrape.error).toBe('Navigation timed out');
        expect(output.post.reactionSummary.total).toBe(0);
        expect(output.post.reactions).toEqual([]);
        expect(output.comments).toEqual([]);
    });

    it('uses the guest browser label for guest-session failures', () => {
        const output = buildFailedOutput('https://www.facebook.com/example/posts/123', 'job-guest-fail', 'Blocked', 'guest-session');

        expect(output.scrape.browser).toBe('guest-chrome-session');
    });

    it('includes blocked-page diagnostics when a redirect/login-wall artifact was captured', () => {
        const output = buildFailedOutput(
            'https://www.facebook.com/example/posts/123',
            'job-blocked',
            'Blocked',
            'public-session',
            {
                finalUrl: 'https://www.facebook.com/',
                screenshot: { localPath: '/tmp/run-1_item-1_blocked-page.png' },
                html: { localPath: '/tmp/run-1_item-1_blocked-page.html' },
            },
        );

        expect(output.scrape.browser).toBe('persistent-chrome-profile');
        expect(output.artifacts?.blockedPage).toEqual({
            finalUrl: 'https://www.facebook.com/',
            screenshot: { localPath: '/tmp/run-1_item-1_blocked-page.png' },
            html: { localPath: '/tmp/run-1_item-1_blocked-page.html' },
        });
    });
});

describe('buildRunOutput', () => {
    it('counts succeeded, partial, and failed results in the run summary', () => {
        const runOutput = buildRunOutput(
            'facebook',
            'post-engagement',
            '/tmp/profiles/facebook',
            'persistent-profile',
            'run-1',
            '2026-03-22T10:00:00.000Z',
            '2026-03-22T10:05:00.000Z',
            2,
            3,
            { present: false },
            [
                buildSuccessOutput(buildResult(), 'job-1'),
                buildSuccessOutput(buildResult({ reactionCount: 0, reactions: [] }), 'job-2'),
                buildFailedOutput('https://www.facebook.com/example/posts/789', 'job-3', 'Navigation timed out'),
            ],
        );

        expect(runOutput.summary).toEqual({
            succeeded: 2,
            partial: 0,
            failed: 1,
        });
        expect(runOutput.run.requestedUrls).toBe(3);
        expect(runOutput.run.concurrency).toBe(2);
        expect(runOutput.run.browserSession).toBe('persistent-profile');
    });
});
