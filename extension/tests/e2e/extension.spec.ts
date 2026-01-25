import { test, expect, chromium, BrowserContext } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { MockWebSocketServer } from './helpers/mock-server';

const EXTENSION_PATH = path.resolve(__dirname, '../..');
const TEST_PAGE_PATH = path.resolve(__dirname, 'fixtures/test-page.html');

// =============================================================================
// POPUP UI TESTS
// =============================================================================

test.describe('Popup UI', () => {
  test('renders title and initial state', async () => {
    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/dist/popup.html`);

      await expect(page.locator('h1')).toHaveText('LLM Browser Agent');
      await expect(page.locator('#ws-url')).toHaveValue('ws://localhost:8080');
      await expect(page.locator('#connect-btn')).toBeVisible();
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('connects and disconnects from WebSocket server', async () => {
    const mockServer = new MockWebSocketServer({ port: 8081 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);
      const page = await context.newPage();
      await page.goto(`chrome-extension://${extensionId}/dist/popup.html`);

      // Update URL to test server
      await page.locator('#ws-url').fill('ws://localhost:8081');
      await page.locator('#save-url-btn').click();

      // Connect
      await page.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);
      await expect(page.locator('#status-text')).toHaveText('Connected', { timeout: 5000 });

      // Disconnect
      await page.locator('#disconnect-btn').click();
      await expect(page.locator('#status-text')).toHaveText('Disconnected', { timeout: 5000 });
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// SNAPSHOT TESTS
// =============================================================================

test.describe('Snapshot Command', () => {
  test('generates snapshot with refs', async () => {
    const mockServer = new MockWebSocketServer({ port: 8082 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      // Connect via popup
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8082');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      // Open test page
      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Send snapshot command
      const response = await mockServer.sendCommandAndWaitForResponse({
        id: 'snap-1',
        type: 'snapshot',
      });

      const result = response as { success: boolean; data?: { snapshot: string; title: string } };
      expect(result.success).toBe(true);
      expect(result.data?.snapshot).toContain('RootWebArea');
      expect(result.data?.snapshot).toContain('E2E Test Page');
      expect(result.data?.snapshot).toMatch(/\[ref=e\d+\]/);
      expect(result.data?.title).toBe('E2E Test Page');
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// CLICK TESTS
// =============================================================================

test.describe('Click Command', () => {
  test('clicks button and triggers handler', async () => {
    const mockServer = new MockWebSocketServer({ port: 8083 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      // Connect
      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8083');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      // Open test page
      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Get snapshot
      const snapResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'click-snap',
        type: 'snapshot',
      });
      const snapshot = (snapResp as { data?: { snapshot: string } }).data?.snapshot || '';

      // Find button ref
      const buttonMatch = snapshot.match(/button "Test Button" \[ref=(e\d+)\]/);
      expect(buttonMatch).toBeTruthy();

      // Click button
      const clickResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'click-1',
        type: 'click',
        params: { ref: buttonMatch![1] },
      });

      expect((clickResp as { success: boolean }).success).toBe(true);
      await expect(testPage.locator('#click-result')).toHaveText('Button clicked!');
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('returns error for invalid ref', async () => {
    const mockServer = new MockWebSocketServer({ port: 8084 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8084');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Snapshot first
      await mockServer.sendCommandAndWaitForResponse({ id: 'snap', type: 'snapshot' });

      // Click invalid ref
      const resp = await mockServer.sendCommandAndWaitForResponse({
        id: 'bad-click',
        type: 'click',
        params: { ref: 'e99999' },
      });

      const result = resp as { success: boolean; error?: string };
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// FILL TESTS
// =============================================================================

test.describe('Fill Command', () => {
  test('fills text input', async () => {
    const mockServer = new MockWebSocketServer({ port: 8085 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8085');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Snapshot
      const snapResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'fill-snap',
        type: 'snapshot',
      });
      const snapshot = (snapResp as { data?: { snapshot: string } }).data?.snapshot || '';

      // Find input ref
      const inputMatch = snapshot.match(/textbox "Enter text here" \[ref=(e\d+)\]/);
      expect(inputMatch).toBeTruthy();

      // Fill
      const fillResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'fill-1',
        type: 'fill',
        params: { ref: inputMatch![1], value: 'Hello World' },
      });

      expect((fillResp as { success: boolean }).success).toBe(true);
      await expect(testPage.locator('#text-input')).toHaveValue('Hello World');
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('fills form and submits', async () => {
    const mockServer = new MockWebSocketServer({ port: 8086 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8086');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Snapshot
      const snapResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'form-snap',
        type: 'snapshot',
      });
      const snapshot = (snapResp as { data?: { snapshot: string } }).data?.snapshot || '';

      // Find refs
      const usernameMatch = snapshot.match(/textbox "Username" \[ref=(e\d+)\]/);
      const submitMatch = snapshot.match(/button "Submit" \[ref=(e\d+)\]/);
      expect(usernameMatch).toBeTruthy();
      expect(submitMatch).toBeTruthy();

      // Fill username
      await mockServer.sendCommandAndWaitForResponse({
        id: 'fill-user',
        type: 'fill',
        params: { ref: usernameMatch![1], value: 'testuser' },
      });

      // Click submit
      await mockServer.sendCommandAndWaitForResponse({
        id: 'click-submit',
        type: 'click',
        params: { ref: submitMatch![1] },
      });

      await expect(testPage.locator('#form-result')).toHaveText('Submitted: testuser');
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('types text into input (appending)', async () => {
    const mockServer = new MockWebSocketServer({ port: 8087 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8087');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Snapshot
      const snapResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'type-snap',
        type: 'snapshot',
      });
      const snapshot = (snapResp as { data?: { snapshot: string } }).data?.snapshot || '';

      // Find input ref
      const inputMatch = snapshot.match(/textbox "Enter text here" \[ref=(e\d+)\]/);
      expect(inputMatch).toBeTruthy();
      const ref = inputMatch![1];

      // Fill first
      await mockServer.sendCommandAndWaitForResponse({
        id: 'fill-initial',
        type: 'fill',
        params: { ref, value: 'Initial' },
      });

      // Type (should append)
      const typeResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'type-1',
        type: 'type',
        params: { ref, text: ' Appended' },
      });

      const typeResult = typeResp as { success: boolean; error?: string };
      expect(typeResult.success, typeResult.error).toBe(true);
      await expect(testPage.locator('#text-input')).toHaveValue('Initial Appended');
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('checks and unchecks checkbox', async () => {
    const mockServer = new MockWebSocketServer({ port: 8088 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8088');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Snapshot
      const snapResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'check-snap',
        type: 'snapshot',
      });
      const snapshot = (snapResp as { data?: { snapshot: string } }).data?.snapshot || '';

      // Find checkbox ref
      const checkMatch = snapshot.match(/checkbox "Check me" \[ref=(e\d+)\]/);
      expect(checkMatch).toBeTruthy();
      const ref = checkMatch![1];

      // Check
      const checkResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'check-1',
        type: 'check',
        params: { ref },
      });
      expect((checkResp as any).success).toBe(true);
      await expect(testPage.locator('#checkbox-input')).toBeChecked();

      // Uncheck
      const uncheckResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'uncheck-1',
        type: 'uncheck',
        params: { ref },
      });
      expect((uncheckResp as any).success).toBe(true);
      await expect(testPage.locator('#checkbox-input')).not.toBeChecked();
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('selects option in dropdown', async () => {
    const mockServer = new MockWebSocketServer({ port: 8089 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8089');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Snapshot
      const snapResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'select-snap',
        type: 'snapshot',
      });
      const snapshot = (snapResp as { data?: { snapshot: string } }).data?.snapshot || '';

      // Find select ref
      const selectMatch = snapshot.match(/combobox "Select an option" \[ref=(e\d+)\]/);
      expect(selectMatch).toBeTruthy();
      const ref = selectMatch![1];

      // Select by value
      const selectResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'select-1',
        type: 'select',
        params: { ref, value: 'option2' },
      });
      expect((selectResp as any).success).toBe(true);
      await expect(testPage.locator('#select-input')).toHaveValue('option2');

      // Select by text
      const selectResp2 = await mockServer.sendCommandAndWaitForResponse({
        id: 'select-2',
        type: 'select',
        params: { ref, value: 'Option 3' },
      });
      expect((selectResp2 as any).success).toBe(true);
      await expect(testPage.locator('#select-input')).toHaveValue('option3');
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('navigates to URL using open command', async () => {
    const mockServer = new MockWebSocketServer({ port: 8090 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8090');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto('about:blank');
      await testPage.bringToFront();

      // Navigate
      const openResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'open-1',
        type: 'open',
        params: { url: `file://${TEST_PAGE_PATH}` },
      });
      const openResult = openResp as { success: boolean; error?: string };
      expect(openResult.success, openResult.error).toBe(true);

      // Wait for navigation and verify
      await testPage.waitForURL(`file://${TEST_PAGE_PATH}`);
      await expect(testPage.locator('h1')).toHaveText('E2E Test Page');
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('double-clicks an element', async () => {
    const mockServer = new MockWebSocketServer({ port: 8091 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8091');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Snapshot
      const snapResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'dbl-snap',
        type: 'snapshot',
      });
      const snapshot = (snapResp as { data?: { snapshot: string } }).data?.snapshot || '';

      // Find button ref
      const btnMatch = snapshot.match(/button "Double Click Me" \[ref=(e\d+)\]/);
      expect(btnMatch).toBeTruthy();
      const ref = btnMatch![1];

      // Double click
      const dblResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'dbl-1',
        type: 'dblclick',
        params: { ref },
      });
      expect((dblResp as any).success).toBe(true);
      await expect(testPage.locator('#click-result')).toHaveText('Double clicked!');
    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('gets info and checks state', async () => {
    const mockServer = new MockWebSocketServer({ port: 8092 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8092');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Snapshot
      const snapResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'info-snap',
        type: 'snapshot',
      });
      const snapshot = (snapResp as { data?: { snapshot: string } }).data?.snapshot || '';

      // Find input ref
      const inputMatch = snapshot.match(/textbox "Enter text here" \[ref=(e\d+)\]/);
      if (!inputMatch) {
        console.log('Snapshot:', snapshot);
      }
      expect(inputMatch).toBeTruthy();
      const ref = inputMatch![1];

      // Get value
      await testPage.locator('#text-input').fill('E2E Value');
      const getValResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'get-val',
        type: 'get',
        params: { what: 'value', ref },
      });
      const getValResult = getValResp as any;
      if (!getValResult.success) {
        console.log('Get Value Response:', getValResult);
      }
      expect(getValResult.data.result).toBe('E2E Value');

      // Get title
      const getTitleResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'get-title',
        type: 'get',
        params: { what: 'title' },
      });
      expect((getTitleResp as any).data.result).toBe('E2E Test Page');

      // Is visible
      const isVisibleResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'is-visible',
        type: 'is',
        params: { what: 'visible', ref },
      });
      expect((isVisibleResp as any).data.result).toBe(true);

      // Is checked
      const checkMatch = snapshot.match(/checkbox "Check me" \[ref=(e\d+)\]/);
      const checkRef = checkMatch![1];
      await testPage.locator('#checkbox-input').check();
      const isCheckedResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'is-checked',
        type: 'is',
        params: { what: 'checked', ref: checkRef },
      });
      expect((isCheckedResp as any).data.result).toBe(true);

    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('handles navigation and eval commands', async () => {
    const mockServer = new MockWebSocketServer({ port: 8093 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8093');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Eval
      const evalResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'eval-1',
        type: 'eval',
        params: { script: 'return 1 + 1' },
      });
      const evalResult = evalResp as any;
      if (!evalResult.success) {
        console.log('Eval Response:', evalResult);
      }
      expect(evalResult.data.result).toBe(2);

      // Reload
      const reloadResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'reload-1',
        type: 'reload',
      });
      expect((reloadResp as any).success).toBe(true);
      await testPage.waitForLoadState('load');
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Navigation (Back/Forward)
      await testPage.goto('about:blank');
      await testPage.waitForURL('about:blank');

      const backResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'back-1',
        type: 'back',
      });
      expect((backResp as any).success).toBe(true);
      await testPage.waitForURL(`file://${TEST_PAGE_PATH}`);

      const forwardResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'forward-1',
        type: 'forward',
      });
      expect((forwardResp as any).success).toBe(true);
      await testPage.waitForURL('about:blank');

    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });

  test('handles find and mouse commands', async () => {
    const mockServer = new MockWebSocketServer({ port: 8094 });
    await mockServer.start();

    const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-ext-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    });

    try {
      const extensionId = await getExtensionId(context);

      const popupPage = await context.newPage();
      await popupPage.goto(`chrome-extension://${extensionId}/dist/popup.html`);
      await popupPage.locator('#ws-url').fill('ws://localhost:8094');
      await popupPage.locator('#save-url-btn').click();
      await popupPage.locator('#connect-btn').click();
      await mockServer.waitForConnection(5000);

      const testPage = await context.newPage();
      await testPage.goto(`file://${TEST_PAGE_PATH}`);
      await testPage.bringToFront();

      // Find by role
      const findResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'find-1',
        type: 'find',
        params: { locator: 'role', value: 'button', text: 'Test Button' },
      });
      const findResult = findResp as any;
      if (!findResult.success) {
        console.log('Find Response:', findResult);
      }
      const ref = findResult.data.result;
      expect(ref).toBeTruthy();

      // Mouse move
      const mouseResp = await mockServer.sendCommandAndWaitForResponse({
        id: 'mouse-1',
        type: 'mouse',
        params: { action: 'move', x: 100, y: 100 },
      });
      expect((mouseResp as any).success).toBe(true);

    } finally {
      await context.close();
      await mockServer.stop();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  });
});

// =============================================================================
// HELPERS
// =============================================================================

async function getExtensionId(context: BrowserContext): Promise<string> {
  const existingWorkers = context.serviceWorkers();
  if (existingWorkers.length > 0) {
    return new URL(existingWorkers[0].url()).host;
  }
  const serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10000 });
  return new URL(serviceWorker.url()).host;
}
