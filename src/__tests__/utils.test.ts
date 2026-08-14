import { describe, test, expect, vi, beforeEach } from 'vitest';
import type { MockedFunction } from 'vitest';
import { showToast } from '../utils';
import { ToastType } from 'api/types';
import logger from '../logger';

// Mock the joplin API
vi.mock('api');

describe('utils', () => {
    describe('showToast', () => {
        beforeEach(async () => {
            const apiModule = await import('api');
            (global as { mockJoplin?: typeof import('api').default }).mockJoplin = apiModule.default;
            vi.clearAllMocks();
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
            const warnSpy = vi
                .spyOn(logger as unknown as { warn: (...args: unknown[]) => void }, 'warn')
                .mockImplementation(() => {});
            (mockJoplin.views.dialogs.showToast as MockedFunction<() => Promise<void>>).mockRejectedValue(
                new Error('API Error')
            );

            await expect(showToast('Test message')).resolves.not.toThrow();
            expect(warnSpy).toHaveBeenCalledWith('Failed to show toast', expect.any(Error));

            warnSpy.mockRestore();
        });
    });
});
