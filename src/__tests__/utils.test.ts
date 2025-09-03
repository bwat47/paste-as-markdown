import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { showToast, validatePasteSettings } from '../utils';
import { ToastType } from 'api/types';

// Mock the joplin API
jest.mock('api');

describe('utils', () => {
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
});
