import { describe, test, expect, jest, beforeEach } from '@jest/globals';
import { showToast, validatePasteSettings } from '../utils';
import { ToastType } from 'api/types';
import logger from '../logger';

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
            const warnSpy = jest
                .spyOn(logger as unknown as { warn: (...args: unknown[]) => void }, 'warn')
                .mockImplementation(() => {});
            (mockJoplin.views.dialogs.showToast as jest.MockedFunction<() => Promise<void>>).mockRejectedValue(
                new Error('API Error')
            );

            await expect(showToast('Test message')).resolves.not.toThrow();
            expect(warnSpy).toHaveBeenCalledWith('Failed to show toast', expect.any(Error));

            warnSpy.mockRestore();
        });
    });

    describe('validatePasteSettings', () => {
        test('returns error for null/undefined input', () => {
            expect(validatePasteSettings(null)).toEqual({ isValid: false, error: 'Settings must be an object' });
            expect(validatePasteSettings(undefined)).toEqual({ isValid: false, error: 'Settings must be an object' });
        });

        test('returns default settings for empty object', () => {
            expect(validatePasteSettings({})).toEqual({
                isValid: true,
                value: {
                    includeImages: true,
                    convertImagesToResources: false,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });
        });

        test('preserves valid boolean includeImages setting', () => {
            expect(validatePasteSettings({ includeImages: false })).toEqual({
                isValid: true,
                value: {
                    includeImages: false,
                    convertImagesToResources: false,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });
            expect(validatePasteSettings({ includeImages: true })).toEqual({
                isValid: true,
                value: {
                    includeImages: true,
                    convertImagesToResources: false,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });
        });

        test('reports error for invalid includeImages values', () => {
            expect(validatePasteSettings({ includeImages: 'true' })).toEqual({
                isValid: false,
                error: 'Invalid setting(s): includeImages must be boolean',
                value: {
                    includeImages: true,
                    convertImagesToResources: false,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });
            expect(validatePasteSettings({ includeImages: 1 })).toEqual({
                isValid: false,
                error: 'Invalid setting(s): includeImages must be boolean',
                value: {
                    includeImages: true,
                    convertImagesToResources: false,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });
            expect(validatePasteSettings({ includeImages: null as unknown as boolean })).toEqual({
                isValid: false,
                error: 'Invalid setting(s): includeImages must be boolean',
                value: {
                    includeImages: true,
                    convertImagesToResources: false,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });
        });

        test('ignores unknown properties', () => {
            expect(
                validatePasteSettings({
                    includeImages: false,
                    unknownProperty: 'value',
                    anotherProperty: 123,
                })
            ).toEqual({
                isValid: true,
                value: {
                    includeImages: false,
                    convertImagesToResources: false,
                    normalizeQuotes: true,
                    forceTightLists: false,
                },
            });
        });
    });
});
