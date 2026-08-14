import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import { DEFAULT_PASS_CONTEXT } from '../html/passContext';
import { pasteOptions } from './helpers/pasteOptions';

// Mock upstream turndown so we can assert rule wiring without invoking full conversion logic.
vi.mock('turndown', () => {
    interface MockRule {
        filter?: (n: HTMLElement) => boolean;
        replacement?: (c: string, n: HTMLElement) => string;
    }
    interface MockService {
        use: Mock;
        remove: Mock;
        turndown: Mock;
        addRule: Mock;
        rules: { array: MockRule[] };
    }
    const ctor = vi.fn(function (): MockService {
        return {
            use: vi.fn(),
            remove: vi.fn(),
            turndown: vi.fn().mockReturnValue('# Mock Output'),
            addRule: vi.fn(),
            rules: { array: [] },
        };
    });
    return { __esModule: true, default: ctor };
});

describe('markdownConverter', () => {
    let convertHtmlToMarkdown: typeof import('../markdownConverter').convertHtmlToMarkdown;

    beforeEach(async () => {
        vi.clearAllMocks();
        // Dynamic import after mocking
        const module = await import('../markdownConverter');
        convertHtmlToMarkdown = module.convertHtmlToMarkdown;
    });

    test('processes HTML and calls turndown service', async () => {
        const { default: TurndownService } = await import('turndown');
        const { markdown: result } = await convertHtmlToMarkdown('<p>Test</p>', pasteOptions(), DEFAULT_PASS_CONTEXT);
        expect(TurndownService).toHaveBeenCalled();
        const instance = (TurndownService as unknown as Mock).mock.results[0].value as {
            use: Mock;
            turndown: Mock;
        };
        expect(instance.use).toHaveBeenCalled();
        expect(instance.turndown).toHaveBeenCalled();
        expect(result).toBe('# Mock Output');
    });

    test('processes HTML through DOM preprocessing when includeImages is false (defensive removals still applied)', async () => {
        const { default: TurndownService } = await import('turndown');
        await convertHtmlToMarkdown(
            '<p>Test <img src="test.jpg"> content</p>',
            pasteOptions({ includeImages: false }),
            DEFAULT_PASS_CONTEXT
        );
        const instance = (TurndownService as unknown as Mock).mock.results[0].value as {
            remove: Mock;
            addRule: Mock;
            turndown: Mock;
        };
        // Defensive removals now expected even though DOMPurify normally strips these.
        expect(instance.remove).toHaveBeenCalledWith('script');
        expect(instance.remove).toHaveBeenCalledWith('style');
        expect(instance.remove).toHaveBeenCalledWith('img');
        // No legacy custom image stripping rule added.
        expect(instance.addRule).not.toHaveBeenCalledWith('__stripImages', expect.any(Object));
        expect(instance.turndown).toHaveBeenCalled();
    });

    // Detailed integration behaviors covered in separate integration test file.
});
