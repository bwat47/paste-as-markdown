import type { CodeMirrorControl, MarkdownEditorContentScriptModule } from 'api/types';
import { INSERT_MARKDOWN_COMMAND, IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND } from '../editorCommands';
import { createContextMenuOriginTracker } from './contextMenuOrigin';

interface EditorViewLike {
    dom: HTMLElement;
    state: {
        replaceSelection(text: string): unknown;
    };
    dispatch(transaction: unknown): void;
}

export default (): MarkdownEditorContentScriptModule => ({
    plugin: (editorControl: CodeMirrorControl): void => {
        if (!editorControl.cm6) return;

        const view = editorControl.editor as EditorViewLike;
        const originTracker = createContextMenuOriginTracker();
        view.dom.addEventListener('contextmenu', originTracker.mark, true);

        editorControl.registerCommand(IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND, (): boolean => {
            return originTracker.consume();
        });

        editorControl.registerCommand(INSERT_MARKDOWN_COMMAND, (markdown: unknown): boolean => {
            if (typeof markdown !== 'string') return false;
            view.dispatch(view.state.replaceSelection(markdown));
            return true;
        });
    },
});

