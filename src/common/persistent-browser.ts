import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { chromium, type Browser, type BrowserContext } from 'playwright';

import { applyGuestSessionStealth, GUEST_SESSION_LOCALE, GUEST_SESSION_TIMEZONE, GUEST_SESSION_USER_AGENT } from './browser-stealth.js';
import { log } from './logger.js';

type LaunchChromeOptions = {
    executablePath: string;
    recordVideoDir?: string;
    stealth?: boolean;
};

type LaunchPersistentChromeOptions = LaunchChromeOptions & {
    profileDir: string;
};

const closeExtraBlankPages = async (context: BrowserContext): Promise<void> => {
    await Promise.all(context.pages()
        .filter((page) => page.url() === 'about:blank')
        .map(async (page) => page.close().catch(() => undefined)));
};

const launchChromeContext = async (
    profileDir: string,
    options: LaunchChromeOptions,
): Promise<BrowserContext> => {
    await mkdir(profileDir, { recursive: true });
    const recordingEnabled = Boolean(options.recordVideoDir);

    const args = [
        ...(recordingEnabled ? ['--window-size=1280,720', '--disable-gpu'] : []),
        ...(options.stealth ? ['--disable-blink-features=AutomationControlled'] : []),
    ];

    const context = await chromium.launchPersistentContext(profileDir, {
        executablePath: options.executablePath,
        headless: false,
        viewport: recordingEnabled ? { width: 1280, height: 720 } : { width: 1366, height: 768 },
        locale: options.stealth ? GUEST_SESSION_LOCALE : undefined,
        timezoneId: options.stealth ? GUEST_SESSION_TIMEZONE : undefined,
        userAgent: options.stealth ? GUEST_SESSION_USER_AGENT : undefined,
        args: args.length > 0 ? args : undefined,
        ignoreDefaultArgs: options.stealth ? ['--enable-automation'] : undefined,
        recordVideo: options.recordVideoDir
            ? { dir: options.recordVideoDir, size: { width: 1280, height: 720 } }
            : undefined,
    });

    if (options.stealth) await applyGuestSessionStealth(context);
    await closeExtraBlankPages(context);
    return context;
};

const attachTemporaryProfileCleanup = (
    context: BrowserContext,
    profileDir: string,
    browser?: Browser,
): BrowserContext => {
    const originalClose = context.close.bind(context);
    context.close = (async (...args: Parameters<BrowserContext['close']>) => {
        try {
            await originalClose(...args);
        } finally {
            await browser?.close().catch(() => undefined);
            await rm(profileDir, { force: true, recursive: true }).catch(() => undefined);
        }
    }) as BrowserContext['close'];
    return context;
};

export const launchPersistentChromeContext = async (
    options: LaunchPersistentChromeOptions,
): Promise<BrowserContext> => {
    log.info(`Launching persistent Chrome profile at ${options.profileDir}`);
    return launchChromeContext(options.profileDir, options);
};

export const launchTemporaryChromeContext = async (
    options: LaunchChromeOptions & { profilePrefix?: string },
): Promise<BrowserContext> => {
    const profileDir = await mkdtemp(join(tmpdir(), options.profilePrefix ?? 'scrape-guest-profile-'));
    log.info(`Launching temporary Chrome profile at ${profileDir}`);
    const recordingEnabled = Boolean(options.recordVideoDir);
    const args = [
        ...(recordingEnabled ? ['--window-size=1280,720', '--disable-gpu'] : ['--window-size=1366,768']),
        ...(options.stealth ? ['--disable-blink-features=AutomationControlled', '--lang=de-AT'] : []),
    ];

    const browser = await chromium.launch({
        executablePath: options.executablePath,
        headless: false,
        args,
        ignoreDefaultArgs: options.stealth ? ['--enable-automation'] : undefined,
    });

    const context = await browser.newContext({
        viewport: recordingEnabled ? { width: 1280, height: 720 } : { width: 1366, height: 768 },
        locale: options.stealth ? GUEST_SESSION_LOCALE : undefined,
        timezoneId: options.stealth ? GUEST_SESSION_TIMEZONE : undefined,
        userAgent: options.stealth ? GUEST_SESSION_USER_AGENT : undefined,
        recordVideo: options.recordVideoDir
            ? { dir: options.recordVideoDir, size: { width: 1280, height: 720 } }
            : undefined,
    });

    if (options.stealth) await applyGuestSessionStealth(context);
    return attachTemporaryProfileCleanup(context, profileDir, browser);
};
