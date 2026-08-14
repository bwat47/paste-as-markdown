import joplin from 'api';
import { convertHtmlToMarkdown } from './markdownConverter';
import { HtmlProcessingError } from './html/processHtml';
import { showToast } from './utils';
import { ToastType } from 'api/types';
import type {
    ClipboardSource,
    ConversionSuccess,
    ConversionFailure,
    PassContext,
    PasteOptions,
    ResourceConversionMeta,
} from './types';
import { DEFAULT_PASTE_OPTIONS, SETTINGS } from './constants';
import type { SettingKey } from './constants';
import logger from './logger';

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

    return 'generic';
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

async function insertMarkdownAtCursor(markdown: string): Promise<void> {
    // First, try 'insertText'. If that fails, fall back to 'replaceSelection'.
    // This provides compatibility with different editor implementations in Joplin.
    // Use Joplin's high-level commands directly rather than editor.execCommand to ensure
    // compatibility with both CodeMirror 5 (legacy) and CodeMirror 6 editors.
    const attempts = ['insertText', 'replaceSelection'];
    let lastError: unknown;
    for (const cmd of attempts) {
        try {
            await joplin.commands.execute(cmd, markdown);
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
 * Runs the plain text fallback and, if that also fails, reports the failure to the user.
 * Always resolves to a ConversionFailure describing what happened.
 */
async function fallbackOrFailure(
    errorMessage: string,
    failureToast: string,
    fallbackWarning: string
): Promise<ConversionFailure> {
    const fallbackResult = await attemptPlainTextFallback(errorMessage);
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

function resolveBooleanSetting(setting: SettingKey, value: unknown, defaultValue: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (value !== undefined) {
        logger.warn('Invalid boolean setting; using default', { setting, value, defaultValue });
    }
    return defaultValue;
}

async function loadPasteOptions(): Promise<PasteOptions> {
    return {
        includeImages: resolveBooleanSetting(
            SETTINGS.INCLUDE_IMAGES,
            await joplin.settings.value(SETTINGS.INCLUDE_IMAGES),
            DEFAULT_PASTE_OPTIONS.includeImages
        ),
        convertImagesToResources: resolveBooleanSetting(
            SETTINGS.CONVERT_IMAGES_TO_RESOURCES,
            await joplin.settings.value(SETTINGS.CONVERT_IMAGES_TO_RESOURCES),
            DEFAULT_PASTE_OPTIONS.convertImagesToResources
        ),
        normalizeQuotes: resolveBooleanSetting(
            SETTINGS.NORMALIZE_QUOTES,
            await joplin.settings.value(SETTINGS.NORMALIZE_QUOTES),
            DEFAULT_PASTE_OPTIONS.normalizeQuotes
        ),
        forceTightLists: resolveBooleanSetting(
            SETTINGS.FORCE_TIGHT_LISTS,
            await joplin.settings.value(SETTINGS.FORCE_TIGHT_LISTS),
            DEFAULT_PASTE_OPTIONS.forceTightLists
        ),
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
    const created = resources.resourcesCreated;
    const attempted = resources.attempted ?? created;
    const failed = resources.failed ?? 0;
    if (failed > 0 && attempted > 0) {
        return `${base} (converted ${created} of ${attempted} image${pluralSuffix(attempted)})`;
    }
    if (created > 0 && attempted > 0) {
        return `${base} (${created} image resource${pluralSuffix(created)} created)`;
    }
    return base;
}

/** Maps a conversion error to a user-facing result, attempting a plain text fallback first. */
async function handleConversionFailure(err: unknown): Promise<ConversionFailure> {
    if (err instanceof HtmlProcessingError) {
        // Technical error details logged for debugging, user sees only actionable result
        logger.error('HTML processing failed, attempting plain text fallback', err);
        return fallbackOrFailure(
            err.message,
            'Paste failed: unable to process HTML or read plain text',
            'Plain text fallback failed'
        );
    }

    logger.error('Conversion failed, attempting plain text fallback', err);
    const errorMessage = (err as Error)?.message || 'HTML conversion failed';
    return fallbackOrFailure(errorMessage, 'Paste failed: no HTML or plain text available', 'No plain text available');
}

/**
 * Reads clipboard HTML or plain text, converts to Markdown using user settings,
 * inserts result at cursor, and provides user feedback. Falls back to plain text if conversion fails.
 */
export async function handlePasteAsMarkdown(): Promise<ConversionSuccess | ConversionFailure> {
    const options = await loadPasteOptions();

    // Read HTML and detect source
    const html = await readClipboardHtml();
    const source = await detectClipboardSource(html);
    const passContext: PassContext = { source };

    if (!html || !/</.test(html)) {
        return pastePlainTextOnly();
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
            const errorMessage = (insertErr as Error)?.message || 'Editor insertion failed';
            return fallbackOrFailure(
                errorMessage,
                'Paste failed: unable to insert content into editor',
                'Plain text fallback also failed'
            );
        }

        await showToast(buildSuccessMessage(options, resources), ToastType.Success);
        return { markdown, success: true, plainTextFallback: false };
    } catch (err) {
        return handleConversionFailure(err);
    }
}
