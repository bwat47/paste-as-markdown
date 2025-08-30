import joplin from 'api';
import { ToastType } from 'api/types';
import { TOAST_DURATION } from './constants';
import type { PasteOptions } from './types';

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
        .replace(/<link[\s\S]*?>/gi, '') // Remove link tags too
        .replace(/\s+/g, ' ')
        .trim();

    // If it's just plain text with no tags, not meaningful HTML
    if (!/<[^>]+>/i.test(cleaned)) return false;

    // Check for meaningful content tags beyond just wrapper divs/spans/p
    const meaningfulTags = /<(?!\/?(div|span|p|html|body|head|meta|title)\b)[a-z0-9]+(\s|>|\/)/i;

    // Check for inline styling that indicates formatting
    const hasFormatting =
        /style\s*=\s*["'][^"']*(?:font-weight|font-style|text-decoration|color|background|border|margin|padding)[^"']*["']/i;

    // Check for semantic attributes that indicate structured content
    const hasSemanticAttrs =
        /(?:class|id)\s*=\s*["'][^"']*(?:bold|italic|highlight|heading|title|caption|code|quote)[^"']*["']/i;

    // Check for data URLs (embedded images)
    const hasDataUrl = /src\s*=\s*["']data:[^"']+["']/i;

    return (
        meaningfulTags.test(cleaned) || hasFormatting.test(html) || hasSemanticAttrs.test(html) || hasDataUrl.test(html)
    );
}

export function validatePasteSettings(settings: unknown): PasteOptions {
    const s = (settings || {}) as Partial<PasteOptions>;
    return {
        includeImages: typeof s.includeImages === 'boolean' ? s.includeImages : true,
    };
}
