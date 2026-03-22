import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const loadFixture = async (name: string): Promise<string> => {
    return readFile(join(process.cwd(), 'tests', 'fixtures', 'facebook', name), 'utf8');
};
