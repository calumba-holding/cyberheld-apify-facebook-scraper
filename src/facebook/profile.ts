import { join } from 'node:path';

import type { BrowserSessionMode } from '../common/types.js';
import { defaultProfileRootDir } from '../common/profile.js';

export const getProfileDir = (
    overrideRootDir?: string,
    browserSessionMode: BrowserSessionMode = 'persistent-profile',
): string => {
    const rootDir = overrideRootDir || defaultProfileRootDir;
    if (browserSessionMode === 'public-session') return join(rootDir, 'facebook-public');
    return join(rootDir, 'facebook');
};

export const getLoginUrl = (): string => 'https://www.facebook.com/';
