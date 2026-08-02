
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DiscoveryCrawler } from '../agent/DiscoveryCrawler.js';
import { db } from '../db/index.js';
import { testRuns, testSteps } from '../db/schema.js';
import { desc, eq, lt } from 'drizzle-orm';
import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

const app = new Hono();

// Global Event Emitter for broadcasting to SSE clients
export const eventBus = new EventEmitter();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const subscriber = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

subscriber.subscribe('reliqa-events', (err: any, count: any) => {
    if (err) console.error('Failed to subscribe: %s', err.message);
    else console.log(`Subscribed to ${count} channels. Listening for updates...`);
});

subscriber.on('message', (channel: string, message: string) => {
    if (channel === 'reliqa-events') {
        try {
            const data = JSON.parse(message);
            // Re-emit internally so SSE handlers can pick it up
            if (data.type === 'step') eventBus.emit('step', data);
            else if (data.type === 'run-created') eventBus.emit('run-created', data);
            else if (data.type === 'frame') eventBus.emit('frame', data);
            else if (data.type === 'status') eventBus.emit('status', data);
            else eventBus.emit('log', data);
        } catch (e) {
            console.error('Failed to parse Redis message:', e);
        }
    }
});

import { serveStatic } from '@hono/node-server/serve-static';
import path from 'path';
import fs from 'fs';

app.use('/*', cors());

// Serve static videos
// Note: In production this should be Nginx or S3, but for local dev this works.
const artifactsDir = path.resolve('./artifacts/videos');
if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

app.use('/videos/*', serveStatic({
    root: './artifacts/videos',
    rewriteRequestPath: (path) => path.replace(/^\/videos/, ''),
}));

app.get('/', (c) => {
    return c.text('Reliqa API is running!\n Videos at /videos/');
});

// List recent runs
app.get('/api/runs', async (c) => {
    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!) : 10;
    const cursor = c.req.query('cursor') ? parseInt(c.req.query('cursor')!) : undefined;

    const query = db.select().from(testRuns).orderBy(desc(testRuns.id));

    if (cursor) {
        query.where(lt(testRuns.id, cursor));
    }

    const runs = await query.limit(limit);
    const nextCursor = runs.length === limit ? runs[runs.length - 1].id : null;

    return c.json({ runs, nextCursor });
});

// Get run details
app.get('/api/runs/:id', async (c) => {
    const id = parseInt(c.req.param('id'));
    const run = await db.select().from(testRuns).where(eq(testRuns.id, id)).execute();

    if (run.length === 0) return c.json({ error: 'Run not found' }, 404);

    const steps = await db.select().from(testSteps).where(eq(testSteps.runId, id)).orderBy(testSteps.stepNumber).execute();

    return c.json({ ...run[0], steps });
});

// Stop a run
app.post('/api/runs/:id/stop', async (c) => {
    const id = parseInt(c.req.param('id'));
    const [run] = await db.select().from(testRuns).where(eq(testRuns.id, id)).execute();

    if (!run) return c.json({ error: 'Run not found' }, 404);
    if (run.status !== 'running' && run.status !== 'queued') {
        return c.json({ error: 'Run is not in a stoppable state' }, 400);
    }

    // Update status to 'stopping'
    await db.update(testRuns)
        .set({ status: 'stopping', updatedAt: new Date() })
        .where(eq(testRuns.id, id))
        .execute();

    // Broadcast status change
    eventBus.emit('status', {
        runId: id,
        status: 'stopping',
        timestamp: new Date()
    });

    console.log(`🛑 Run ${id} marked as stopping`);

    return c.json({ success: true });
});

