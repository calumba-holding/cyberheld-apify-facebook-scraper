type InputObject = Record<string, unknown>;

export type BrowserMode = 'cdp' | 'managed';

export type FacebookScraperInput = {
    url: string;
    browserMode: BrowserMode;
    recordVideo: boolean;
    externalChromeCdpUrl?: string;
    headless: boolean;
    waitAfterNavigationMs: number;
    requestHandlerTimeoutSecs: number;
    proxyConfiguration?: InputObject;
};

const DEFAULTS = {
    browserMode: 'managed' as BrowserMode,
    recordVideo: false,
    headless: false,
    waitAfterNavigationMs: 5000,
    requestHandlerTimeoutSecs: 240,
};

const toObject = (value: unknown, name: string): InputObject => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${name} must be an object.`);
    return value as InputObject;
};

const toBoolean = (value: unknown, fallback: boolean, name: string): boolean => {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') throw new Error(`${name} must be a boolean.`);
    return value;
};

const toInteger = (value: unknown, fallback: number, name: string, min: number, max: number): number => {
    const candidate = value === undefined ? fallback : value;
    if (typeof candidate !== 'number' || !Number.isFinite(candidate)) {
        throw new Error(`${name} must be a number.`);
    }

    const parsed = Math.trunc(candidate);
    if (parsed < min || parsed > max) throw new Error(`${name} must be an integer between ${min} and ${max}.`);
    return parsed;
};

const toRequiredUrl = (value: unknown, name: string): string => {
    if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required and must be a non-empty string.`);
    try {
        return new URL(value).toString();
    } catch {
        throw new Error(`${name} must be a valid URL.`);
    }
};

const toOptionalString = (value: unknown, name: string): string | undefined => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value !== 'string') throw new Error(`${name} must be a string.`);
    return value.trim();
};

const parseBrowserMode = (value: unknown): BrowserMode => {
    if (value === undefined) return DEFAULTS.browserMode;
    if (value !== 'cdp' && value !== 'managed') {
        throw new Error('browserMode must be either "cdp" or "managed".');
    }

    return value;
};

export const parseInput = (rawInput: unknown): FacebookScraperInput => {
    const input = toObject(rawInput ?? {}, 'Actor input');
    const browserMode = parseBrowserMode(input.browserMode);
    const externalChromeCdpUrl = toOptionalString(input.externalChromeCdpUrl, 'externalChromeCdpUrl');

    if (browserMode === 'cdp' && !externalChromeCdpUrl) {
        throw new Error('externalChromeCdpUrl is required when browserMode is "cdp".');
    }

    if (externalChromeCdpUrl) {
        try {
            new URL(externalChromeCdpUrl);
        } catch {
            throw new Error('externalChromeCdpUrl must be a valid URL.');
        }
    }

    return {
        url: toRequiredUrl(input.url, 'url'),
        browserMode,
        recordVideo: toBoolean(input.recordVideo, DEFAULTS.recordVideo, 'recordVideo'),
        externalChromeCdpUrl,
        headless: toBoolean(input.headless, DEFAULTS.headless, 'headless'),
        waitAfterNavigationMs: toInteger(input.waitAfterNavigationMs, DEFAULTS.waitAfterNavigationMs, 'waitAfterNavigationMs', 0, 120000),
        requestHandlerTimeoutSecs: toInteger(input.requestHandlerTimeoutSecs, DEFAULTS.requestHandlerTimeoutSecs, 'requestHandlerTimeoutSecs', 30, 3600),
        proxyConfiguration: input.proxyConfiguration ? toObject(input.proxyConfiguration, 'proxyConfiguration') : undefined,
    };
};
