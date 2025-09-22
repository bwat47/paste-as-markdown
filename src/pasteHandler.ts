import joplin from 'api';
import { convertHtmlToMarkdown } from './markdownConverter';
import { HtmlProcessingError } from './html/processHtml';
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

async function detectGoogleDocsSource(html: string | null): Promise<boolean> {
    try {
        // Primary detection: Google Docs specific MIME type
        const formats = await joplin.clipboard.availableFormats();
        if (formats.includes('application/x-vnd.google-docs-document-slice-clip+wrapped')) {
            return true;
        }

        // Secondary detection: Check HTML content for Google Docs internal GUID pattern
        if (html && /docs-internal-guid-/.test(html)) {
            return true;
        }

        return false;
    } catch (err) {
        console.warn(LOG_PREFIX, 'Failed to detect clipboard source:', err);
        return false; // Safer default
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

// Update handlePasteAsMarkdown function:
export async function handlePasteAsMarkdown(): Promise<ConversionSuccess | ConversionFailure> {
    // Get user settings
    const rawSettings = {
        includeImages: await joplin.settings.value(SETTINGS.INCLUDE_IMAGES),
        convertImagesToResources: await joplin.settings.value(SETTINGS.CONVERT_IMAGES_TO_RESOURCES),
        normalizeQuotes: await joplin.settings.value(SETTINGS.NORMALIZE_QUOTES),
        forceTightLists: await joplin.settings.value(SETTINGS.FORCE_TIGHT_LISTS),
    };
    const validation = validatePasteSettings(rawSettings);
    if (!validation.isValid || !validation.value) {
        const msg = validation.error || 'Invalid settings';
        await showToast(msg, ToastType.Error);
        return { markdown: '', success: false, warnings: [msg] };
    }
    const options = validation.value;

    // Read HTML and detect source
    const html = await readClipboardHtml();
    const isGoogleDocs = await detectGoogleDocsSource(html);
    const shouldConvert = html && /</.test(html);

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
        // Pass detection result to conversion
        const { markdown, resources } = await convertHtmlToMarkdown(html!, {
            includeImages: options.includeImages,
            convertImagesToResources: options.convertImagesToResources,
            normalizeQuotes: options.normalizeQuotes,
            forceTightLists: options.forceTightLists,
            isGoogleDocs,
        });

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

        // Add Google Docs indicator to success message for debugging
        if (isGoogleDocs) {
            console.debug(LOG_PREFIX, 'Processed Google Docs content');
        }

        await showToast(message, ToastType.Success);
        return { markdown, success: true };
    } catch (err) {
        if (err instanceof HtmlProcessingError) {
            console.error(LOG_PREFIX, 'HTML processing prerequisites missing; aborting paste.', err);
            try {
                const text = await readClipboardText();
                if (text) {
                    await insertMarkdownAtCursor(text);
                    await showToast('Conversion failed; pasted plain text', ToastType.Error);
                    return {
                        markdown: text,
                        success: false,
                        warnings: [err.message],
                        plainTextFallback: true,
                    };
                }
            } catch (readErr) {
                console.error(LOG_PREFIX, 'Failed to read plain text after HTML processing error', readErr);
            }
            return {
                markdown: '',
                success: false,
                warnings: [err.message],
                plainTextFallback: false,
            };
        }

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
