import { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const API_ORIGIN = process.env.RELIQA_API_URL || 'http://localhost:3001';

const STRIP_HEADERS = new Set([
    'host',
    'connection',
    'content-length',
    'transfer-encoding',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-forwarded-for',
    'x-real-ip',
    'x-user-id',
    'x-user-email',
    'x-organization-id',
]);

async function proxyVideo(request: NextRequest, pathSegments: string[]) {
    const path = pathSegments.join('/');
    const search = request.nextUrl.search;
    const upstreamUrl = `${API_ORIGIN}/videos/${path}${search}`;

    const headers = new Headers();
    request.headers.forEach((value, key) => {
        if (STRIP_HEADERS.has(key.toLowerCase())) return;
        headers.set(key, value);
    });

    const upstream = await fetch(upstreamUrl, {
        method: request.method,
        headers,
        redirect: 'manual',
    });

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower === 'transfer-encoding') return;
        responseHeaders.set(key, value);
    });

    return new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
    });
}

type RouteContext = {
    params: Promise<{ path: string[] }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
    const { path } = await context.params;
    return proxyVideo(request, path);
}

export async function HEAD(request: NextRequest, context: RouteContext) {
    const { path } = await context.params;
    return proxyVideo(request, path);
}
