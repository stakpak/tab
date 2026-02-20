/**
 * Validation utilities for browser-daemon
 */

import { CommandType, Command } from "./types.js";

/**
 * Valid command types for validation
 */
export const VALID_COMMAND_TYPES: Set<CommandType> = new Set([
    "navigate", "open", "back", "forward", "reload", "close",
    "snapshot", "click", "dblclick", "fill", "type", "press",
    "hover", "focus", "check", "uncheck", "select",
    "scroll", "scrollintoview", "get", "is", "find",
    "drag", "upload", "mouse", "wait",
    "tab", "tab_new", "tab_close", "tab_switch", "tab_list",
    "screenshot", "pdf"
]);

/**
 * Validate a command structure
 */
export function validateCommand(command: Command): boolean {
    if (!command.id || typeof command.id !== "string") return false;
    if (!command.sessionId || typeof command.sessionId !== "string") return false;
    if (!command.type || typeof command.type !== "string") return false;
    if (command.params !== undefined && (typeof command.params !== "object" || command.params === null)) {
        return false;
    }
    return VALID_COMMAND_TYPES.has(command.type);
}

/**
 * Validate session name format
 */
export function validateSessionName(name: string): boolean {
    if (!name || name.length === 0 || name.length > 64) return false;
    return /^[a-zA-Z0-9_-]+$/.test(name);
}
