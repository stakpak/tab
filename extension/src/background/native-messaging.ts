/**
 * Native Messaging Module
 * 
 * Handles one-shot native messaging requests to the daemon for endpoint discovery.
 * Used only for bootstrap and recovery - never for steady-state communication.
 */

// =============================================================================
// Types
// =============================================================================

export interface BrowserEndpoint {
  ip: string;
  port: number;
}

export interface RegistrationResponse {
  ip: string;
  port: number;
  sessionId: string;
}

interface NativeMessageRequest {
  type: 'get_browser_endpoint' | 'register_extension';
}

interface NativeMessageResponse {
  ip: string;
  port: number;
  sessionId?: string;
}

interface NativeMessageErrorResponse {
  error: string;
}

/**
 * Native host name - must match the name in the native messaging manifest
 */
const NATIVE_HOST_NAME = 'com.stakpak.tab_daemon';

// =============================================================================
// Public API
// =============================================================================

/**
 * Check if native messaging is available in this browser context.
 */
export function isNativeMessagingAvailable(): boolean {
  return !!(
    typeof chrome !== 'undefined' &&
    chrome.runtime &&
    typeof chrome.runtime.sendNativeMessage === 'function'
  );
}

/**
 * Request the daemon's WebSocket endpoint via native messaging.
 * This is a one-shot request - the native host exits after responding.
 * 
 * @returns Promise resolving to the browser endpoint (ip, port)
 * @throws Error if native messaging fails or daemon is unavailable
 */
export function requestDaemonEndpoint(): Promise<BrowserEndpoint> {
  return new Promise((resolve, reject) => {
    if (!isNativeMessagingAvailable()) {
      reject(new Error('Native messaging is not available'));
      return;
    }

    const request: NativeMessageRequest = { type: 'get_browser_endpoint' };

    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      request,
      (response: NativeMessageResponse | NativeMessageErrorResponse | undefined) => {
        // Check for Chrome runtime error
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Native messaging failed'));
          return;
        }

        // Check for empty response
        if (!response) {
          reject(new Error('Empty response from native host'));
          return;
        }

        // Check for error response
        if ('error' in response) {
          reject(new Error(response.error));
          return;
        }

        // Validate response structure
        if (typeof response.ip !== 'string' || typeof response.port !== 'number') {
          reject(new Error('Invalid response format from native host'));
          return;
        }

        resolve({ ip: response.ip, port: response.port });
      }
    );
  });
}

/**
 * Register extension with daemon and get assigned session.
 * This is used when the daemon launches a browser and waits for the extension to connect.
 * 
 * @returns Promise resolving to registration response (sessionId, ip, port)
 * @throws Error if native messaging fails or daemon is unavailable
 */
export function registerExtension(): Promise<RegistrationResponse> {
  return new Promise((resolve, reject) => {
    if (!isNativeMessagingAvailable()) {
      reject(new Error('Native messaging is not available'));
      return;
    }

    const request: NativeMessageRequest = { type: 'register_extension' };

    chrome.runtime.sendNativeMessage(
      NATIVE_HOST_NAME,
      request,
      (response: NativeMessageResponse | NativeMessageErrorResponse | undefined) => {
        // Check for Chrome runtime error
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message || 'Native messaging failed'));
          return;
        }

        // Check for empty response
        if (!response) {
          reject(new Error('Empty response from native host'));
          return;
        }

        // Check for error response
        if ('error' in response) {
          reject(new Error(response.error));
          return;
        }

        // Validate response structure
        if (
          typeof response.ip !== 'string' ||
          typeof response.port !== 'number' ||
          typeof response.sessionId !== 'string'
        ) {
          reject(new Error('Invalid registration response format from native host'));
          return;
        }

        resolve({ ip: response.ip, port: response.port, sessionId: response.sessionId });
      }
    );
  });
}
