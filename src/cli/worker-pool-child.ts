import { setVerboseLogging } from '../common/logger.js';
import type { ScrapeRunOutput } from '../common/output-types.js';
import { runScrapeCommand } from './runtime.js';
import type { RunCliOptions } from './types.js';

type ChildRequest = { options: RunCliOptions };
type ChildResponse = { ok: true; output: ScrapeRunOutput } | { ok: false; error: string };

const handleMessage = async (message: ChildRequest): Promise<void> => {
    const send = (response: ChildResponse): void => {
        process.send?.(response);
        process.disconnect?.();
    };

    try {
        setVerboseLogging(message.options.verbose);
        const output = await runScrapeCommand(message.options);
        send({ ok: true, output });
    } catch (error) {
        send({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
};

process.on('message', (message: ChildRequest) => {
    void handleMessage(message);
});
