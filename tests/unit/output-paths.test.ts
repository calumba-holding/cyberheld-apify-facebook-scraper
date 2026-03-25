import { describe, expect, it } from 'vitest';

import { resolveRunOutputFile } from '../../src/cli/output-paths.js';

describe('resolveRunOutputFile', () => {
    it('returns undefined when no output file was requested', () => {
        expect(resolveRunOutputFile(undefined, 'run-123')).toBeUndefined();
    });

    it('prefixes the output file name with the run id', () => {
        expect(resolveRunOutputFile('/tmp/out/comment-reactions.json', '24c81531')).toBe(
            '/tmp/out/24c81531_comment-reactions.json',
        );
    });
});
