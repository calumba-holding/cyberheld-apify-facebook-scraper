import { expect, test } from '@playwright/test';

import { applyGuestSessionStealth } from '../../src/common/browser-stealth.js';

test.describe('applyGuestSessionStealth', () => {
    test('patches common automation fingerprints for future pages', async ({ context }) => {
        await applyGuestSessionStealth(context);
        const page = await context.newPage();
        await page.goto('data:text/html,<html><body>stealth</body></html>');

        const fingerprint = await page.evaluate(async () => ({
            webdriver: navigator.webdriver,
            languages: navigator.languages,
            platform: navigator.platform,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory,
            maxTouchPoints: navigator.maxTouchPoints,
            userAgent: navigator.userAgent,
            userAgentDataPlatform: navigator.userAgentData?.platform,
            pluginsLength: navigator.plugins.length,
            hasChromeRuntime: Boolean(window.chrome?.runtime),
            notificationPermission: (await navigator.permissions.query({ name: 'notifications' })).state,
            webglVendor: (() => {
                const canvas = document.createElement('canvas');
                const context = canvas.getContext('webgl');
                return context?.getParameter(37445);
            })(),
        }));

        expect(fingerprint.webdriver).toBeUndefined();
        expect(fingerprint.languages).toEqual(['de-AT', 'de', 'en-US', 'en']);
        expect(fingerprint.platform).toBe('MacIntel');
        expect(fingerprint.hardwareConcurrency).toBe(8);
        expect(fingerprint.deviceMemory).toBe(8);
        expect(fingerprint.maxTouchPoints).toBe(0);
        expect(fingerprint.userAgent).toContain('Chrome/135.0.0.0');
        expect(fingerprint.userAgentDataPlatform).toBe('macOS');
        expect(fingerprint.pluginsLength).toBeGreaterThan(0);
        expect(fingerprint.hasChromeRuntime).toBe(true);
        expect(typeof fingerprint.notificationPermission).toBe('string');
        if (fingerprint.webglVendor !== undefined) {
            expect(fingerprint.webglVendor).toBe('Intel Inc.');
        }
    });
});
