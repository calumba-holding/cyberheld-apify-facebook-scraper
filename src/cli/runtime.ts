import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin as input } from 'node:process';
import { fileURLToPath } from 'node:url';
import { log, setVerboseLogging } from '../common/logger.js';
import { buildFailedOutput, buildRunOutput, buildSuccessOutput, type ScrapeItemOutput, type ScrapeRunOutput, type VideoArtifact } from '../common/output-item.js';
import { getTargetPlugin } from '../registry.js';
import type { TargetPlugin } from '../common/types.js';
import { helpText } from './parse.js';
import { runWatchService } from '../watch/service.js';
import type { ParsedCli, ProfileStatusOutput, RunCliOptions } from './types.js';
import { resolveRunOutputFile } from './output-paths.js';
import { finalizeVideoArtifact, prepareRawVideoDir } from './video-artifacts.js';
import { runWorkerPool } from './worker-pool.js';
const ensureParentDirectory = async (filePath: string): Promise<void> => {
    await mkdir(dirname(filePath), { recursive: true });
};
const writeJsonFile = async (filePath: string, value: unknown): Promise<void> => {
    await ensureParentDirectory(filePath);
    await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
};
const emitJson = async (outputJson: ScrapeRunOutput | ProfileStatusOutput, outputFile?: string): Promise<void> => {
    if (outputFile) await writeJsonFile(outputFile, outputJson);
    process.stdout.write(`${JSON.stringify(outputJson, null, 2)}\n`);
};
const mapLimit = async <T, R>(items: T[], limit: number, worker: (item: T, index: number) => Promise<R>): Promise<R[]> => {
    const results = new Array<R>(items.length);
    let nextIndex = 0;

    const runWorker = async (): Promise<void> => {
        while (true) {
            const currentIndex = nextIndex;
            nextIndex += 1;
            if (currentIndex >= items.length) return;
            results[currentIndex] = await worker(items[currentIndex], currentIndex);
        }
    };

    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => runWorker()));
    return results;
};

