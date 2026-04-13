import { facebookPlugin } from './facebook/plugin.js';
import { instagramPlugin } from './instagram/plugin.js';
import type { SupportedTarget, TargetPlugin } from './common/types.js';

const plugins = {
    facebook: facebookPlugin,
    instagram: instagramPlugin,
} as const satisfies Record<SupportedTarget, TargetPlugin>;

export const SUPPORTED_TARGETS = Object.keys(plugins) as SupportedTarget[];

export const getTargetPlugin = (target: SupportedTarget): TargetPlugin => plugins[target];

export const isSupportedTarget = (value: string): value is SupportedTarget => {
    return value in plugins;
};
