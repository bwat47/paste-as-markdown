import joplin from 'api';
import { SettingItemType } from 'api/types';
import logger from './logger';
import { LIST_INDENTATION, type ListIndentation, type PasteOptions } from './types';

export const SETTINGS = {
    INCLUDE_IMAGES: 'includeImages',
    CONVERT_IMAGES_TO_RESOURCES: 'convertImagesToResources',
    NORMALIZE_QUOTES: 'normalizeQuotes',
    FORCE_TIGHT_LISTS: 'forceTightLists',
    LIST_INDENTATION: 'listIndentation',
    SHOW_PASTE_OPTIONS_DIALOG: 'showPasteOptionsDialog',
} as const;

type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS];

export const DEFAULT_PASTE_OPTIONS = {
    includeImages: true,
    convertImagesToResources: false,
    normalizeQuotes: true,
    forceTightLists: false,
    listIndentation: LIST_INDENTATION.TABS,
} as const satisfies PasteOptions;

const DEFAULT_SHOW_PASTE_OPTIONS_DIALOG = false;

/** Labels shared by the settings screen and the per-paste options dialog. */
export const PASTE_OPTION_LABELS = {
    includeImages: 'Include images',
    convertImagesToResources: 'Convert images to Joplin resources',
    normalizeQuotes: 'Normalize smart quotes',
    forceTightLists: 'Force tight lists',
    listIndentation: 'List indentation',
} as const satisfies Record<keyof PasteOptions, string>;

export const LIST_INDENTATION_LABELS = {
    [LIST_INDENTATION.SPACES]: 'Spaces',
    [LIST_INDENTATION.TABS]: 'Tabs',
} as const satisfies Record<ListIndentation, string>;

/** Everything the paste handler reads from settings on each paste. */
export interface PasteSettings {
    options: PasteOptions;
    showPasteOptionsDialog: boolean;
}

const SETTINGS_SECTION = 'pasteAsMarkdown';

export async function registerPluginSettings(): Promise<void> {
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
            label: PASTE_OPTION_LABELS.includeImages,
            description:
                'If enabled, images will be included in the pasted markdown. If disabled, images will be removed entirely.',
        },
        [SETTINGS.CONVERT_IMAGES_TO_RESOURCES]: {
            value: DEFAULT_PASTE_OPTIONS.convertImagesToResources,
            type: SettingItemType.Bool,
            section: SETTINGS_SECTION,
            public: true,
            label: PASTE_OPTION_LABELS.convertImagesToResources,
            description:
                "If enabled, http(s) and base64 images are stored as Joplin resources (requires 'Include images').",
        },
        [SETTINGS.NORMALIZE_QUOTES]: {
            value: DEFAULT_PASTE_OPTIONS.normalizeQuotes,
            type: SettingItemType.Bool,
            section: SETTINGS_SECTION,
            public: true,
            label: PASTE_OPTION_LABELS.normalizeQuotes,
            description: 'Convert Word/Office smart quotes to regular quotes for better markdown compatibility.',
        },
        [SETTINGS.FORCE_TIGHT_LISTS]: {
            value: DEFAULT_PASTE_OPTIONS.forceTightLists,
            type: SettingItemType.Bool,
            section: SETTINGS_SECTION,
            public: true,
            label: PASTE_OPTION_LABELS.forceTightLists,
            description:
                'Prevent blank lines between list items in output Markdown, except for list items with multi-block content.',
        },
        [SETTINGS.LIST_INDENTATION]: {
            value: DEFAULT_PASTE_OPTIONS.listIndentation,
            type: SettingItemType.String,
            section: SETTINGS_SECTION,
            public: true,
            label: PASTE_OPTION_LABELS.listIndentation,
            description: 'Choose whether nested list items and continuation lines are indented with spaces or tabs.',
            isEnum: true,
            options: LIST_INDENTATION_LABELS,
        },
        [SETTINGS.SHOW_PASTE_OPTIONS_DIALOG]: {
            value: DEFAULT_SHOW_PASTE_OPTIONS_DIALOG,
            type: SettingItemType.Bool,
            section: SETTINGS_SECTION,
            public: true,
            label: 'Show paste options dialog',
            description:
                'If enabled, Paste HTML as Markdown first shows a dialog for adjusting the options above for that paste only. The dialog starts from these settings.',
        },
    });
}

function resolveBooleanSetting(setting: SettingKey, value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (value !== undefined) {
        logger.warn('Invalid boolean setting; using default', { setting, value, defaultValue });
    }
    return defaultValue;
}

function resolveListIndentationSetting(
    setting: SettingKey,
    value: unknown,
    defaultValue: ListIndentation
): ListIndentation {
    if (value === LIST_INDENTATION.SPACES || value === LIST_INDENTATION.TABS) return value;
    if (value !== undefined) {
        logger.warn('Invalid list indentation setting; using default', { setting, value, defaultValue });
    }
    return defaultValue;
}

export async function loadPasteSettings(): Promise<PasteSettings> {
    // One `values()` round-trip is much faster than a `value()` call per setting, and this runs on every paste.
    const values: Record<string, unknown> = await joplin.settings.values(Object.values(SETTINGS));
    const options: PasteOptions = {
        includeImages: resolveBooleanSetting(
            SETTINGS.INCLUDE_IMAGES,
            values[SETTINGS.INCLUDE_IMAGES],
            DEFAULT_PASTE_OPTIONS.includeImages
        ),
        convertImagesToResources: resolveBooleanSetting(
            SETTINGS.CONVERT_IMAGES_TO_RESOURCES,
            values[SETTINGS.CONVERT_IMAGES_TO_RESOURCES],
            DEFAULT_PASTE_OPTIONS.convertImagesToResources
        ),
        normalizeQuotes: resolveBooleanSetting(
            SETTINGS.NORMALIZE_QUOTES,
            values[SETTINGS.NORMALIZE_QUOTES],
            DEFAULT_PASTE_OPTIONS.normalizeQuotes
        ),
        forceTightLists: resolveBooleanSetting(
            SETTINGS.FORCE_TIGHT_LISTS,
            values[SETTINGS.FORCE_TIGHT_LISTS],
            DEFAULT_PASTE_OPTIONS.forceTightLists
        ),
        listIndentation: resolveListIndentationSetting(
            SETTINGS.LIST_INDENTATION,
            values[SETTINGS.LIST_INDENTATION],
            DEFAULT_PASTE_OPTIONS.listIndentation
        ),
    };
    return {
        options,
        showPasteOptionsDialog: resolveBooleanSetting(
            SETTINGS.SHOW_PASTE_OPTIONS_DIALOG,
            values[SETTINGS.SHOW_PASTE_OPTIONS_DIALOG],
            DEFAULT_SHOW_PASTE_OPTIONS_DIALOG
        ),
    };
}