// Create a new run (Trigger Job)
app.post('/api/jobs', async (c) => {
    const { url, goal, mode, chaosProfile, model, headless, disableCache } = await c.req.json();

    if (!url || !goal) return c.json({ error: 'Missing url or goal' }, 400);

    console.log(`Triggering Job: ${goal} on ${url} [${mode}] using ${model || 'default'}`);

    // Ensure a default user exists (temporary hack until auth)
    let user = await db.query.users.findFirst();
    if (!user) {
        // ... (user creation logic commented out in original)
    }

    // Create Test Run record
    const [testRun] = await db.insert(testRuns).values({
        // userId: user?.id, 
        url: url,
        goal: goal,
        status: 'queued',
        model: model || 'gemini-2.5-flash' // Default if not provided
    }).returning();

    const queue = new Queue('test-queue', { connection: redis as any });

    // Push to Queue
    await queue.add('test-job', {
        url,
        goal,
        testRunId: testRun.id,
        mode,
        chaosProfile,
        model: model || 'gemini-2.5-flash',
        headless: headless !== false, // Default true
        disableCache: disableCache === true
    });

    await queue.close();

    return c.json({ runId: testRun.id, status: 'queued' });
});

// Dynamic Sitemap Analyzer endpoint
app.post('/api/analyze-sitemap', async (c) => {
    const { url, nodes, flowType } = await c.req.json();

    const activeNodes = (nodes || []).filter((n: any) => n.isActive);
    if (activeNodes.length === 0) {
        return c.json({ prompt: "GOAL: No pages selected. Please enable at least one page state." });
    }

    // Rules-based dynamic prompt generator (failsafe fallback for 429 quota limits)
    const generateFallbackPrompt = () => {
        let text = `GOAL: Validate the user flow on ${url}.\n\n`;
        
        text += "PHASE 1: NAVIGATION & ASSERTIONS\n";
        activeNodes.forEach((node: any, idx: number) => {
            text += `${idx + 1}. Navigate to state "${node.title}" (${node.url}).\n`;
            if (node.customAssertion) {
                text += `   - ASSERT: ${node.customAssertion}\n`;
            }
        });

        text += "\nPHASE 2: INTERACTION VERIFICATION\n";
        activeNodes.forEach((node: any) => {
            if (node.interactives && node.interactives.length > 0) {
                text += `- On page "${node.title}", verify the presence of interactive elements: ${node.interactives.join(', ')}.\n`;
            }
        });

        text += "\nPHASE 3: COMPLETE\n";
        text += `${activeNodes.length + 1}. Once all active states are verified, emit "Done".`;
        return text;
    };

    // If flow type matches mock templates, we can merge them dynamically
    if (flowType === 'chaos-fuzz') {
        let text = `GOAL: Stress-test inputs using fuzzed strings on ${url}.\n\n`;
        activeNodes.forEach((node: any, idx: number) => {
            text += `${idx + 1}. Go to "${node.title}" (${node.url}).\n`;
            if (node.interactives && node.interactives.length > 0) {
                text += `   - Fuzz fields: ${node.interactives.slice(0, 2).join(', ')} with SQL Injection and emoji payloads.\n`;
            }
        });
        text += `${activeNodes.length + 1}. Ensure server handles validations without throwing 500 server errors.`;
        return c.json({ prompt: text });
    }

    const key = process.env.GOOGLE_API_KEY;
    let geminiPrompt = "";

    if (key) {
        try {
            const genAI = new GoogleGenerativeAI(key);
            const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
            const model = genAI.getGenerativeModel({ model: modelName });

            const aiPrompt = `
You are an expert QA Engineer.
Below is the sitemap of a web application discovered by our crawler on target URL: "${url}".

State Nodes (Pages/Screens):
${JSON.stringify(activeNodes, null, 2)}

Please write a step-by-step test plan/prompt that can be executed by an autonomous vision QA agent to perform a happy path end-to-end checkout/validation test on these pages.
The test plan must:
1. Be structured as a set of logical phases.
2. Tell the agent exactly what to click, type, and verify at each page.
3. Be generic to this specific website and nodes.
4. End with a rule to emit 'Done' when the final node is verified.

Return ONLY the plain text test instructions. Keep it clean and concise. Do not wrap in markdown boxes.
`;

            const result = await model.generateContent([aiPrompt]);
            geminiPrompt = result.response.text();
        } catch (error) {
            console.warn("Gemini sitemap analysis failed, using fallback:", error);
        }
    }

    const prompt = geminiPrompt || generateFallbackPrompt();
    return c.json({ prompt });
});

