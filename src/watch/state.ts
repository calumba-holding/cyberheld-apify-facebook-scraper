import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import type { PostWatchState, WatchConfig, WatchState } from './types.js';
import { WATCH_STATE_VERSION } from './types.js';

const ensureParent = async (filePath: string): Promise<void> => {
    await mkdir(dirname(filePath), { recursive: true });
};

export const emptyPostState = (): PostWatchState => ({
    lastSeenCommentKeys: [],
    openIncidentEventCount: 0,
});

export const createInitialState = (config: WatchConfig): WatchState => {
    const posts: WatchState['posts'] = {};
    for (const { postUrl } of config.posts) {
        posts[postUrl] = emptyPostState();
    }
    return {
        version: WATCH_STATE_VERSION,
        workerId: config.workerId,
        updatedAt: new Date().toISOString(),
        posts,
    };
};

export const loadWatchState = async (stateFile: string, config: WatchConfig): Promise<WatchState> => {
    try {
        const raw = await readFile(stateFile, 'utf8');
        const parsed = JSON.parse(raw) as WatchState;
        if (parsed.version !== WATCH_STATE_VERSION || parsed.workerId !== config.workerId) {
            return createInitialState(config);
        }
        for (const { postUrl } of config.posts) {
            if (!parsed.posts[postUrl]) parsed.posts[postUrl] = emptyPostState();
        }
        return parsed;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
            return createInitialState(config);
        }
        throw error;
    }
};

export const saveWatchState = async (stateFile: string, state: WatchState): Promise<void> => {
    await ensureParent(stateFile);
    const next: WatchState = { ...state, updatedAt: new Date().toISOString() };
    await writeFile(stateFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
};
