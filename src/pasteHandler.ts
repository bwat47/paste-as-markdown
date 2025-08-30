import joplin from 'api';
import { convertHtmlToMarkdown } from './markdownConverter';
import { showToast, hasMeaningfulHtml, validatePasteSettings } from './utils';
import { ToastType } from 'api/types';
import type { ConversionResult } from './types';
import { SETTINGS } from './constants';

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
        console.error('[paste-as-markdown] Failed to read text clipboard:', err);
        throw new Error('Unable to access clipboard text');
    }
}

async function insertMarkdownAtCursor(markdown: string): Promise<void> {
    // Try commands with args signature (CodeMirror)
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

    console.error('[paste-as-markdown] Failed to insert markdown', lastError);
    throw new Error('Unable to insert markdown into editor');
}

export async function handlePasteAsMarkdown(): Promise<ConversionResult> {
    // Get user setting
    const rawSettings = {
        includeImages: await joplin.settings.value(SETTINGS.INCLUDE_IMAGES),
    };
    const options = validatePasteSettings(rawSettings);

    // Read HTML (will be null if unavailable)

    const html = await readClipboardHtml();
    const hasHtml = html && hasMeaningfulHtml(html);

    if (!hasHtml) {
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
        const markdown = convertHtmlToMarkdown(html!, options.includeImages);
        await insertMarkdownAtCursor(markdown);

        const message = options.includeImages ? 'Pasted as Markdown' : 'Pasted as Markdown (images excluded)';
        await showToast(message, ToastType.Success);

        return { markdown, success: true };
    } catch (err) {
        console.error('[paste-as-markdown] Conversion failed, attempting plain text fallback', err);
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
