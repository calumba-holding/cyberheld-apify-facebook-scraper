import type { Page } from 'playwright';

export interface ScriptRunResult {
    ok: boolean;
    empty: boolean;
    value: unknown;
}

const isPlainObject = (val: unknown): val is Record<string, unknown> =>
    typeof val === 'object' && val !== null && !Array.isArray(val);

const hasOnlyEmptyArrays = (obj: Record<string, unknown>): boolean => {
    const values = Object.values(obj);
    const arrays = values.filter((v): v is unknown[] => Array.isArray(v));
    if (arrays.length === 0) return false;
    const hasNonEmptyString = values.some((v) => typeof v === 'string' && v.length > 0);
    return arrays.every((a) => a.length === 0) && !hasNonEmptyString;
};

export const runScript = async (page: Page, script: string): Promise<ScriptRunResult> => {
    try {
        const result = await page.evaluate<unknown>(`(function(){\n${script}\n})()`);
        if (result === null || result === undefined) {
            return { ok: false, empty: true, value: null };
        }
        const empty = isPlainObject(result) && hasOnlyEmptyArrays(result);
        return { ok: true, empty, value: result };
    } catch {
        return { ok: false, empty: true, value: null };
    }
};
