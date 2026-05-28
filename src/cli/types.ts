import type { BrowserSessionMode, SupportedTarget } from '../common/types.js';

export interface RunCliOptions {
    command: 'run';
    target: SupportedTarget;
    scraper: string;
    targetUrls: string[];
    concurrency: number;
    browserSessionMode: BrowserSessionMode;
    screenVideo: boolean;
    download: boolean;
    outputFile?: string;
    chromeExecutable: string;
    profileRootDir: string;
    waitAfterNavigationMs: number;
    requestTimeoutSecs: number;
    verbose: boolean;
    artifactRootDir: string;
    regenerateScript: boolean;
    fullPageScreenshot: boolean;
    expandComments: boolean;
}

export interface ProfileLoginCliOptions {
    command: 'profile-login';
    target: SupportedTarget;
    chromeExecutable: string;
    profileRootDir: string;
    verbose: boolean;
}

export interface ProfilePathCliOptions {
    command: 'profile-path';
    target: SupportedTarget;
    profileRootDir: string;
}

export interface WatchCliOptions {
    command: 'watch';
    configPath: string;
    profileRootDir: string;
    artifactRootDir: string;
    chromeExecutable: string;
    once: boolean;
    verbose: boolean;
}

export type ParsedCli =
    | { kind: 'help'; text: string }
    | { kind: 'version' }
    | { kind: 'run'; options: RunCliOptions }
    | { kind: 'watch'; options: WatchCliOptions }
    | { kind: 'profile-login'; options: ProfileLoginCliOptions }
    | { kind: 'profile-path'; options: ProfilePathCliOptions };

export interface ProfileStatusOutput {
    target: SupportedTarget;
    profileDir: string;
    status: 'ready' | 'ok';
}
