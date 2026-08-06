import { describe, test, expect } from 'vitest';
import { buildSanitizerConfig } from '../sanitizerConfig';

// Locks the URI scheme allow-list, which is compiled into a regex from a scheme array.

const ALLOWED_URIS = [
    'http://example.com',
    'https://example.com',
    'HTTPS://EXAMPLE.COM',
    'ftp://example.com/file',
    'ftps://example.com/file',
    'mailto:user@example.com',
    'tel:+15551234567',
    'callto:user',
    'sms:+15551234567',
    'cid:part1@example.com',
    'xmpp:user@example.com',
    'data:image/png;base64,AAAA',
    // Relative references have no scheme and must stay usable.
    '/path/to/page',
    './relative',
    '#anchor',
    '?query=1',
    'page.html',
];

const BLOCKED_URIS = [
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'about:blank',
    'blob:https://example.com/abc',
];

describe('buildSanitizerConfig ALLOWED_URI_REGEXP', () => {
    const { ALLOWED_URI_REGEXP } = buildSanitizerConfig({ includeImages: true });

    test.each(ALLOWED_URIS)('allows %s', (uri) => {
        expect(ALLOWED_URI_REGEXP.test(uri)).toBe(true);
    });

    test.each(BLOCKED_URIS)('blocks %s', (uri) => {
        expect(ALLOWED_URI_REGEXP.test(uri)).toBe(false);
    });
});
