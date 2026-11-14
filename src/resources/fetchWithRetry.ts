/** HTTP statuses outside the 5xx range that indicate a transient failure (Request Timeout, Too Many Requests). */
const RETRYABLE_STATUSES = new Set([408, 429]);
const SERVER_ERROR_MIN = 500;
const SERVER_ERROR_MAX_EXCLUSIVE = 600;
const BACKOFF_FACTOR = 2;

/** Whether an HTTP status is worth retrying: 408, 429 or any 5xx. */
export function isRetryableStatus(status: number): boolean {
    return RETRYABLE_STATUSES.has(status) || (status >= SERVER_ERROR_MIN && status < SERVER_ERROR_MAX_EXCLUSIVE);
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lightweight retry wrapper around fetch for transient errors.
 * Retries on network errors and retryable HTTP statuses with exponential backoff
 * (`baseDelayMs`, then doubling). After the final attempt, a non-ok response is returned
 * for the caller to handle and a network error is rethrown. An aborted signal stops retrying.
 */
export async function fetchWithRetry(
    url: string,
    init: RequestInit,
    retries: number,
    baseDelayMs: number
): Promise<Response> {
    const { signal } = init;
    for (let attempt = 0; ; attempt++) {
        if (signal?.aborted) throw new Error('abort');
        const canRetry = attempt < retries;
        try {
            const resp = await fetch(url, init);
            if (resp.ok || !canRetry || !isRetryableStatus(resp.status)) return resp;
        } catch (e) {
            if (signal?.aborted || !canRetry) throw e;
        }
        await sleep(baseDelayMs * Math.pow(BACKOFF_FACTOR, attempt));
    }
}
