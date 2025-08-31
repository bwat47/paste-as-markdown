import joplin from 'api';
import { ToastType } from 'api/types';
import { TOAST_DURATION } from './constants';
import type { PasteOptions } from './types';

// Precompiled regex constants (avoid recreation per call)
const RE_DOCTYPE = /<!DOCTYPE[\s\S]*?>/gi;
const RE_META = /<meta[\s\S]*?>/gi;
const RE_STYLE = /<style[\s\S]*?<\/style>/gi;
const RE_SCRIPT = /<script[\s\S]*?<\/script>/gi;
const RE_LINK = /<link[\s\S]*?>/gi;
// Meaningful tags: any tag that's not a trivial wrapper / structural boilerplate
const RE_MEANINGFUL_TAG = /<(?!\/?(div|span|p|html|body|head|meta|title|br)\b)[a-z0-9]+(?:\s|>|\/)/i;
// Inline formatting / style attributes indicating significance
const RE_FORMATTING_STYLE =
    /style\s*=\s*["'][^"']*(?:font-weight|font-style|text-decoration|color|background|border|margin|padding)[^"']*["']/i;
// Semantic classes / ids
const RE_SEMANTIC_ATTRS =
    /(?:class|id)\s*=\s*["'][^"']*(?:bold|italic|highlight|heading|title|caption|code|quote)[^"']*["']/i;
// Data URL image (usually meaningful content)
const RE_DATA_URL = /<img[^>]*src\s*=\s*["']data:[^"']+["'][^>]*>/i;
// Any HTML tag
const RE_ANY_TAG = /<[^>]+>/i;
// Extract images
const RE_IMG_TAG_GLOBAL = /<img[^>]*>/gi;
const RE_WIDTH = /width\s*=\s*"?(\d{1,4})/i;
const RE_HEIGHT = /height\s*=\s*"?(\d{1,4})/i;
// Minimum body length after cleaning to be considered meaningful when only trivial wrappers found
const MIN_MEANINGFUL_TEXT_LEN = 20;
// Tiny image threshold (e.g., tracking pixels, small icons)
const MIN_IMG_DIMENSION = 6; // px

export async function showToast(message: string, type: ToastType = ToastType.Info, duration = TOAST_DURATION) {
    try {
        await joplin.views.dialogs.showToast({ message, type, duration });
    } catch (err) {
        console.warn('[paste-as-markdown] Failed to show toast:', err);
    }
}

/**
 * Checks if an individual image is meaningful (not a tracking pixel or tiny icon)
 */
function isMeaningfulImage(imgHtml: string): boolean {
    const w = Number(RE_WIDTH.exec(imgHtml)?.[1] || '0');
    const h = Number(RE_HEIGHT.exec(imgHtml)?.[1] || '0');

    // If dimensions missing, assume meaningful
    if (w === 0 && h === 0) return true;

    // Filter out tracking pixels and tiny icons
    return w >= MIN_IMG_DIMENSION && h >= MIN_IMG_DIMENSION;
}

/**
 * Checks if HTML contains any meaningful images (not tracking pixels)
 */
function hasMeaningfulImages(html: string): boolean {
    const images = html.match(RE_IMG_TAG_GLOBAL);
    return images ? images.some(isMeaningfulImage) : false;
}

export function hasMeaningfulHtml(html: string | null | undefined): boolean {
    if (!html) return false;

    // Fast path: if we clearly have a non-trivial tag, we can short-circuit.
    if (RE_MEANINGFUL_TAG.test(html)) return true;

    // If no tags at all, it's plain text.
    if (!RE_ANY_TAG.test(html)) return false;

    // Clean boilerplate / non-content tags for structural checks.
    const cleaned = html
        .replace(RE_DOCTYPE, '')
        .replace(RE_META, '')
        .replace(RE_STYLE, '')
        .replace(RE_SCRIPT, '')
        .replace(RE_LINK, '')
        .replace(/\s+/g, ' ')
        .trim();

    if (!cleaned) return false;

    // Exclude a single trivial empty wrapper like <div><br></div> or <p>&nbsp;</p>
    const emptyWrapperMatch = cleaned.match(/^<(div|span|p)[^>]*>[\s\S]*<\/(div|span|p)>$/i);
    if (emptyWrapperMatch) {
        const inner = cleaned
            .replace(/^<(div|span|p)[^>]*>/i, '')
            .replace(/<\/(div|span|p)>$/i, '')
            .replace(/<br\s*\/?>/gi, '')
            .replace(/&nbsp;/gi, '')
            .trim();
        if (!inner) return false;
    }

    // Size guard: if very short and doesn't contain meaningful tags, treat as plain
    if (cleaned.length < MIN_MEANINGFUL_TEXT_LEN && !RE_MEANINGFUL_TAG.test(cleaned)) return false;

    // Formatting / semantic cues on original HTML
    if (RE_FORMATTING_STYLE.test(html) || RE_SEMANTIC_ATTRS.test(html)) return true;

    // Data URL image (likely pasted inline image)
    if (RE_DATA_URL.test(html)) return true;

    // Check for meaningful images (not tracking pixels)
    if (hasMeaningfulImages(html)) return true;

    // Final structural meaningful tag check on cleaned content.
    return RE_MEANINGFUL_TAG.test(cleaned);
}

export function validatePasteSettings(settings: unknown): PasteOptions {
    const s = (settings || {}) as Partial<PasteOptions>;
    return {
        includeImages: typeof s.includeImages === 'boolean' ? s.includeImages : true,
    };
}
