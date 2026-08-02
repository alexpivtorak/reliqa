import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/sign-in', '/api/auth'];

export function proxy(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (
        PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon') ||
        pathname.match(/\.(svg|png|jpg|jpeg|gif|webp|ico)$/)
    ) {
        return NextResponse.next();
    }

    const sessionCookie =
        request.cookies.get('better-auth.session_token') ||
        request.cookies.get('__Secure-better-auth.session_token');

    if (!sessionCookie?.value) {
        if (pathname.startsWith('/api/') || pathname.startsWith('/videos/')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const signInUrl = new URL('/sign-in', request.url);
        signInUrl.searchParams.set('returnTo', pathname);
        return NextResponse.redirect(signInUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ['/((?!_next/static|_next/image).*)'],
};
