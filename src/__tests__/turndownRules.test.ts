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
        test('adds cleanHeadingAnchors rule', () => {
            applyCustomRules(mockService as unknown as import('@joplin/turndown').default);

            expect(mockService.addRule).toHaveBeenCalledWith('cleanHeadingAnchors', {
                filter: expect.any(Function),
                replacement: expect.any(Function),
            });
        });

        test('cleanHeadingAnchors rule handles permalink anchors and heading links', () => {
            applyCustomRules(mockService as unknown as import('@joplin/turndown').default);

            const ruleCall = mockService.addRule.mock.calls.find((call) => call[0] === 'cleanHeadingAnchors');
            expect(ruleCall).toBeDefined();

            const { filter, replacement } = ruleCall[1] as {
                filter: (node: unknown) => boolean | undefined;
                replacement: (content: string, node: unknown) => string;
            };

            interface TestNode {
                nodeName: string;
                getAttribute: (k: string) => string | null;
                textContent: string;
                children: unknown[];
                parentElement: { nodeName: string } | null;
            }
            const mkNode = (attrs: Record<string, string | null>, text: string): TestNode => ({
                nodeName: 'A',
                getAttribute: (k: string) => attrs[k] ?? null,
                textContent: text,
                children: [],
                parentElement: null,
            });

            const permalinkAnchor = mkNode({ class: 'anchor', href: '#heading' }, '');
            const userContentAnchor = mkNode({ class: 'anchor', id: 'user-content-heading' }, '');
            const anchorWithText = mkNode({ class: 'anchor', href: '#heading' }, 'Title');
            const nonPermalinkAnchor = mkNode({ class: 'anchor', href: 'https://example.com' }, '');
            const nonAnchor: TestNode = {
                nodeName: 'DIV',
                getAttribute: () => null,
                textContent: '',
                children: [],
                parentElement: null,
            };

            // Heading wrapper link
            const heading: { nodeName: string } = { nodeName: 'H2' };
            const headingLink = mkNode({ href: 'https://example.com' }, 'Some Heading');
            headingLink.parentElement = heading;

            expect(filter(permalinkAnchor)).toBe(true);
            expect(filter(userContentAnchor)).toBe(true);
            expect(filter(anchorWithText)).toBe(false);
            expect(filter(nonPermalinkAnchor)).toBe(false);
            expect(filter(nonAnchor)).toBe(false);
            expect(filter(headingLink)).toBe(true); // unwrap case
            expect(replacement('', permalinkAnchor)).toBe('');
            expect(replacement('Some Heading', headingLink)).toBe('Some Heading');
        });

        test('handles service without proper rules structure gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            const serviceWithoutRules = {
                addRule: jest.fn(),
            } as unknown as import('@joplin/turndown').default;
            expect(() => applyCustomRules(serviceWithoutRules)).not.toThrow();
            expect(serviceWithoutRules.addRule).toHaveBeenCalledWith('cleanHeadingAnchors', expect.any(Object));
            expect(consoleSpy).toHaveBeenCalledWith(
                '[paste-as-markdown]',
                'Could not access Turndown rules for insert filter fix'
            );
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
    });
});
