/**
 * Test configuration and utilities
 *
 * Provides test-specific configuration and helper functions
 */

import type { DaemonConfig } from "../../src/types.js";

/**
 * Get a unique port for testing (to avoid conflicts between parallel tests)
 */
let portCounter = 19222;
export function getTestPort(): number {
  return portCounter++;
}

/**
 * Get a unique socket path for testing
 */
let socketCounter = 0;
export function getTestSocketPath(): string {
  return `/tmp/tab-test-${process.pid}-${socketCounter++}.sock`;
}

/**
 * Create a test configuration
 */
export function createTestConfig(overrides: Partial<DaemonConfig> = {}): DaemonConfig {
  return {
    ipcSocketPath: getTestSocketPath(),
    wsPort: getTestPort(),
    heartbeatInterval: 1000, // Faster heartbeat for tests
    heartbeatTimeout: 500,   // Faster timeout for tests
    ...overrides,
  };
}

/**
 * Wait for a condition to be true
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 50
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await sleep(interval);
  }
  throw new Error(`Condition not met within ${timeout}ms`);
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate a unique command ID
 */
let commandIdCounter = 0;
export function generateCommandId(): string {
  return `test-cmd-${Date.now()}-${commandIdCounter++}`;
}

/**
 * Generate a unique session ID
 */
let sessionIdCounter = 0;
export function generateSessionId(): string {
  return `test-session-${Date.now()}-${sessionIdCounter++}`;
}
