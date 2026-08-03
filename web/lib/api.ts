
export interface Run {
    id: number;
    url: string;
    goal: string;
    status: 'queued' | 'running' | 'completed' | 'failed' | 'stopping' | 'stopped';
    result: 'pass' | 'fail' | null;
    videoUrl?: string;
    createdAt: string;
    logs?: string;
    model?: string;
}

export interface Step {
    id: number;
    runId: number;
    stepNumber: number;
    actionType: string;
    thought: string;
    selector: string;
    screenshotUrl: string;
    timestamp: string;
}

const API_BASE = '/api';

const fetchOptions: RequestInit = {
    credentials: 'include',
};

export class UnauthorizedError extends Error {
    constructor() {
        super('Unauthorized');
        this.name = 'UnauthorizedError';
    }
}

function clearStaleSessionCookies() {
    document.cookie = 'better-auth.session_token=; Max-Age=0; Path=/';
    document.cookie = '__Secure-better-auth.session_token=; Max-Age=0; Path=/; Secure';
}

function redirectToSignIn() {
    if (typeof window === 'undefined') return;

    clearStaleSessionCookies();

    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/sign-in?returnTo=${encodeURIComponent(returnTo || '/')}`;
}

// Shared fetch that sends cookies and sends stale sessions back to sign-in
export async function apiFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const res = await fetch(input, {
        ...fetchOptions,
        ...init,
        credentials: 'include',
    });

    if (res.status === 401) {
        redirectToSignIn();
        throw new UnauthorizedError();
    }

    return res;
}

export async function getRuns(limit = 10, cursor?: number): Promise<{ runs: Run[], nextCursor: number | null }> {
    const url = new URL(`${API_BASE}/runs`, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
    url.searchParams.append('limit', limit.toString());
    if (cursor) url.searchParams.append('cursor', cursor.toString());

    const res = await apiFetch(url.toString());
    if (!res.ok) throw new Error('Failed to fetch runs');
    return res.json();
}

export async function getRun(id: string): Promise<Run & { steps: Step[] }> {
    const res = await apiFetch(`${API_BASE}/runs/${id}`);
    if (!res.ok) throw new Error('Failed to fetch run');
    return res.json();
}

export function getStreamUrl(runId: string) {
    return `${API_BASE}/stream/${runId}`;
}

export async function stopRun(id: string): Promise<{ success: boolean }> {
    const res = await apiFetch(`${API_BASE}/runs/${id}/stop`, {
        method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to stop run');
    return res.json();
}
