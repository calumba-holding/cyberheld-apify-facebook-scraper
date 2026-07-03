import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { eventFilePath } from './paths.js';
import type { CommentEvent } from './types.js';

export const writeCommentEvent = async (eventsDir: string, event: CommentEvent): Promise<string> => {
    const filePath = eventFilePath(eventsDir, event.observedAt, event.eventId);
    await mkdir(dirname(filePath), { recursive: true });
    await writeFile(filePath, `${JSON.stringify(event, null, 2)}\n`, 'utf8');
    return filePath;
};
