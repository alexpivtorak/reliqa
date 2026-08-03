/**
 * Generated identifiers rotate. A ULID captured during a crawl is gone the next time
 * the app is reseeded, so a test plan built from exact ids expires with the data.
 * These helpers turn "product-01KZ4CHAYW2Z1F53YF71CHB04V" into the family it belongs
 * to, "product-", which survives a reseed and still says what kind of thing it is.
 */

const ULID = /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{26}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LONG_HEX = /^[0-9a-f]{16,}$/i;
const LONG_NUMBER = /^\d{4,}$/;
const RANDOM_ALNUM = /^(?=[a-z0-9]*\d)(?=[a-z0-9]*[a-z])[a-z0-9]{12,}$/i;

export function isVolatileToken(token: string): boolean {
    if (!token) return false;
    return ULID.test(token) ||
        UUID.test(token) ||
        LONG_HEX.test(token) ||
        LONG_NUMBER.test(token) ||
        RANDOM_ALNUM.test(token);
}

export type TestIdShape =
    | { kind: 'stable' }
    | { kind: 'family'; prefix: string }
    | { kind: 'volatile' };

/**
 * A UUID contains dashes, so it has to be checked before the value is split apart.
 */
export function classifyTestId(value: string): TestIdShape {
    if (!value) return { kind: 'stable' };
    if (isVolatileToken(value)) return { kind: 'volatile' };

    // Odd indices hold the separators, so joining a slice rebuilds the original text
    const parts = value.split(/([-_])/);

    for (let i = 0; i < parts.length; i += 2) {
        if (!isVolatileToken(parts[i])) continue;
        const prefix = parts.slice(0, i).join('');
        return prefix ? { kind: 'family', prefix } : { kind: 'volatile' };
    }

    return { kind: 'stable' };
}

export function familySelector(attribute: string, prefix: string): string {
    return `[${attribute}^="${prefix.replace(/"/g, '\\"')}"]`;
}
