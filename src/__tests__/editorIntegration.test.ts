import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import { isMarkdownEditorContextMenuOrigin } from '../editorIntegration';
import { IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND } from '../editorCommands';

vi.mock('api');

describe('editor integration', () => {
    let globalValue: Mock<(key: string) => Promise<unknown>>;
    let execute: Mock<(command: string, args: unknown) => Promise<unknown>>;

    beforeEach(async () => {
        vi.clearAllMocks();
        globalValue = vi.fn<(key: string) => Promise<unknown>>();
        execute = vi.fn<(command: string, args: unknown) => Promise<unknown>>();

        const joplinModule = await import('api');
        (joplinModule.default as unknown) = {
            settings: { globalValue },
            commands: { execute },
        };
    });

    test('rejects rich text mode without querying the Markdown editor', async () => {
        globalValue.mockResolvedValue(false);

        await expect(isMarkdownEditorContextMenuOrigin()).resolves.toBe(false);
        expect(globalValue).toHaveBeenCalledWith('editor.codeView');
        expect(execute).not.toHaveBeenCalled();
    });

    test('accepts a Markdown editor context menu origin', async () => {
        globalValue.mockResolvedValue(true);
        execute.mockResolvedValue(true);

        await expect(isMarkdownEditorContextMenuOrigin()).resolves.toBe(true);
        expect(execute).toHaveBeenCalledWith('editor.execCommand', {
            name: IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND,
        });
    });

    test('rejects the viewer while Markdown mode is enabled', async () => {
        globalValue.mockResolvedValue(true);
        execute.mockResolvedValue(false);

        await expect(isMarkdownEditorContextMenuOrigin()).resolves.toBe(false);
    });
});
