
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { DiscoveryCrawler } from '../agent/DiscoveryCrawler.js';
import { db } from '../db/index.js';
import { testRuns, testSteps } from '../db/schema.js';
import { and, desc, eq, lt } from 'drizzle-orm';
import { EventEmitter } from 'events';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';
import { auth } from '../auth/index.js';
import { ensureSeedUser } from '../scripts/ensure-seed-user.js';
import { sessionMiddleware, requireAuth, type AuthVariables } from './auth-middleware.js';
import {
    getRunOwnerId,
    loadOwnedRun,
    parseRunId,
    rememberRunOwner,
    sessionUserId,
} from './run-access.js';
import { assertSafeTargetUrl, UnsafeTargetUrlError } from '../security/target-url.js';

const app = new Hono<{ Variables: AuthVariables }>();

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

import path from 'path';
import fs from 'fs';

const webOrigin = process.env.BETTER_AUTH_URL || 'http://localhost:3000';
const RUN_VIDEO_RE = /^run-(\d+)\.webm$/;

app.use(
    '/*',
    cors({
        origin: webOrigin,
        allowHeaders: ['Content-Type', 'Authorization'],
        allowMethods: ['GET', 'POST', 'OPTIONS'],
        credentials: true,
        maxAge: 600,
    }),
);

app.on(['POST', 'GET'], '/api/auth/*', (c) => {
    return auth.handler(c.req.raw);
});

app.use('*', sessionMiddleware);

// Owned video serving: only run-<id>.webm, and only for the run owner
const artifactsDir = path.resolve('./artifacts/videos');
if (!fs.existsSync(artifactsDir)) fs.mkdirSync(artifactsDir, { recursive: true });

app.get('/videos/:filename', requireAuth, async (c) => {
    const userId = sessionUserId(c);
    if (userId === null) return c.json({ error: 'Unauthorized' }, 401);

    const filename = c.req.param('filename');
    if (!filename) return c.json({ error: 'Not found' }, 404);

    const match = RUN_VIDEO_RE.exec(filename);
    if (!match) return c.json({ error: 'Not found' }, 404);

    const runId = Number(match[1]);
    const run = await loadOwnedRun(runId, userId);
    if (!run) return c.json({ error: 'Not found' }, 404);

    const filePath = path.join(artifactsDir, filename);
    if (!fs.existsSync(filePath)) return c.json({ error: 'Not found' }, 404);

    const stat = fs.statSync(filePath);
    const { Readable } = await import('stream');
    const nodeStream = fs.createReadStream(filePath);
    const webStream = Readable.toWeb(nodeStream) as ReadableStream;

    return new Response(webStream, {
        headers: {
            'Content-Type': 'video/webm',
            'Content-Length': String(stat.size),
            'Cache-Control': 'private, max-age=3600',
        },
    });
});

