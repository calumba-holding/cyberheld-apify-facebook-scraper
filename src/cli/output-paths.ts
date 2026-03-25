import { dirname, join, basename } from 'node:path';

export const resolveRunOutputFile = (outputFile: string | undefined, runId: string): string | undefined => {
    if (!outputFile) return undefined;
    return join(dirname(outputFile), `${runId}_${basename(outputFile)}`);
};
