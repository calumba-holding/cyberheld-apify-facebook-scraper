import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

/** Bring Chrome to the front on the Xvfb display (visible in noVNC). */
export const focusChromeOnDisplay = async (): Promise<void> => {
    if (!process.env.DISPLAY) return;
    try {
        await execFileAsync('/usr/local/bin/focus-chrome.sh', [], { timeout: 10_000 });
    } catch {
        // Optional on non-Docker hosts
    }
};