app.get('/api/health', (c) => {
    return c.json({
        service: 'reliqa-api',
        status: 'ok',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

app.get('/', (c) => {
    return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Reliqa API</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
            background: #0f172a;
            color: #e2e8f0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        main { text-align: center; padding: 2rem; max-width: 28rem; }
        .logo { font-size: 2rem; font-weight: 700; letter-spacing: -0.02em; }
        .logo span { color: #a855f7; }
        .status {
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            margin-top: 1rem;
            padding: 0.35rem 0.9rem;
            border: 1px solid #334155;
            border-radius: 9999px;
            font-size: 0.85rem;
            color: #94a3b8;
        }
        .dot { width: 8px; height: 8px; border-radius: 50%; background: #22c55e; }
        p { margin-top: 1.25rem; color: #94a3b8; font-size: 0.95rem; line-height: 1.6; }
        a { color: #a855f7; text-decoration: none; font-weight: 600; }
        a:hover { text-decoration: underline; }
        .links { margin-top: 1.5rem; font-size: 0.85rem; color: #64748b; }
        .links code { background: #1e293b; padding: 0.15rem 0.45rem; border-radius: 0.35rem; font-size: 0.8rem; }
    </style>
</head>
<body>
    <main>
        <div class="logo">Reli<span>qa</span> API</div>
        <div class="status" role="status" aria-live="polite"><span class="dot" aria-hidden="true"></span>Service running on port ${port}</div>
        <p>This is the backend API for Reliqa, the agentic QA platform. Looking for the dashboard? It runs separately at <a href="http://localhost:3000">localhost:3000</a>.</p>
        <div class="links">Health check at <code>/api/health</code> &middot; Run videos at <code>/videos/</code></div>
    </main>
</body>
</html>`);
});

// List recent runs for the signed-in user only
app.get('/api/runs', requireAuth, async (c) => {
    const userId = sessionUserId(c);
    if (userId === null) return c.json({ error: 'Unauthorized' }, 401);

    const limit = c.req.query('limit') ? parseInt(c.req.query('limit')!, 10) : 10;
    const cursorRaw = c.req.query('cursor');
    const cursor = cursorRaw ? parseRunId(cursorRaw) : undefined;
    if (cursorRaw && cursor === null) {
        return c.json({ error: 'Invalid cursor' }, 400);
    }

    const conditions = [eq(testRuns.userId, userId)];
    if (cursor !== undefined && cursor !== null) {
        conditions.push(lt(testRuns.id, cursor));
    }

    const runs = await db
        .select()
        .from(testRuns)
        .where(and(...conditions))
        .orderBy(desc(testRuns.id))
        .limit(limit);

    const nextCursor = runs.length === limit ? runs[runs.length - 1].id : null;

    return c.json({ runs, nextCursor });
});

// Get run details (owner only)
app.get('/api/runs/:id', requireAuth, async (c) => {
    const userId = sessionUserId(c);
    if (userId === null) return c.json({ error: 'Unauthorized' }, 401);

    const id = parseRunId(c.req.param('id')!);
    if (id === null) return c.json({ error: 'Invalid run id' }, 400);

    const run = await loadOwnedRun(id, userId);
    if (!run) return c.json({ error: 'Run not found' }, 404);

    const steps = await db
        .select()
        .from(testSteps)
        .where(eq(testSteps.runId, id))
        .orderBy(testSteps.stepNumber)
        .execute();

    return c.json({ ...run, steps });
});

// Stop a run (owner only)
app.post('/api/runs/:id/stop', requireAuth, async (c) => {
    const userId = sessionUserId(c);
    if (userId === null) return c.json({ error: 'Unauthorized' }, 401);

    const id = parseRunId(c.req.param('id')!);
    if (id === null) return c.json({ error: 'Invalid run id' }, 400);

    const run = await loadOwnedRun(id, userId);
    if (!run) return c.json({ error: 'Run not found' }, 404);
    if (run.status !== 'running' && run.status !== 'queued') {
        return c.json({ error: 'Run is not in a stoppable state' }, 400);
    }

    await db.update(testRuns)
        .set({ status: 'stopping', updatedAt: new Date() })
        .where(eq(testRuns.id, id))
        .execute();

    eventBus.emit('status', {
        runId: id,
        status: 'stopping',
        timestamp: new Date()
    });

    console.log(`🛑 Run ${id} marked as stopping`);

    return c.json({ success: true });
});

// Create a new run (Trigger Job)
app.post('/api/jobs', requireAuth, async (c) => {
    const { url, goal, mode, chaosProfile, model, headless, disableCache } = await c.req.json();

    if (!url || !goal) return c.json({ error: 'Missing url or goal' }, 400);

    const userId = sessionUserId(c);
    if (userId === null) return c.json({ error: 'Unauthorized' }, 401);

    let safeUrl: string;
    try {
        safeUrl = await assertSafeTargetUrl(url);
    } catch (err) {
        const message = err instanceof UnsafeTargetUrlError ? err.message : 'Unsafe target URL';
        return c.json({ error: message }, 400);
    }

    console.log(`Triggering Job: ${goal} on ${safeUrl} [${mode}] using ${model || 'default'}`);

    const [testRun] = await db.insert(testRuns).values({
        userId,
        url: safeUrl,
        goal: goal,
        status: 'queued',
        model: model || 'gemini-2.5-flash'
    }).returning();

    rememberRunOwner(testRun.id, userId);

    const queue = new Queue('test-queue', { connection: redis as any });

    await queue.add('test-job', {
        url: safeUrl,
        goal,
        testRunId: testRun.id,
        userId,
        mode,
        chaosProfile,
        model: model || 'gemini-2.5-flash',
        headless: headless !== false,
        disableCache: disableCache === true
    });

    await queue.close();

    return c.json({ runId: testRun.id, status: 'queued' });
});

// Dynamic Sitemap Analyzer endpoint
app.post('/api/analyze-sitemap', requireAuth, async (c) => {
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
app.get('/api/crawl-stream', requireAuth, async (c) => {
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
        let safeUrl: string;
        try {
            safeUrl = await assertSafeTargetUrl(url);
        } catch (err) {
            const message = err instanceof UnsafeTargetUrlError ? err.message : 'Unsafe target URL';
            await stream.writeSSE({
                data: JSON.stringify({ error: message }),
                event: 'error'
            });
            return;
        }

        const crawler = new DiscoveryCrawler();
        try {
            const result = await crawler.discover(safeUrl, depth, async (event) => {
                await stream.writeSSE({
                    data: JSON.stringify(event.data),
                    event: event.type
                });
            });

            if (!result.nodes.length) {
                await stream.writeSSE({
                    data: JSON.stringify({
                        error: "Crawl found 0 pages. Check the Target URL (use http:// for local apps, not https://) and that the site is reachable."
                    }),
                    event: 'error'
                });
                return;
            }

            await stream.writeSSE({
                data: JSON.stringify({ success: true, nodeCount: result.nodes.length }),
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

// Global Stream for Dashboard (owner-scoped events only)
app.get('/api/stream/global', requireAuth, async (c) => {
    const userId = sessionUserId(c);
    if (userId === null) return c.json({ error: 'Unauthorized' }, 401);

    console.log(`🔌 Client connected to GLOBAL stream (user ${userId})`);

    c.header('Content-Type', 'text/event-stream; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return streamSSE(c, async (stream) => {
        const onRunCreated = async (data: any) => {
            if (data.run?.userId !== userId) return;
            await stream.writeSSE({
                data: JSON.stringify(data.run),
                event: 'run-created',
            });
        };

        const onStatus = async (data: any) => {
            const ownerId = await getRunOwnerId(data.runId);
            if (ownerId !== userId) return;
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

// SSE Endpoint for Live Streaming (Specific Run, owner only)
app.get('/api/stream/:id', requireAuth, async (c) => {
    const userId = sessionUserId(c);
    if (userId === null) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id')!;
    const runId = parseRunId(id);
    if (runId === null) return c.json({ error: 'Invalid run id' }, 400);

    const run = await loadOwnedRun(runId, userId);
    if (!run) return c.json({ error: 'Run not found' }, 404);

    console.log(`🔌 Client connected to stream for run ${id}`);

    c.header('Content-Type', 'text/event-stream; charset=utf-8');
    c.header('Cache-Control', 'no-cache');
    c.header('Connection', 'keep-alive');

    return streamSSE(c, async (stream) => {
        await stream.writeSSE({
            data: JSON.stringify({ type: 'connected', message: `Listening for events on run ${id}` }),
            event: 'status',
        });

        const onLog = async (data: any) => {
            if (data.runId === runId) {
                await stream.writeSSE({ data: JSON.stringify(data), event: 'log' });
            }
        };
        const onStep = async (data: any) => {
            if (data.runId === runId) {
                await stream.writeSSE({ data: JSON.stringify(data), event: 'step' });
            }
        };
        const onFrame = async (data: any) => {
            if (data.runId === runId) {
                await stream.writeSSE({ data: data.data, event: 'frame' });
            }
        };
        const onStatus = async (data: any) => {
            if (data.runId === runId) {
                await stream.writeSSE({ data: JSON.stringify(data), event: 'status' });
            }
        };

        eventBus.on('log', onLog);
        eventBus.on('step', onStep);
        eventBus.on('frame', onFrame);
        eventBus.on('status', onStatus);

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

ensureSeedUser()
    .catch((err) => {
        console.error('[auth] Failed to ensure seed user:', err);
    })
    .finally(() => {
        console.log(`🚀 Server is running on port ${port}`);
        serve({
            fetch: app.fetch,
            port,
        });
    });
