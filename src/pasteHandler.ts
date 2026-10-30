import joplin from 'api';
import { convertHtmlToMarkdown } from './pasteConversion';
import { HtmlProcessingError } from './html/processHtml';
import { showToast } from './utils';
import { ToastType } from 'api/types';
import type {
    ClipboardSource,
    ConversionSuccess,
    ConversionFailure,
    PassContext,
    PasteOptions,
    PasteOptionsPrompt,
    PasteResult,
    ResourceConversionMeta,
} from './types';
import { DEFAULT_PASS_CONTEXT } from './html/passContext';
import { loadPasteSettings } from './settings';
import logger from './logger';
import { getErrorMessage } from './errors';
import { insertMarkdownAtCursor } from './editor/editorIntegration';

async function readClipboardHtml(): Promise<string | null> {
    try {
        return await joplin.clipboard.readHtml();
    } catch {
        return null; // Some platforms may throw if no HTML
    }
}

async function detectClipboardSource(html: string | null): Promise<ClipboardSource> {
    let formats: string[] | null = null;
    try {
        // Primary detection: Google Docs specific MIME type
        formats = await joplin.clipboard.availableFormats();
    } catch (err) {
        logger.warn('Failed to detect clipboard source', err);
    }

    if (formats && formats.includes('application/x-vnd.google-docs-document-slice-clip+wrapped')) {
        return 'google-docs';
    }

    // Secondary detection: Check HTML content for Google Docs internal GUID pattern
    if (html && /docs-internal-guid-/.test(html)) {
        return 'google-docs';
    }

    return DEFAULT_PASS_CONTEXT.source;
}

async function readClipboardText(): Promise<string> {
    try {
        return await joplin.clipboard.readText();
    } catch (err) {
        logger.error('Failed to read text clipboard', err);
        const error = Object.assign(new Error('Unable to access clipboard text'), { cause: err });
        throw error;
    }
}

/**
 * Attempts to insert the captured plain text and notify the user.
 * Returns a ConversionFailure result on success (successful fallback is still a conversion failure).
 * Returns null if captured plain text is unavailable or cannot be inserted.
 */
async function attemptPlainTextFallback(text: string, errorMessage: string): Promise<ConversionFailure | null> {
    try {
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
        logger.error('Failed to insert captured plain text during fallback', err);
        return null;
    }
}

/**
 * Runs the plain text fallback and, if that also fails, reports the failure to the user.
 * Always resolves to a ConversionFailure describing what happened.
 */
async function fallbackOrFailure(
    text: string,
    errorMessage: string,
    failureToast: string,
    fallbackWarning: string
): Promise<ConversionFailure> {
    const fallbackResult = await attemptPlainTextFallback(text, errorMessage);
    if (fallbackResult) {
        return fallbackResult;
    }
    // Both the primary path and the plain text fallback failed
    await showToast(failureToast, ToastType.Error);
    return {
        markdown: '',
        success: false,
        warnings: [errorMessage, fallbackWarning],
        plainTextFallback: false,
    };
}

/** Pastes clipboard plain text when no HTML flavour is available. */
async function pastePlainTextOnly(): Promise<ConversionSuccess | ConversionFailure> {
    const text = await readClipboardText();
    if (!text) {
        await showToast('Clipboard is empty', ToastType.Info);
        return { markdown: '', success: false, plainTextFallback: false, warnings: ['Clipboard empty'] };
    }
    await insertMarkdownAtCursor(text);
    await showToast('Pasted plain text (no HTML found)', ToastType.Info);
    return { markdown: text, success: true, plainTextFallback: true };
}

const pluralSuffix = (count: number): string => (count === 1 ? '' : 's');

/** Builds the success toast text, including image resource counts when relevant. */
function buildSuccessMessage(options: PasteOptions, resources: ResourceConversionMeta): string {
    if (!options.includeImages) {
        return 'Pasted as Markdown (images excluded)';
    }
    const base = 'Pasted as Markdown';
    if (!options.convertImagesToResources) {
        return base;
    }
    const { resourcesCreated: created, attempted, failed } = resources;
    if (failed > 0 && attempted > 0) {
        return `${base} (converted ${created} of ${attempted} image${pluralSuffix(attempted)})`;
    }
    if (created > 0 && attempted > 0) {
        return `${base} (${created} image resource${pluralSuffix(created)} created)`;
    }
    return base;
}

/** Maps a conversion error to a user-facing result, attempting a plain text fallback first. */
async function handleConversionFailure(err: unknown, fallbackText: string): Promise<ConversionFailure> {
    if (err instanceof HtmlProcessingError) {
        // Technical error details logged for debugging, user sees only actionable result
        logger.error('HTML processing failed, attempting plain text fallback', err);
        return fallbackOrFailure(
            fallbackText,
            err.message,
            'Paste failed: unable to process HTML or read plain text',
            'Plain text fallback failed'
        );
    }

    logger.error('Conversion failed, attempting plain text fallback', err);
    const errorMessage = getErrorMessage(err) || 'HTML conversion failed';
    return fallbackOrFailure(
        fallbackText,
        errorMessage,
        'Paste failed: no HTML or plain text available',
        'No plain text available'
    );
}

/** Loads the saved paste options and, when the user enabled it, lets them adjust those options for this paste. */
async function resolvePasteOptions(promptForOptions: PasteOptionsPrompt): Promise<PasteOptions | null> {
    const { options, showPasteOptionsDialog } = await loadPasteSettings();
    return showPasteOptionsDialog ? promptForOptions(options) : options;
}

/**
 * Reads clipboard HTML or plain text, converts to Markdown using user settings,
 * inserts result at cursor, and provides user feedback. Falls back to plain text if conversion fails.
 *
 * `promptForOptions` is only consulted when the clipboard holds HTML and the options dialog setting is enabled.
 */
export async function handlePasteAsMarkdown(promptForOptions: PasteOptionsPrompt): Promise<PasteResult> {
    const html = await readClipboardHtml();
    if (!html || !/</.test(html)) {
        return pastePlainTextOnly();
    }

    // Capture fallback text and source before the dialog opens. Never re-read the clipboard after it closes.
    // A missing text flavour must not prevent a successful HTML paste.
    const fallbackText = await readClipboardText().catch(() => '');
    const source = await detectClipboardSource(html);
    const passContext: PassContext = { source };

    const options = await resolvePasteOptions(promptForOptions);
    if (!options) {
        logger.debug('Paste cancelled from the paste options dialog');
        return { cancelled: true };
    }

    try {
        const { markdown, resources } = await convertHtmlToMarkdown(html, options, passContext);

        // Add Google Docs indicator to success message for debugging
        if (source === 'google-docs') {
            logger.debug('Processed Google Docs content');
        }

        // Separate try-catch for editor insertion to distinguish from conversion errors
        try {
            await insertMarkdownAtCursor(markdown);
        } catch (insertErr) {
            // Conversion succeeded but insertion failed - try plain text fallback
            logger.error('Failed to insert converted markdown, attempting plain text fallback', insertErr);
            const errorMessage = getErrorMessage(insertErr) || 'Editor insertion failed';
            return fallbackOrFailure(
                fallbackText,
                errorMessage,
                'Paste failed: unable to insert content into editor',
                'Plain text fallback also failed'
            );
        }

        await showToast(buildSuccessMessage(options, resources), ToastType.Success);
        return { markdown, success: true, plainTextFallback: false };
    } catch (err) {
        return handleConversionFailure(err, fallbackText);
    }
}
