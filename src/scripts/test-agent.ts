import { BrowserController } from '../agent/BrowserController.js';
import { VisionBrain } from '../agent/VisionBrain.js';
import { ActionCache } from '../agent/ActionCache.js';
import { Action } from '../agent/types.js';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

dotenv.config();

async function main() {
    const url = process.argv[2];
    const goal = process.argv[3];
    const mode = process.argv[4] || 'standard';

    if (!url || !goal) {
        console.error('Usage: npm run test:manual <url> <goal>');
        process.exit(1);
    }

    console.log(`Starting Manual Agent Test...`);
    console.log(`URL: ${url}`);
    console.log(`Goal: ${goal}`);
    console.log(`Mode: ${mode}`);

    const browser = new BrowserController();
    const brain = new VisionBrain();
    const actionCache = new ActionCache();
    const history: string[] = [];

    try {
        await browser.launch();
        await browser.startSession('manual-test');

        if (mode === 'chaos') {
            await browser.enableChaos();
            console.log('🔥 Chaos Mode Enabled');
        }

        await browser.navigate(url);

        // --- CACHE CHECK ---
        const cachedActions = actionCache.get(url, 'Manual Test', goal);

        if (cachedActions && cachedActions.length > 0) {
            console.log(`\n⚡ CACHE HIT! Attempting ${cachedActions.length} cached actions...`);
            const startTime = Date.now();
            try {
                for (const action of cachedActions) {
                    if (action.type === 'done') {
                        console.log('⚡ Cached "done" action reached. Goal achieved!');
                        break;
                    }

                    // Execute blindly (fast)
                    console.log(`⚡ Executing cached: ${action.type} ${action.selector || action.text || ''}`);
                    await browser.executeActions(action);

                    // Small wait to ensure stability
                    await browser.page?.waitForTimeout(500);
                }
                const duration = (Date.now() - startTime) / 1000;
                console.log(`\n✅ Cached execution successful in ${duration.toFixed(2)}s!`);

                await browser.closeSession();
                await browser.cleanup();
                return; // Exit early
            } catch (e) {
                console.warn(`❌ Cached execution failed: ${e}. Falling back to Vision.`);
                // Fallthrough to standard Vision loop
            }
        } else {
            console.log('\nStarting Vision Loop (Slow Path)...');
        }

        let step = 0;
        const MAX_STEPS = 10;
        const sessionActions: Action[] = [];

        while (step < MAX_STEPS) {
            console.log(`\n--- Step ${step + 1} ---`);

            const screenshot = await browser.getScreenshot();
            console.log('Thinking...');

            let decision;
            if (mode === 'chaos') {
                decision = await brain.decideChaosAction(screenshot, history);
            } else {
                decision = await brain.decideAction(screenshot, goal, history);
            }
            const action = decision.actions[0];

            console.log('Action:', action);
            history.push(`Step ${step + 1}: Action=${action.type} Reason=${action.reason || ''}`);
            sessionActions.push(action);

            if (action.type === 'done') {
                console.log('SUCCESS: Goal achieved!');
                // Save to cache
                if (sessionActions.length > 0) {
                    console.log('💾 Saving actions to cache...');
                    actionCache.set(url, 'Manual Test', goal, sessionActions);
                }
                break;
            }

            if (action.type === 'fail') {
                console.error('FAILURE: Agent decided to fail.', action.reason);
                break;
            }

            await browser.executeActions(action);
            step++;

            // Wait for stability
            await browser.page?.waitForLoadState('domcontentloaded');
        }

        const tempVideoPath = await browser.closeSession();

        let finalVideoPath: string | undefined;

        if (tempVideoPath && fs.existsSync(tempVideoPath)) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
            const newFilename = `${timestamp}_manual-test.webm`;
            const videoDir = path.dirname(tempVideoPath);
            finalVideoPath = path.join(videoDir, newFilename);

            // Rename file
            fs.renameSync(tempVideoPath, finalVideoPath);
            console.log(`\nSession ended. Video saved at: ${finalVideoPath}`);
        } else {
            console.log(`\nSession ended. No video saved.`);
        }

    } catch (error) {
        console.error('Fatal Error:', error);
    } finally {
        await browser.cleanup();
    }
}

main();
