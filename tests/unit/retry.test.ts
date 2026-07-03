import { describe, expect, it } from 'vitest';

import { computeBackoffMs } from '../../src/cli/retry.js';

describe('computeBackoffMs', () => {
    it('doubles starting from 1s', () => {
        expect(computeBackoffMs(1)).toBe(1000);
        expect(computeBackoffMs(2)).toBe(2000);
        expect(computeBackoffMs(3)).toBe(4000);
        expect(computeBackoffMs(4)).toBe(8000);
    });

    it('caps at 30s', () => {
        expect(computeBackoffMs(10)).toBe(30000);
    });
});
