import { describe, expect, it } from 'vitest';

import { parseInstagramCount } from '../../src/instagram/post-extraction.js';

describe('parseInstagramCount', () => {
    it('parses compact instagram counts', () => {
        expect(parseInstagramCount('60.4M')).toBe(60_400_000);
        expect(parseInstagramCount('3.8M')).toBe(3_800_000);
        expect(parseInstagramCount('1.2K')).toBe(1_200);
    });

    it('parses plain integer instagram counts', () => {
        expect(parseInstagramCount('987')).toBe(987);
        expect(parseInstagramCount('12,345')).toBe(12_345);
        expect(parseInstagramCount('28 likes')).toBe(28);
        expect(parseInstagramCount('134 comments')).toBe(134);
    });

    it('returns undefined for non-count labels', () => {
        expect(parseInstagramCount('Like')).toBeUndefined();
        expect(parseInstagramCount('Load more comments')).toBeUndefined();
    });
});
