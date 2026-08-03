import { Queue } from 'bullmq';
import { db } from '../db/index.js';
import { testRuns } from '../db/schema.js';
import { resolveRunOwner } from './ensure-local-user.js';
import dotenv from 'dotenv';
import { Redis } from 'ioredis';

dotenv.config();

const connection = {
    url: process.env.REDIS_URL || 'redis://localhost:6379'
};

const testQueue = new Queue('test-queue', { connection });

function parseArgs(argv: string[]) {
    let asEmail: string | undefined;
    const positional: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--as') {
            asEmail = argv[++i];
            if (!asEmail) {
                throw new Error('Missing value for --as <email>');
            }
            continue;
        }
        positional.push(arg);
    }

    return { asEmail, positional };
}

async function main() {
    const { asEmail, positional } = parseArgs(process.argv.slice(2));
    const url = positional[0];
    const goal = positional[1];
    const mode = positional[2] || 'standard';

    if (!url || !goal) {
        console.error('Usage: pnpm run trigger <url> <goal> [mode] [--as email]');
        process.exit(1);
    }

    console.log(`Triggering Job: ${goal} on ${url} [${mode}]`);

    const user = await resolveRunOwner(asEmail);

    const [testRun] = await db.insert(testRuns).values({
        userId: user.id,
        url: url,
        goal: goal,
        status: 'queued'
    }).returning();

    await testQueue.add('test-job', {
        url,
        goal,
        testRunId: testRun.id,
        userId: user.id,
        mode
    });

    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
    await redis.publish('reliqa-events', JSON.stringify({
        type: 'run-created',
        run: testRun,
        timestamp: new Date()
    }));
    redis.disconnect();

    console.log(`Job queued! TestRun ID: ${testRun.id} (owner: ${user.email})`);
    process.exit(0);
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});
