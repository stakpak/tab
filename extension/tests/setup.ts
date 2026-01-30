import { vi } from 'vitest';

const chromeMock = {
  runtime: {
    lastError: undefined as { message: string } | undefined,
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
    get: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
    update: vi.fn(),
  },
  windows: {
    update: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn((key: string, callback: (result: Record<string, unknown>) => void) => {
        callback({});
      }),
      set: vi.fn((_data: Record<string, unknown>, callback: () => void) => {
        callback();
      }),
      remove: vi.fn((_key: string, callback: () => void) => {
        callback();
      }),
    },
  },
};

Object.defineProperty(globalThis, 'chrome', {
  value: chromeMock,
  writable: true,
});

if (typeof document !== 'undefined' && document.defaultView) {
  globalThis.window = document.defaultView;
  globalThis.InputEvent = document.defaultView.InputEvent;
}

class MockPointerEvent extends Event {
  clientX = 0;
  clientY = 0;
  screenX = 0;
  screenY = 0;
  button = 0;
  buttons = 0;
  isPrimary = false;

  constructor(type: string, init?: any) {
    super(type, init);
    if (init) {
      this.clientX = init.clientX ?? 0;
      this.clientY = init.clientY ?? 0;
      this.screenX = init.screenX ?? 0;
      this.screenY = init.screenY ?? 0;
      this.button = init.button ?? 0;
      this.buttons = init.buttons ?? 0;
      this.isPrimary = init.isPrimary ?? false;
    }
  }
}

globalThis.PointerEvent = MockPointerEvent as unknown as typeof PointerEvent;

class MockMouseEvent extends Event {
  clientX = 0;
  clientY = 0;
  screenX = 0;
  screenY = 0;
  button = 0;
  buttons = 0;

  constructor(type: string, init?: MouseEventInit) {
    super(type, init);
    if (init) {
      this.clientX = init.clientX ?? 0;
      this.clientY = init.clientY ?? 0;
      this.screenX = init.screenX ?? 0;
      this.screenY = init.screenY ?? 0;
      this.button = init.button ?? 0;
      this.buttons = init.buttons ?? 0;
    }
  }
}

globalThis.MouseEvent = MockMouseEvent as unknown as typeof MouseEvent;

if (typeof Element !== 'undefined') {
  Element.prototype.scrollIntoView = vi.fn();
}

if (typeof HTMLElement !== 'undefined') {
  Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
    get() {
      return document.body;
    },
  });
}
