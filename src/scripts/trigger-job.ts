import { Queue } from 'bullmq';
import { db } from '../db/index.js';
import { testRuns, users } from '../db/schema.js';
import dotenv from 'dotenv';
import { Redis } from 'ioredis';

dotenv.config();

const connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
};

const testQueue = new Queue('test-queue', { connection });

async function main() {
    const url = process.argv[2];
    const goal = process.argv[3];
    const mode = process.argv[4] || 'standard';

    if (!url || !goal) {
        console.error('Usage: npm run trigger <url> <goal> [mode]');
        process.exit(1);
    }

    console.log(`Triggering Job: ${goal} on ${url} [${mode}]`);

    // Ensure a default user exists
    let user = await db.query.users.findFirst();
    if (!user) {
        const [newUser] = await db.insert(users).values({
            email: 'demo@reliqa.com',
            apiKey: 'demo-key'
        }).returning();
        user = newUser;
    }

    // Create Test Run record
    const [testRun] = await db.insert(testRuns).values({
        userId: user.id,
        url: url,
        goal: goal,
        status: 'queued'
    }).returning();

    // Push to Queue
    await testQueue.add('test-job', {
        url,
        goal,
        testRunId: testRun.id,
        mode
    });

    // Notify Dashboard via Redis
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    await redis.publish('reliqa-events', JSON.stringify({
        type: 'run-created',
        run: testRun,
        timestamp: new Date()
    }));
    redis.disconnect();

    console.log(`Job queued! TestRun ID: ${testRun.id}`);
    process.exit(0);
}

main();
