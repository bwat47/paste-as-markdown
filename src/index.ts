import joplin from 'api';
import { handlePasteAsMarkdown } from './pasteHandler';
import { registerPluginSettings } from './settings';
import { showToast } from './utils';
import { MenuItemLocation, ToastType } from 'api/types';
import logger from './logger';

const PASTE_AS_MARKDOWN_COMMAND = 'pasteHtmlAsMarkdown';
const PASTE_AS_MARKDOWN_SHORTCUT = 'Ctrl+Alt+V';
const PASTE_AS_MARKDOWN_MENU = 'pasteAsMarkdownMenu';

joplin.plugins.register({
    onStart: async () => {
        // Register command
        await joplin.commands.register({
            name: PASTE_AS_MARKDOWN_COMMAND,
            label: 'Paste HTML as Markdown',
            iconName: 'fas fa-paste',
            execute: async () => {
                try {
                    const res = await handlePasteAsMarkdown();
                    if (res.success) {
                        // Success path already shows success toasts inside handler.
                    } else if (res.warnings.length) {
                        logger.warn('Paste reported warnings:', res.warnings);
                    }
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    logger.error('Error handling paste command', err);
                    await showToast('Paste HTML as Markdown failed: ' + message, ToastType.Error);
                }
            },
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

        // Context menu filtering - only add in markdown editor
        joplin.workspace.filterEditorContextMenu(async (menu) => {
            // We only show the context menu item if the user is in the Markdown editor (Code View).
            // 'editor.codeView' is true for Code View, false for Rich Text.
            const isMarkdown = await joplin.settings.globalValue('editor.codeView');
            logger.debug('Context menu filter: isMarkdown (Code View)=', isMarkdown);
            if (!isMarkdown) return menu;
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
