import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { fetchWithRetry, isRetryableStatus } from '../resources/fetchWithRetry';

const URL = 'https://example.com/image.png';
const RETRIES = 2;
const BASE_DELAY_MS = 10;

function response(status: number): Response {
    return new Response(null, { status });
}

describe('isRetryableStatus', () => {
    test.each([408, 429, 500, 503, 599])('retries %i', (status) => {
        expect(isRetryableStatus(status)).toBe(true);
    });

    test.each([400, 404, 499, 600])('does not retry %i', (status) => {
        expect(isRetryableStatus(status)).toBe(false);
    });
});

describe('fetchWithRetry', () => {
    const fetchMock = vi.fn<typeof fetch>();

    beforeEach(() => {
        vi.useFakeTimers();
        fetchMock.mockReset();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
    });

    test('returns an ok response without retrying', async () => {
        fetchMock.mockResolvedValueOnce(response(200));

        const resp = await fetchWithRetry(URL, {}, RETRIES, BASE_DELAY_MS);

        expect(resp.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('returns a non-retryable response immediately', async () => {
        fetchMock.mockResolvedValueOnce(response(404));

        const resp = await fetchWithRetry(URL, {}, RETRIES, BASE_DELAY_MS);

        expect(resp.status).toBe(404);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('retries retryable statuses with exponential backoff, then returns the last response', async () => {
        fetchMock.mockResolvedValue(response(503));

        const pending = fetchWithRetry(URL, {}, RETRIES, BASE_DELAY_MS);
        await vi.advanceTimersByTimeAsync(BASE_DELAY_MS);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(BASE_DELAY_MS * 2);

        expect((await pending).status).toBe(503);
        expect(fetchMock).toHaveBeenCalledTimes(RETRIES + 1);
    });

    test('retries network errors and rethrows after the final attempt', async () => {
        const error = new Error('network');
        fetchMock.mockRejectedValue(error);

        // Capture the rejection up front so it is never reported as unhandled while timers advance.
        const settled = fetchWithRetry(URL, {}, RETRIES, BASE_DELAY_MS).catch((e: unknown) => e);
        await vi.runAllTimersAsync();

        expect(await settled).toBe(error);
        expect(fetchMock).toHaveBeenCalledTimes(RETRIES + 1);
    });

    test('recovers when a retry succeeds', async () => {
        fetchMock.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(response(200));

        const pending = fetchWithRetry(URL, {}, RETRIES, BASE_DELAY_MS);
        await vi.runAllTimersAsync();

        expect((await pending).status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    test('does not retry once the signal is aborted', async () => {
        const controller = new AbortController();
        const error = new Error('aborted');
        fetchMock.mockImplementationOnce(() => {
            controller.abort();
            return Promise.reject(error);
        });

        await expect(fetchWithRetry(URL, { signal: controller.signal }, RETRIES, BASE_DELAY_MS)).rejects.toBe(error);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    test('throws before fetching when the signal is already aborted', async () => {
        const controller = new AbortController();
        controller.abort();

        await expect(fetchWithRetry(URL, { signal: controller.signal }, RETRIES, BASE_DELAY_MS)).rejects.toThrow(
            'abort'
        );
        expect(fetchMock).not.toHaveBeenCalled();
    });
});
