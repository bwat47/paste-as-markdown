import joplin from 'api';
import { convertHtmlToMarkdown } from './markdownConverter';
import { showToast, validatePasteSettings } from './utils';
import { ToastType } from 'api/types';
import type { ConversionSuccess, ConversionFailure } from './types';
import { SETTINGS, LOG_PREFIX } from './constants';

async function readClipboardHtml(): Promise<string | null> {
    try {
        return await joplin.clipboard.readHtml();
    } catch {
        return null; // Some platforms may throw if no HTML
    }
}

async function readClipboardText(): Promise<string> {
    try {
        return await joplin.clipboard.readText();
    } catch (err) {
        console.error(LOG_PREFIX, 'Failed to read text clipboard:', err);
        throw new Error('Unable to access clipboard text');
    }
}

async function insertMarkdownAtCursor(markdown: string): Promise<void> {
    // First, try 'insertText'. If that fails, fall back to 'replaceSelection'.
    // This provides compatibility with different editor implementations in Joplin.
    const attempts = [
        { name: 'insertText', args: [markdown] },
        { name: 'replaceSelection', args: [markdown] },
    ];
    let lastError: unknown;
    for (const cmd of attempts) {
        try {
            await joplin.commands.execute('editor.execCommand', cmd);
            return;
        } catch (err) {
            lastError = err;
        }
    }

    console.error(LOG_PREFIX, 'Failed to insert markdown', lastError);
    throw new Error('Unable to insert markdown into editor');
}

export async function handlePasteAsMarkdown(): Promise<ConversionSuccess | ConversionFailure> {
    // Get user setting
    const rawSettings = {
        includeImages: await joplin.settings.value(SETTINGS.INCLUDE_IMAGES),
        convertImagesToResources: await joplin.settings.value(SETTINGS.CONVERT_IMAGES_TO_RESOURCES),
        normalizeQuotes: await joplin.settings.value(SETTINGS.NORMALIZE_QUOTES),
    };
    const validation = validatePasteSettings(rawSettings);
    const options = validation.value!; // validation currently always returns isValid=true

    // Read HTML (will be null if unavailable)

    const html = await readClipboardHtml();
    const shouldConvert = html && /</.test(html); // basic presence of tag marker

    if (!shouldConvert) {
        // Fallback to plain text
        const text = await readClipboardText();
        if (!text) {
            await showToast('Clipboard is empty', ToastType.Info);
            return { markdown: '', success: false, plainTextFallback: true, warnings: ['Clipboard empty'] };
        }
        await insertMarkdownAtCursor(text);
        await showToast('Pasted plain text (no HTML found)', ToastType.Info);
        return { markdown: text, success: true, plainTextFallback: true };
    }

    try {
        const { markdown, resources } = await convertHtmlToMarkdown(
            html!,
            options.includeImages,
            options.convertImagesToResources,
            options.normalizeQuotes
        );
        await insertMarkdownAtCursor(markdown);

        let message = options.includeImages ? 'Pasted as Markdown' : 'Pasted as Markdown (images excluded)';
        if (options.includeImages && options.convertImagesToResources) {
            const created = resources.resourcesCreated;
            const attempted = resources.attempted ?? created;
            const failed = resources.failed ?? 0;
            if (attempted > 0) {
                if (failed > 0) {
                    message += ` (converted ${created} of ${attempted} image${attempted === 1 ? '' : 's'})`;
                } else if (created > 0) {
                    message += ` (${created} image resource${created === 1 ? '' : 's'} created)`;
                }
            }
        }
        await showToast(message, ToastType.Success);

        return { markdown, success: true };
    } catch (err) {
        console.error(LOG_PREFIX, 'Conversion failed, attempting plain text fallback', err);
        const text = await readClipboardText();
        if (text) {
            await insertMarkdownAtCursor(text);
            await showToast('Conversion failed; pasted plain text', ToastType.Error);
            return {
                markdown: text,
                success: false,
                warnings: ['HTML conversion failed'],
                plainTextFallback: true,
            };
        }
        throw new Error('Failed to convert HTML and no plain text available');
    }
}