export const runScrapeCommand = async (options: RunCliOptions): Promise<ScrapeRunOutput> => {
    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const plugin = getTargetPlugin(options.target) as TargetPlugin;
    const profileDir = plugin.getProfileDir(options.profileRootDir, options.browserSessionMode);
    let videoArtifact: VideoArtifact = { present: false };
    const recordVideoDir = await prepareRawVideoDir(options, runId);
    const context = await plugin.launchBrowser({
        browserSessionMode: options.browserSessionMode,
        chromeExecutable: options.chromeExecutable,
        profileRootDir: options.profileRootDir,
        recordVideoDir,
    });
    let results: ScrapeItemOutput[] = [];

    try {
        results = await mapLimit(options.targetUrls, options.concurrency, async (targetUrl, itemIndex): Promise<ScrapeItemOutput> => {
            try {
                log.info(`Scraping ${targetUrl}`);
                const scrapeResult = await plugin.runScrape(context, options.scraper, targetUrl, {
                    ...options,
                    runId,
                    itemIndex,
                });
                return buildSuccessOutput(scrapeResult, runId, options.browserSessionMode);
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                const blockedPage = error instanceof Error && 'blockedPage' in error
                    ? (error as Error & { blockedPage?: Parameters<typeof buildFailedOutput>[4] }).blockedPage
                    : undefined;
                log.error(`${targetUrl}: ${message}`);
                return buildFailedOutput(targetUrl, runId, message, options.browserSessionMode, blockedPage);
            }
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results = options.targetUrls.map((targetUrl) => buildFailedOutput(targetUrl, runId, message, options.browserSessionMode));
    } finally {
        await context.close().catch(() => undefined);
    }

    const sessionVideos = results
        .map((result) => result.artifacts?.sessionVideo?.localPath)
        .filter((path): path is string => Boolean(path));

    if (sessionVideos.length > 0) {
        videoArtifact = { present: true, localPath: sessionVideos[0] };
        if (sessionVideos.length > 1) {
            log.info(`Recorded ${String(sessionVideos.length)} session videos (one per parallel tab).`);
        }
    } else {
        videoArtifact = await finalizeVideoArtifact(
            options,
            runId,
            recordVideoDir,
            results.some((result) => result.scrape.status !== 'FAILED'),
        );
    }

    return buildRunOutput(
        options.target,
        options.scraper,
        profileDir,
        options.browserSessionMode,
        runId,
        startedAt,
        new Date().toISOString(),
        options.concurrency,
        options.targetUrls.length,
        videoArtifact,
        results,
    );
};

const waitForProfileLoginComplete = async (): Promise<void> => {
    const autoWaitSecs = Number.parseInt(process.env.SCRAPE_LOGIN_AUTO_WAIT_SECS ?? '', 10);
    if (Number.isFinite(autoWaitSecs) && autoWaitSecs > 0 && !process.stdin.isTTY) {
        process.stderr.write(`Waiting up to ${String(autoWaitSecs)}s for login (SCRAPE_LOGIN_AUTO_WAIT_SECS, non-interactive)...\n`);
        await new Promise((resolve) => setTimeout(resolve, autoWaitSecs * 1000));
        return;
    }

    process.stderr.write('Log into the target in the browser, then press Enter here when ready.\n');
    const rl = createInterface({ input, output: process.stderr });
    await rl.question('Press Enter after login is complete... ');
    rl.close();
};

const runProfileLoginCommand = async (target: RunCliOptions['target'], chromeExecutable: string, profileRootDir: string): Promise<ProfileStatusOutput> => {
    const plugin = getTargetPlugin(target);
    const context = await plugin.openProfileLoginBrowser({ chromeExecutable, profileRootDir });
    const profileDir = plugin.getProfileDir(profileRootDir);

    try {
        process.stderr.write(`Opened persistent profile at ${profileDir}\n`);
        await waitForProfileLoginComplete();
        return { target, profileDir, status: 'ready' };
    } finally {
        await context.close().catch(() => undefined);
    }
};

export const runCli = async (parsed: ParsedCli): Promise<void> => {
    if (parsed.kind === 'help') {
        process.stdout.write(`${parsed.text}\n`);
        return;
    }

    if (parsed.kind === 'version') {
        const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json');
        const pkg = JSON.parse(await readFile(pkgPath, 'utf8')) as { version: string };
        process.stdout.write(`${pkg.version}\n`);
        return;
    }

    if (parsed.kind === 'profile-path') {
        await emitJson({
            target: parsed.options.target,
            profileDir: getTargetPlugin(parsed.options.target).getProfileDir(parsed.options.profileRootDir),
            status: 'ok',
        });
        return;
    }

    if (parsed.kind === 'profile-login') {
        setVerboseLogging(parsed.options.verbose);
        await emitJson(await runProfileLoginCommand(parsed.options.target, parsed.options.chromeExecutable, parsed.options.profileRootDir));
        return;
    }

    if (parsed.kind === 'watch') {
        setVerboseLogging(parsed.options.verbose);
        await runWatchService({
            configPath: parsed.options.configPath,
            profileRootDir: parsed.options.profileRootDir,
            artifactRootDir: parsed.options.artifactRootDir,
            chromeExecutable: parsed.options.chromeExecutable,
            once: parsed.options.once,
        });
        return;
    }

    setVerboseLogging(parsed.options.verbose);
    const outputJson = parsed.options.workers > 1
        ? await runWorkerPool(parsed.options)
        : await runScrapeCommand(parsed.options);
    await emitJson(outputJson, resolveRunOutputFile(parsed.options.outputFile, outputJson.run.runId));
    if (outputJson.summary.failed > 0) process.exitCode = 1;
};

export const printCliError = (error: unknown): void => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${helpText}\n`);
};
