import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { testRuns } from '../db/schema.js';
import type { AuthVariables } from './auth-middleware.js';

const ownerCache = new Map<number, number>();

export function sessionUserId(c: Context<{ Variables: AuthVariables }>): number | null {
    const user = c.get('user');
    if (!user) return null;
    const userId = Number(user.id);
    if (!Number.isInteger(userId) || userId <= 0) return null;
    return userId;
}

export function parseRunId(raw: string): number | null {
    if (!/^\d+$/.test(raw)) return null;
    const id = Number(raw);
    if (!Number.isInteger(id) || id <= 0) return null;
    return id;
}

export async function getRunOwnerId(runId: number): Promise<number | null> {
    const cached = ownerCache.get(runId);
    if (cached !== undefined) return cached;

    const [row] = await db
        .select({ userId: testRuns.userId })
        .from(testRuns)
        .where(eq(testRuns.id, runId))
        .execute();

    if (!row) return null;

    ownerCache.set(runId, row.userId);
    return row.userId;
}

export async function loadOwnedRun(runId: number, userId: number) {
    const [run] = await db
        .select()
        .from(testRuns)
        .where(eq(testRuns.id, runId))
        .execute();

    if (!run || run.userId !== userId) return null;

    ownerCache.set(runId, run.userId);
    return run;
}

export function rememberRunOwner(runId: number, userId: number) {
    ownerCache.set(runId, userId);
}
