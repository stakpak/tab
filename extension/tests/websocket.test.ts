import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createWebSocketManager } from '../src/background/websocket';
import type { ExtensionConfig } from '../src/shared/types';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(public url: string) {}

  send = vi.fn();
  close = vi.fn();
}

describe('websocket manager', () => {
  const config: ExtensionConfig = {
    websocketUrl: 'ws://localhost:8080',
    reconnectInterval: 10,
    maxReconnectAttempts: 3,
    heartbeatInterval: 1000,
    heartbeatTimeout: 100,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
  });

  it('clears reconnect timer when connecting', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

    const manager = createWebSocketManager(config, async () => ({ id: '1', success: true }));
    manager.attemptReconnect();

    expect(setTimeoutSpy).toHaveBeenCalledTimes(1);

    manager.connect();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });

  it('does not schedule reconnect while connecting', () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const manager = createWebSocketManager(config, async () => ({ id: '1', success: true }));

    manager.connect();
    manager.attemptReconnect();

    expect(setTimeoutSpy).not.toHaveBeenCalled();
  });
});
