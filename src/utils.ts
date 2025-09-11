import joplin from 'api';
import { ToastType } from 'api/types';
import { TOAST_DURATION, LOG_PREFIX } from './constants';
import type { PasteOptions, ValidationResult, ValidatedSettings } from './types';

export async function showToast(message: string, type: ToastType = ToastType.Info, duration = TOAST_DURATION) {
    try {
        await joplin.views.dialogs.showToast({ message, type, duration });
    } catch (err) {
        console.warn(LOG_PREFIX, 'Failed to show toast:', err);
    }
}

export function validatePasteSettings(settings: unknown): ValidationResult<ValidatedSettings> {
    const s = (settings || {}) as Partial<PasteOptions>;
    const value: PasteOptions = {
        includeImages: typeof s.includeImages === 'boolean' ? s.includeImages : true,
        convertImagesToResources: typeof s.convertImagesToResources === 'boolean' ? s.convertImagesToResources : false,
        normalizeQuotes: typeof s.normalizeQuotes === 'boolean' ? s.normalizeQuotes : true,
    };
    return { isValid: true, value };
}
