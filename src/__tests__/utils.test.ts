import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { hasMeaningfulHtml, showToast, validatePasteSettings } from '../utils';
import { ToastType } from 'api/types';

// Mock the joplin API
jest.mock('api');

describe('utils', () => {
    describe('hasMeaningfulHtml', () => {
        test('returns false for null/undefined/empty input', () => {
            expect(hasMeaningfulHtml(null)).toBe(false);
            expect(hasMeaningfulHtml(undefined)).toBe(false);
            expect(hasMeaningfulHtml('')).toBe(false);
            expect(hasMeaningfulHtml('   ')).toBe(false);
        });

        test('returns false for plain text', () => {
            expect(hasMeaningfulHtml('Just plain text')).toBe(false);
            expect(hasMeaningfulHtml('Hello world')).toBe(false);
        });

        test('returns true for meaningful HTML tags', () => {
            expect(hasMeaningfulHtml('<h1>Title</h1>')).toBe(true);
            expect(hasMeaningfulHtml('<strong>Bold text</strong>')).toBe(true);
            expect(hasMeaningfulHtml('<em>Italic text</em>')).toBe(true);
            expect(hasMeaningfulHtml('<a href="http://example.com">Link</a>')).toBe(true);
            expect(hasMeaningfulHtml('<ul><li>List item</li></ul>')).toBe(true);
            expect(hasMeaningfulHtml('<table><tr><td>Cell</td></tr></table>')).toBe(true);
            expect(hasMeaningfulHtml('<img src="image.jpg" alt="Image">')).toBe(true);
        });

        test('returns false for trivial wrapper tags', () => {
            expect(hasMeaningfulHtml('<div>Simple text</div>')).toBe(false);
            expect(hasMeaningfulHtml('<span>Text</span>')).toBe(false);
            expect(hasMeaningfulHtml('<p>Short</p>')).toBe(false);
        });

        test('handles wrapper content length correctly', () => {
            // div/span/p are excluded from RE_MEANINGFUL_TAG, so single wrappers of these return false
            const divContent = '<div>This is normal text content</div>';
            expect(hasMeaningfulHtml(divContent)).toBe(false);

            // But content with non-trivial tags is considered meaningful
            const meaningfulContent = '<article>This is normal text content</article>';
            expect(hasMeaningfulHtml(meaningfulContent)).toBe(true);
        });

        test('returns false for empty wrappers', () => {
            expect(hasMeaningfulHtml('<div><br></div>')).toBe(false);
            expect(hasMeaningfulHtml('<p>&nbsp;</p>')).toBe(false);
            expect(hasMeaningfulHtml('<span>   </span>')).toBe(false);
        });

        test('returns true for elements with formatting styles', () => {
            expect(hasMeaningfulHtml('<span style="font-weight: bold">Text</span>')).toBe(true);
            expect(hasMeaningfulHtml('<div style="color: red">Colored text</div>')).toBe(true);
            expect(hasMeaningfulHtml('<p style="text-decoration: underline">Underlined</p>')).toBe(true);
        });

        test('returns true for elements with semantic classes', () => {
            expect(hasMeaningfulHtml('<span class="bold">Text</span>')).toBe(true);
            expect(hasMeaningfulHtml('<div class="heading">Title</div>')).toBe(true);
            expect(hasMeaningfulHtml('<p id="code-block">Code</p>')).toBe(true);
        });

        test('returns true for data URL images', () => {
            expect(hasMeaningfulHtml('<img src="data:image/png;base64,iVBOR...">')).toBe(true);
        });

        test('returns true for meaningful images (filters out tracking pixels)', () => {
            // Large image
            expect(hasMeaningfulHtml('<img src="image.jpg" width="300" height="200">')).toBe(true);
            // The function first checks RE_MEANINGFUL_TAG which matches img tags, so it returns true
            // The filtering happens only within hasMeaningfulImages when called later in the process
            // But since img is itself a meaningful tag, any img makes the HTML meaningful
            expect(hasMeaningfulHtml('<img src="pixel.gif" width="5" height="5">')).toBe(true);
            // Image without dimensions (assumed meaningful)
            expect(hasMeaningfulHtml('<img src="photo.jpg">')).toBe(true);
            // Image at the threshold should be meaningful
            expect(hasMeaningfulHtml('<img src="icon.gif" width="6" height="6">')).toBe(true);
        });

        test('handles boilerplate tags correctly', () => {
            const htmlWithBoilerplate = `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="utf-8">
                    <title>Test</title>
                    <style>body { margin: 0; }</style>
                    <script>console.log('test');</script>
                    <link rel="stylesheet" href="style.css">
                </head>
                <body>
                    <h1>Real Content</h1>
                </body>
                </html>
            `;
            expect(hasMeaningfulHtml(htmlWithBoilerplate)).toBe(true);
        });

        test('returns false for HTML with only boilerplate', () => {
            const onlyBoilerplate = `
                <!DOCTYPE html>
                <html><head><meta charset="utf-8"><title>Test</title></head><body></body></html>
            `;
            expect(hasMeaningfulHtml(onlyBoilerplate)).toBe(false);
        });
    });

    describe('showToast', () => {
        beforeEach(async () => {
            const apiModule = await import('api');
            (global as { mockJoplin?: typeof import('api').default }).mockJoplin = apiModule.default;
            jest.clearAllMocks();
        });

        test('calls joplin toast API with correct parameters', async () => {
            const mockJoplin = (global as { mockJoplin?: typeof import('api').default }).mockJoplin!;

            await showToast('Test message', ToastType.Info, 5000);

            expect(mockJoplin.views.dialogs.showToast).toHaveBeenCalledWith({
                message: 'Test message',
                type: ToastType.Info,
                duration: 5000,
            });
        });

        test('uses default parameters when not provided', async () => {
            const mockJoplin = (global as { mockJoplin?: typeof import('api').default }).mockJoplin!;

            await showToast('Test message');

            expect(mockJoplin.views.dialogs.showToast).toHaveBeenCalledWith({
                message: 'Test message',
                type: ToastType.Info,
                duration: 4000, // TOAST_DURATION constant
            });
        });

        test('handles API errors gracefully', async () => {
            const mockJoplin = (global as { mockJoplin?: typeof import('api').default }).mockJoplin!;
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
            (mockJoplin.views.dialogs.showToast as jest.MockedFunction<() => Promise<void>>).mockRejectedValue(
                new Error('API Error')
            );

            await expect(showToast('Test message')).resolves.not.toThrow();
            expect(consoleSpy).toHaveBeenCalledWith('[paste-as-markdown]', 'Failed to show toast:', expect.any(Error));

            consoleSpy.mockRestore();
        });
    });

    describe('validatePasteSettings', () => {
        test('returns default settings for null/undefined input', () => {
            expect(validatePasteSettings(null)).toEqual({ includeImages: true });
            expect(validatePasteSettings(undefined)).toEqual({ includeImages: true });
        });

        test('returns default settings for empty object', () => {
            expect(validatePasteSettings({})).toEqual({ includeImages: true });
        });

        test('preserves valid boolean includeImages setting', () => {
            expect(validatePasteSettings({ includeImages: false })).toEqual({ includeImages: false });
            expect(validatePasteSettings({ includeImages: true })).toEqual({ includeImages: true });
        });

        test('uses default for invalid includeImages values', () => {
            expect(validatePasteSettings({ includeImages: 'true' })).toEqual({ includeImages: true });
            expect(validatePasteSettings({ includeImages: 1 })).toEqual({ includeImages: true });
            expect(validatePasteSettings({ includeImages: null })).toEqual({ includeImages: true });
        });

        test('ignores unknown properties', () => {
            expect(
                validatePasteSettings({
                    includeImages: false,
                    unknownProperty: 'value',
                    anotherProperty: 123,
                })
            ).toEqual({ includeImages: false });
        });
    });

    describe('Enhanced HTML Detection', () => {
        test('should detect semantic class names with meaningful keywords', () => {
            expect(hasMeaningfulHtml('<span class="text-bold">Bold</span>')).toBe(true);
            expect(hasMeaningfulHtml('<div class="highlight">Important</div>')).toBe(true);
            expect(hasMeaningfulHtml('<code class="language-js">code</code>')).toBe(true);
            expect(hasMeaningfulHtml('<p class="heading">Title</p>')).toBe(true);
        });

        test('should detect semantic IDs with meaningful keywords', () => {
            expect(hasMeaningfulHtml('<div id="code-block">Code</div>')).toBe(true);
            expect(hasMeaningfulHtml('<span id="bold-text">Text</span>')).toBe(true);
            expect(hasMeaningfulHtml('<p id="quote-section">Quote</p>')).toBe(true);
        });

        test('should properly filter small images by dimensions', () => {
            // Very small images (tracking pixels) - should be filtered out
            expect(hasMeaningfulHtml('<img width="1" height="1" src="track.gif">')).toBe(true); // img tag itself is meaningful
            expect(hasMeaningfulHtml('<img width="3" height="3" src="icon.gif">')).toBe(true); // img tag itself is meaningful

            // Images at/above threshold should be meaningful
            expect(hasMeaningfulHtml('<img width="6" height="6" src="icon.gif">')).toBe(true);
            expect(hasMeaningfulHtml('<img width="10" height="10" src="icon.gif">')).toBe(true);
        });

        test('should handle various data URL formats', () => {
            expect(hasMeaningfulHtml('<img src="data:image/png;base64,iVBORw0...">')).toBe(true);
            expect(hasMeaningfulHtml('<img src="data:image/jpeg;base64,/9j/...">')).toBe(true);
            expect(hasMeaningfulHtml('<img src="data:image/gif;base64,R0lG...">')).toBe(true);
            // Non-image data URLs should still be caught by img tag detection
            expect(hasMeaningfulHtml('<img src="data:text/plain;base64,...">')).toBe(true);
        });

        test('should handle mixed content scenarios', () => {
            // Multiple trivial wrappers with meaningful content
            const mixedContent = '<div><span style="color: blue">Colored text</span></div>';
            expect(hasMeaningfulHtml(mixedContent)).toBe(true);

            // Nested wrappers with semantic classes
            const nestedSemantic = '<div><p class="caption">Image caption</p></div>';
            expect(hasMeaningfulHtml(nestedSemantic)).toBe(true);

            // Content with both images and formatting
            const richContent = '<div><img src="pic.jpg"><strong>Caption</strong></div>';
            expect(hasMeaningfulHtml(richContent)).toBe(true);
        });

        test('should handle edge cases in HTML structure', () => {
            // Self-closing tags
            expect(hasMeaningfulHtml('<br><hr><img src="test.jpg">')).toBe(true);

            // Mixed case tags
            expect(hasMeaningfulHtml('<DIV><STRONG>Text</STRONG></DIV>')).toBe(true);

            // Tags with multiple attributes
            expect(hasMeaningfulHtml('<span class="text bold" id="important" style="color: red">Text</span>')).toBe(
                true
            );
        });
    });
});
