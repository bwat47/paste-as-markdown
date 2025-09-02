import { describe, test, expect, jest, beforeEach } from '@jest/globals';

describe('turndownRules', () => {
    let applyCustomRules: typeof import('../turndownRules').applyCustomRules;
    let mockService: { addRule: jest.Mock };

    beforeEach(async () => {
        jest.clearAllMocks();

        // Create a mock service
        mockService = {
            addRule: jest.fn(),
        };

        // Dynamic import to get fresh module
        const module = await import('../turndownRules');
        applyCustomRules = module.applyCustomRules;
    });

    describe('applyCustomRules', () => {
        test('applies fallback insert rule patch only', () => {
            // After DOM preprocessing refactor, applyCustomRules now only handles fallback insert rule patching
            // The cleanHeadingAnchors rule is no longer added since that logic moved to DOM preprocessing
            applyCustomRules(mockService as unknown as import('@joplin/turndown').default);

            // Should not add any rules since cleanHeadingAnchors is handled in DOM preprocessing
            expect(mockService.addRule).not.toHaveBeenCalled();
        });

        test('handles service without proper rules structure gracefully', async () => {
            const { __resetInsertRuleLogGuards } = await import('../turndownRules');
            __resetInsertRuleLogGuards();
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const serviceWithoutRules = {
                addRule: jest.fn(),
            } as unknown as import('@joplin/turndown').default;
            expect(() => applyCustomRules(serviceWithoutRules)).not.toThrow();
            // Should not add cleanHeadingAnchors rule anymore since it's handled in DOM preprocessing
            expect(serviceWithoutRules.addRule).not.toHaveBeenCalled();
            expect(consoleSpy).toHaveBeenCalledWith(
                '[paste-as-markdown]',
                'Could not access Turndown rules for insert filter fix'
            );
            // Subsequent call should not re-log the warning
            applyCustomRules(serviceWithoutRules);
            expect(
                consoleSpy.mock.calls.filter(
                    (c) =>
                        c[0] === '[paste-as-markdown]' &&
                        c[1] === 'Could not access Turndown rules for insert filter fix'
                ).length
            ).toBe(1);
            consoleSpy.mockRestore();
        });

        test('handles errors during rule processing gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const problematicService = {
                addRule: jest.fn(),
                get rules() {
                    throw new Error('Rules access denied');
                },
            } as unknown as import('@joplin/turndown').default;
            expect(() => applyCustomRules(problematicService)).not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith(
                '[paste-as-markdown]',
                'Failed to apply insert rule fix:',
                'Rules access denied'
            );
            consoleSpy.mockRestore();
        });

        test('modifies insert rule when found', () => {
            const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
            const mockInsertRule = { filter: jest.fn(), replacement: jest.fn() };
            Object.defineProperty(mockInsertRule.filter, 'toString', {
                value: () =>
                    'function(node){/* text-decoration underline */ return getStyleProp(node, "text-decoration") === "underline"; }',
            });
            const serviceWithRules = {
                addRule: jest.fn(),
                rules: { array: [mockInsertRule] },
            } as unknown as import('@joplin/turndown').default;
            applyCustomRules(serviceWithRules);
            expect(consoleSpy).toHaveBeenCalledWith(
                '[paste-as-markdown]',
                'Applied insert rule fix for anchor elements'
            );
            consoleSpy.mockRestore();
        });

        test('insert rule patch is idempotent', () => {
            const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
            const mockInsertRule = { filter: jest.fn(), replacement: jest.fn() };
            Object.defineProperty(mockInsertRule.filter, 'toString', {
                value: () => 'function(node){ return getStyleProp(node, "text-decoration") === "underline"; }',
            });
            const serviceWithRules = {
                addRule: jest.fn(),
                rules: { array: [mockInsertRule] },
            } as unknown as import('@joplin/turndown').default;
            applyCustomRules(serviceWithRules);
            applyCustomRules(serviceWithRules);
            // Only one debug log
            expect(
                consoleSpy.mock.calls.filter((c) => c[1] === 'Applied insert rule fix for anchor elements').length
            ).toBe(1);
            // Filter patched flag present (accessing internal rules via cast)
            type RuleFn = (node: unknown, options?: unknown) => boolean;
            const internal = serviceWithRules as unknown as {
                rules: { array: Array<{ filter: RuleFn & { _anchorPatched?: boolean } }> };
            };
            const patched = internal.rules.array[0].filter as { _anchorPatched?: boolean };
            expect(patched._anchorPatched).toBe(true);
            consoleSpy.mockRestore();
        });
    });
});
