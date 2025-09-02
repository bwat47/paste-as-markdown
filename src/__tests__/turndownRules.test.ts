import { describe, test, expect } from '@jest/globals';
import { applyCustomRules } from '../turndownRules';

describe('turndownRules (DOM refactor)', () => {
    test('applyCustomRules no-op', () => {
        expect(() => applyCustomRules()).not.toThrow();
    });
});
