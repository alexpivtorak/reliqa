import { eq } from 'drizzle-orm';
import { db } from '../db/index.js';
import { users } from '../db/schema.js';

const LOCAL_DEV_EMAIL = process.env.LOCAL_DEV_USER_EMAIL || 'dev@reliqa.local';
const LOCAL_DEV_NAME = process.env.LOCAL_DEV_USER_NAME || 'Local Dev';

export async function ensureLocalDevUser() {
    const existing = await db.query.users.findFirst({
        where: eq(users.email, LOCAL_DEV_EMAIL),
    });

    if (existing) {
        return existing;
    }

    const [created] = await db
        .insert(users)
        .values({
            name: LOCAL_DEV_NAME,
            email: LOCAL_DEV_EMAIL,
            emailVerified: true,
        })
        .returning();

    return created;
}
