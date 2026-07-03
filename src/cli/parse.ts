import { defaultArtifactRootDir, defaultChromeExecutable, defaultProfileRootDir, helpText } from './help.js';
import { getTargetPlugin } from '../registry.js';
import { ensureUrl, loadUrlsFromFile, parseBooleanEnv, parseInteger, parseTargetFlag, takeValue } from './parse-helpers.js';
import type { BrowserSessionMode, SupportedTarget } from '../common/types.js';
import type { ParsedCli, ProfileLoginCliOptions, ProfilePathCliOptions, RunCliOptions, WatchCliOptions } from './types.js';

const parseProfileArgs = (argv: string[]): ProfileLoginCliOptions | ProfilePathCliOptions => {
    const subcommand = argv[1];
    if (subcommand !== 'login' && subcommand !== 'path') {
        throw new Error('Profile subcommands: login, path');
    }

    let target: SupportedTarget | undefined;
    let chromeExecutable = process.env.SCRAPE_CHROME_EXECUTABLE ?? defaultChromeExecutable;
    let profileRootDir = process.env.SCRAPE_PROFILE_ROOT_DIR ?? defaultProfileRootDir;
    let verbose = false;

    for (let index = 2; index < argv.length; index++) {
        const arg = argv[index];
        switch (arg) {
            case '--target':
                target = parseTargetFlag(argv, index);
                index += 1;
                break;
            case '--chrome-executable':
                chromeExecutable = takeValue(argv, index, '--chrome-executable');
                index += 1;
                break;
            case '--profile-root-dir':
                profileRootDir = takeValue(argv, index, '--profile-root-dir');
                index += 1;
                break;
            case '--verbose':
                verbose = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!target) throw new Error('Missing required flag: --target');
    if (subcommand === 'login') {
        return { command: 'profile-login', target, chromeExecutable, profileRootDir, verbose };
    }

    return { command: 'profile-path', target, profileRootDir };
};

const parseRunArgs = (argv: string[]): RunCliOptions => {
    let target: SupportedTarget | undefined;
    let scraper: string | undefined;
    const targetUrls: string[] = [];
    let browserSessionMode: BrowserSessionMode = 'persistent-profile';
    let screenVideo = parseBooleanEnv(process.env.SCRAPE_SCREEN_VIDEO, true);
    let download = true;
    let outputFile: string | undefined;
    let chromeExecutable = process.env.SCRAPE_CHROME_EXECUTABLE ?? defaultChromeExecutable;
    let profileRootDir = process.env.SCRAPE_PROFILE_ROOT_DIR ?? defaultProfileRootDir;
    let waitAfterNavigationMs = parseInteger(process.env.SCRAPE_WAIT_AFTER_NAVIGATION_MS ?? '5000', 'waitAfterNavigationMs', 0, 120000);
    let requestTimeoutSecs = parseInteger(process.env.SCRAPE_REQUEST_TIMEOUT_SECS ?? '240', 'requestTimeoutSecs', 30, 3600);
    let concurrency = parseInteger(process.env.SCRAPE_CONCURRENCY ?? '1', 'concurrency', 1, 32);
    const artifactRootDir = process.env.SCRAPE_ARTIFACT_ROOT_DIR ?? defaultArtifactRootDir;
    let verbose = false;
    let regenerateScript = false;
    let fullPageScreenshot = false;
    let expandComments = true;
    let workers = parseInteger(process.env.SCRAPE_WORKERS ?? '1', 'workers', 1, 20);
    let workerConcurrency = parseInteger(process.env.SCRAPE_WORKER_CONCURRENCY ?? '4', 'workerConcurrency', 1, 16);
    let workerStartDelayMs = parseInteger(process.env.SCRAPE_WORKER_START_DELAY_MS ?? '2000', 'workerStartDelayMs', 0, 60000);
    let maxRetries = parseInteger(process.env.SCRAPE_MAX_RETRIES ?? '2', 'maxRetries', 0, 5);
    let itemDelayMs = parseInteger(process.env.SCRAPE_ITEM_DELAY_MS ?? '0', 'itemDelayMs', 0, 60000);

    for (let index = 0; index < argv.length; index++) {
        const arg = argv[index];
        switch (arg) {
            case '--target':
                target = parseTargetFlag(argv, index);
                index += 1;
                break;
            case '--scraper':
                scraper = takeValue(argv, index, '--scraper');
                index += 1;
                break;
            case '--target-url':
                targetUrls.push(ensureUrl(takeValue(argv, index, '--target-url')));
                index += 1;
                break;
            case '--urls-file':
                targetUrls.push(...loadUrlsFromFile(takeValue(argv, index, '--urls-file')));
                index += 1;
                break;
            case '--concurrency':
                concurrency = parseInteger(takeValue(argv, index, '--concurrency'), 'concurrency', 1, 32);
                index += 1;
                break;
            case '--public-session':
                browserSessionMode = 'public-session';
                break;
            case '--guest-session':
                browserSessionMode = 'guest-session';
                break;
            case '--screen-video':
                screenVideo = true;
                break;
            case '--no-screen-video':
                screenVideo = false;
                break;
            case '--full-page-screenshot':
                fullPageScreenshot = true;
                break;
            case '--no-expand-comments':
                expandComments = false;
                break;
            case '--no-download':
                download = false;
                break;
            case '--output-file':
                outputFile = takeValue(argv, index, '--output-file');
                index += 1;
                break;
            case '--chrome-executable':
                chromeExecutable = takeValue(argv, index, '--chrome-executable');
                index += 1;
                break;
            case '--profile-root-dir':
                profileRootDir = takeValue(argv, index, '--profile-root-dir');
                index += 1;
                break;
            case '--wait-after-navigation-ms':
                waitAfterNavigationMs = parseInteger(takeValue(argv, index, '--wait-after-navigation-ms'), 'waitAfterNavigationMs', 0, 120000);
                index += 1;
                break;
            case '--request-timeout-secs':
                requestTimeoutSecs = parseInteger(takeValue(argv, index, '--request-timeout-secs'), 'requestTimeoutSecs', 30, 3600);
                index += 1;
                break;
            case '--verbose':
                verbose = true;
                break;
            case '--regenerate-script':
                regenerateScript = true;
                break;
            case '--workers':
                workers = parseInteger(takeValue(argv, index, '--workers'), 'workers', 1, 20);
                index += 1;
                break;
            case '--worker-concurrency':
                workerConcurrency = parseInteger(takeValue(argv, index, '--worker-concurrency'), 'workerConcurrency', 1, 16);
                index += 1;
                break;
            case '--worker-start-delay-ms':
                workerStartDelayMs = parseInteger(takeValue(argv, index, '--worker-start-delay-ms'), 'workerStartDelayMs', 0, 60000);
                index += 1;
                break;
            case '--max-retries':
                maxRetries = parseInteger(takeValue(argv, index, '--max-retries'), 'maxRetries', 0, 5);
                index += 1;
                break;
            case '--item-delay-ms':
                itemDelayMs = parseInteger(takeValue(argv, index, '--item-delay-ms'), 'itemDelayMs', 0, 60000);
                index += 1;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!target) throw new Error('Missing required flag: --target');
    if (!scraper) throw new Error('Missing required flag: --scraper');
    if (targetUrls.length === 0) {
        throw new Error('Missing target URLs. Provide --target-url <url> and/or --urls-file <path>.');
    }
    if (!getTargetPlugin(target).scrapers.includes(scraper)) {
        throw new Error(`Unsupported scraper for ${target}: ${scraper}`);
    }
    if (browserSessionMode !== 'persistent-profile' && target !== 'facebook') {
        throw new Error('--public-session and --guest-session are currently supported only for --target facebook.');
    }
    if (workers > 1 && workers * workerConcurrency > 100) {
        throw new Error('workers * worker-concurrency must not exceed 100.');
    }
    return {
        command: 'run',
        target,
        scraper,
        targetUrls,
        concurrency,
        browserSessionMode,
        screenVideo,
        download,
        outputFile,
        chromeExecutable,
        profileRootDir,
        waitAfterNavigationMs,
        requestTimeoutSecs,
        verbose,
        artifactRootDir,
        regenerateScript,
        fullPageScreenshot,
        expandComments,
        workers,
        workerConcurrency,
        workerStartDelayMs,
        maxRetries,
        itemDelayMs,
    };
};

const parseWatchArgs = (argv: string[]): WatchCliOptions => {
    let configPath: string | undefined;
    let profileRootDir = process.env.SCRAPE_PROFILE_ROOT_DIR ?? defaultProfileRootDir;
    let artifactRootDir = process.env.SCRAPE_ARTIFACT_ROOT_DIR ?? defaultArtifactRootDir;
    let chromeExecutable = process.env.SCRAPE_CHROME_EXECUTABLE ?? defaultChromeExecutable;
    let once = false;
    let verbose = false;

    for (let index = 1; index < argv.length; index++) {
        const arg = argv[index];
        switch (arg) {
            case '--config':
                configPath = takeValue(argv, index, '--config');
                index += 1;
                break;
            case '--chrome-executable':
                chromeExecutable = takeValue(argv, index, '--chrome-executable');
                index += 1;
                break;
            case '--profile-root-dir':
                profileRootDir = takeValue(argv, index, '--profile-root-dir');
                index += 1;
                break;
            case '--artifact-root-dir':
                artifactRootDir = takeValue(argv, index, '--artifact-root-dir');
                index += 1;
                break;
            case '--once':
                once = true;
                break;
            case '--verbose':
                verbose = true;
                break;
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!configPath) throw new Error('Missing required flag: --config');
    return {
        command: 'watch',
        configPath,
        profileRootDir,
        artifactRootDir,
        chromeExecutable,
        once,
        verbose,
    };
};

/** Drop npm/pnpm passthrough `--` and optional leading `scrape` subcommand name. */
const normalizeArgv = (argv: string[]): string[] => {
    const withoutScrape = argv[0] === 'scrape' ? argv.slice(1) : argv;
    return withoutScrape.filter((arg) => arg !== '--');
};

export const parseCliArgs = (argv: string[]): ParsedCli => {
    const normalizedArgv = normalizeArgv(argv);

    if (normalizedArgv.length === 0 || normalizedArgv.includes('-h') || normalizedArgv.includes('--help')) {
        return { kind: 'help', text: helpText };
    }
    if (normalizedArgv.includes('--version')) return { kind: 'version' };
    if (normalizedArgv[0] === 'watch') {
        return { kind: 'watch', options: parseWatchArgs(normalizedArgv) };
    }
    if (normalizedArgv[0] === 'profile') {
        const options = parseProfileArgs(normalizedArgv);
        return options.command === 'profile-login'
            ? { kind: 'profile-login', options }
            : { kind: 'profile-path', options };
    }
    return { kind: 'run', options: parseRunArgs(normalizedArgv) };
};

export { helpText };
