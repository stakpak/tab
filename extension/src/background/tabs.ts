/**
 * Tab Management
 * Handles tab-related commands using the chrome.tabs API
 */

import type { TabParams, AgentResponse, TabInfo } from '../shared/types';

/**
 * Handle tab-related commands
 * @param params - Tab command parameters
 * @returns Response data
 */
export async function handleTabCommand(params: TabParams): Promise<Omit<AgentResponse, 'id'>> {
    const { action, url, tabId } = params;

    switch (action) {
        case 'new': {
            await chrome.tabs.create({ url });
            return { success: true, data: { executed: true } };
        }

        case 'list': {
            const tabs = await chrome.tabs.query({});
            const tabList: TabInfo[] = tabs.map((t) => ({
                id: t.id,
                url: t.url,
                title: t.title,
                active: t.active,
            }));
            return { success: true, data: { tabs: tabList } };
        }

        case 'close': {
            if (tabId === undefined) throw new Error('tabId required for close action');
            await chrome.tabs.remove(tabId);
            return { success: true, data: { executed: true } };
        }

        case 'switch': {
            if (tabId === undefined) throw new Error('tabId required for switch action');
            await chrome.tabs.update(tabId, { active: true });

            // Also ensure the window is focused if needed
            const tab = await chrome.tabs.get(tabId);
            if (tab.windowId) {
                await chrome.windows.update(tab.windowId, { focused: true });
            }
            return { success: true, data: { executed: true } };
        }

        default:
            throw new Error(`Unknown tab action: ${action}`);
    }
}
