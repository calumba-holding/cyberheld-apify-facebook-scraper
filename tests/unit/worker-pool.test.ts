import { describe, expect, it } from 'vitest';

import { chunkUrlsForWorkers } from '../../src/cli/worker-pool.js';

describe('chunkUrlsForWorkers', () => {
    it('splits urls evenly across workers preserving order', () => {
        const urls = ['a', 'b', 'c', 'd', 'e', 'f'];
        expect(chunkUrlsForWorkers(urls, 3)).toEqual([
            ['a', 'b'],
            ['c', 'd'],
            ['e', 'f'],
        ]);
    });

    it('distributes the remainder to the first workers', () => {
        const urls = ['a', 'b', 'c', 'd', 'e'];
        expect(chunkUrlsForWorkers(urls, 3)).toEqual([
            ['a', 'b'],
            ['c', 'd'],
            ['e'],
        ]);
    });

    it('produces empty chunks when there are more workers than urls', () => {
        const urls = ['a', 'b'];
        expect(chunkUrlsForWorkers(urls, 5)).toEqual([
            ['a'],
            ['b'],
            [],
            [],
            [],
        ]);
    });

    it('concatenating chunks reconstructs the original url order', () => {
        const urls = Array.from({ length: 17 }, (_unused, index) => `url-${String(index)}`);
        const chunks = chunkUrlsForWorkers(urls, 4);
        expect(chunks.flat()).toEqual(urls);
    });
});
