import { describe, expect, test, vi } from 'vitest';
import type { CodeMirrorControl } from 'api/types';
import codeMirror5ContentScript from '../contentScripts/codeMirror5';
import codeMirror6ContentScript from '../contentScripts/codeMirror6';
import {
    createContextMenuOriginTracker,
    EDITOR_CONTEXT_MENU_EVENT_GRACE_MS,
} from '../contentScripts/contextMenuOrigin';
import { INSERT_MARKDOWN_COMMAND, IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND } from '../editorCommands';

type EditorCommand = (...args: unknown[]) => unknown;

describe('editor content scripts', () => {
    test('the CodeMirror 6 script tracks editor context menus and inserts at the selection', () => {
        const commands = new Map<string, EditorCommand>();
        const transaction = { selectionReplacement: true };
        const editor = {
            dom: document.createElement('div'),
            state: {
                replaceSelection: vi.fn().mockReturnValue(transaction),
            },
            dispatch: vi.fn(),
        };
        const editorControl = {
            cm6: {},
            editor,
            registerCommand: (name: string, command: EditorCommand): void => {
                commands.set(name, command);
            },
        } as unknown as CodeMirrorControl;

        codeMirror6ContentScript().plugin(editorControl);

        expect(commands.get(IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND)?.()).toBe(false);
        editor.dom.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        expect(commands.get(IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND)?.()).toBe(true);
        expect(commands.get(IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND)?.()).toBe(false);

        expect(commands.get(INSERT_MARKDOWN_COMMAND)?.('inserted')).toBe(true);
        expect(editor.state.replaceSelection).toHaveBeenCalledWith('inserted');
        expect(editor.dispatch).toHaveBeenCalledWith(transaction);
        expect(commands.get(INSERT_MARKDOWN_COMMAND)?.(42)).toBe(false);
    });

    test('the CodeMirror 6 script ignores the legacy editor', () => {
        const registerCommand = vi.fn();
        codeMirror6ContentScript().plugin({ cm6: undefined, registerCommand } as unknown as CodeMirrorControl);
        expect(registerCommand).not.toHaveBeenCalled();
    });

    test('the CodeMirror 5 script tracks editor context menus and replaces the selection', () => {
        const extensions = new Map<string, EditorCommand>();
        let initializeOption: ((editor: unknown, enabled: boolean) => void) | undefined;
        const codeMirror = {
            defineOption: vi.fn((_name: string, _defaultValue: boolean, callback: typeof initializeOption) => {
                initializeOption = callback;
            }),
            defineExtension: vi.fn((name: string, command: EditorCommand) => {
                extensions.set(name, command);
            }),
        };
        const wrapper = document.createElement('div');
        const editor = {
            getWrapperElement: (): HTMLElement => wrapper,
            replaceSelection: vi.fn(),
        };

        const module = codeMirror5ContentScript();
        module.plugin(codeMirror as never);
        initializeOption?.(editor, true);

        const originCommand = extensions.get(IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND);
        expect(originCommand?.call(editor)).toBe(false);
        wrapper.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }));
        expect(originCommand?.call(editor)).toBe(true);
        expect(originCommand?.call(editor)).toBe(false);

        const insertCommand = extensions.get(INSERT_MARKDOWN_COMMAND);
        expect(insertCommand?.call(editor, 'inserted')).toBe(true);
        expect(editor.replaceSelection).toHaveBeenCalledWith('inserted');
        expect(insertCommand?.call(editor, null)).toBe(false);
        expect(module.codeMirrorOptions).toEqual({ 'pasteAsMarkdown-enableContentScript': true });
    });

    test('the CodeMirror 5 script ignores the CodeMirror 6 wrapper', () => {
        const codeMirror = {
            cm6: {},
            defineOption: vi.fn(),
            defineExtension: vi.fn(),
        };
        codeMirror5ContentScript().plugin(codeMirror as never);
        expect(codeMirror.defineOption).not.toHaveBeenCalled();
        expect(codeMirror.defineExtension).not.toHaveBeenCalled();
    });

    test('context menu origin markers expire and are consumed once', () => {
        let now = 1_000;
        const tracker = createContextMenuOriginTracker(() => now);

        tracker.mark();
        now += EDITOR_CONTEXT_MENU_EVENT_GRACE_MS + 1;
        expect(tracker.consume()).toBe(false);
        now = 2_000;
        tracker.mark();
        expect(tracker.consume()).toBe(true);
        expect(tracker.consume()).toBe(false);
    });
});
