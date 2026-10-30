import { describe, test, expect } from 'vitest';
import { getErrorMessage } from '../errors';

describe('getErrorMessage', () => {
    test('returns the message of an Error', () => {
        expect(getErrorMessage(new TypeError('bad input'))).toBe('bad input');
    });

    test('stringifies non-Error values', () => {
        expect(getErrorMessage('plain string')).toBe('plain string');
        expect(getErrorMessage(42)).toBe('42');
        expect(getErrorMessage(undefined)).toBe('undefined');
        expect(getErrorMessage(null)).toBe('null');
    });
});
