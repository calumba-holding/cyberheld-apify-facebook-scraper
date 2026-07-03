import { execFile } from 'node:child_process';
import { unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { getProfileDir } from '../facebook/profile.js';

const execFileAsync = promisify(execFile);

const LOCK_FILES = ['SingletonLock', 'SingletonSocket', 'SingletonCookie'] as const;

type CleanupOptions = {
    /** Kill stray Chrome before relaunch (default true). Skip on first watch launch — same as login. */
    killChrome?: boolean;
};

/** Remove Chrome singleton locks so a new container can open the profile. */
export const cleanupChromeProfileLocks = async (
    profileRootDir: string,
    options: CleanupOptions = {},
): Promise<void> => {
    const killChrome = options.killChrome ?? true;
    const profileDir = getProfileDir(profileRootDir);
    await Promise.all(LOCK_FILES.map((name) => unlink(join(profileDir, name)).catch(() => undefined)));

    if (process.env.DISPLAY && killChrome) {
        try {
            await execFileAsync('pkill', ['-f', '[c]hrome'], { timeout: 5000 });
        } catch {
            // No running chrome — fine
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }
};
