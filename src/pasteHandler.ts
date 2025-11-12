import joplin from 'api';
import { convertHtmlToMarkdown } from './markdownConverter';
import { HtmlProcessingError } from './html/processHtml';
import { showToast, validatePasteSettings } from './utils';
import { ToastType } from 'api/types';
import type { ConversionSuccess, ConversionFailure } from './types';
import { SETTINGS } from './constants';
import logger from './logger';

async function readClipboardHtml(): Promise<string | null> {
    try {
        return await joplin.clipboard.readHtml();
    } catch {
        return null; // Some platforms may throw if no HTML
    }
}

async function detectGoogleDocsSource(html: string | null): Promise<boolean> {
    let formats: string[] | null = null;
    try {
        // Primary detection: Google Docs specific MIME type
        formats = await joplin.clipboard.availableFormats();
    } catch (err) {
        logger.warn('Failed to detect clipboard source', err);
    }

    if (formats && formats.includes('application/x-vnd.google-docs-document-slice-clip+wrapped')) {
        return true;
    }

    // Secondary detection: Check HTML content for Google Docs internal GUID pattern
    if (html && /docs-internal-guid-/.test(html)) {
        return true;
    }

    return false;
}

async function readClipboardText(): Promise<string> {
    try {
        return await joplin.clipboard.readText();
    } catch (err) {
        logger.error('Failed to read text clipboard', err);
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

    logger.error('Failed to insert markdown', lastError);
    throw new Error('Unable to insert markdown into editor');
}

/**
 * Attempts to read plain text from clipboard, insert it, and notify the user.
 * Returns a ConversionFailure result on success (successful fallback is still a conversion failure).
 * Returns null if plain text cannot be read or inserted.
 */
async function attemptPlainTextFallback(errorMessage: string): Promise<ConversionFailure | null> {
    try {
        const text = await readClipboardText();
        if (!text) {
            return null;
        }
        await insertMarkdownAtCursor(text);
        await showToast('Conversion failed; pasted plain text', ToastType.Error);
        return {
            markdown: text,
            success: false,
            warnings: [errorMessage],
            plainTextFallback: true,
        };
    } catch (err) {
        logger.error('Failed to read or insert plain text during fallback', err);
        return null;
    }
}

/**
 * Reads clipboard HTML or plain text, converts to Markdown using user settings,
 * inserts result at cursor, and provides user feedback. Falls back to plain text if conversion fails.
 */
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
        return { markdown: '', success: false, warnings: [msg], plainTextFallback: false };
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
        const { markdown, resources, degradedProcessing } = await convertHtmlToMarkdown(html!, {
            includeImages: options.includeImages,
            convertImagesToResources: options.convertImagesToResources,
            normalizeQuotes: options.normalizeQuotes,
            forceTightLists: options.forceTightLists,
            isGoogleDocs,
        });

        // Log degraded processing for debugging
        if (degradedProcessing) {
            logger.debug('HTML conversion used degraded string-based processing (no DOM available)');
        }

        // Add Google Docs indicator to success message for debugging
        if (isGoogleDocs) {
            logger.debug('Processed Google Docs content');
        }

        // Separate try-catch for editor insertion to distinguish from conversion errors
        try {
            await insertMarkdownAtCursor(markdown);
        } catch (insertErr) {
            // Conversion succeeded but insertion failed - try plain text fallback
            logger.error('Failed to insert converted markdown, attempting plain text fallback', insertErr);
            const fallbackResult = await attemptPlainTextFallback('Editor insertion failed');
            if (fallbackResult) {
                return fallbackResult;
            }
            // Both markdown insertion and plain text insertion failed
            await showToast('Paste failed: unable to insert content into editor', ToastType.Error);
            return {
                markdown: '',
                success: false,
                warnings: ['Editor insertion failed', 'Plain text fallback also failed'],
                plainTextFallback: true,
            };
        }

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
        return { markdown, success: true, plainTextFallback: false };
    } catch (err) {
        if (err instanceof HtmlProcessingError) {
            logger.error('HTML processing prerequisites missing; aborting paste', err);
            // Show the error message from the HtmlProcessingError
            await showToast(err.message, ToastType.Error);
            const fallbackResult = await attemptPlainTextFallback(err.message);
            if (fallbackResult) {
                return fallbackResult;
            }
            // Plain text fallback failed
            await showToast('Plain text fallback also failed', ToastType.Error);
            return {
                markdown: '',
                success: false,
                warnings: [err.message, 'Plain text fallback failed'],
                plainTextFallback: true,
            };
        }

        logger.error('Conversion failed, attempting plain text fallback', err);
        const fallbackResult = await attemptPlainTextFallback('HTML conversion failed');
        if (fallbackResult) {
            return fallbackResult;
        }

        // Both HTML conversion and plain text fallback failed
        await showToast('Paste failed: no HTML or plain text available', ToastType.Error);
        return {
            markdown: '',
            success: false,
            warnings: ['HTML conversion failed', 'No plain text available'],
            plainTextFallback: true,
        };
    }
}
