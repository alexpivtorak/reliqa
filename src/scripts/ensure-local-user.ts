import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

const FALLBACK_DEV_EMAIL = 'dev@reliqa.local';
const FALLBACK_DEV_NAME = 'Local Dev';

async function findUserByEmail(email: string) {
    return db.query.users.findFirst({
        where: eq(users.email, email.trim().toLowerCase()),
    });
}

async function ensureFallbackDevUser() {
    const existing = await findUserByEmail(FALLBACK_DEV_EMAIL);
    if (existing) return existing;

    const [created] = await db
        .insert(users)
        .values({
            name: process.env.LOCAL_DEV_USER_NAME || FALLBACK_DEV_NAME,
            email: FALLBACK_DEV_EMAIL,
            emailVerified: true,
        })
        .returning();

    return created;
}

/**
 * Resolves the owner for CLI-triggered runs.
 * Prefer --as <email>, then LOCAL_DEV_USER_EMAIL, then auto-create dev@reliqa.local.
 * Explicit emails must already exist (no silent create for arbitrary addresses).
 */
export async function resolveRunOwner(emailFromFlag?: string) {
    const explicit = (emailFromFlag || process.env.LOCAL_DEV_USER_EMAIL || '').trim().toLowerCase();

    if (explicit) {
        const existing = await findUserByEmail(explicit);
        if (!existing) {
            throw new Error(
                `No user found for "${explicit}". Sign in once with that email, or omit --as / LOCAL_DEV_USER_EMAIL to use ${FALLBACK_DEV_EMAIL}.`,
            );
        }
        return existing;
    }

    return ensureFallbackDevUser();
}

/** @deprecated Prefer resolveRunOwner. Kept for callers that expect the fallback user. */
export async function ensureLocalDevUser() {
    return resolveRunOwner();
}
