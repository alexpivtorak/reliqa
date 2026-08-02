import { db } from '../src/db/index.js';
import { testRuns } from '../src/db/schema.js';

async function main() {
    try {
        const runs = await db.select().from(testRuns);
        console.log(`Total runs found: ${runs.length}`);
        console.log(runs.map(r => ({ id: r.id, url: r.url, status: r.status, createdAt: r.createdAt })));
    } catch (e) {
        console.error(e);
    }
    process.exit(0);
}

main();
