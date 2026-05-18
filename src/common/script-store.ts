import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPTS_DIR = PROJECT_ROOT;
const SCRIPTS_PATH = resolve(PROJECT_ROOT, 'scripts.json');

export interface StoredScript {
    script: string;
    version: number;
    createdAt: string;
    lastValidatedAt: string;
    brokenAt: string | null;
}

type ScriptStore = Record<string, StoredScript>;

const storeKey = (target: string, scraper: string): string => `${target}|${scraper}`;

const readStore = async (): Promise<ScriptStore> => {
    try {
        const raw = await readFile(SCRIPTS_PATH, 'utf8');
        return JSON.parse(raw) as ScriptStore;
    } catch {
        return {};
    }
};

const writeStore = async (store: ScriptStore): Promise<void> => {
    await mkdir(SCRIPTS_DIR, { recursive: true }).catch(() => undefined);
    await writeFile(SCRIPTS_PATH, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
};

export const loadScript = async (target: string, scraper: string): Promise<StoredScript | null> => {
    const store = await readStore();
    return store[storeKey(target, scraper)] ?? null;
};

export const saveScript = async (target: string, scraper: string, script: string): Promise<void> => {
    const store = await readStore();
    const key = storeKey(target, scraper);
    const existing = store[key];
    const now = new Date().toISOString();
    store[key] = {
        script,
        version: (existing?.version ?? 0) + 1,
        createdAt: existing?.createdAt ?? now,
        lastValidatedAt: now,
        brokenAt: null,
    };
    await writeStore(store);
};

export const markScriptBroken = async (target: string, scraper: string): Promise<void> => {
    const store = await readStore();
    const key = storeKey(target, scraper);
    const existing = store[key];
    if (!existing) return;
    store[key] = { ...existing, brokenAt: new Date().toISOString() };
    await writeStore(store);
};
