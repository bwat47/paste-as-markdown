import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { handlePasteAsMarkdown } from '../pasteHandler';
import { convertHtmlToMarkdown } from '../markdownConverter';
import { HtmlProcessingError } from '../html/processHtml';
import { showToast, validatePasteSettings } from '../utils';
import { ToastType } from 'api/types';
import { SETTINGS } from '../constants';

// Mock dependencies
jest.mock('api');
jest.mock('../markdownConverter');
jest.mock('../utils');

describe('pasteHandler', () => {
    let mockJoplin: {
        clipboard: {
            readHtml: jest.Mock<() => Promise<string | null>>;
            readText: jest.Mock<() => Promise<string>>;
        };
        settings: {
            value: jest.Mock<(setting: string) => Promise<unknown>>;
        };
        commands: {
            execute: jest.Mock<(command: string, args: unknown) => Promise<void>>;
        };
    };

    let mockConvertHtmlToMarkdown: jest.MockedFunction<typeof convertHtmlToMarkdown>;
    let mockShowToast: jest.MockedFunction<typeof showToast>;
    let mockValidatePasteSettings: jest.MockedFunction<typeof validatePasteSettings>;

    beforeEach(async () => {
        jest.clearAllMocks();

        // Mock joplin API
        const joplinModule = await import('api');
        mockJoplin = {
            clipboard: {
                readHtml: jest.fn<() => Promise<string | null>>(),
                readText: jest.fn<() => Promise<string>>(),
            },
            settings: {
                value: jest.fn<(setting: string) => Promise<unknown>>(),
            },
            commands: {
                execute: jest.fn<(command: string, args: unknown) => Promise<void>>(),
            },
        };
        (joplinModule.default as unknown) = mockJoplin;

        // Mock other dependencies
        mockConvertHtmlToMarkdown = convertHtmlToMarkdown as jest.MockedFunction<typeof convertHtmlToMarkdown>;
        mockShowToast = showToast as jest.MockedFunction<typeof showToast>;
        mockValidatePasteSettings = validatePasteSettings as jest.MockedFunction<typeof validatePasteSettings>;

        // Default mock implementations
        mockJoplin.settings.value.mockImplementation((setting: string) => {
            switch (setting) {
                case SETTINGS.INCLUDE_IMAGES:
                    return Promise.resolve(true);
                case SETTINGS.CONVERT_IMAGES_TO_RESOURCES:
                    return Promise.resolve(false);
                default:
                    return Promise.resolve(undefined);
            }
        });

        mockValidatePasteSettings.mockReturnValue({
            isValid: true,
            value: {
                includeImages: true,
                convertImagesToResources: false,
                normalizeQuotes: true,
                forceTightLists: false,
            },
        });
    });

    describe('HTML conversion scenarios', () => {
        test('successful HTML to markdown conversion', async () => {
            const html = '<p>Hello <strong>world</strong></p>';
            const expectedMarkdown = 'Hello **world**';

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockResolvedValue({
                markdown: expectedMarkdown,
                resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 },
                degradedProcessing: false,
            });

            const result = await handlePasteAsMarkdown();

            expect(mockJoplin.clipboard.readHtml).toHaveBeenCalled();
            expect(mockConvertHtmlToMarkdown).toHaveBeenCalledWith(html, {
                includeImages: true,
                convertImagesToResources: false,
                normalizeQuotes: true,
                forceTightLists: false,
                isGoogleDocs: false,
            });
            expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
                name: 'insertText',
                args: [expectedMarkdown],
            });
            expect(mockShowToast).toHaveBeenCalledWith('Pasted as Markdown', ToastType.Success);
            expect(result).toEqual({
                markdown: expectedMarkdown,
                success: true,
                plainTextFallback: false,
            });
        });

        test('HTML conversion with images excluded', async () => {
            const html = '<p>Text</p><img src="test.png" alt="Test">';
            const expectedMarkdown = 'Text';

            mockValidatePasteSettings.mockReturnValue({
                isValid: true,
                value: {
                    includeImages: false,
                    convertImagesToResources: false,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockResolvedValue({
                markdown: expectedMarkdown,
                resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 },
                degradedProcessing: false,
            });

            const result = await handlePasteAsMarkdown();

            expect(mockConvertHtmlToMarkdown).toHaveBeenCalledWith(html, {
                includeImages: false,
                convertImagesToResources: false,
                normalizeQuotes: true,
                forceTightLists: false,
                isGoogleDocs: false,
            });
            expect(mockShowToast).toHaveBeenCalledWith('Pasted as Markdown (images excluded)', ToastType.Success);
            expect(result).toEqual({
                markdown: expectedMarkdown,
                success: true,
                plainTextFallback: false,
            });
        });

        test('HTML conversion with resource creation', async () => {
            const html = '<p>Text</p><img src="data:image/png;base64,iVBORw0..." alt="Image">';
            const expectedMarkdown = 'Text\n\n![Image](:resource-id)';

            mockValidatePasteSettings.mockReturnValue({
                isValid: true,
                value: {
                    includeImages: true,
                    convertImagesToResources: true,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockResolvedValue({
                markdown: expectedMarkdown,
                resources: {
                    resourcesCreated: 1,
                    resourceIds: ['resource-id'],
                    attempted: 1,
                    failed: 0,
                },
                degradedProcessing: false,
            });

            const result = await handlePasteAsMarkdown();

            expect(mockConvertHtmlToMarkdown).toHaveBeenCalledWith(html, {
                includeImages: true,
                convertImagesToResources: true,
                normalizeQuotes: true,
                forceTightLists: false,
                isGoogleDocs: false,
            });
            expect(mockShowToast).toHaveBeenCalledWith(
                'Pasted as Markdown (1 image resource created)',
                ToastType.Success
            );
            expect(result).toEqual({
                markdown: expectedMarkdown,
                success: true,
                plainTextFallback: false,
            });
        });

        test('HTML conversion with partial resource creation failure', async () => {
            const html = '<p>Text</p><img src="image1.png"><img src="image2.png">';
            const expectedMarkdown = 'Text\n\n![](image1.png)\n![](image2.png)';

            mockValidatePasteSettings.mockReturnValue({
                isValid: true,
                value: {
                    includeImages: true,
                    convertImagesToResources: true,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockResolvedValue({
                markdown: expectedMarkdown,
                resources: {
                    resourcesCreated: 1,
                    resourceIds: ['resource-id'],
                    attempted: 2,
                    failed: 1,
                },
                degradedProcessing: false,
            });

            const result = await handlePasteAsMarkdown();

            expect(mockShowToast).toHaveBeenCalledWith(
                'Pasted as Markdown (converted 1 of 2 images)',
                ToastType.Success
            );
            expect(result).toEqual({
                markdown: expectedMarkdown,
                success: true,
                plainTextFallback: false,
            });
        });

        test('HTML conversion with multiple resource creation', async () => {
            const html = '<p>Text</p><img src="image1.png"><img src="image2.png">';
            const expectedMarkdown = 'Text\n\n![](image1.png)\n![](image2.png)';

            mockValidatePasteSettings.mockReturnValue({
                isValid: true,
                value: {
                    includeImages: true,
                    convertImagesToResources: true,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockResolvedValue({
                markdown: expectedMarkdown,
                resources: {
                    resourcesCreated: 2,
                    resourceIds: ['resource-id-1', 'resource-id-2'],
                    attempted: 2,
                    failed: 0,
                },
                degradedProcessing: false,
            });

            const result = await handlePasteAsMarkdown();

            expect(mockShowToast).toHaveBeenCalledWith(
                'Pasted as Markdown (2 image resources created)',
                ToastType.Success
            );
            expect(result).toEqual({
                markdown: expectedMarkdown,
                success: true,
                plainTextFallback: false,
            });
        });
    });

    describe('Plain text fallback scenarios', () => {
        test('no HTML available - uses plain text', async () => {
            const plainText = 'Just plain text';

            mockJoplin.clipboard.readHtml.mockResolvedValue(null);
            mockJoplin.clipboard.readText.mockResolvedValue(plainText);

            const result = await handlePasteAsMarkdown();

            expect(mockJoplin.clipboard.readHtml).toHaveBeenCalled();
            expect(mockJoplin.clipboard.readText).toHaveBeenCalled();
            expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
                name: 'insertText',
                args: [plainText],
            });
            expect(mockShowToast).toHaveBeenCalledWith('Pasted plain text (no HTML found)', ToastType.Info);
            expect(result).toEqual({
                markdown: plainText,
                success: true,
                plainTextFallback: true,
            });
        });

        test('HTML without tags - uses plain text', async () => {
            const plainText = 'Text without HTML tags';

            mockJoplin.clipboard.readHtml.mockResolvedValue(plainText);
            mockJoplin.clipboard.readText.mockResolvedValue(plainText);

            const result = await handlePasteAsMarkdown();

            expect(mockJoplin.clipboard.readText).toHaveBeenCalled();
            expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
                name: 'insertText',
                args: [plainText],
            });
            expect(mockShowToast).toHaveBeenCalledWith('Pasted plain text (no HTML found)', ToastType.Info);
            expect(result).toEqual({
                markdown: plainText,
                success: true,
                plainTextFallback: true,
            });
        });

        test('empty clipboard', async () => {
            mockJoplin.clipboard.readHtml.mockResolvedValue(null);
            mockJoplin.clipboard.readText.mockResolvedValue('');

            const result = await handlePasteAsMarkdown();

            expect(mockShowToast).toHaveBeenCalledWith('Clipboard is empty', ToastType.Info);
            expect(result).toEqual({
                markdown: '',
                success: false,
                plainTextFallback: true,
                warnings: ['Clipboard empty'],
            });
        });

        test('HTML conversion fails - falls back to plain text', async () => {
            const html = '<p>HTML content</p>';
            const plainText = 'Plain text fallback';

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockJoplin.clipboard.readText.mockResolvedValue(plainText);
            mockConvertHtmlToMarkdown.mockRejectedValue(new Error('Conversion failed'));

            const result = await handlePasteAsMarkdown();

            expect(mockConvertHtmlToMarkdown).toHaveBeenCalledWith(html, {
                includeImages: true,
                convertImagesToResources: false,
                normalizeQuotes: true,
                forceTightLists: false,
                isGoogleDocs: false,
            });
            expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
                name: 'insertText',
                args: [plainText],
            });
            expect(mockShowToast).toHaveBeenCalledWith('Conversion failed; pasted plain text', ToastType.Error);
            expect(result).toEqual({
                markdown: plainText,
                success: false,
                warnings: ['HTML conversion failed'],
                plainTextFallback: true,
            });
        });

        test('HTML processing error falls back to plain text when available', async () => {
            const html = '<p>HTML content</p>';
            const error = new HtmlProcessingError('dom-unavailable');
            const fallbackText = 'plain clipboard text';

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockRejectedValue(error);
            mockJoplin.clipboard.readText.mockResolvedValue(fallbackText);

            const result = await handlePasteAsMarkdown();

            expect(mockJoplin.clipboard.readText).toHaveBeenCalled();
            expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
                name: 'insertText',
                args: [fallbackText],
            });
            // Now expect TWO toasts: first the error message, then the fallback success
            expect(mockShowToast).toHaveBeenCalledWith(error.message, ToastType.Error);
            expect(mockShowToast).toHaveBeenCalledWith('Conversion failed; pasted plain text', ToastType.Error);
            expect(result).toEqual({
                markdown: fallbackText,
                success: false,
                warnings: [error.message],
                plainTextFallback: true,
            });
        });

        test('HTML processing error without plain text keeps failure state', async () => {
            const html = '<p>HTML content</p>';
            const error = new HtmlProcessingError('sanitize-failed');

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockRejectedValue(error);
            mockJoplin.clipboard.readText.mockResolvedValue('');

            const result = await handlePasteAsMarkdown();

            expect(mockJoplin.clipboard.readText).toHaveBeenCalled();
            expect(mockJoplin.commands.execute).not.toHaveBeenCalled();
            // Now expect TWO toasts: first the error message, then the fallback failure
            expect(mockShowToast).toHaveBeenCalledWith(error.message, ToastType.Error);
            expect(mockShowToast).toHaveBeenCalledWith('Plain text fallback also failed', ToastType.Error);
            expect(result).toEqual({
                markdown: '',
                success: false,
                warnings: [error.message, 'Plain text fallback failed'],
                plainTextFallback: true,
            });
        });
    });

    describe('Editor insertion scenarios', () => {
        test('insertText command succeeds', async () => {
            const html = '<p>Test</p>';
            const markdown = 'Test';

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockResolvedValue({
                markdown,
                resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 },
                degradedProcessing: false,
            });
            mockJoplin.commands.execute.mockResolvedValueOnce(undefined);

            await handlePasteAsMarkdown();

            expect(mockJoplin.commands.execute).toHaveBeenCalledWith('editor.execCommand', {
                name: 'insertText',
                args: [markdown],
            });
            expect(mockJoplin.commands.execute).toHaveBeenCalledTimes(1);
        });

        test('insertText fails, falls back to replaceSelection', async () => {
            const html = '<p>Test</p>';
            const markdown = 'Test';

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockResolvedValue({
                markdown,
                resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 },
                degradedProcessing: false,
            });
            mockJoplin.commands.execute
                .mockRejectedValueOnce(new Error('insertText failed'))
                .mockResolvedValueOnce(undefined);

            await handlePasteAsMarkdown();

            expect(mockJoplin.commands.execute).toHaveBeenNthCalledWith(1, 'editor.execCommand', {
                name: 'insertText',
                args: [markdown],
            });
            expect(mockJoplin.commands.execute).toHaveBeenNthCalledWith(2, 'editor.execCommand', {
                name: 'replaceSelection',
                args: [markdown],
            });
            expect(mockJoplin.commands.execute).toHaveBeenCalledTimes(2);
        });

        test('both insertText and replaceSelection fail - falls back to plain text', async () => {
            const html = '<p>Test</p>';
            const markdown = 'Test';
            const plainText = 'Plain text fallback';

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockResolvedValue({
                markdown,
                resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 },
                degradedProcessing: false,
            });
            mockJoplin.clipboard.readText.mockResolvedValue(plainText);

            // Mock both insertText and replaceSelection to fail
            mockJoplin.commands.execute
                .mockRejectedValueOnce(new Error('insertText failed'))
                .mockRejectedValueOnce(new Error('replaceSelection failed'))
                .mockResolvedValueOnce(undefined); // For the fallback plain text insertion

            const result = await handlePasteAsMarkdown();

            expect(mockJoplin.commands.execute).toHaveBeenCalledTimes(3); // 2 failed attempts + 1 successful fallback
            expect(mockShowToast).toHaveBeenCalledWith('Conversion failed; pasted plain text', ToastType.Error);
            expect(result).toEqual({
                markdown: plainText,
                success: false,
                warnings: ['Editor insertion failed'],
                plainTextFallback: true,
            });
        });

        test('editor insertion completely fails - returns failure with toast', async () => {
            const html = '<p>Test</p>';
            const markdown = 'Test';

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockResolvedValue({
                markdown,
                resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 },
                degradedProcessing: false,
            });
            mockJoplin.clipboard.readText.mockResolvedValue(''); // No fallback text available

            // Mock both insertText and replaceSelection to fail
            mockJoplin.commands.execute
                .mockRejectedValueOnce(new Error('insertText failed'))
                .mockRejectedValueOnce(new Error('replaceSelection failed'));

            const result = await handlePasteAsMarkdown();

            expect(mockJoplin.commands.execute).toHaveBeenCalledTimes(2);
            expect(mockShowToast).toHaveBeenCalledWith(
                'Paste failed: unable to insert content into editor',
                ToastType.Error
            );
            expect(result).toEqual({
                markdown: '',
                success: false,
                warnings: ['Editor insertion failed', 'Plain text fallback also failed'],
                plainTextFallback: true,
            });
        });
    });

    describe('Clipboard access errors', () => {
        test('readHtml throws error - returns null gracefully', async () => {
            const plainText = 'Fallback text';

            mockJoplin.clipboard.readHtml.mockRejectedValue(new Error('HTML clipboard not available'));
            mockJoplin.clipboard.readText.mockResolvedValue(plainText);

            const result = await handlePasteAsMarkdown();

            expect(mockJoplin.clipboard.readText).toHaveBeenCalled();
            expect(mockShowToast).toHaveBeenCalledWith('Pasted plain text (no HTML found)', ToastType.Info);
            expect(result).toEqual({
                markdown: plainText,
                success: true,
                plainTextFallback: true,
            });
        });

        test('readText throws error', async () => {
            mockJoplin.clipboard.readHtml.mockResolvedValue(null);
            mockJoplin.clipboard.readText.mockRejectedValue(new Error('Text clipboard not available'));

            await expect(handlePasteAsMarkdown()).rejects.toThrow('Unable to access clipboard text');
        });

        test('HTML conversion fails and readText fails - returns failure with toast', async () => {
            const html = '<p>HTML content</p>';

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockRejectedValue(new Error('Conversion failed'));
            mockJoplin.clipboard.readText.mockRejectedValue(new Error('Text clipboard not available'));

            const result = await handlePasteAsMarkdown();

            expect(mockShowToast).toHaveBeenCalledWith(
                'Paste failed: no HTML or plain text available',
                ToastType.Error
            );
            expect(result).toEqual({
                markdown: '',
                success: false,
                warnings: ['HTML conversion failed', 'No plain text available'],
                plainTextFallback: true,
            });
        });

        test('HTML conversion fails and readText returns empty - returns failure with toast', async () => {
            const html = '<p>HTML content</p>';

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockRejectedValue(new Error('Conversion failed'));
            mockJoplin.clipboard.readText.mockResolvedValue('');

            const result = await handlePasteAsMarkdown();

            expect(mockShowToast).toHaveBeenCalledWith(
                'Paste failed: no HTML or plain text available',
                ToastType.Error
            );
            expect(result).toEqual({
                markdown: '',
                success: false,
                warnings: ['HTML conversion failed', 'No plain text available'],
                plainTextFallback: true,
            });
        });
    });

    describe('Settings integration', () => {
        test('uses user settings for conversion', async () => {
            const html = '<p>Test</p><img src="test.png">';

            mockJoplin.settings.value.mockImplementation((setting: string) => {
                switch (setting) {
                    case SETTINGS.INCLUDE_IMAGES:
                        return Promise.resolve(false);
                    case SETTINGS.CONVERT_IMAGES_TO_RESOURCES:
                        return Promise.resolve(true);
                    default:
                        return Promise.resolve(undefined);
                }
            });

            mockValidatePasteSettings.mockReturnValue({
                isValid: true,
                value: {
                    includeImages: false,
                    convertImagesToResources: true,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });

            mockJoplin.clipboard.readHtml.mockResolvedValue(html);
            mockConvertHtmlToMarkdown.mockResolvedValue({
                markdown: 'Test',
                resources: { resourcesCreated: 0, resourceIds: [], attempted: 0, failed: 0 },
                degradedProcessing: false,
            });

            await handlePasteAsMarkdown();

            expect(mockJoplin.settings.value).toHaveBeenCalledWith(SETTINGS.INCLUDE_IMAGES);
            expect(mockJoplin.settings.value).toHaveBeenCalledWith(SETTINGS.CONVERT_IMAGES_TO_RESOURCES);
            expect(mockValidatePasteSettings).toHaveBeenCalledWith({
                includeImages: false,
                convertImagesToResources: true,
                normalizeQuotes: undefined,
                forceTightLists: undefined,
            });
            expect(mockConvertHtmlToMarkdown).toHaveBeenCalledWith(html, {
                includeImages: false,
                convertImagesToResources: true,
                normalizeQuotes: true,
                forceTightLists: false,
                isGoogleDocs: false,
            });
        });
    });
});
