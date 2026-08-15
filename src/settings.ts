import joplin from 'api';
import { SettingItemType } from 'api/types';
import logger from './logger';
import type { PasteOptions } from './types';

export const SETTINGS = {
    INCLUDE_IMAGES: 'includeImages',
    CONVERT_IMAGES_TO_RESOURCES: 'convertImagesToResources',
    REMOVE_BADGES: 'removeBadges',
    NORMALIZE_QUOTES: 'normalizeQuotes',
    FORCE_TIGHT_LISTS: 'forceTightLists',
} as const;

type SettingKey = (typeof SETTINGS)[keyof typeof SETTINGS];

export const DEFAULT_PASTE_OPTIONS = {
    includeImages: true,
    convertImagesToResources: false,
    removeBadges: false,
    normalizeQuotes: true,
    forceTightLists: false,
} as const satisfies PasteOptions;

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
        [SETTINGS.REMOVE_BADGES]: {
            value: DEFAULT_PASTE_OPTIONS.removeBadges,
            type: SettingItemType.Bool,
            section: SETTINGS_SECTION,
            public: true,
            label: 'Remove badges',
            description: "Remove common status, donation, and sponsorship badge images (requires 'Include images').",
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
}

function resolveBooleanSetting(setting: SettingKey, value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (value !== undefined) {
        logger.warn('Invalid boolean setting; using default', { setting, value, defaultValue });
    }
    return defaultValue;
}

export async function loadPasteOptions(): Promise<PasteOptions> {
    return {
        includeImages: resolveBooleanSetting(
            SETTINGS.INCLUDE_IMAGES,
            await joplin.settings.value(SETTINGS.INCLUDE_IMAGES),
            DEFAULT_PASTE_OPTIONS.includeImages
        ),
        convertImagesToResources: resolveBooleanSetting(
            SETTINGS.CONVERT_IMAGES_TO_RESOURCES,
            await joplin.settings.value(SETTINGS.CONVERT_IMAGES_TO_RESOURCES),
            DEFAULT_PASTE_OPTIONS.convertImagesToResources
        ),
        removeBadges: resolveBooleanSetting(
            SETTINGS.REMOVE_BADGES,
            await joplin.settings.value(SETTINGS.REMOVE_BADGES),
            DEFAULT_PASTE_OPTIONS.removeBadges
        ),
        normalizeQuotes: resolveBooleanSetting(
            SETTINGS.NORMALIZE_QUOTES,
            await joplin.settings.value(SETTINGS.NORMALIZE_QUOTES),
            DEFAULT_PASTE_OPTIONS.normalizeQuotes
        ),
        forceTightLists: resolveBooleanSetting(
            SETTINGS.FORCE_TIGHT_LISTS,
            await joplin.settings.value(SETTINGS.FORCE_TIGHT_LISTS),
            DEFAULT_PASTE_OPTIONS.forceTightLists
        ),
    };
}
