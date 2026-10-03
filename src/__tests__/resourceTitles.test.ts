import { describe, test, expect } from 'vitest';
import { formatFallbackStem, formatFilenameTimestamp } from '../resourceTitles';

describe('formatFilenameTimestamp', () => {
    test('formats local time as a sortable, colon-free timestamp', () => {
        expect(formatFilenameTimestamp(new Date(2026, 9, 3, 14, 30, 25))).toBe('2026-10-03-143025');
    });

    test('zero-pads every field', () => {
        expect(formatFilenameTimestamp(new Date(2026, 0, 5, 3, 4, 5))).toBe('2026-01-05-030405');
    });
});

describe('formatFallbackStem', () => {
    test('first stem has no suffix and later stems are suffixed with their index', () => {
        const pastedAt = new Date(2026, 9, 3, 14, 30, 25);
        expect([1, 2, 3].map((index) => formatFallbackStem(pastedAt, index))).toEqual([
            'pasted-2026-10-03-143025',
            'pasted-2026-10-03-143025-2',
            'pasted-2026-10-03-143025-3',
        ]);
    });
});
