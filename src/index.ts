import joplin from 'api';
import { COMMANDS, DEFAULT_PASTE_OPTIONS, SHORTCUTS, SETTINGS, SETTINGS_SECTION } from './constants';
import { handlePasteAsMarkdown } from './pasteHandler';
import { showToast } from './utils';
import { MenuItemLocation, ToastType, SettingItemType } from 'api/types';
import logger from './logger';

joplin.plugins.register({
    onStart: async () => {
        // Register command
        await joplin.commands.register({
            name: COMMANDS.PASTE_AS_MARKDOWN,
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

        // Register settings
        await joplin.settings.registerSection(SETTINGS_SECTION, {
            label: 'Paste HTML as Markdown',
            iconName: 'fas fa-paste',
        });

        await joplin.settings.registerSettings({
            [SETTINGS.INCLUDE_IMAGES]: {
                value: DEFAULT_PASTE_OPTIONS.includeImages,
                type: SettingItemType.Bool,
                section: SETTINGS_SECTION,
                public: true,
                label: 'Include images',
                description:
                    'If enabled, images will be included in the pasted markdown. If disabled, images will be removed entirely.',
            },
            [SETTINGS.CONVERT_IMAGES_TO_RESOURCES]: {
                value: DEFAULT_PASTE_OPTIONS.convertImagesToResources,
                type: SettingItemType.Bool,
                section: SETTINGS_SECTION,
                public: true,
                label: 'Convert images to Joplin resources',
                description:
                    "If enabled, http(s) and base64 images are stored as Joplin resources (requires 'Include images').",
            },
            [SETTINGS.NORMALIZE_QUOTES]: {
                value: DEFAULT_PASTE_OPTIONS.normalizeQuotes,
                type: SettingItemType.Bool,
                section: SETTINGS_SECTION,
                public: true,
                label: 'Normalize smart quotes',
                description: 'Convert Word/Office smart quotes to regular quotes for better markdown compatibility.',
            },
            [SETTINGS.FORCE_TIGHT_LISTS]: {
                value: DEFAULT_PASTE_OPTIONS.forceTightLists,
                type: SettingItemType.Bool,
                section: SETTINGS_SECTION,
                public: true,
                label: 'Force tight lists',
                description:
                    'Prevent blank lines between list items in output Markdown, except for list items with multi-block content.',
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
            logger.warn('Failed to create menu item', err);
        }

        // Context menu filtering - only add in markdown editor
        joplin.workspace.filterEditorContextMenu(async (menu) => {
            // We only show the context menu item if the user is in the Markdown editor (Code View).
            // 'editor.codeView' is true for Code View, false for Rich Text.
            const isMarkdown = await joplin.settings.globalValue('editor.codeView');
            logger.debug('Context menu filter: isMarkdown (Code View)=', isMarkdown);
            if (!isMarkdown) return menu;
            const exists = menu.items.some((i) => i.commandName === COMMANDS.PASTE_AS_MARKDOWN);
            if (!exists) {
                menu.items.push({
                    commandName: COMMANDS.PASTE_AS_MARKDOWN,
                    label: 'Paste HTML as Markdown',
                    accelerator: SHORTCUTS.PASTE_AS_MARKDOWN,
                });
            }
            return menu;
        });

        logger.info('Plugin started');
    },
});
