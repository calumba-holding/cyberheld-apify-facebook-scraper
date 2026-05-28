import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { incidentFilePath } from './paths.js';
import type { WatchIncidentSummary } from './types.js';

export const writeIncidentSummary = async (
    incidentsDir: string,
    summary: WatchIncidentSummary,
): Promise<string> => {
    const filePath = incidentFilePath(incidentsDir, summary.incidentId);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    return filePath;
};
