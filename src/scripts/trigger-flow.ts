import { Queue } from 'bullmq';
import { db } from '../db/index.js';
import { testRuns, users } from '../db/schema.js';
import { TestFlow } from '../agent/types.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Redis } from 'ioredis';

dotenv.config();

const connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
};

const testQueue = new Queue('test-queue', { connection });

// TODO: Refactor to use API
// For now, we still push to queue directly, BUT we need the Server to be running to receive events if we want SSE.
// CAUTION: The 'eventBus' is in-memory. If Worker and Server are separate processes (they are), 
// the Server won't receive 'eventBus.emit' from the Worker.
//
// WE NEED REDIS PUB/SUB for inter-process communication.
//
// Refactoring plan:
// 1. Worker publishes events to Redis 'reliqa-events' channel.
// 2. Server subscribes to Redis 'reliqa-events' channel.
// 3. Server forwards events to SSE clients.



async function main() {
    const flowId = process.argv[2];
    const mode = process.argv[3] || 'standard';

    if (!flowId) {
        console.error('Usage: npm run trigger:flow <flow-id> [mode]');
        console.log('Available flows:');
        const tests = JSON.parse(fs.readFileSync(path.resolve('tests.json'), 'utf-8'));
        tests.forEach((t: any) => console.log(`- ${t.id}: ${t.name}`));
        process.exit(1);
    }

    const tests = JSON.parse(fs.readFileSync(path.resolve('tests.json'), 'utf-8'));
    const selectedTest = tests.find((t: any) => t.id === flowId);

    if (!selectedTest) {
        console.error(`Test Flow '${flowId}' not found in tests.json`);
        process.exit(1);
    }

    const flow: TestFlow = {
        name: selectedTest.name,
        steps: selectedTest.steps
    };

    console.log(`Triggering Flow: ${flow.name} on ${selectedTest.url} [${mode}]`);

    let user = await db.query.users.findFirst();
    if (!user) {
        user = (await db.insert(users).values({ email: 'flow@test.com', apiKey: 'flow-key' }).returning())[0];
    }

    const [testRun] = await db.insert(testRuns).values({
        userId: user.id,
        url: selectedTest.url,
        goal: `FLOW: ${flow.name}`,
        status: 'queued'
    }).returning();

    await testQueue.add('test-job', {
        url: selectedTest.url,
        flow: flow,
        testRunId: testRun.id,
        mode: mode
    });

    // Notify Dashboard via Redis
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    await redis.publish('reliqa-events', JSON.stringify({
        type: 'run-created',
        run: testRun,
        timestamp: new Date()
    }));
    redis.disconnect();

    console.log(`Flow queued! TestRun ID: ${testRun.id}`);
    process.exit(0);
}

main();
