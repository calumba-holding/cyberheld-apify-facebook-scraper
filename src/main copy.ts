import { Actor } from 'apify';
import { chromium } from 'playwright';

await Actor.init();

const targetUrl = 'https://www.facebook.com/share/p/188oJdjQFR/'; 

console.log('🔌 Connecting to local Chrome...');

try {
    const browser = await chromium.connectOverCDP('http://localhost:9222');
    console.log('✅ Connected successfully!');
    
    const context = browser.contexts()[0];
    const page = await context.newPage();
    
    console.log(`🚀 Navigating to: ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(5000);

    // =========================================================
    // PHASE 1: Scrape Main Post Reactions (Categorized)
    // =========================================================
    console.log('\n👍 Hunting for the main post reaction counter...');
    
    const reactionCounter = page.locator('[aria-label*="reacted to this"], [aria-label*="reactions"]').first();

    if (await reactionCounter.isVisible()) {
        console.log('👆 Found it! Clicking to open the modal...');
        await reactionCounter.click({ force: true });
        
        console.log('⏳ Waiting for modal to render...');
        await page.waitForSelector('div[role="dialog"]:visible', { timeout: 5000 });
        await page.waitForTimeout(2000);

        const modal = page.locator('div[role="dialog"]:visible').last();
        
        const reactionTabs = modal.locator('[role="button"][aria-label*=": "]');
        const tabCount = await reactionTabs.count();
        
        const tabLabels: string[] = [];
        for (let i = 0; i < tabCount; i++) {
            const label = await reactionTabs.nth(i).getAttribute('aria-label');
            if (label) tabLabels.push(label);
        }

        console.log(`🔍 Found ${tabLabels.length} different reaction categories:`, tabLabels);

        const allReactionsData: any[] = [];
        const seenProfiles = new Set(); 
        const modalBox = await modal.boundingBox();

        for (const label of tabLabels) {
            const reactionType = label.split(':')[0].trim(); 
            
            console.log(`\n➡️ Switching to tab: [${reactionType}]...`);
            
            // ==========================================
            // FIX 1: Instant Pure JS Scroll to Top
            // ==========================================
            await page.evaluate(() => {
                const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
                const topDialog = dialogs[dialogs.length - 1]; 
                if (topDialog) {
                    const scrollableDivs = Array.from(topDialog.querySelectorAll('div')).filter(d => {
                        const overflowY = window.getComputedStyle(d).overflowY;
                        return overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay';
                    });
                    // Instantly snap all internal scrollbars back to the top
                    scrollableDivs.forEach(d => { d.scrollTop = 0; });
                }
            });
            await page.waitForTimeout(1000); // Give the DOM a second to re-render the tabs

            // ==========================================
            // FIX 2: Dynamic Tab Selection (Ignores live number changes)
            // ==========================================
            // By using ^= we match anything starting with "Haha:" or "Like:"
            const targetTab = modal.locator(`[role="button"][aria-label^="${reactionType}:"]`).first();
            await targetTab.click({ force: true });
            await page.waitForTimeout(2000); 

            console.log(`   📜 Scrolling and extracting [${reactionType}]...`);
            
            let previousCount = 0;
            let retries = 0;
            
            while (retries < 3) {
                const currentBatch = await page.evaluate((type) => {
                    const results: any[] = [];
                    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
                    const topDialog = dialogs[dialogs.length - 1]; 
                    if (!topDialog) return results;

                    const nodes = topDialog.querySelectorAll('a[aria-label^="Profile picture of"]');
                    nodes.forEach(node => {
                        const ariaLabel = node.getAttribute('aria-label') || '';
                        const name = ariaLabel.replace('Profile picture of ', '').trim();
                        let url = (node as HTMLAnchorElement).href || '';

                        if (url.includes('&__cft__')) url = url.split('&__cft__')[0];
                        if (url.includes('?__cft__')) url = url.split('?__cft__')[0];

                        if (name) results.push({ name, profile_url: url, reaction: type });
                    });
                    return results;
                }, reactionType);

                for (const user of currentBatch) {
                    if (!seenProfiles.has(user.profile_url)) {
                        seenProfiles.add(user.profile_url);
                        allReactionsData.push(user);
                    }
                }

                if (modalBox) {
                    await page.mouse.move(modalBox.x + modalBox.width / 2, modalBox.y + modalBox.height / 2);
                    await page.mouse.wheel(0, 1500);
                }

                await page.waitForTimeout(1500); 

                if (seenProfiles.size === previousCount) {
                    retries++; 
                } else {
                    retries = 0; 
                    console.log(`      Extracted ${seenProfiles.size} total unique users so far...`);
                    previousCount = seenProfiles.size;
                }
            }
        }

        console.log(`\n🎉 Extracted a grand total of ${allReactionsData.length} categorized reactions!`);
        await Actor.setValue('post_reactions', allReactionsData);
        console.log('💾 Reactions saved to ./storage/key_value_stores/default/post_reactions.json');

        // =========================================================
        // PHASE 2: Gracefully Close the Modal 
        // =========================================================
        console.log('\n❌ Closing the reactions modal...');
        const closeBtn = modal.locator('[aria-label="Close"][role="button"]').first();
        if (await closeBtn.isVisible()) {
            await closeBtn.click({ force: true });
            await page.waitForTimeout(2000); 
        } else {
            console.log('⚠️ Close button not found, falling back to Escape key.');
            await page.keyboard.press('Escape');
            await page.waitForTimeout(2000);
        }

    } else {
        console.log('⚠️ Could not find the reaction counter.');
    }


    // =========================================================
    // PHASE 3: Switch to "All comments"
    // =========================================================
    console.log('\n🔄 Attempting to set filter to "All comments"...');
    try {
        const filterDropdown = page.locator('div[role="button"]:has-text("Most relevant"), div[role="button"]:has-text("Top comments")').first();
        if (await filterDropdown.isVisible({ timeout: 3000 })) {
            await filterDropdown.click({ force: true });
            await page.waitForTimeout(1000);
            
            const allCommentsOption = page.getByText('All comments', { exact: true }).first();
            await allCommentsOption.click({ force: true });
            console.log('✅ Filter set to "All comments"!');
            await page.waitForTimeout(3000); 
        }
    } catch (e) {
        console.log('ℹ️ Could not change filter, moving on.');
    }

    // =========================================================
    // PHASE 4: The Smart Scroll 
    // =========================================================
    // console.log('\n📜 Scrolling the comments naturally...');
    
    // await page.locator('body').click({ position: { x: 10, y: 10 }, force: true });
    
    // for (let i = 0; i < 10; i++) {
    //     console.log(`\n⏬ Scroll Pass ${i + 1}/10...`);
        
    //     const comments = page.locator('div[role="article"][aria-label^="Comment by"]');
    //     const countBeforeScroll = await comments.count();
        
    //     if (countBeforeScroll > 0) {
    //         await comments.nth(countBeforeScroll - 1).scrollIntoViewIfNeeded();
    //     } else {
    //         await page.keyboard.press('PageDown');
    //     }

    //     try {
    //         const viewMoreBtn = page.getByRole('button', { name: /View more comments/i }).first();
    //         if (await viewMoreBtn.isVisible()) {
    //             console.log('   👆 Clicking "View more comments"...');
    //             await viewMoreBtn.scrollIntoViewIfNeeded(); 
    //             await viewMoreBtn.click({ force: true });
    //         }

    //         const viewRepliesBtn = page.getByRole('button', { name: /View .* replies/i }).first();
    //         if (await viewRepliesBtn.isVisible()) {
    //             console.log('   👆 Clicking "View replies"...');
    //             await viewRepliesBtn.scrollIntoViewIfNeeded();
    //             await viewRepliesBtn.click({ force: true });
    //         }
    //     } catch (err) {
    //         console.log('   ⚠️ Minor UI issue, continuing scroll...');
    //     }

    //     await page.waitForTimeout(3000); 
    //     const countAfterScroll = await comments.count();
    //     console.log(`   📊 Real-time check: ${countAfterScroll} comments currently loaded on screen.`);
    // }

    // // =========================================================
    // // PHASE 5: The Extraction Engine
    // // =========================================================
    // console.log('\n🧠 Running final JSON extraction...');
    // const scrapedComments = await page.evaluate(() => {
    //     const results: any[] = [];
    //     const commentNodes = document.querySelectorAll('div[role="article"][aria-label^="Comment by"]');

    //     commentNodes.forEach(node => {
    //         const userElement = node.querySelector('a span[dir="auto"]');
    //         const user = userElement && userElement.textContent ? userElement.textContent.trim() : 'Unknown User';

    //         const contentElement = node.querySelector('div[dir="auto"][style*="text-align:start"]');
    //         const content = contentElement && contentElement.textContent ? contentElement.textContent.trim() : '';

    //         const ariaLabel = node.getAttribute('aria-label') || '';
    //         const timestamp = ariaLabel.replace(`Comment by ${user} `, '').trim();

    //         let id = 'Unknown ID';
    //         const linkWithId = node.querySelector('a[href*="comment_id="]') as HTMLAnchorElement;
    //         if (linkWithId) {
    //             const match = linkWithId.href.match(/comment_id=([^&]+)/);
    //             if (match) {
    //                 id = decodeURIComponent(match[1]); 
    //             }
    //         }

    //         if (user !== 'Unknown User' || content !== '') {
    //             results.push({ user, content, timestamp, id });
    //         }
    //     });

    //     return results;
    // });

    // console.log(`🎉 Successfully extracted ${scrapedComments.length} comments!`);

    // await Actor.setValue('comments', scrapedComments);
    // console.log('💾 Data saved to ./storage/key_value_stores/default/comments.json');

} catch (error) {
    console.error('❌ An error occurred:', error);
}

await Actor.exit();
