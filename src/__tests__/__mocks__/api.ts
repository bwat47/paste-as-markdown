// Mock Joplin API
import { vi } from 'vitest';

const joplin = {
    views: {
        dialogs: {
            showToast: vi.fn<() => Promise<void>>().mockResolvedValue(),
        },
    },
    commands: {
        execute: vi.fn<() => Promise<void>>().mockResolvedValue(),
    },
    workspace: {
        selectedNote: vi.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'test-note' }),
    },
};

export default joplin;
