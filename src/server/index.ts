
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
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

subscriber.subscribe('wolfqa-events', (err: any, count: any) => {
    if (err) console.error('Failed to subscribe: %s', err.message);
    else console.log(`Subscribed to ${count} channels. Listening for updates...`);
});

subscriber.on('message', (channel: string, message: string) => {
    if (channel === 'wolfqa-events') {
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
    return c.text('WolfQA API is running! 🐺\n Videos at /videos/');
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
        model: model || 'gemini-2.0-flash' // Default if not provided
    }).returning();

    const queue = new Queue('test-queue', { connection: redis as any });

    // Push to Queue
    await queue.add('test-job', {
        url,
        goal,
        testRunId: testRun.id,
        mode,
        chaosProfile,
        model: model || 'gemini-2.0-flash',
        headless: headless !== false, // Default true
        disableCache: disableCache === true
    });

    await queue.close();

    return c.json({ runId: testRun.id, status: 'queued' });
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

        while (true) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (c.req.raw.signal.aborted) {
                console.log(`🔌 Client disconnected from GLOBAL stream`);
                eventBus.off('run-created', onRunCreated);
                eventBus.off('status', onStatus);
                break;
            }
        }
    });
});

// SSE Endpoint for Live Streaming (Specific Run)
app.get('/api/stream/:id', async (c) => {
    const id = c.req.param('id');
    console.log(`🔌 Client connected to stream for run ${id}`);

    // Set headers for SSE with explicit charset
    c.header('Content-Type', 'text/event-stream; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    const response = await streamSSE(c, async (stream) => {
        // Send initial connection message
        await stream.writeSSE({
            data: JSON.stringify({ type: 'connected', message: `Listening for events on run ${id}` }),
            event: 'status',
        });

        // Listener function
        const onLog = async (data: any) => {
            if (data.runId === parseInt(id)) {
                await stream.writeSSE({
                    data: JSON.stringify(data),
                    event: 'log',
                });
            }
        };

        const onStep = async (data: any) => {
            if (data.runId === parseInt(id)) {
                await stream.writeSSE({
                    data: JSON.stringify(data),
                    event: 'step',
                });
            }
        };

        const onFrame = async (data: any) => {
            if (data.runId === parseInt(id)) {
                await stream.writeSSE({
                    data: data.data, // base64 string
                    event: 'frame',
                });
            }
        };

        const onStatus = async (data: any) => {
            if (data.runId === parseInt(id)) {
                await stream.writeSSE({
                    data: JSON.stringify(data),
                    event: 'status',
                });
            }
        };

        // Attach listeners
        eventBus.on('log', onLog);
        eventBus.on('step', onStep);
        eventBus.on('frame', onFrame);
        eventBus.on('status', onStatus);

        // Keep connection open until client disconnects
        while (true) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            if (c.req.raw.signal.aborted) {
                console.log(`🔌 Client disconnected from stream ${id}`);
                eventBus.off('log', onLog);
                eventBus.off('step', onStep);
                eventBus.off('frame', onFrame);
                eventBus.off('status', onStatus);
                break;
            }
        }
    });

    response.headers.set('Content-Type', 'text/event-stream; charset=utf-8');
    return response;
});

const port = 3001;
console.log(`🚀 Server is running on port ${port}`);

serve({
    fetch: app.fetch,
    port
});
