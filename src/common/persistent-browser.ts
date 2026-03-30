import { mkdir } from 'node:fs/promises';
import { chromium, type BrowserContext } from 'playwright';

import { log } from './logger.js';

type LaunchPersistentChromeOptions = {
    profileDir: string;
    executablePath: string;
    recordVideoDir?: string;
};

const closeExtraBlankPages = async (context: BrowserContext): Promise<void> => {
    await Promise.all(context.pages()
        .filter((page) => page.url() === 'about:blank')
        .map(async (page) => page.close().catch(() => undefined)));
};

export const launchPersistentChromeContext = async (
    options: LaunchPersistentChromeOptions,
): Promise<BrowserContext> => {
    await mkdir(options.profileDir, { recursive: true });
    const recordingEnabled = Boolean(options.recordVideoDir);

    log.info(`Launching persistent Chrome profile at ${options.profileDir}`);
    const context = await chromium.launchPersistentContext(options.profileDir, {
        executablePath: options.executablePath,
        headless: false,
        viewport: recordingEnabled ? { width: 1280, height: 720 } : null,
        args: recordingEnabled ? ['--window-size=1280,720', '--disable-gpu'] : undefined,
        recordVideo: options.recordVideoDir
            ? { dir: options.recordVideoDir, size: { width: 1280, height: 720 } }
            : undefined,
    });

    await closeExtraBlankPages(context);
    return context;
};
