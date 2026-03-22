import { homedir } from 'node:os';
import { join } from 'node:path';

export const defaultProfileRootDir = join(homedir(), '.scrape', 'profiles');
