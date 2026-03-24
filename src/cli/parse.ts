import { defaultArtifactRootDir, defaultChromeExecutable, defaultProfileRootDir, helpText } from './help.js';
import { isSupportedScraperForTarget, isSupportedTarget, SUPPORTED_TARGETS } from '../registry.js';
import type { SupportedTarget } from '../common/types.js';
import type { ParsedCli, ProfileLoginCliOptions, ProfilePathCliOptions, RunCliOptions } from './types.js';

const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
    if (!value) return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};

const parseInteger = (value: string, name: string, min: number, max: number): number => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} must be an integer between ${String(min)} and ${String(max)}.`);
    }
    return parsed;
};

const takeValue = (args: string[], index: number, name: string): string => {
    const value = args[index + 1];
    if (!value || value.startsWith('-')) throw new Error(`${name} requires a value.`);
    return value;
};

const ensureUrl = (value: string): string => {
    try {
        return new URL(value).toString();
    } catch {
        throw new Error('--target-url must be a valid URL.');
    }
};

const parseTargetFlag = (args: string[], index: number): SupportedTarget => {
    const value = takeValue(args, index, '--target');
    if (!isSupportedTarget(value)) throw new Error(`--target must be one of: ${SUPPORTED_TARGETS.join(', ')}`);
    return value;
};

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
    let screenVideo = parseBooleanEnv(process.env.SCRAPE_SCREEN_VIDEO, false);
    let outputFile: string | undefined;
    let chromeExecutable = process.env.SCRAPE_CHROME_EXECUTABLE ?? defaultChromeExecutable;
    let profileRootDir = process.env.SCRAPE_PROFILE_ROOT_DIR ?? defaultProfileRootDir;
    let waitAfterNavigationMs = parseInteger(process.env.SCRAPE_WAIT_AFTER_NAVIGATION_MS ?? '5000', 'waitAfterNavigationMs', 0, 120000);
    let requestTimeoutSecs = parseInteger(process.env.SCRAPE_REQUEST_TIMEOUT_SECS ?? '240', 'requestTimeoutSecs', 30, 3600);
    let concurrency = parseInteger(process.env.SCRAPE_CONCURRENCY ?? '1', 'concurrency', 1, 16);
    const artifactRootDir = process.env.SCRAPE_ARTIFACT_ROOT_DIR ?? defaultArtifactRootDir;
    let verbose = false;

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
            case '--concurrency':
                concurrency = parseInteger(takeValue(argv, index, '--concurrency'), 'concurrency', 1, 16);
                index += 1;
                break;
            case '--screen-video':
                screenVideo = true;
                break;
            case '--no-screen-video':
                screenVideo = false;
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
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    if (!target) throw new Error('Missing required flag: --target');
    if (!scraper) throw new Error('Missing required flag: --scraper');
    if (targetUrls.length === 0) throw new Error('Missing required flag: --target-url');
    if (!isSupportedScraperForTarget(target, scraper)) {
        throw new Error(`Unsupported scraper for ${target}: ${scraper}`);
    }

    return {
        command: 'run',
        target,
        scraper,
        targetUrls,
        concurrency,
        screenVideo,
        outputFile,
        chromeExecutable,
        profileRootDir,
        waitAfterNavigationMs,
        requestTimeoutSecs,
        verbose,
        artifactRootDir,
    };
};

export const parseCliArgs = (argv: string[]): ParsedCli => {
    if (argv.length === 0 || argv.includes('-h') || argv.includes('--help')) return { kind: 'help', text: helpText };
    if (argv.includes('--version')) return { kind: 'version' };
    if (argv[0] === 'profile') {
        const options = parseProfileArgs(argv);
        return options.command === 'profile-login'
            ? { kind: 'profile-login', options }
            : { kind: 'profile-path', options };
    }
    return { kind: 'run', options: parseRunArgs(argv) };
};

export { helpText };
