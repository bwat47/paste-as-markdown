import { ToastType } from 'api/types';
import { isMarkdownEditorMode } from './editorIntegration';
import { handlePasteAsMarkdown } from './pasteHandler';
import logger from './logger';
import { showToast } from './utils';

const RICH_TEXT_UNSUPPORTED_MESSAGE = 'Paste HTML as Markdown is not supported in the rich text editor';

/** Executes Paste as Markdown only when Joplin's Markdown editor is active. */
export async function executePasteAsMarkdownCommand(): Promise<void> {
    if (!(await isMarkdownEditorMode())) {
        await showToast(RICH_TEXT_UNSUPPORTED_MESSAGE, ToastType.Info);
        return;
    }

    try {
        const result = await handlePasteAsMarkdown();
        if (!result.success && result.warnings.length) {
            logger.warn('Paste reported warnings:', result.warnings);
        }
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error('Error handling paste command', err);
        await showToast('Paste HTML as Markdown failed: ' + message, ToastType.Error);
    }
}

