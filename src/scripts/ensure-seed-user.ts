import { pathToFileURL } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { db } from '../db/index.js';
import { account, users } from '../db/schema.js';
import { AUTH_SEED_EMAIL, AUTH_SEED_NAME, AUTH_SEED_PASSWORD } from '../auth/index.js';

/**
 * Ensures the password-login seed user exists with a credential account.
 * Password sign-in is restricted to this email in Better Auth hooks.
 */
export async function ensureSeedUser() {
    if (!AUTH_SEED_PASSWORD || AUTH_SEED_PASSWORD.length < 8) {
        console.warn(
            '[auth] AUTH_SEED_PASSWORD missing or shorter than 8 chars — skipping seed user.',
        );
        return null;
    }

    let user = await db.query.users.findFirst({
        where: eq(users.email, AUTH_SEED_EMAIL),
    });

    if (!user) {
        const [created] = await db
            .insert(users)
            .values({
                name: AUTH_SEED_NAME,
                email: AUTH_SEED_EMAIL,
                emailVerified: true,
            })
            .returning();
        user = created;
        console.log(`[auth] Created seed user ${AUTH_SEED_EMAIL}`);
    } else {
        const [updated] = await db
            .update(users)
            .set({ name: AUTH_SEED_NAME, emailVerified: true })
            .where(eq(users.id, user.id))
            .returning();
        user = updated;
    }

    const existingCredential = await db.query.account.findFirst({
        where: and(eq(account.userId, user.id), eq(account.providerId, 'credential')),
    });

    const accountId = String(user.id);
    const passwordMatches =
        existingCredential?.password &&
        (await verifyPassword({
            hash: existingCredential.password,
            password: AUTH_SEED_PASSWORD,
        }));

    if (!existingCredential) {
        const hashedPassword = await hashPassword(AUTH_SEED_PASSWORD);
        await db.insert(account).values({
            id: crypto.randomUUID(),
            accountId,
            providerId: 'credential',
            userId: user.id,
            password: hashedPassword,
        });
        console.log(`[auth] Linked credential account for ${AUTH_SEED_EMAIL}`);
    } else if (!passwordMatches) {
        const hashedPassword = await hashPassword(AUTH_SEED_PASSWORD);
        await db
            .update(account)
            .set({ password: hashedPassword, accountId })
            .where(eq(account.id, existingCredential.id));
        console.log(`[auth] Updated seed password for ${AUTH_SEED_EMAIL}`);
    }

    return user;
}

const isDirectRun =
    Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
    ensureSeedUser()
        .then((user) => {
            if (user) console.log(`Seed user ready: ${user.email} (id=${user.id})`);
            process.exit(0);
        })
        .catch((err) => {
            console.error(err);
            process.exit(1);
        });
}
