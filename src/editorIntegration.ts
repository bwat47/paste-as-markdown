import joplin from 'api';
import logger from './logger';
import { INSERT_MARKDOWN_COMMAND, IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND } from './editorCommands';

const EDITOR_CODE_VIEW_SETTING = 'editor.codeView';

/** Returns whether the pending context menu was opened from a Markdown editor. */
async function isEditorContextMenuOrigin(): Promise<boolean> {
    try {
        const result = await joplin.commands.execute('editor.execCommand', {
            name: IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND,
        });
        return result === true;
    } catch (err) {
        logger.debug('Editor context menu origin check failed', err);
        return false;
    }
}

/** Returns whether Joplin is using its Markdown editor rather than the rich text editor. */
export async function isMarkdownEditorMode(): Promise<boolean> {
    try {
        const isMarkdownEditor = await joplin.settings.globalValue(EDITOR_CODE_VIEW_SETTING);
        return isMarkdownEditor === true;
    } catch (err) {
        logger.debug('Markdown editor mode check failed', err);
        return false;
    }
}

/** Excludes rich text mode, then distinguishes the Markdown editor from its viewer. */
export async function isMarkdownEditorContextMenuOrigin(): Promise<boolean> {
    if (!(await isMarkdownEditorMode())) return false;
    return isEditorContextMenuOrigin();
}

/** Inserts text through the command supplied by the active Markdown editor content script. */
export async function insertMarkdownAtCursor(markdown: string): Promise<void> {
    try {
        const inserted = await joplin.commands.execute('editor.execCommand', {
            name: INSERT_MARKDOWN_COMMAND,
            args: [markdown],
        });
        if (inserted === true) return;
    } catch (err) {
        logger.error('Markdown editor insertion command failed', err);
    }

    throw new Error('Unable to insert markdown into editor');
}
