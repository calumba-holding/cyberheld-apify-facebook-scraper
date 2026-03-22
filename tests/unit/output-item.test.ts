import { describe, expect, it } from 'vitest';

import { buildFailedOutput, buildRunOutput, buildSuccessOutput } from '../../src/facebook/output-item.js';
import type { FacebookScrapeResult } from '../../src/facebook/types.js';

const buildResult = (overrides: Partial<FacebookScrapeResult> = {}): FacebookScrapeResult => ({
    inputUrl: 'https://www.facebook.com/example/posts/123',
    finalUrl: 'https://www.facebook.com/example/posts/123',
    scrapedAt: '2026-03-22T10:00:00.000Z',
    reactionCount: 2,
    commentCount: 1,
    allCommentsFilterApplied: true,
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
        expect(output.completeness).toEqual({
            allCommentsFilterApplied: true,
            commentsExtracted: true,
            postReactionsExtracted: true,
        });
        expect(output.post.reactionSummary.total).toBe(2);
        expect(output.comments).toHaveLength(1);
    });

    it('returns PARTIAL when post reactions are missing', () => {
        const output = buildSuccessOutput(buildResult({ reactionCount: 0, reactions: [] }), 'job-2');

        expect(output.scrape.status).toBe('PARTIAL');
        expect(output.completeness.postReactionsExtracted).toBe(false);
        expect(output.post.reactions).toEqual([]);
    });
});

describe('buildFailedOutput', () => {
    it('returns FAILED output with empty collections when scraping errors', () => {
        const output = buildFailedOutput('https://www.facebook.com/example/posts/123', 'job-3', 'Navigation timed out');

        expect(output.scrape.status).toBe('FAILED');
        expect(output.scrape.error).toBe('Navigation timed out');
        expect(output.post.reactionSummary.total).toBe(0);
        expect(output.post.reactions).toEqual([]);
        expect(output.comments).toEqual([]);
    });
});

describe('buildRunOutput', () => {
    it('counts succeeded, partial, and failed results in the run summary', () => {
        const runOutput = buildRunOutput(
            'facebook',
            'post-engagement',
            '/tmp/profiles/facebook',
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
            succeeded: 1,
            partial: 1,
            failed: 1,
        });
        expect(runOutput.run.requestedUrls).toBe(3);
        expect(runOutput.run.concurrency).toBe(2);
    });
});
