// Test setup file
import { jest } from '@jest/globals';

// Mock DOM APIs that might be used in the plugin
const createMockDocument = (html: string) => ({
    querySelectorAll: jest.fn().mockReturnValue([]),
    getElementById: jest.fn().mockReturnValue(null),
    body: {
        innerHTML: html.replace(/<\/?html>|<\/?body>/gi, ''),
        querySelectorAll: jest.fn().mockReturnValue([]),
    },
});

// Mock DOMParser in global scope for Node environment
Object.defineProperty(global, 'DOMParser', {
    writable: true,
    value: jest.fn().mockImplementation(() => ({
        parseFromString: jest.fn().mockImplementation((html: string) => {
            return createMockDocument(html);
        }),
    })),
});

// Ensure globalThis is available
(global as unknown as { globalThis: unknown }).globalThis = global;

// Add console.debug and console.warn if they don't exist (for Node.js environment)
if (!console.debug) {
    console.debug = jest.fn();
}
if (!console.warn) {
    console.warn = jest.fn();
}
