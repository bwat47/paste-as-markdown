import joplin from 'api';
import { COMMANDS, SHORTCUTS, SETTINGS, SETTINGS_SECTION, LOG_PREFIX } from './constants';
import { handlePasteAsMarkdown } from './pasteHandler';
import { showToast } from './utils';
import { MenuItemLocation, ToastType, SettingItemType } from 'api/types';

joplin.plugins.register({
    onStart: async () => {
        // Register command
        await joplin.commands.register({
            name: COMMANDS.PASTE_AS_MARKDOWN,
            label: 'Paste as Markdown',
            iconName: 'fas fa-paste',
            execute: async () => {
                try {
                    await handlePasteAsMarkdown();
                } catch (err: unknown) {
                    const message = err instanceof Error ? err.message : String(err);
                    console.error(LOG_PREFIX, 'Error:', err);
                    await showToast('Paste as Markdown failed: ' + message, ToastType.Error);
                }
            },
        });

        // Register settings
        await joplin.settings.registerSection(SETTINGS_SECTION, {
            label: 'Paste as Markdown',
            iconName: 'fas fa-paste',
        });

        await joplin.settings.registerSettings({
            [SETTINGS.INCLUDE_IMAGES]: {
                value: true,
                type: SettingItemType.Bool,
                section: SETTINGS_SECTION,
                public: true,
                label: 'Include images',
                description:
                    'If enabled, images from HTML will be converted to markdown image syntax. If disabled, images will be removed entirely.',
            },
        });

        // Add menu item with accelerator in Edit menu for discoverability
        try {
            await joplin.views.menuItems.create(
                'pasteAsMarkdownMenu',
                COMMANDS.PASTE_AS_MARKDOWN,
                MenuItemLocation.Edit,
                {
                    accelerator: SHORTCUTS.PASTE_AS_MARKDOWN,
                }
            );
        } catch (err) {
            console.warn(LOG_PREFIX, 'Failed to create menu item', err);
        }

        // Context menu filtering - only add in markdown editor
        joplin.workspace.filterEditorContextMenu(async (menu) => {
            let isMarkdown = false;
            try {
                // To determine if the user is in the Markdown editor, we try to execute
                // a command that is only supported by that editor. If it succeeds, we
                // know it's the Markdown editor. If it throws, it's probably the
                // Rich Text editor.
                await joplin.commands.execute('editor.execCommand', {
                    name: 'getCursor',
                });
                isMarkdown = true;
            } catch {
                isMarkdown = false;
            }
            if (!isMarkdown) return menu;
            const exists = menu.items.some((i) => i.commandName === COMMANDS.PASTE_AS_MARKDOWN);
            if (!exists) {
                menu.items.push({
                    commandName: COMMANDS.PASTE_AS_MARKDOWN,
                    label: 'Paste as Markdown',
                    accelerator: SHORTCUTS.PASTE_AS_MARKDOWN,
                });
            }
            return menu;
        });

        console.info(LOG_PREFIX, 'Plugin started');
    },
});
