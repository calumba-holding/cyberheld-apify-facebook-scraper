type LogLevel = 'debug' | 'info' | 'warning' | 'error';

let debugEnabled = false;

const timestamp = (): string => new Date().toISOString();

const emit = (level: LogLevel, message: string): void => {
    if (level === 'debug' && !debugEnabled) return;
    const prefix = level.toUpperCase().padEnd(7, ' ');
    process.stderr.write(`${timestamp()} ${prefix} ${message}\n`);
};

export const setVerboseLogging = (enabled: boolean): void => {
    debugEnabled = enabled;
};

export const log = {
    debug: (message: string): void => emit('debug', message),
    info: (message: string): void => emit('info', message),
    warning: (message: string): void => emit('warning', message),
    error: (message: string): void => emit('error', message),
};
