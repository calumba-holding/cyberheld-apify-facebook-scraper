export type JsonValue = null | boolean | number | string | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue | undefined };

export const asObject = (value: JsonValue | undefined): JsonObject | null => {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : null;
};

export const asArray = (value: JsonValue | undefined): JsonValue[] => {
    return Array.isArray(value) ? value : [];
};

export const asString = (value: JsonValue | undefined): string | undefined => {
    return typeof value === 'string' ? value : undefined;
};

export const asNumber = (value: JsonValue | undefined): number | undefined => {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
};

export const asBoolean = (value: JsonValue | undefined): boolean | undefined => {
    return typeof value === 'boolean' ? value : undefined;
};

export const getPath = (input: JsonObject | null, path: readonly string[]): JsonValue | undefined => {
    let current: JsonValue | undefined = input;
    for (const segment of path) {
        const object = asObject(current);
        if (!object) return undefined;
        current = object[segment];
    }
    return current;
};

export const parseJsonLines = (payload: string): JsonObject[] => {
    const chunks: JsonObject[] = [];
    for (const line of payload.split('\n').map((part) => part.trim()).filter(Boolean)) {
        try {
            const parsed = JSON.parse(line) as JsonValue;
            const object = asObject(parsed);
            if (object) chunks.push(object);
        } catch {
            // Ignore malformed incremental chunks.
        }
    }
    return chunks;
};

export const normalizeText = (value: string | undefined): string => value?.trim() ?? '';
