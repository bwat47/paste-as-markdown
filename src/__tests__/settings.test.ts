import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Mock } from 'vitest';
import { SettingItemType } from 'api/types';
import { DEFAULT_PASTE_OPTIONS, loadPasteOptions, registerPluginSettings, SETTINGS } from '../settings';
import logger from '../logger';

vi.mock('api');

describe('settings', () => {
    let registerSection: Mock;
    let registerSettings: Mock;
    let value: Mock<(setting: string) => Promise<unknown>>;

    beforeEach(async () => {
        vi.clearAllMocks();
        registerSection = vi.fn<() => Promise<void>>().mockResolvedValue();
        registerSettings = vi.fn<() => Promise<void>>().mockResolvedValue();
        value = vi.fn<(setting: string) => Promise<unknown>>();

        const joplinModule = await import('api');
        (joplinModule.default as unknown) = {
            settings: { registerSection, registerSettings, value },
        };
    });

    test('registers the settings section and all paste options', async () => {
        await registerPluginSettings();

        expect(registerSection).toHaveBeenCalledWith('pasteAsMarkdown', {
            label: 'Paste HTML as Markdown',
            iconName: 'fas fa-paste',
        });
        expect(registerSettings).toHaveBeenCalledOnce();

        const registered = registerSettings.mock.calls[0][0];
        expect(Object.keys(registered)).toEqual(Object.values(SETTINGS));
        expect(registered).toMatchObject({
            [SETTINGS.INCLUDE_IMAGES]: {
                value: DEFAULT_PASTE_OPTIONS.includeImages,
                type: SettingItemType.Bool,
                section: 'pasteAsMarkdown',
            },
            [SETTINGS.CONVERT_IMAGES_TO_RESOURCES]: {
                value: DEFAULT_PASTE_OPTIONS.convertImagesToResources,
                type: SettingItemType.Bool,
                section: 'pasteAsMarkdown',
            },
            [SETTINGS.REMOVE_BADGES]: {
                value: DEFAULT_PASTE_OPTIONS.removeBadges,
                type: SettingItemType.Bool,
                section: 'pasteAsMarkdown',
            },
            [SETTINGS.NORMALIZE_QUOTES]: {
                value: DEFAULT_PASTE_OPTIONS.normalizeQuotes,
                type: SettingItemType.Bool,
                section: 'pasteAsMarkdown',
            },
            [SETTINGS.FORCE_TIGHT_LISTS]: {
                value: DEFAULT_PASTE_OPTIONS.forceTightLists,
                type: SettingItemType.Bool,
                section: 'pasteAsMarkdown',
            },
        });
    });

    test('loads boolean setting values into complete paste options', async () => {
        value.mockImplementation((setting: string) =>
            Promise.resolve(
                {
                    [SETTINGS.INCLUDE_IMAGES]: false,
                    [SETTINGS.CONVERT_IMAGES_TO_RESOURCES]: true,
                    [SETTINGS.REMOVE_BADGES]: true,
                    [SETTINGS.NORMALIZE_QUOTES]: false,
                    [SETTINGS.FORCE_TIGHT_LISTS]: true,
                }[setting]
            )
        );

        await expect(loadPasteOptions()).resolves.toEqual({
            includeImages: false,
            convertImagesToResources: true,
            removeBadges: true,
            normalizeQuotes: false,
            forceTightLists: true,
        });
    });

    test('uses defaults for missing or malformed values and logs malformed values', async () => {
        const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
        value.mockImplementation((setting: string) => {
            if (setting === SETTINGS.INCLUDE_IMAGES) return Promise.resolve('false');
            if (setting === SETTINGS.NORMALIZE_QUOTES) return Promise.resolve(null);
            return Promise.resolve(undefined);
        });

        await expect(loadPasteOptions()).resolves.toEqual(DEFAULT_PASTE_OPTIONS);
        expect(warnSpy).toHaveBeenNthCalledWith(1, 'Invalid boolean setting; using default', {
            setting: SETTINGS.INCLUDE_IMAGES,
            value: 'false',
            defaultValue: true,
        });
        expect(warnSpy).toHaveBeenNthCalledWith(2, 'Invalid boolean setting; using default', {
            setting: SETTINGS.NORMALIZE_QUOTES,
            value: null,
            defaultValue: true,
        });
        expect(warnSpy).toHaveBeenCalledTimes(2);

        warnSpy.mockRestore();
    });
});
