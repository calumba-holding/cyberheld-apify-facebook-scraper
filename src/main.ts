import { Actor } from 'apify';
import { join } from 'node:path';
import { chromium } from 'playwright';

import { extractAllComments } from './comments.js';
import { switchToAllComments } from './comment-filter.js';
import { startChromeWindowRecording, type ChromeSessionRecorder } from './recording.js';
import { closeReactionModal, extractAllReactions } from './reactions.js';

await Actor.init();

const targetUrl = 'https://www.facebook.com/share/p/1Ahqyuv1ky/';
const recordingOutputPath = join('storage', 'key_value_stores', 'default', 'chrome_session.mp4');

console.log('🔌 Connecting to local Chrome...');

let recorder: ChromeSessionRecorder | null = null;

try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✅ Connected successfully!');

    const context = browser.contexts()[0];
    const page = await context.newPage();
    await page.bringToFront();
    await page.waitForTimeout(1500);

    recorder = await startChromeWindowRecording(recordingOutputPath);
    console.log(`🎥 Whole Chrome window recording started: ${recordingOutputPath}`);

    console.log(`🚀 Navigating to: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    const reactions = await extractAllReactions(page);
    await Actor.setValue('final_reactions', reactions);
    console.log('💾 Reactions saved to ./storage/key_value_stores/default/final_reactions.json');

    await closeReactionModal(page);

    await switchToAllComments(page);
    const comments = await extractAllComments(page);
    await Actor.setValue('comments', comments);
    console.log('💾 Comments saved to ./storage/key_value_stores/default/comments.json');
} catch (error) {
    console.error('❌ An error occurred:', error);
} finally {
    if (recorder) {
        try {
            const savedPath = await recorder.stop();
            console.log(`🎬 Chrome session recording saved to: ${savedPath}`);
        } catch (error) {
            console.error('❌ Failed to finalize the Chrome window recording:', error);
        }
    }
}

await Actor.exit();
