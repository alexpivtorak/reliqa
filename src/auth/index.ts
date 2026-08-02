import { betterAuth } from 'better-auth';
import { APIError, createAuthMiddleware } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

export const AUTH_SEED_EMAIL = (process.env.AUTH_SEED_EMAIL || 'agent@reliqa.local').trim().toLowerCase();
export const AUTH_SEED_PASSWORD = process.env.AUTH_SEED_PASSWORD || 'reliqa-agent-pass';
export const AUTH_SEED_NAME = process.env.AUTH_SEED_NAME || 'Reliqa Agent';

function parseAllowedEmails(): Set<string> {
    const raw = process.env.AUTH_ALLOWED_EMAILS || '';
    return new Set(
        raw
            .split(',')
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
    );
}

function isAllowedEmail(email: string | undefined | null): boolean {
    if (!email) return false;
    const normalized = email.trim().toLowerCase();
    if (normalized === AUTH_SEED_EMAIL) return true;
    const allowed = parseAllowedEmails();
    if (allowed.size === 0) return false;
    return allowed.has(normalized);
}

export function isSeedEmail(email: string | undefined | null): boolean {
    if (!email) return false;
    return email.trim().toLowerCase() === AUTH_SEED_EMAIL;
}

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: 'pg',
        schema: {
            ...schema,
            // Better Auth looks up both the default model name and our table name.
            user: schema.users,
            users: schema.users,
        },
    }),
    baseURL: process.env.BETTER_AUTH_URL || 'http://localhost:3000',
    secret: process.env.BETTER_AUTH_SECRET,
    user: {
        modelName: 'users',
    },
    emailAndPassword: {
        enabled: true,
        disableSignUp: true,
        minPasswordLength: 8,
        autoSignIn: true,
    },
    socialProviders: {
        google: {
            clientId: process.env.GOOGLE_CLIENT_ID as string,
            clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
        },
    },
    advanced: {
        trustedProxyHeaders: false,
        database: {
            generateId: (options) => {
                if (options.model === 'user' || options.model === 'users') {
                    return false;
                }
                return crypto.randomUUID();
            },
        },
    },
    hooks: {
        before: createAuthMiddleware(async (ctx) => {
            if (ctx.path !== '/sign-in/email') {
                return;
            }

            const email = typeof ctx.body?.email === 'string' ? ctx.body.email : '';
            if (!isSeedEmail(email)) {
                throw new APIError('FORBIDDEN', {
                    message: 'Password sign-in is only available for the seed agent account.',
                });
            }
        }),
    },
    databaseHooks: {
        user: {
            create: {
                before: async (user) => {
                    if (!isAllowedEmail(user.email)) {
                        throw new APIError('BAD_REQUEST', {
                            message: 'Your email is not on the allowlist.',
                        });
                    }
                    return { data: user };
                },
            },
        },
    },
});

export type SessionUser = typeof auth.$Infer.Session.user;
export type Session = typeof auth.$Infer.Session.session;
