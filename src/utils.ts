import joplin from 'api';
import { ToastType } from 'api/types';
import { TOAST_DURATION, LOG_PREFIX } from './constants';
import type { PasteOptions } from './types';

export async function showToast(message: string, type: ToastType = ToastType.Info, duration = TOAST_DURATION) {
    try {
        await joplin.views.dialogs.showToast({ message, type, duration });
    } catch (err) {
        console.warn(LOG_PREFIX, 'Failed to show toast:', err);
    }
}

export function validatePasteSettings(settings: unknown): PasteOptions {
    const s = (settings || {}) as Partial<PasteOptions>;
    return {
        includeImages: typeof s.includeImages === 'boolean' ? s.includeImages : true,
        convertImagesToResources: typeof s.convertImagesToResources === 'boolean' ? s.convertImagesToResources : false,
    };
}