// SSE Sitemap Crawler Discovery endpoint
app.get('/api/crawl-stream', async (c) => {
    const url = c.req.query('url');
    const depthStr = c.req.query('depth');
    const depth = depthStr ? parseInt(depthStr, 10) : 3;

    if (!url) {
        return c.json({ error: "Missing 'url' query parameter" }, 400);
    }

    console.log(`🔌 Client connected to crawl SSE stream for: ${url} (depth: ${depth})`);

    c.header('Content-Type', 'text/event-stream; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return streamSSE(c, async (stream) => {
        const crawler = new DiscoveryCrawler();
        try {
            await crawler.discover(url, depth, async (event) => {
                await stream.writeSSE({
                    data: JSON.stringify(event.data),
                    event: event.type
                });
            });
            // Send complete signal
            await stream.writeSSE({
                data: JSON.stringify({ success: true }),
                event: 'complete'
            });
        } catch (err: any) {
            console.error('SSE Crawl streaming failed:', err);
            await stream.writeSSE({
                data: JSON.stringify({ error: err.message }),
                event: 'error'
            });
        }
    });
});

// Global Stream for Dashboard
app.get('/api/stream/global', async (c) => {
    console.log(`🔌 Client connected to GLOBAL stream`);

    c.header('Content-Type', 'text/event-stream; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return streamSSE(c, async (stream) => {
        const onRunCreated = async (data: any) => {
            await stream.writeSSE({
                data: JSON.stringify(data.run),
                event: 'run-created',
            });
        };

        const onStatus = async (data: any) => {
            await stream.writeSSE({
                data: JSON.stringify({
                    runId: data.runId,
                    status: data.status,
                    result: data.result,
                    videoUrl: data.videoUrl
                }),
                event: 'status-update',
            });
        };

        eventBus.on('run-created', onRunCreated);
        eventBus.on('status', onStatus);

        // Block until the client disconnects — no polling, purely event-driven.
        await new Promise<void>((resolve) => {
            const cleanup = () => {
                console.log(`🔌 Client disconnected from GLOBAL stream`);
                eventBus.off('run-created', onRunCreated);
                eventBus.off('status', onStatus);
                resolve();
            };
            c.req.raw.signal.addEventListener('abort', cleanup, { once: true });
            stream.onAbort(cleanup);
        });
    });
});

// SSE Endpoint for Live Streaming (Specific Run)
app.get('/api/stream/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`🔌 Client connected to stream for run ${id}`);

    c.header('Content-Type', 'text/event-stream; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return streamSSE(c, async (stream) => {
        // Send initial connection message
        await stream.writeSSE({
            data: JSON.stringify({ type: 'connected', message: `Listening for events on run ${id}` }),
            event: 'status',
        });

        const onLog = async (data: any) => {
            if (data.runId === parseInt(id)) {
                await stream.writeSSE({ data: JSON.stringify(data), event: 'log' });
            }
        };
        const onStep = async (data: any) => {
            if (data.runId === parseInt(id)) {
                await stream.writeSSE({ data: JSON.stringify(data), event: 'step' });
            }
        };
        const onFrame = async (data: any) => {
            if (data.runId === parseInt(id)) {
                await stream.writeSSE({ data: data.data, event: 'frame' });
            }
        };
        const onStatus = async (data: any) => {
            if (data.runId === parseInt(id)) {
                await stream.writeSSE({ data: JSON.stringify(data), event: 'status' });
            }
        };

        eventBus.on('log', onLog);
        eventBus.on('step', onStep);
        eventBus.on('frame', onFrame);
        eventBus.on('status', onStatus);

        // Block until the client disconnects — no polling, purely event-driven.
        await new Promise<void>((resolve) => {
            const cleanup = () => {
                console.log(`🔌 Client disconnected from stream ${id}`);
                eventBus.off('log', onLog);
                eventBus.off('step', onStep);
                eventBus.off('frame', onFrame);
                eventBus.off('status', onStatus);
                resolve();
            };
            c.req.raw.signal.addEventListener('abort', cleanup, { once: true });
            stream.onAbort(cleanup);
        });
    });
});

const port = 3001;
console.log(`🚀 Server is running on port ${port}`);

serve({
    fetch: app.fetch,
    port
});
