import joplin from 'api';
import { ToastType } from 'api/types';
import { TOAST_DURATION } from './constants';
import type { PasteOptions, ValidationResult, ValidatedSettings, SettingsInput } from './types';
import logger from './logger';

export async function showToast(message: string, type: ToastType = ToastType.Info, duration = TOAST_DURATION) {
    try {
        await joplin.views.dialogs.showToast({ message, type, duration });
    } catch (err) {
        logger.warn('Failed to show toast', err);
    }
}

function validateBoolean(value: unknown, key: string, defaultValue: boolean, errors: string[]): boolean {
    if (typeof value === 'boolean') return value;
    if (value === undefined) return defaultValue;
    errors.push(key);
    return defaultValue;
}

export function validatePasteSettings(settings: unknown): ValidationResult<ValidatedSettings> {
    if (settings === null || typeof settings !== 'object') {
        return { isValid: false, error: 'Settings must be an object' };
    }
    const s = settings as SettingsInput;
    const invalid: string[] = [];

    const includeImages = validateBoolean(s.includeImages, 'includeImages', true, invalid);
    const convertImagesToResources = validateBoolean(
        s.convertImagesToResources,
        'convertImagesToResources',
        false,
        invalid
    );
    const normalizeQuotes = validateBoolean(s.normalizeQuotes, 'normalizeQuotes', true, invalid);
    const forceTightLists = validateBoolean(s.forceTightLists, 'forceTightLists', false, invalid);

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
