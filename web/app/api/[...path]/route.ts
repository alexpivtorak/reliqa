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

async function proxyRequest(request: NextRequest, pathSegments: string[]) {
    const path = pathSegments.join('/');
    const search = request.nextUrl.search;
    const upstreamUrl = `${API_ORIGIN}/api/${path}${search}`;

    const headers = new Headers();
    request.headers.forEach((value, key) => {
        if (STRIP_HEADERS.has(key.toLowerCase())) return;
        headers.set(key, value);
    });

    const init: RequestInit = {
        method: request.method,
        headers,
        redirect: 'manual',
    };

    if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = request.body;
        // @ts-expect-error duplex is required for streaming request bodies in Node fetch
        init.duplex = 'half';
    }

    const upstream = await fetch(upstreamUrl, init);

    const responseHeaders = new Headers();
    upstream.headers.forEach((value, key) => {
        const lower = key.toLowerCase();
        if (lower === 'transfer-encoding') return;
        if (lower === 'set-cookie') return;
        responseHeaders.set(key, value);
    });

    const setCookies =
        typeof upstream.headers.getSetCookie === 'function'
            ? upstream.headers.getSetCookie()
            : [];

    for (const cookie of setCookies) {
        responseHeaders.append('set-cookie', cookie);
    }

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
    return proxyRequest(request, path);
}

export async function POST(request: NextRequest, context: RouteContext) {
    const { path } = await context.params;
    return proxyRequest(request, path);
}

export async function OPTIONS(request: NextRequest, context: RouteContext) {
    const { path } = await context.params;
    return proxyRequest(request, path);
}
