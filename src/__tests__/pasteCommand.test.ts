import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ToastType } from 'api/types';
import { isMarkdownEditorMode } from '../editorIntegration';
import { handlePasteAsMarkdown } from '../pasteHandler';
import { executePasteAsMarkdownCommand } from '../pasteCommand';
import { showToast } from '../utils';

vi.mock('../editorIntegration');
vi.mock('../pasteHandler');
vi.mock('../utils');
vi.mock('../logger', () => ({
    default: {
        warn: vi.fn(),
        error: vi.fn(),
    },
}));

describe('paste command', () => {
    const mockIsMarkdownEditorMode = vi.mocked(isMarkdownEditorMode);
    const mockHandlePasteAsMarkdown = vi.mocked(handlePasteAsMarkdown);
    const mockShowToast = vi.mocked(showToast);

    beforeEach(() => {
        vi.clearAllMocks();
        mockIsMarkdownEditorMode.mockResolvedValue(true);
        mockHandlePasteAsMarkdown.mockResolvedValue({
            markdown: 'converted',
            success: true,
            plainTextFallback: false,
        });
    });

    test('short-circuits with an info toast in the rich text editor', async () => {
        mockIsMarkdownEditorMode.mockResolvedValue(false);

        await executePasteAsMarkdownCommand();

        expect(mockShowToast).toHaveBeenCalledWith(
            'Paste as Markdown is not supported in the rich text editor',
            ToastType.Info
        );
        expect(mockHandlePasteAsMarkdown).not.toHaveBeenCalled();
    });

    test('runs the paste handler in the Markdown editor', async () => {
        await executePasteAsMarkdownCommand();

        expect(mockHandlePasteAsMarkdown).toHaveBeenCalledTimes(1);
        expect(mockShowToast).not.toHaveBeenCalled();
    });

    test('preserves command error reporting', async () => {
        mockHandlePasteAsMarkdown.mockRejectedValue(new Error('clipboard unavailable'));

        await executePasteAsMarkdownCommand();

        expect(mockShowToast).toHaveBeenCalledWith(
            'Paste HTML as Markdown failed: clipboard unavailable',
            ToastType.Error
        );
    });
});
