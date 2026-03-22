#!/usr/bin/env node

import { parseCliArgs } from './cli/parse.js';
import { printCliError, runCli } from './cli/runtime.js';

const main = async (): Promise<void> => {
    try {
        await runCli(parseCliArgs(process.argv.slice(2)));
    } catch (error) {
        printCliError(error);
        process.exitCode = 2;
    }
};

await main();
