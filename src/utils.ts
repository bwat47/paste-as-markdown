import joplin from 'api';
import { ToastType } from 'api/types';
import logger from './logger';

const TOAST_DURATION = 4000;

export async function showToast(
    message: string,
    type: ToastType = ToastType.Info,
    duration = TOAST_DURATION
): Promise<void> {
    try {
        await joplin.views.dialogs.showToast({ message, type, duration });
    } catch (err) {
        logger.warn('Failed to show toast', err);
    }
}
