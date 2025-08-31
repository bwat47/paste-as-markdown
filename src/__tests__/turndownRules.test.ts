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
        test('adds removePermalinkAnchors rule', () => {
            applyCustomRules(mockService as unknown as import('@joplin/turndown').default);

            expect(mockService.addRule).toHaveBeenCalledWith('removePermalinkAnchors', {
                filter: expect.any(Function),
                replacement: expect.any(Function),
            });
        });

        test('removePermalinkAnchors rule correctly identifies anchor elements', () => {
            applyCustomRules(mockService as unknown as import('@joplin/turndown').default);

            const ruleCall = mockService.addRule.mock.calls.find((call) => call[0] === 'removePermalinkAnchors');
            expect(ruleCall).toBeDefined();

            const { filter, replacement } = ruleCall[1] as {
                filter: (node: unknown) => boolean | undefined;
                replacement: () => string;
            };

            // Test filter function
            const anchorWithClass = {
                nodeName: 'A',
                getAttribute: jest.fn((attr: string) => (attr === 'class' ? 'anchor permalink' : null)),
                textContent: '', // Empty string
            };

            const regularAnchor = {
                nodeName: 'A',
                getAttribute: jest.fn(() => null),
                textContent: 'Link text', // Non-empty string
            };

            const nonAnchor = {
                nodeName: 'DIV',
                getAttribute: jest.fn(),
                textContent: '',
            };

            expect(filter(anchorWithClass)).toBe(true);
            // When getAttribute returns null, ?.includes() returns undefined, making the whole expression undefined
            expect(filter(regularAnchor)).toBe(undefined);
            // For non-anchor elements, node.nodeName === 'A' is false, so the whole expression is false
            expect(filter(nonAnchor)).toBe(false);

            // Test replacement function
            expect(replacement()).toBe('');
        });

        test('handles service without proper rules structure gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            // Service needs addRule method but no rules structure for insert fix
            const serviceWithoutRules = {
                addRule: jest.fn(), // Has addRule so it won't throw initially
            } as unknown as import('@joplin/turndown').default;

            expect(() => applyCustomRules(serviceWithoutRules)).not.toThrow();

            // Should have called addRule for the permalink anchors rule
            expect(serviceWithoutRules.addRule).toHaveBeenCalledWith('removePermalinkAnchors', expect.any(Object));

            // Should warn about not being able to access rules for insert fix
            expect(consoleSpy).toHaveBeenCalledWith(
                '[paste-as-markdown] Could not access Turndown rules for insert filter fix'
            );

            consoleSpy.mockRestore();
        });

        test('handles errors during rule processing gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

            // Create a service that throws when accessing rules
            const problematicService = {
                addRule: jest.fn(),
                get rules() {
                    throw new Error('Rules access denied');
                },
            } as unknown as import('@joplin/turndown').default;

            expect(() => applyCustomRules(problematicService)).not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith(
                '[paste-as-markdown] Failed to apply insert rule fix:',
                expect.any(Error)
            );

            consoleSpy.mockRestore();
        });

        test('modifies insert rule when found', () => {
            const consoleSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});

            // Create a service with mock rules that includes an insert-like rule
            const mockInsertRule = {
                filter: jest.fn(),
                replacement: jest.fn(),
            };

            // Make the filter function look like the insert rule
            Object.defineProperty(mockInsertRule.filter, 'toString', {
                value: () => 'function(node) { return getStyleProp(node, "text-decoration") === "underline"; }',
            });

            const serviceWithRules = {
                addRule: jest.fn(),
                rules: {
                    array: [mockInsertRule],
                },
            } as unknown as import('@joplin/turndown').default;

            applyCustomRules(serviceWithRules);

            expect(consoleSpy).toHaveBeenCalledWith('[paste-as-markdown] Applied insert rule fix for anchor elements');

            consoleSpy.mockRestore();
        });
    });
});
