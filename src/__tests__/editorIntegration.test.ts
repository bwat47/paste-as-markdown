import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import { isMarkdownEditorContextMenuOrigin } from '../editorIntegration';
import { IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND } from '../editorCommands';

vi.mock('api');

describe('editor integration', () => {
    let globalValues: Mock<(keys: string[]) => Promise<unknown[]>>;
    let execute: Mock<(command: string, args: unknown) => Promise<unknown>>;

    beforeEach(async () => {
        vi.clearAllMocks();
        globalValues = vi.fn<(keys: string[]) => Promise<unknown[]>>();
        execute = vi.fn<(command: string, args: unknown) => Promise<unknown>>();

        const joplinModule = await import('api');
        (joplinModule.default as unknown) = {
            settings: { globalValues },
            commands: { execute },
        };
    });

    test('rejects rich text mode without querying the Markdown editor', async () => {
        globalValues.mockResolvedValue([false]);

        await expect(isMarkdownEditorContextMenuOrigin()).resolves.toBe(false);
        expect(globalValues).toHaveBeenCalledWith(['editor.codeView']);
        expect(execute).not.toHaveBeenCalled();
    });

    test('accepts a Markdown editor context menu origin', async () => {
        globalValues.mockResolvedValue([true]);
        execute.mockResolvedValue(true);

        await expect(isMarkdownEditorContextMenuOrigin()).resolves.toBe(true);
        expect(execute).toHaveBeenCalledWith('editor.execCommand', {
            name: IS_EDITOR_CONTEXT_MENU_ORIGIN_COMMAND,
        });
    });

    test('rejects the viewer while Markdown mode is enabled', async () => {
        globalValues.mockResolvedValue([true]);
        execute.mockResolvedValue(false);

        await expect(isMarkdownEditorContextMenuOrigin()).resolves.toBe(false);
    });
});
