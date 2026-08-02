import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import * as schema from '../db/schema.js';

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
    const allowed = parseAllowedEmails();
    if (allowed.size === 0) return false;
    return allowed.has(email.trim().toLowerCase());
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
