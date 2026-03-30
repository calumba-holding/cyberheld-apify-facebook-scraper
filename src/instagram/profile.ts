import { join } from 'node:path';

import { defaultProfileRootDir } from '../common/profile.js';

export const getProfileDir = (overrideRootDir?: string): string => {
    return join(overrideRootDir || defaultProfileRootDir, 'instagram');
};

export const getLoginUrl = (): string => 'https://www.instagram.com/accounts/login/';
