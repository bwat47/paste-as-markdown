import { ToastType } from 'api/types';
import { isMarkdownEditorMode } from './editor/editorIntegration';
import { getErrorMessage } from './errors';
import logger from './logger';
import { handlePasteAsMarkdown } from './pasteHandler';
import type { PasteOptionsPrompt } from './types';
import { showToast } from './utils';

const RICH_TEXT_UNSUPPORTED_MESSAGE = 'Paste HTML as Markdown is not supported in the rich text editor';

/** Executes Paste as Markdown only when Joplin's Markdown editor is active. */
export async function executePasteAsMarkdownCommand(promptForOptions: PasteOptionsPrompt): Promise<void> {
    if (!(await isMarkdownEditorMode())) {
        await showToast(RICH_TEXT_UNSUPPORTED_MESSAGE, ToastType.Info);
        return;
    }

    try {
        const result = await handlePasteAsMarkdown(promptForOptions);
        if ('cancelled' in result) return;
        if (!result.success && result.warnings.length) {
            logger.warn('Paste reported warnings:', result.warnings);
        }
    } catch (err: unknown) {
        logger.error('Error handling paste command', err);
        await showToast('Paste HTML as Markdown failed: ' + getErrorMessage(err), ToastType.Error);
    }
}
