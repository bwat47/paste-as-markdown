import { INSERT_MARKDOWN_COMMAND, IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND } from '../editorCommands';
import { createContextMenuOriginTracker } from './contextMenuOrigin';
import type { ContextMenuOriginTracker } from './contextMenuOrigin';

const ENABLE_CONTENT_SCRIPT_OPTION = 'pasteAsMarkdown-enableContentScript';

interface CodeMirror5Editor {
    getWrapperElement(): HTMLElement;
    replaceSelection(text: string): void;
}

interface CodeMirror5Module {
    cm6?: unknown;
    defineExtension(name: string, callback: (this: CodeMirror5Editor, ...args: unknown[]) => unknown): void;
    defineOption(
        name: string,
        defaultValue: boolean,
        callback: (editor: CodeMirror5Editor, enabled: boolean) => void
    ): void;
}

interface CodeMirror5ContentScriptModule {
    plugin: (codeMirror: CodeMirror5Module) => void;
    codeMirrorOptions: Record<string, boolean>;
}

const originTrackers = new WeakMap<CodeMirror5Editor, ContextMenuOriginTracker>();

export default (): CodeMirror5ContentScriptModule => ({
    plugin: (codeMirror: CodeMirror5Module): void => {
        if (codeMirror.cm6) return;

        codeMirror.defineOption(ENABLE_CONTENT_SCRIPT_OPTION, true, (editor, enabled): void => {
            if (!enabled || originTrackers.has(editor)) return;

            const tracker = createContextMenuOriginTracker();
            originTrackers.set(editor, tracker);
            editor.getWrapperElement().addEventListener('contextmenu', tracker.mark, true);
        });

        codeMirror.defineExtension(IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND, function (): boolean {
            return originTrackers.get(this)?.consume() ?? false;
        });

        codeMirror.defineExtension(INSERT_MARKDOWN_COMMAND, function (markdown: unknown): boolean {
            if (typeof markdown !== 'string') return false;
            this.replaceSelection(markdown);
            return true;
        });
    },
    codeMirrorOptions: {
        [ENABLE_CONTENT_SCRIPT_OPTION]: true,
    },
});
