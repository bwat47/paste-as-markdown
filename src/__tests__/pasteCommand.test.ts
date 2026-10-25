import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ToastType } from 'api/types';
import { isMarkdownEditorMode } from '../editor/editorIntegration';
import { handlePasteAsMarkdown } from '../pasteHandler';
import { executePasteAsMarkdownCommand } from '../pasteCommand';
import { showToast } from '../utils';
import logger from '../logger';
import type { PasteOptionsPrompt } from '../types';

vi.mock('../editor/editorIntegration');
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
    const promptForOptions = vi.fn<PasteOptionsPrompt>();

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

        await executePasteAsMarkdownCommand(promptForOptions);

        expect(mockShowToast).toHaveBeenCalledWith(
            'Paste HTML as Markdown is not supported in the rich text editor',
            ToastType.Info
        );
        expect(mockHandlePasteAsMarkdown).not.toHaveBeenCalled();
    });

    test('runs the paste handler in the Markdown editor', async () => {
        await executePasteAsMarkdownCommand(promptForOptions);

        expect(mockHandlePasteAsMarkdown).toHaveBeenCalledExactlyOnceWith(promptForOptions);
        expect(mockShowToast).not.toHaveBeenCalled();
    });

    test('treats a cancelled paste as neither a failure nor a warning', async () => {
        mockHandlePasteAsMarkdown.mockResolvedValue({ cancelled: true });

        await executePasteAsMarkdownCommand(promptForOptions);

        expect(logger.warn).not.toHaveBeenCalled();
        expect(mockShowToast).not.toHaveBeenCalled();
    });

    test('preserves command error reporting', async () => {
        mockHandlePasteAsMarkdown.mockRejectedValue(new Error('clipboard unavailable'));

        await executePasteAsMarkdownCommand(promptForOptions);

        expect(mockShowToast).toHaveBeenCalledWith(
            'Paste HTML as Markdown failed: clipboard unavailable',
            ToastType.Error
        );
    });
});
