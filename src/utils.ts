import joplin from 'api';
import { ToastType } from 'api/types';
import { TOAST_DURATION, LOG_PREFIX } from './constants';
import type { PasteOptions, ValidationResult, ValidatedSettings, SettingsInput } from './types';

export async function showToast(message: string, type: ToastType = ToastType.Info, duration = TOAST_DURATION) {
    try {
        await joplin.views.dialogs.showToast({ message, type, duration });
    } catch (err) {
        console.warn(LOG_PREFIX, 'Failed to show toast:', err);
    }
}

export function validatePasteSettings(settings: unknown): ValidationResult<ValidatedSettings> {
    if (settings === null || typeof settings !== 'object') {
        return { isValid: false, error: 'Settings must be an object' };
    }
    const s = settings as SettingsInput;
    const invalid: string[] = [];

    const includeImages =
        typeof s.includeImages === 'boolean'
            ? s.includeImages
            : s.includeImages === undefined
              ? true
              : (invalid.push('includeImages'), true);
    const convertImagesToResources =
        typeof s.convertImagesToResources === 'boolean'
            ? s.convertImagesToResources
            : s.convertImagesToResources === undefined
              ? false
              : (invalid.push('convertImagesToResources'), false);
    const normalizeQuotes =
        typeof s.normalizeQuotes === 'boolean'
            ? s.normalizeQuotes
            : s.normalizeQuotes === undefined
              ? true
              : (invalid.push('normalizeQuotes'), true);

    const forceTightLists =
        typeof s.forceTightLists === 'boolean'
            ? s.forceTightLists
            : s.forceTightLists === undefined
              ? false
              : (invalid.push('forceTightLists'), false);

    const value: PasteOptions = { includeImages, convertImagesToResources, normalizeQuotes, forceTightLists };
    if (invalid.length) {
        return {
            isValid: false,
            error: `Invalid setting(s): ${invalid.join(', ')} must be boolean`,
            value,
        };
    }
    return { isValid: true, value };
}
