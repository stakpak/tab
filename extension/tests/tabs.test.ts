import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleTabCommand } from '../src/background/tabs';
import type { TabParams } from '../src/shared/types';

const chromeTabs = chrome.tabs as unknown as {
    query: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
};

const chromeWindows = chrome.windows as unknown as {
    update: ReturnType<typeof vi.fn>;
};

describe('handleTabCommand', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('handles "new" action', async () => {
        const params: TabParams = { action: 'new', url: 'https://example.com' };
        chromeTabs.create.mockResolvedValueOnce({ id: 1 });

        const response = await handleTabCommand(params, 1);

        expect(response.success).toBe(true);
        expect(chromeTabs.create).toHaveBeenCalledWith({ url: 'https://example.com', windowId: 1 });
    });

    it('handles "list" action', async () => {
        const params: TabParams = { action: 'list' };
        const mockTabs = [
            { id: 1, url: 'https://a.com', title: 'A', active: true },
            { id: 2, url: 'https://b.com', title: 'B', active: false },
        ];
        chromeTabs.query.mockResolvedValueOnce(mockTabs);

        const response = await handleTabCommand(params, 1);

        expect(response.success).toBe(true);
        expect(response.data).toEqual({ tabs: mockTabs, activeTabId: 1 });
        expect(chromeTabs.query).toHaveBeenCalledWith({ windowId: 1 });
    });

    it('handles "close" action', async () => {
        const params: TabParams = { action: 'close', tabId: 123 };
        chromeTabs.get.mockResolvedValueOnce({ id: 123, windowId: 1 });
        chromeTabs.remove.mockResolvedValueOnce(undefined);

        const response = await handleTabCommand(params, 1);

        expect(response.success).toBe(true);
        expect(chromeTabs.remove).toHaveBeenCalledWith(123);
    });

    it('handles "switch" action', async () => {
        const params: TabParams = { action: 'switch', tabId: 456 };
        chromeTabs.get.mockResolvedValueOnce({ id: 456, windowId: 1 });
        chromeTabs.update.mockResolvedValueOnce({ id: 456 });
        chromeWindows.update.mockResolvedValueOnce({});

        const response = await handleTabCommand(params, 1);

        expect(response.success).toBe(true);
        expect(chromeTabs.update).toHaveBeenCalledWith(456, { active: true });
        expect(chromeWindows.update).toHaveBeenCalledWith(1, { focused: true });
    });

    it('throws error for unknown action', async () => {
        const params = { action: 'invalid' } as any;
        await expect(handleTabCommand(params, 1)).rejects.toThrow('Unknown tab action: invalid');
    });

    it('throws error if tabId is missing for close', async () => {
        const params: TabParams = { action: 'close' };
        await expect(handleTabCommand(params, 1)).rejects.toThrow('tabId required for close action');
    });

    it('throws error if close tabId does not belong to current window', async () => {
        const params: TabParams = { action: 'close', tabId: 123 };
        chromeTabs.get.mockResolvedValueOnce({ id: 123, windowId: 2 });

        await expect(handleTabCommand(params, 1)).rejects.toThrow('tabId does not belong to the current window');
    });

    it('throws error if switch tabId does not belong to current window', async () => {
        const params: TabParams = { action: 'switch', tabId: 456 };
        chromeTabs.get.mockResolvedValueOnce({ id: 456, windowId: 2 });

        await expect(handleTabCommand(params, 1)).rejects.toThrow('tabId does not belong to the current window');
    });

    it('handles "list" action with no active tab', async () => {
        const params: TabParams = { action: 'list' };
        const mockTabs = [
            { id: 1, url: 'https://a.com', title: 'A', active: false },
            { id: 2, url: 'https://b.com', title: 'B', active: false },
        ];
        chromeTabs.query.mockResolvedValueOnce(mockTabs);

        const response = await handleTabCommand(params, 1);

        expect(response.success).toBe(true);
        expect(response.data).toEqual({ tabs: mockTabs, activeTabId: undefined });
    });
});
