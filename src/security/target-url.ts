import dns from 'dns/promises';
import type { LookupAddress } from 'dns';
import ipaddr from 'ipaddr.js';

export class UnsafeTargetUrlError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsafeTargetUrlError';
    }
}

export function allowPrivateTargets(): boolean {
    return process.env.ALLOW_PRIVATE_TARGETS === 'true';
}

function isBlockedRange(range: string): boolean {
    return (
        range === 'unspecified' ||
        range === 'broadcast' ||
        range === 'multicast' ||
        range === 'linkLocal' ||
        range === 'loopback' ||
        range === 'carrierGradeNat' ||
        range === 'private' ||
        range === 'reserved' ||
        range === 'uniqueLocal'
    );
}

function classifyAddress(raw: string): { ok: boolean; reason?: string } {
    let parsed: ipaddr.IPv4 | ipaddr.IPv6;
    try {
        parsed = ipaddr.parse(raw);
    } catch {
        return { ok: false, reason: `Invalid IP address: ${raw}` };
    }

    if (parsed.kind() === 'ipv6') {
        const v6 = parsed as ipaddr.IPv6;
        if (v6.isIPv4MappedAddress()) {
            return classifyAddress(v6.toIPv4Address().toString());
        }
    }

    const range = parsed.range();
    if (isBlockedRange(range)) {
        return {
            ok: false,
            reason: `Target resolves to a blocked ${range} address (${raw})`,
        };
    }

    return { ok: true };
}

/**
 * Validates that a job or crawl target URL is safe to open from the API/worker.
 * Default-denies loopback, private, link-local, metadata, and reserved ranges.
 * Set ALLOW_PRIVATE_TARGETS=true for local self-tests against localhost.
 */
export async function assertSafeTargetUrl(raw: string): Promise<string> {
    let parsed: URL;
    try {
        parsed = new URL(raw);
    } catch {
        throw new UnsafeTargetUrlError('Invalid target URL');
    }

    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new UnsafeTargetUrlError('Target URL must use http or https');
    }

    if (parsed.username || parsed.password) {
        throw new UnsafeTargetUrlError('Target URL must not include credentials');
    }

    if (allowPrivateTargets()) {
        return parsed.toString();
    }

    const host = parsed.hostname;
    if (!host) {
        throw new UnsafeTargetUrlError('Target URL is missing a hostname');
    }

    if (ipaddr.isValid(host)) {
        const result = classifyAddress(host);
        if (!result.ok) {
            throw new UnsafeTargetUrlError(result.reason || 'Blocked target address');
        }
        return parsed.toString();
    }

    let addresses: LookupAddress[];
    try {
        addresses = await dns.lookup(host, { all: true });
    } catch {
        throw new UnsafeTargetUrlError(`Could not resolve target host: ${host}`);
    }

    if (addresses.length === 0) {
        throw new UnsafeTargetUrlError(`Could not resolve target host: ${host}`);
    }

    for (const entry of addresses) {
        const result = classifyAddress(entry.address);
        if (!result.ok) {
            throw new UnsafeTargetUrlError(result.reason || 'Blocked target address');
        }
    }

    return parsed.toString();
}
