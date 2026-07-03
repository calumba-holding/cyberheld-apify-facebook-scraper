/** Exponential backoff starting at 1s, doubling per attempt, capped at 30s. */
export const computeBackoffMs = (attempt: number): number => Math.min(1000 * 2 ** (attempt - 1), 30000);

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
