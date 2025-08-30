import joplin from 'api';
import { ToastType } from 'api/types';
import { TOAST_DURATION } from './constants';

export async function showToast(message: string, type: ToastType = ToastType.Info, duration = TOAST_DURATION) {
    try {
        await joplin.views.dialogs.showToast({ message, type, duration });
    } catch (err) {
        console.warn('[paste-as-markdown] Failed to show toast:', err);
    }
}

export function hasMeaningfulHtml(html: string | null | undefined): boolean {
    if (!html) return false;
    const cleaned = html
        .replace(/<!DOCTYPE[\s\S]*?>/gi, '')
        .replace(/<meta[\s\S]*?>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
    // If after stripping we still have tags beyond a bare div/span/p wrapper, consider meaningful
    return /<([a-z0-9]+)(\s|>)/i.test(cleaned) && cleaned.length > 0;
}
