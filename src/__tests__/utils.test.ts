import { describe, test, expect, vi, beforeEach, type Mock } from 'vitest';
import { showToast } from '../utils';
import { ToastType, type Toast } from 'api/types';
import logger from '../logger';

// Mock the joplin API
vi.mock('api');

describe('utils', () => {
    describe('showToast', () => {
        let showToastMock: Mock<(toast: Toast) => Promise<void>>;

        beforeEach(async () => {
            vi.clearAllMocks();
            showToastMock = vi.fn<(toast: Toast) => Promise<void>>().mockResolvedValue();

            const joplinModule = await import('api');
            (joplinModule.default as unknown) = {
                views: { dialogs: { showToast: showToastMock } },
            };
        });

        test('calls joplin toast API with correct parameters', async () => {
            await showToast('Test message', ToastType.Info, 5000);

            expect(showToastMock).toHaveBeenCalledWith({
                message: 'Test message',
                type: ToastType.Info,
                duration: 5000,
            });
        });

        test('uses default parameters when not provided', async () => {
            await showToast('Test message');

            expect(showToastMock).toHaveBeenCalledWith({
                message: 'Test message',
                type: ToastType.Info,
                duration: 4000, // TOAST_DURATION constant
            });
        });

        test('handles API errors gracefully', async () => {
            const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
            showToastMock.mockRejectedValue(new Error('API Error'));

            await expect(showToast('Test message')).resolves.not.toThrow();
            expect(warnSpy).toHaveBeenCalledWith('Failed to show toast', expect.any(Error));

            warnSpy.mockRestore();
        });
    });
});
