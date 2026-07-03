import { afterEach, describe, expect, it } from 'vitest';

import { parseCliArgs } from '../../src/cli/parse.js';

const ENV_KEYS = [
    'SCRAPE_CHROME_EXECUTABLE',
    'SCRAPE_PROFILE_ROOT_DIR',
    'SCRAPE_WAIT_AFTER_NAVIGATION_MS',
    'SCRAPE_REQUEST_TIMEOUT_SECS',
    'SCRAPE_SCREEN_VIDEO',
    'SCRAPE_CONCURRENCY',
    'SCRAPE_ARTIFACT_ROOT_DIR',
] as const;

const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

afterEach(() => {
    for (const key of ENV_KEYS) {
        const value = originalEnv[key];
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
    }
});

describe('parseCliArgs', () => {
    it('returns run options when required scrape flags are provided', () => {
        const parsed = parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/example/posts/123',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.target).toBe('facebook');
            expect(parsed.options.scraper).toBe('post-engagement');
            expect(parsed.options.targetUrls).toEqual(['https://www.facebook.com/example/posts/123']);
            expect(parsed.options.concurrency).toBe(1);
            expect(parsed.options.browserSessionMode).toBe('persistent-profile');
            expect(parsed.options.screenVideo).toBe(true);
            expect(parsed.options.download).toBe(true);
        }
    });

    it('returns profile-login options when profile login command is requested', () => {
        process.env.SCRAPE_CHROME_EXECUTABLE = '/Applications/Test Chrome';
        process.env.SCRAPE_PROFILE_ROOT_DIR = '/tmp/scrape-profiles';

        const parsed = parseCliArgs(['profile', 'login', '--target', 'facebook']);

        expect(parsed.kind).toBe('profile-login');
        if (parsed.kind === 'profile-login') {
            expect(parsed.options.target).toBe('facebook');
            expect(parsed.options.chromeExecutable).toBe('/Applications/Test Chrome');
            expect(parsed.options.profileRootDir).toBe('/tmp/scrape-profiles');
            expect(parsed.options.verbose).toBe(false);
        }
    });

    it('accepts an optional leading scrape command token for direct node invocation', () => {
        const parsed = parseCliArgs([
            'scrape',
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/example/posts/123',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.target).toBe('facebook');
            expect(parsed.options.scraper).toBe('post-engagement');
            expect(parsed.options.targetUrls).toEqual(['https://www.facebook.com/example/posts/123']);
        }
    });

    it('accepts an optional leading scrape command token for profile commands', () => {
        const parsed = parseCliArgs(['scrape', 'profile', 'path', '--target', 'facebook']);

        expect(parsed.kind).toBe('profile-path');
        if (parsed.kind === 'profile-path') {
            expect(parsed.options.target).toBe('facebook');
        }
    });

    it('accepts the comment-reactions scraper for facebook', () => {
        const parsed = parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'comment-reactions',
            '--target-url',
            'https://www.facebook.com/example/posts/123?comment_id=456',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.scraper).toBe('comment-reactions');
            expect(parsed.options.targetUrls).toEqual(['https://www.facebook.com/example/posts/123?comment_id=456']);
        }
    });

    it('accepts the instagram post-engagement scraper', () => {
        const parsed = parseCliArgs([
            '--target',
            'instagram',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.instagram.com/p/example-post/',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.target).toBe('instagram');
            expect(parsed.options.scraper).toBe('post-engagement');
            expect(parsed.options.targetUrls).toEqual(['https://www.instagram.com/p/example-post/']);
        }
    });

    it('accepts the instagram profile-scraper', () => {
        const parsed = parseCliArgs([
            '--target',
            'instagram',
            '--scraper',
            'profile-scraper',
            '--target-url',
            'https://www.instagram.com/example-profile/',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.target).toBe('instagram');
            expect(parsed.options.scraper).toBe('profile-scraper');
            expect(parsed.options.targetUrls).toEqual(['https://www.instagram.com/example-profile/']);
        }
    });

    it('returns run options from environment defaults when optional flags are omitted', () => {
        process.env.SCRAPE_CONCURRENCY = '3';
        process.env.SCRAPE_SCREEN_VIDEO = 'true';
        process.env.SCRAPE_WAIT_AFTER_NAVIGATION_MS = '1500';
        process.env.SCRAPE_REQUEST_TIMEOUT_SECS = '600';
        process.env.SCRAPE_ARTIFACT_ROOT_DIR = '/tmp/artifacts';

        const parsed = parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/example/posts/123',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.concurrency).toBe(3);
            expect(parsed.options.screenVideo).toBe(true);
            expect(parsed.options.waitAfterNavigationMs).toBe(1500);
            expect(parsed.options.requestTimeoutSecs).toBe(600);
            expect(parsed.options.artifactRootDir).toBe('/tmp/artifacts');
        }
    });

    it('disables browser video when --no-screen-video is provided', () => {
        const parsed = parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/example/posts/123',
            '--no-screen-video',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.screenVideo).toBe(false);
        }
    });

    it('uses a public browser session for facebook when --public-session is provided', () => {
        const parsed = parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/example/posts/123',
            '--public-session',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.browserSessionMode).toBe('public-session');
        }
    });

    it('uses a guest browser session for facebook when --guest-session is provided', () => {
        const parsed = parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/example/posts/123',
            '--guest-session',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.browserSessionMode).toBe('guest-session');
        }
    });

    it('disables source-video download when --no-download is provided', () => {
        const parsed = parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/watch/?v=627375550054084',
            '--no-download',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.download).toBe(false);
        }
    });

    it('throws an error when target-url is missing for a scrape run', () => {
        expect(() => parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
        ])).toThrowError('Missing required flag: --target-url');
    });

    it('throws an error when concurrency is outside the supported range', () => {
        expect(() => parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/example/posts/123',
            '--concurrency',
            '0',
        ])).toThrowError('concurrency must be an integer between 1 and 32.');
    });

    it('throws an error when --public-session is used for a non-facebook target', () => {
        expect(() => parseCliArgs([
            '--target',
            'instagram',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.instagram.com/p/example-post/',
            '--public-session',
        ])).toThrowError('--public-session and --guest-session are currently supported only for --target facebook.');
    });

    it('throws an error when --guest-session is used for a non-facebook target', () => {
        expect(() => parseCliArgs([
            '--target',
            'instagram',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.instagram.com/p/example-post/',
            '--guest-session',
        ])).toThrowError('--public-session and --guest-session are currently supported only for --target facebook.');
    });

    it('throws an error when target is unsupported', () => {
        expect(() => parseCliArgs([
            '--target',
            'threads',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.threads.net/@example/post/abc',
        ])).toThrowError('--target must be one of: facebook, instagram');
    });

    it('parses watch with npm/pnpm passthrough -- separator', () => {
        const parsed = parseCliArgs(['watch', '--', '--config', 'farm/config/worker-1.json', '--once']);
        expect(parsed.kind).toBe('watch');
        if (parsed.kind !== 'watch') return;
        expect(parsed.options.configPath).toBe('farm/config/worker-1.json');
        expect(parsed.options.once).toBe(true);
    });

    it('defaults workers to 1 and worker-concurrency to 4 when omitted', () => {
        const parsed = parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/example/posts/123',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.workers).toBe(1);
            expect(parsed.options.workerConcurrency).toBe(4);
            expect(parsed.options.workerStartDelayMs).toBe(2000);
            expect(parsed.options.maxRetries).toBe(2);
            expect(parsed.options.itemDelayMs).toBe(0);
        }
    });

    it('parses --max-retries and --item-delay-ms', () => {
        const parsed = parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/example/posts/123',
            '--max-retries',
            '0',
            '--item-delay-ms',
            '1500',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.maxRetries).toBe(0);
            expect(parsed.options.itemDelayMs).toBe(1500);
        }
    });

    it('throws an error when max-retries is outside the supported range', () => {
        expect(() => parseCliArgs([
            '--target',
            'facebook',
            '--scraper',
            'post-engagement',
            '--target-url',
            'https://www.facebook.com/example/posts/123',
            '--max-retries',
            '6',
        ])).toThrowError('maxRetries must be an integer between 0 and 5.');
    });

    it('parses --workers, --worker-concurrency and --worker-start-delay-ms', () => {
        const parsed = parseCliArgs([
            '--target',
            'instagram',
            '--scraper',
            'post-screenshot',
            '--target-url',
            'https://www.instagram.com/reel/example/',
            '--workers',
            '5',
            '--worker-concurrency',
            '10',
            '--worker-start-delay-ms',
            '500',
        ]);

        expect(parsed.kind).toBe('run');
        if (parsed.kind === 'run') {
            expect(parsed.options.workers).toBe(5);
            expect(parsed.options.workerConcurrency).toBe(10);
            expect(parsed.options.workerStartDelayMs).toBe(500);
        }
    });

    it('throws an error when workers * worker-concurrency exceeds 100', () => {
        expect(() => parseCliArgs([
            '--target',
            'instagram',
            '--scraper',
            'post-screenshot',
            '--target-url',
            'https://www.instagram.com/reel/example/',
            '--workers',
            '11',
            '--worker-concurrency',
            '10',
        ])).toThrowError('workers * worker-concurrency must not exceed 100.');
    });
});
