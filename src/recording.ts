import { execFile, spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
type ScreenBounds = {
    width: number;
    height: number;
    scale: number;
};
type WindowBounds = {
    left: number;
    top: number;
    width: number;
    height: number;
};
export type ChromeSessionRecorder = {
    outputPath: string;
    stop: () => Promise<string>;
};
const makeEven = (value: number): number => {
    const rounded = Math.max(2, Math.round(value));
    return rounded % 2 === 0 ? rounded : rounded - 1;
};
const parseDeviceIndex = (devicesOutput: string): string => {
    for (const line of devicesOutput.split('\n')) {
        if (!line.includes('Capture screen 0')) continue;

        const markerStart = line.lastIndexOf('[');
        const markerEnd = line.indexOf(']', markerStart + 1);
        if (markerStart === -1 || markerEnd === -1) continue;

        const deviceIndex = line.slice(markerStart + 1, markerEnd).trim();
        if (deviceIndex) return deviceIndex;
    }

    throw new Error('Could not find the macOS screen capture device in ffmpeg.');
};

const readScreenDeviceIndex = async (): Promise<string> => {
    const { stderr } = await execFileAsync('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], {
        encoding: 'utf8',
    }).catch((error: Error & { stderr?: string }) => ({ stderr: error.stderr ?? '' }));

    return parseDeviceIndex(stderr);
};

const readChromeWindowBounds = async (): Promise<WindowBounds> => {
    const { stdout } = await execFileAsync('osascript', [
        '-e',
        'tell application "Google Chrome" to activate',
        '-e',
        'repeat 20 times',
        '-e',
        'tell application "Google Chrome"',
        '-e',
        'if (count of windows) > 0 then return bounds of front window',
        '-e',
        'end tell',
        '-e',
        'delay 0.25',
        '-e',
        'end repeat',
        '-e',
        'error "Could not find a visible Google Chrome window."',
    ], { encoding: 'utf8' });

    const [left, top, right, bottom] = stdout
        .trim()
        .split(',')
        .map((value) => Number(value.trim()));

    if ([left, top, right, bottom].some((value) => Number.isNaN(value))) {
        throw new Error(`Could not parse Chrome window bounds: ${stdout}`);
    }

    return {
        left,
        top,
        width: right - left,
        height: bottom - top,
    };
};

const readMainScreenBounds = async (): Promise<ScreenBounds> => {
    const { stdout } = await execFileAsync('osascript', [
        '-l',
        'JavaScript',
        '-e',
        [
            'ObjC.import("AppKit");',
            'const screen = $.NSScreen.mainScreen;',
            'const frame = screen.frame;',
            'const scale = Number(screen.backingScaleFactor);',
            'JSON.stringify({ width: Number(frame.size.width), height: Number(frame.size.height), scale });',
        ].join(' '),
    ], { encoding: 'utf8' });

    const output = stdout.trim();
    const parsed = JSON.parse(output) as ScreenBounds;
    if (!parsed.width || !parsed.height || !parsed.scale) {
        throw new Error(`Could not read the main screen bounds: ${output}`);
    }

    return parsed;
};

const buildCropFilter = (windowBounds: WindowBounds, screenBounds: ScreenBounds): string => {
    const scaledLeft = makeEven(windowBounds.left * screenBounds.scale);
    const scaledTop = makeEven(windowBounds.top * screenBounds.scale);
    const scaledWidth = makeEven(windowBounds.width * screenBounds.scale);
    const scaledHeight = makeEven(windowBounds.height * screenBounds.scale);
    const maxWidth = makeEven(screenBounds.width * screenBounds.scale);
    const maxHeight = makeEven(screenBounds.height * screenBounds.scale);

    const cropWidth = Math.min(scaledWidth, maxWidth - scaledLeft);
    const cropHeight = Math.min(scaledHeight, maxHeight - scaledTop);

    if (cropWidth <= 0 || cropHeight <= 0) {
        throw new Error('Chrome window bounds are outside the main display.');
    }

    return `crop=${cropWidth}:${cropHeight}:${scaledLeft}:${scaledTop}`;
};

export const startChromeWindowRecording = async (outputPath: string): Promise<ChromeSessionRecorder> => {
    if (process.platform !== 'darwin') {
        throw new Error('Whole Chrome window recording is currently implemented only for macOS.');
    }

    await mkdir(dirname(outputPath), { recursive: true });

    const [deviceIndex, windowBounds, screenBounds] = await Promise.all([
        readScreenDeviceIndex(),
        readChromeWindowBounds(),
        readMainScreenBounds(),
    ]);

    const cropFilter = buildCropFilter(windowBounds, screenBounds);
    const ffmpegArgs = [
        '-y',
        '-f',
        'avfoundation',
        '-framerate',
        '30',
        '-capture_cursor',
        '1',
        '-i',
        `${deviceIndex}:none`,
        '-vf',
        cropFilter,
        '-c:v',
        'libx264',
        '-preset',
        'veryfast',
        '-pix_fmt',
        'yuv420p',
        outputPath,
    ];

    const recorderProcess = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['pipe', 'ignore', 'pipe'],
    });

    let recentErrors = '';
    recorderProcess.stderr.on('data', (chunk: Buffer) => {
        recentErrors = `${recentErrors}${chunk.toString('utf8')}`.slice(-4000);
    });

    await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(resolve, 1200);
        recorderProcess.once('exit', (code) => {
            clearTimeout(timer);
            reject(new Error(`ffmpeg exited before recording started (code ${code ?? 'unknown'}): ${recentErrors}`));
        });
    });

    return {
        outputPath,
        stop: async () => {
            if (!recorderProcess.killed && recorderProcess.stdin.writable) {
                recorderProcess.stdin.write('q');
            }

            await new Promise<void>((resolve, reject) => {
                recorderProcess.once('exit', (code) => {
                    if (code === 0 || code === 255) {
                        resolve();
                        return;
                    }

                    reject(new Error(`ffmpeg exited with code ${code ?? 'unknown'}: ${recentErrors}`));
                });
            });

            return outputPath;
        },
    };
};
