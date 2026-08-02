import type { Context, Next } from 'hono';
import { auth, type Session, type SessionUser } from '../auth/index.js';

export type AuthVariables = {
    user: SessionUser | null;
    session: Session | null;
};

export async function sessionMiddleware(c: Context<{ Variables: AuthVariables }>, next: Next) {
    const sessionData = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!sessionData) {
        c.set('user', null);
        c.set('session', null);
        await next();
        return;
    }

    c.set('user', sessionData.user);
    c.set('session', sessionData.session);
    await next();
}

export async function requireAuth(c: Context<{ Variables: AuthVariables }>, next: Next) {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Unauthorized' }, 401);
    }
    await next();
}
