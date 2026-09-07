export const EDITOR_CONTEXT_MENU_EVENT_GRACE_MS = 1000;

export interface ContextMenuOriginTracker {
    mark(): void;
    consume(): boolean;
}

/** Creates a single-use marker for a recent context-menu event in one editor instance. */
export function createContextMenuOriginTracker(now: () => number = Date.now): ContextMenuOriginTracker {
    let lastContextMenuAt = 0;
    let pending = false;

    return {
        mark(): void {
            lastContextMenuAt = now();
            pending = true;
        },
        consume(): boolean {
            const isRecent = pending && now() - lastContextMenuAt <= EDITOR_CONTEXT_MENU_EVENT_GRACE_MS;
            pending = false;
            return isRecent;
        },
    };
}
