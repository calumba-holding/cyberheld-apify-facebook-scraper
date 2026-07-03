import { readFileSync } from 'node:fs';

import { isSupportedTarget, SUPPORTED_TARGETS } from '../registry.js';
import type { SupportedTarget } from '../common/types.js';

export const parseBooleanEnv = (value: string | undefined, fallback: boolean): boolean => {
    if (!value) return fallback;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
    return fallback;
};

export const parseInteger = (value: string, name: string, min: number, max: number): number => {
    const parsed = Number.parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
        throw new Error(`${name} must be an integer between ${String(min)} and ${String(max)}.`);
    }
    return parsed;
};

export const takeValue = (args: string[], index: number, name: string): string => {
    const value = args[index + 1];
    if (!value || value.startsWith('-')) throw new Error(`${name} requires a value.`);
    return value;
};

export const ensureUrl = (value: string): string => {
    if (!URL.canParse(value)) throw new Error('--target-url must be a valid URL.');
    return new URL(value).toString();
};

export const loadUrlsFromFile = (filePath: string): string[] => (
    readFileSync(filePath, 'utf8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('#'))
        .map(ensureUrl)
);

export const parseTargetFlag = (args: string[], index: number): SupportedTarget => {
    const value = takeValue(args, index, '--target');
    if (!isSupportedTarget(value)) throw new Error(`--target must be one of: ${SUPPORTED_TARGETS.join(', ')}`);
    return value;
};
