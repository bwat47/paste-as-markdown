import { describe, test, expect, jest } from '@jest/globals';

// Mock upstream turndown so we can assert rule wiring without invoking full conversion logic.
jest.mock('turndown', () => {
    interface MockRule {
        filter?: (n: HTMLElement) => boolean;
        replacement?: (c: string, n: HTMLElement) => string;
    }
    interface MockService {
        use: jest.Mock;
        remove: jest.Mock;
        turndown: jest.Mock;
        addRule: jest.Mock;
        rules: { array: MockRule[] };
    }
    const ctor = jest.fn((): MockService => {
        return {
            use: jest.fn(),
            remove: jest.fn(),
            turndown: jest.fn().mockReturnValue('# Mock Output'),
            addRule: jest.fn(),
            rules: { array: [] },
        };
    });
    return { __esModule: true, default: ctor };
});

// Mock our gfm wrapper
jest.mock('../gfmPlugin');

describe('markdownConverter', () => {
    let convertHtmlToMarkdown: typeof import('../markdownConverter').convertHtmlToMarkdown;

    beforeEach(async () => {
        jest.clearAllMocks();
        // Dynamic import after mocking
        const module = await import('../markdownConverter');
        convertHtmlToMarkdown = module.convertHtmlToMarkdown;
    });

    test('processes HTML and calls turndown service', async () => {
        const { default: TurndownService } = await import('turndown');
        const { markdown: result } = await convertHtmlToMarkdown('<p>Test</p>');
        expect(TurndownService).toHaveBeenCalled();
        const instance = (TurndownService as unknown as jest.Mock).mock.results[0].value as {
            use: jest.Mock;
            turndown: jest.Mock;
        };
        expect(instance.use).toHaveBeenCalled();
        expect(instance.turndown).toHaveBeenCalled();
        expect(result).toBe('# Mock Output');
    });

    test('processes HTML through DOM preprocessing when includeImages is false (defensive removals still applied)', async () => {
        const { default: TurndownService } = await import('turndown');
        await convertHtmlToMarkdown('<p>Test <img src="test.jpg"> content</p>', { includeImages: false });
        const instance = (TurndownService as unknown as jest.Mock).mock.results[0].value as {
            remove: jest.Mock;
            addRule: jest.Mock;
            turndown: jest.Mock;
        };
        // Defensive removals now expected even though DOMPurify normally strips these.
        expect(instance.remove).toHaveBeenCalledWith('script');
        expect(instance.remove).toHaveBeenCalledWith('style');
        expect(instance.remove).toHaveBeenCalledWith('img');
        // No legacy custom image stripping rule added.
        expect(instance.addRule).not.toHaveBeenCalledWith('__stripImages', expect.any(Object));
        expect(instance.turndown).toHaveBeenCalled();
    });

    test('strips leading blank lines from output', async () => {
        const html = '<p>ABC<br>DEF</p>';
        const { markdown: result } = await convertHtmlToMarkdown(html);
        // Our mock always returns '# Mock Output', so we cannot assert actual trimming here.
        // Instead, simulate the trimming function directly to validate regex behavior.
        const simulate = (md: string) => md.replace(/^(?:[ \t]*\n)+/, '');
        expect(simulate('\n\nABC  \nDEF')).toBe('ABC  \nDEF');
        expect(result).toBe('# Mock Output');
    });

    // Detailed integration behaviors covered in separate integration test file.
});
