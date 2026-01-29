# LLM Browser Agent Extension

A Chrome extension that enables an external AI Agent to control the browser via WebSocket.

## Documentation

*   **[Architecture](./ARCHITECTURE.md)**: Detailed technical overview of the extension's design, components, and data flow.

## Setup

1.  **Install Dependencies**:
    ```bash
    npm install
    ```

2.  **Build**:
    ```bash
    npm run build
    ```
    This will generate the `dist/` directory containing the unpacked extension.

3.  **Load in Chrome**:
    *   Open `chrome://extensions/`
    *   Enable "Developer mode"
    *   Click "Load unpacked"
    *   Select the `dist/` directory

4.  **Development**:
    *   Run `npm run watch` to automatically rebuild on changes.
    *   Run `npm test` to execute unit tests.

## Features

*   **WebSocket Bridge**: Connects to a local agent server (default `ws://localhost:8080`).
*   **DOM Snapshotting**: Generates AI-friendly text representations of the page.
*   **Ref-Based Interaction**: Uses stable references (`e1`, `e2`) for reliable clicking and typing.
*   **Multi-Tab Support**: Automatically routes commands to the active or relevant tab.
