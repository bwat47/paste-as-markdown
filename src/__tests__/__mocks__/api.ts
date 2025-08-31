// Mock Joplin API
import { jest } from '@jest/globals';

const joplin = {
    views: {
        dialogs: {
            showToast: jest.fn<() => Promise<void>>().mockResolvedValue(),
        },
    },
    commands: {
        execute: jest.fn<() => Promise<void>>().mockResolvedValue(),
    },
    workspace: {
        selectedNote: jest.fn<() => Promise<{ id: string }>>().mockResolvedValue({ id: 'test-note' }),
    },
};

export default joplin;
