import joplin from 'api';
import { registerPluginSettings } from './settings';
import { ContentScriptType, MenuItemLocation } from 'api/types';
import logger from './logger';
import { isMarkdownEditorContextMenuOrigin } from './editorIntegration';
import { executePasteAsMarkdownCommand } from './pasteCommand';

const PASTE_AS_MARKDOWN_COMMAND = 'pasteHtmlAsMarkdown';
const PASTE_AS_MARKDOWN_SHORTCUT = 'Ctrl+Alt+V';
const PASTE_AS_MARKDOWN_MENU = 'pasteAsMarkdownMenu';
const CODE_MIRROR_6_CONTENT_SCRIPT_ID = 'pasteAsMarkdownCodeMirror6';
const CODE_MIRROR_5_CONTENT_SCRIPT_ID = 'pasteAsMarkdownCodeMirror5';

joplin.plugins.register({
    onStart: async () => {
        await joplin.contentScripts.register(
            ContentScriptType.CodeMirrorPlugin,
            CODE_MIRROR_6_CONTENT_SCRIPT_ID,
            './contentScripts/codeMirror6.js'
        );
        await joplin.contentScripts.register(
            ContentScriptType.CodeMirrorPlugin,
            CODE_MIRROR_5_CONTENT_SCRIPT_ID,
            './contentScripts/codeMirror5.js'
        );

        // Register command
        await joplin.commands.register({
            name: PASTE_AS_MARKDOWN_COMMAND,
            label: 'Paste HTML as Markdown',
            iconName: 'fas fa-paste',
            execute: executePasteAsMarkdownCommand,
        });

        await registerPluginSettings();

        // Add menu item with accelerator in Edit menu for discoverability
        try {
            await joplin.views.menuItems.create(
                PASTE_AS_MARKDOWN_MENU,
                PASTE_AS_MARKDOWN_COMMAND,
                MenuItemLocation.Edit,
                {
                    accelerator: PASTE_AS_MARKDOWN_SHORTCUT,
                }
            );
        } catch (err) {
            logger.warn('Failed to create menu item', err);
        }

        // Joplin invokes this filter for editor and viewer context menus. The content scripts
        // provide a single-use marker that identifies right-clicks from either Markdown editor,
        // while editor.codeView excludes the rich text editor.
        joplin.workspace.filterEditorContextMenu(async (menu) => {
            if (!(await isMarkdownEditorContextMenuOrigin())) return menu;
            const exists = menu.items.some((i) => i.commandName === PASTE_AS_MARKDOWN_COMMAND);
            if (!exists) {
                menu.items.push({
                    commandName: PASTE_AS_MARKDOWN_COMMAND,
                    label: 'Paste HTML as Markdown',
                    accelerator: PASTE_AS_MARKDOWN_SHORTCUT,
                });
            }
            return menu;
        });

        logger.info('Plugin started');
    },
});
