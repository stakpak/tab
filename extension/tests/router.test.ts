import { beforeEach, describe, expect, it, vi } from 'vitest';
import { routeCommand } from '../src/background/router';
import type { AgentCommand } from '../src/shared/types';

const chromeTabs = chrome.tabs as unknown as {
  query: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  sendMessage: ReturnType<typeof vi.fn>;
};

describe('routeCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chrome.runtime.lastError = undefined;
  });

  it('routes click to the last snapshot tab', async () => {
    const firstTab = { id: 11, url: 'https://example.com' } as chrome.tabs.Tab;
    const secondTab = { id: 22, url: 'https://other.com' } as chrome.tabs.Tab;

    chromeTabs.query.mockResolvedValueOnce([firstTab]);
    chromeTabs.get.mockResolvedValueOnce(firstTab);
    chromeTabs.sendMessage.mockImplementation((_tabId, _req, callback) => {
      callback?.({ success: true, data: { snapshot: 'snapshot', url: 'https://example.com', title: 'Example' } });
    });

    const snapshotCommand: AgentCommand = { id: '1', type: 'snapshot' };
    await routeCommand(snapshotCommand);
    expect(chromeTabs.sendMessage).toHaveBeenCalledWith(11, expect.anything(), expect.anything());

    chromeTabs.query.mockResolvedValueOnce([secondTab]);
    chromeTabs.get.mockResolvedValueOnce(firstTab);
    chromeTabs.sendMessage.mockImplementation((_tabId, _req, callback) => {
      callback?.({ success: true, data: { executed: true } });
    });

    const clickCommand: AgentCommand = { id: '2', type: 'click', params: { ref: 'e1' } };
    await routeCommand(clickCommand);
    expect(chromeTabs.sendMessage).toHaveBeenLastCalledWith(11, expect.anything(), expect.anything());
  });
});
