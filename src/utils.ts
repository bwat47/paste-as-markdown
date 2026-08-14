import joplin from 'api';
import { ToastType } from 'api/types';
import { TOAST_DURATION } from './constants';
import logger from './logger';

export async function showToast(message: string, type: ToastType = ToastType.Info, duration = TOAST_DURATION) {
    try {
        await joplin.views.dialogs.showToast({ message, type, duration });
    } catch (err) {
        logger.warn('Failed to show toast', err);
    }
}
