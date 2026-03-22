import { access } from 'node:fs/promises';
import { spawn, type ChildProcess } from 'node:child_process';

import { log } from './logger.js';

export type ScreenRecording = {
    outputPath: string;
    stop: () => Promise<string | undefined>;
};

const detectScreenIndex = async (): Promise<number | undefined> => {
    return new Promise((resolve) => {
        const probe = spawn('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
            stdio: ['ignore', 'ignore', 'pipe'],
        });

        let stderr = '';
        probe.stderr.on('data', (chunk: Buffer) => {
            stderr += chunk.toString();
        });

        const finish = (): void => {
            const matches = Array.from(stderr.matchAll(/\[(\d+)\]\s+Capture screen/gi));
            resolve(matches.length ? Number.parseInt(matches[0][1], 10) : undefined);
        };

        probe.on('error', () => resolve(undefined));
        probe.on('close', finish);
    });
};

const waitForExit = (processToWaitFor: ChildProcess, timeoutMs: number): Promise<void> => {
    return new Promise((resolve) => {
        let settled = false;
        const timer = setTimeout(() => {
            if (settled) return;
            settled = true;
            processToWaitFor.kill('SIGKILL');
            resolve();
        }, timeoutMs);

        processToWaitFor.once('close', () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
        });
    });
};

export const startScreenRecording = async (outputPath: string, preferredScreenIndex?: number): Promise<ScreenRecording | null> => {
    const screenIndex = preferredScreenIndex ?? await detectScreenIndex();
    if (screenIndex === undefined) {
        log.warning('Could not find a macOS screen capture device for ffmpeg. Continuing without video.');
        return null;
    }

    log.info(`Starting screen recording with ffmpeg on AVFoundation screen index ${screenIndex}.`);
    const recorder = spawn('ffmpeg', [
        '-y',
        '-f', 'avfoundation',
        '-framerate', '30',
        '-capture_cursor', '1',
        '-i', `${screenIndex}:none`,
        '-pix_fmt', 'yuv420p',
        '-vcodec', 'libx264',
        '-preset', 'ultrafast',
        outputPath,
    ], {
        stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    recorder.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
    });

    recorder.on('error', (error) => {
        log.warning(`Could not start ffmpeg screen recording: ${error.message}`);
    });

    await new Promise((resolve) => setTimeout(resolve, 1500));

    return {
        outputPath,
        stop: async () => {
            if (recorder.exitCode === null && !recorder.killed) recorder.kill('SIGINT');
            await waitForExit(recorder, 8000);

            try {
                await access(outputPath);
                return outputPath;
            } catch {
                if (stderr.trim()) log.warning(`ffmpeg did not produce a video file. ${stderr.trim().split('\n').slice(-2).join(' ')}`);
                return undefined;
            }
        },
    };
};
