import { join } from 'node:path';

import type { WatchPaths } from './types.js';

export const resolveWatchPaths = (artifactRootDir: string, workerId: string): WatchPaths => {
    const watchRoot = join(artifactRootDir, 'watch', workerId);
    return {
        watchRoot,
        stateFile: join(watchRoot, 'state.json'),
        eventsDir: join(watchRoot, 'events'),
        incidentsDir: join(watchRoot, 'incidents'),
    };
};

export const eventFilePath = (eventsDir: string, observedAt: string, eventId: string): string => {
    const day = observedAt.slice(0, 10);
    return join(eventsDir, day, `${eventId}.json`);
};

export const incidentFilePath = (incidentsDir: string, incidentId: string): string =>
    join(incidentsDir, `${incidentId}.json`);
