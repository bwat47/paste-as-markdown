// Test setup file
import { jest } from '@jest/globals';

// Add console.debug and console.warn if they don't exist (for Node.js environment)
if (!console.debug) {
    console.debug = jest.fn();
}
if (!console.warn) {
    console.warn = jest.fn();
}
