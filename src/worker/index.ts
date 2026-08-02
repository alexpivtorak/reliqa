import { Worker, Job } from 'bullmq';
import { BrowserController } from '../agent/BrowserController.js';
import { VisionBrain } from '../agent/VisionBrain.js';
import { Observer } from '../agent/Observer.js';
import { HistoryManager } from '../agent/HistoryManager.js';
import { ActionCache } from '../agent/ActionCache.js';
import { Optimizer } from '../agent/Optimizer.js';
import { db } from '../db/index.js';
import { testRuns, issues } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
import { Action, TestFlow } from '../agent/types.js';
import fs from 'fs';
import path from 'path';
import { Redis } from 'ioredis';

dotenv.config();

// Redis Publisher for events
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
};

const worker = new Worker('test-queue', async (job: Job) => {
    // Support both single goal and multi-step flow
    const { url, goal, flow, testRunId, mode, chaosProfile, model, headless, disableCache } = job.data;
    // flow: TestFlow | undefined

    const testName = flow ? flow.name : goal;
    const history = new HistoryManager();
    console.log(`Processing job ${job.id}: ${testName} [${mode || 'standard'}] on ${url} using ${model || 'default'}`);

    await db.update(testRuns).set({ status: 'running' }).where(eq(testRuns.id, testRunId));

    // Emit Status Event
    redis.publish('reliqa-events', JSON.stringify({
        runId: testRunId,
        type: 'status',
        status: 'running',
        timestamp: new Date()
    }));

    const startMsg = `🚀 Starting job: ${testName} (${model || 'gemini-2.5-flash'})`;
    redis.publish('reliqa-events', JSON.stringify({
        runId: testRunId,
        type: 'log',
        message: startMsg,
        timestamp: new Date()
    }));
    history.log(startMsg);

    const browser = new BrowserController();
    const brain = new VisionBrain(undefined, model); // Pass model here
    const observer = new Observer();
    const actionCache = new ActionCache();

    try {
        await browser.launch(headless !== false);
        await browser.startSession(job.id || 'unknown');
        await browser.navigate(url);

        // Initial snapshot for DOM Diffing
        await browser.captureDOMSnapshot();

        // --- MONITORING & CHAOS SETUP ---
        const pageErrors: string[] = [];
        const failedRequests: string[] = [];
        const consoleLogs: string[] = [];

        if (browser.page) {
            browser.page.on('console', msg => consoleLogs.push(`[CONSOLE] ${msg.type()}: ${msg.text()}`));
            browser.page.on('pageerror', err => {
                const msg = `[PAGE ERROR] ${err.message}`;
                console.error(msg);
                pageErrors.push(msg);
                history.log(msg);
            });
            browser.page.on('response', resp => {
                if (resp.status() >= 500) {
                    const msg = `[SERVER ERROR] ${resp.status()} on ${resp.url()}`;
                    console.error(msg);
                    failedRequests.push(msg);
                    history.log(msg);
                }
            });
        }

        if (mode === 'chaos') {
            console.log('🔥 enabling CHAOS MODE');
            await browser.enableChaos(chaosProfile);
            history.log(`🔥 CHAOS MODE ENABLED: ${chaosProfile?.name || 'Standard Gremlin'}`);
        }

        // Normalize to a list of steps
        const steps = flow ? flow.steps : [{ name: 'Main Goal', goal: goal }];

        let flowSuccess = true;

        for (let i = 0; i < steps.length; i++) {
            const currentStep = steps[i];
            console.log(`--- Executing Step ${i + 1}/${steps.length}: ${currentStep.name} ---`);
            history.log(`\n--- STEP ${i + 1}: ${currentStep.name} (${currentStep.goal}) ---`);

            const stepMsg = `📍 Step ${i + 1}: ${currentStep.name}`;
            redis.publish('reliqa-events', JSON.stringify({
                runId: testRunId,
                type: 'log',
                message: stepMsg,
                timestamp: new Date()
            }));
            history.log(stepMsg);

            // Check if we should stop
            const [run] = await db.select().from(testRuns).where(eq(testRuns.id, testRunId)).execute();
            if (run?.status === 'stopping') {
                throw new Error('Mission stopped by user');
            }

            // Reset observer for new step
            observer.resetForNewStep();

            let stepSuccess = false;
            let stepLoopCount = 0;
            const MAX_STEPS_PER_GOAL = mode === 'chaos' ? 50 : 25;

            // Give the agent a chance to break its own loop before killing the run
            const MAX_INTERVENTIONS = 3;
            let consecutiveInterventions = 0;
            let pendingIntervention: string | null = null;

            // --- CACHE CHECK ---
            const currentUrl = browser.page?.url() || url; // simple approximation
            const cachedActions = actionCache.get(currentUrl, currentStep.name, currentStep.goal);

            // Disable cache in Chaos Mode to avoid replaying "happy path"
            // Also disable if user explicitly requested it
            if (mode !== 'chaos' && !disableCache && cachedActions && cachedActions.length > 0) {
                console.log(`⚡ Attempting ${cachedActions.length} cached actions for step "${currentStep.name}"`);
                try {
                    // Take a screenshot per step or every few actions to keep the live feed alive
                    const screenshot = await browser.getScreenshot();
                    redis.publish('reliqa-events', JSON.stringify({
                        runId: testRunId,
                        type: 'frame',
                        data: screenshot.toString('base64'),
                        timestamp: new Date()
                    }));

                    for (const action of cachedActions) {
                        if (action.type === 'done') continue; // Don't execute 'done', just finish loop

                        // Execute blindly (fast)
                        const cachedActionMsg = `⚡ Executing cached: ${action.type} ${action.selector || action.text || ''}`;
                        console.log(cachedActionMsg);

                        history.log(cachedActionMsg);
                        redis.publish('reliqa-events', JSON.stringify({
                            runId: testRunId,
                            type: 'log',
                            message: cachedActionMsg,
                            timestamp: new Date()
                        }));

                        // Check if we should stop
                        const [run] = await db.select().from(testRuns).where(eq(testRuns.id, testRunId)).execute();
                        if (run?.status === 'stopping') {
                            throw new Error('Mission stopped by user');
                        }

                        await browser.executeActions([action]);

                        // Small wait to ensure stability
                        await browser.page?.waitForTimeout(500);
                    }
                    console.log(`✅ Cached execution successful for step "${currentStep.name}"`);
                    history.log(`[CACHE] Successfully executed ${cachedActions.length} actions.`);

                    const cacheMsg = `⚡ FAST FORWARD: Executed ${cachedActions.length} cached actions.`;
                    redis.publish('reliqa-events', JSON.stringify({
                        runId: testRunId,
                        type: 'log',
                        message: cacheMsg,
                        timestamp: new Date()
                    }));
                    history.log(cacheMsg);

                    stepSuccess = true;
                    continue; // Skip to next step
                } catch (e) {
                    console.warn(`❌ Cached execution failed: ${e}. Falling back to Vision.`);
                    history.log(`[CACHE] Failed: ${e}. Recovering with Vision.`);
                    // Fallthrough to standard Vision loop
                }
            }

            // --- STANDARD VISION LOOP ---
            const stepActions: Action[] = []; // Track actions for caching

            // Sub-loop for the specific step
            while (stepLoopCount < MAX_STEPS_PER_GOAL) {
                // Check if we should stop
                const [runStatus] = await db.select().from(testRuns).where(eq(testRuns.id, testRunId)).execute();
                if (runStatus?.status === 'stopping') {
                    throw new Error('Mission stopped by user');
                }

                redis.publish('reliqa-events', JSON.stringify({
                    runId: testRunId,
                    type: 'log',
                    message: `📸 Capturing page state [Iteration ${stepLoopCount + 1}]...`,
                    timestamp: new Date()
                }));
                const screenshot = await browser.getScreenshot();

                // Save screenshot for debugging
                const screenshotDir = './artifacts/screenshots';
                if (!fs.existsSync(screenshotDir)) {
                    fs.mkdirSync(screenshotDir, { recursive: true });
                }
                const screenshotPath = path.join(screenshotDir, `${testRunId}_step${i + 1}_action${stepLoopCount}.jpg`);
                fs.writeFileSync(screenshotPath, screenshot);

                // FIREHOSE: Emit screenshot as a frame for live viewing
                // We use a separate channel or event type to distinguishing from logs
                redis.publish('reliqa-events', JSON.stringify({
                    runId: testRunId,
                    type: 'frame',
                    data: screenshot.toString('base64'),
                    timestamp: new Date()
                }));


                const pageContext = await browser.getPageContext();

                redis.publish('reliqa-events', JSON.stringify({
                    runId: testRunId,
                    type: 'log',
                    message: `🧠 Thinking about next step...`,
                    timestamp: new Date()
                }));

                let actions: Action[];
                if (mode === 'chaos') {
                    const response = await brain.decideChaosAction(screenshot, history.getFullLog(), chaosProfile);
                    actions = response.actions;
                } else {
                    const promptHistory = history.getPromptHistory();

                    // Add observer warnings to the prompt
                    const earlyWarning = observer.getEarlyWarning();
                    let optimizedHistory = earlyWarning ? `${promptHistory}\n\nATTENTION: ${earlyWarning}` : promptHistory;

                    if (pendingIntervention) {
                        optimizedHistory += `\n\nSTOP REPEATING: ${pendingIntervention}\n` +
                            `Your last attempts changed nothing. Pick a different element, a different selector, ` +
                            `or handle the dialog that is currently open. Do not repeat the same click.`;
                        pendingIntervention = null;
                    }

                    // Get current DOM diff feedback
                    const domDiff = await browser.getDOMDiff();

                    const response = await brain.decideAction(screenshot, currentStep.goal, [optimizedHistory], pageContext, domDiff.summary, testRunId);
                    actions = response.actions;
                }

                stepActions.push(...actions); // Record actions

                for (const action of actions) {
                    // Enhanced History Logging for Level 3 Intelligence
                    let details = '';
                    if (action.coordinate) details += ` Coord=(${action.coordinate.x},${action.coordinate.y})`;
                    if (action.selector) details += ` Sel="${action.selector}"`;
                    if (action.text) details += ` Text="${action.text}"`;
                    if (action.key) details += ` Key="${action.key}"`;

                    const actionLogMsg = `👉 Action: ${action.type}${details} (${action.reason || ''})`;
                    redis.publish('reliqa-events', JSON.stringify({
                        runId: testRunId,
                        type: 'log',
                        message: actionLogMsg,
                        timestamp: new Date()
                    }));

                    if (action.type === 'fail') {
                        if (mode === 'chaos') {
                            throw new Error(`Chaos crash at step ${currentStep.name}: ${action.reason}`);
                        }
                        throw new Error(`Failed at step ${currentStep.name}: ${action.reason}`);
                    }
                }

                // Check for 'done' in the batch
                const doneAction = actions.find(a => a.type === 'done');
                if (doneAction) {
                    if (mode === 'chaos') {
                        stepSuccess = true;
                        break;
                    }

                    if (stepActions.length > 1) {
                        const optimizedActions = Optimizer.optimizeActions(stepActions);
                        actionCache.set(currentUrl, currentStep.name, currentStep.goal, optimizedActions);
                    }
                    stepSuccess = true;
                    break;
                }

                try {
                    await browser.executeActions(actions);
                } catch (e: any) { // Catch action failure and stop loop
                    throw new Error(`Action Execution Failed: ${e.message}`);
                }

                // Wait for page to stabilize after action batch
                try {
                    await browser.page?.waitForLoadState('domcontentloaded', { timeout: 3000 });
                } catch { }

                // Compare the page before and after the batch, then share that verdict with the Observer
                const postActionDiff = await browser.getDOMDiff();

                // Record state in Observer (just use last known URL)
                const currentUrlObs = browser.page?.url() || '';
                observer.recordState(currentUrlObs, actions[actions.length - 1], postActionDiff.hasChanges);

                // Record the "batch" consequence
                history.record(actions[actions.length - 1], postActionDiff.summary, i + 1);

                // Check for stuck states
                const intervention = observer.validateProgress();

                // CRITICAL CHAOS CHECK
                if (mode === 'chaos') {
                    if (pageErrors.length > 0 || failedRequests.length > 0) {
                        throw new Error(`CRASH DETECTED! ${pageErrors.length} Page Errors, ${failedRequests.length} Failed Requests.`);
                    }
                }

                if (intervention) {
                    consecutiveInterventions++;
                    console.warn(`⚠️ Observer Intervention (${consecutiveInterventions}/${MAX_INTERVENTIONS}): ${intervention}`);
                    redis.publish('reliqa-events', JSON.stringify({
                        runId: testRunId,
                        type: 'log',
                        message: `⚠️ Observer (${consecutiveInterventions}/${MAX_INTERVENTIONS}): ${intervention}`,
                        timestamp: new Date()
                    }));
                    history.log(`OBSERVER: ${intervention}`);

                    if (consecutiveInterventions >= MAX_INTERVENTIONS) {
                        // Force fail to prevent infinite loops
                        throw new Error(`Observer detected issue: ${intervention}`);
                    }

                    // Warn the agent and let it try a different approach
                    pendingIntervention = intervention;
                } else {
                    consecutiveInterventions = 0;
                }

                // Periodically update DB logs
                if (stepLoopCount % 3 === 0) {
                    await db.update(testRuns).set({
                        logs: JSON.stringify(history.getFullLog())
                    }).where(eq(testRuns.id, testRunId));
                }
                stepLoopCount++;
            }

            if (!stepSuccess) {
                throw new Error(`Timeout: Step ${currentStep.name} not completed within limit`);
            }

            // Validate step completion
            const stepValidation = observer.validateStepCompletion(currentStep.name);
            if (stepValidation) {
                console.warn(`⚠️ Observer: ${stepValidation}`);
                history.log(`OBSERVER: ${stepValidation}`);
                throw new Error(stepValidation);
            }
        }

        const tempVideoPath = await browser.closeSession();
        let finalVideoPath: string | undefined;

        if (tempVideoPath && fs.existsSync(tempVideoPath)) {
            // Predictable filename for frontend retrieval: run-{id}.webm determines the URL
            const newFilename = `run-${testRunId}.webm`;
            const videoDir = path.dirname(tempVideoPath); // .chat/videos or artifacts/videos
            // We want to move it to a public artifacts folder if possible, but for now specific local
            // Ensure artifacts/videos exists
            const artifactsDir = path.resolve('./artifacts/videos');
            if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

            finalVideoPath = path.join(artifactsDir, newFilename);

            // Rename/Move file
            fs.renameSync(tempVideoPath, finalVideoPath);
            console.log(`🎥 Video saved to ${finalVideoPath}`);
            // Store relative path or just filename if serving from static root
            finalVideoPath = `/videos/${newFilename}`;
        }

        await db.update(testRuns).set({
            status: 'completed',
            result: 'pass',
            logs: JSON.stringify(history.getFullLog()),
            videoUrl: finalVideoPath || undefined
        }).where(eq(testRuns.id, testRunId));

        redis.publish('reliqa-events', JSON.stringify({
            runId: testRunId,
            type: 'status',
            status: 'completed',
            result: 'pass',
            videoUrl: finalVideoPath,
            timestamp: new Date()
        }));

        redis.publish('reliqa-events', JSON.stringify({
            runId: testRunId,
            type: 'log',
            message: `✅ Job Completed Successfully`,
            timestamp: new Date()
        }));

    } catch (error: any) {
        console.error(`Job failed: ${error}`);
        const tempVideoPath = await browser.closeSession();
        let finalVideoPath: string | undefined;

        if (tempVideoPath && fs.existsSync(tempVideoPath)) {
            const newFilename = `run-${testRunId}.webm`;
            const artifactsDir = path.resolve('./artifacts/videos');
            if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

            finalVideoPath = path.join(artifactsDir, newFilename);
            fs.renameSync(tempVideoPath, finalVideoPath);
            console.log(`🎥 Fail Video saved to ${finalVideoPath}`);
            finalVideoPath = `/videos/${newFilename}`;
        }

        const isStopped = error.message === 'Mission stopped by user';
        const finalStatus = isStopped ? 'stopped' : 'failed';
        const finalResult = isStopped ? null : 'fail';

        await db.update(testRuns).set({
            status: finalStatus,
            result: finalResult,
            logs: JSON.stringify([...history.getFullLog(), isStopped ? '🛑 Mission stopped by user' : `❌ ERROR: ${error.message}`]),
            videoUrl: finalVideoPath || undefined
        }).where(eq(testRuns.id, testRunId));

        redis.publish('reliqa-events', JSON.stringify({
            runId: testRunId,
            type: 'status',
            status: finalStatus,
            result: finalResult,
            videoUrl: finalVideoPath,
            timestamp: new Date()
        }));

        redis.publish('reliqa-events', JSON.stringify({
            runId: testRunId,
            type: 'log',
            message: isStopped ? '🛑 Mission stopped' : `❌ Job Failed: ${error.message}`,
            timestamp: new Date()
        }));

        if (!isStopped) {
            await db.insert(issues).values({
                testRunId: testRunId,
                description: error.message || 'Unknown error',
                severity: 'high'
            });
        }
    } finally {
        await browser.cleanup();
    }

}, { connection });

console.log('Worker started, listening for jobs...');
