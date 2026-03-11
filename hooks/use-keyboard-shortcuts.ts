"use client";

import { useEffect, useRef } from "react";

/**
 * Keyboard modifier keys
 */
type ModifierKey = "ctrl" | "shift" | "alt" | "meta";

/**
 * Keyboard shortcut configuration
 */
interface ShortcutConfig {
  /**
   * The key to trigger (e.g., "k", "b", "Escape")
   */
  key: string;
  
  /**
   * Modifier keys (Ctrl, Shift, Alt, Meta/Cmd)
   */
  modifiers?: ModifierKey[];
  
  /**
   * Callback to execute when shortcut is triggered
   */
  callback: (event: KeyboardEvent) => void;
  
  /**
   * Description of what the shortcut does
   */
  description?: string;
  
  /**
   * Whether to prevent default browser behavior
   * @default true
   */
  preventDefault?: boolean;
  
  /**
   * Whether the shortcut is enabled
   * @default true
   */
  enabled?: boolean;
  
  /**
   * Elements to ignore (e.g., don't trigger in input fields)
   * @default ["INPUT", "TEXTAREA", "SELECT"]
   */
  ignoreElements?: string[];
}

/**
 * Global keyboard shortcuts registry
 */
const SHORTCUT_REGISTRY = new Map<string, ShortcutConfig>();

/**
 * Get shortcut key for display
 */
function getShortcutKey(config: ShortcutConfig): string {
  const modifiers = config.modifiers ?? [];
  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC");
  
  const modifierSymbols = modifiers.map((mod) => {
    switch (mod) {
      case "ctrl":
        return isMac ? "⌃" : "Ctrl";
      case "shift":
        return isMac ? "⇧" : "Shift";
      case "alt":
        return isMac ? "⌥" : "Alt";
      case "meta":
        return isMac ? "⌘" : "Win";
      default:
        return "";
    }
  });
  
  const key = config.key.length === 1 ? config.key.toUpperCase() : config.key;
  
  return [...modifierSymbols, key].join(isMac ? "" : "+");
}

/**
 * Check if modifier keys match
 */
function modifiersMatch(event: KeyboardEvent, modifiers: ModifierKey[]): boolean {
  const hasCtrl = modifiers.includes("ctrl");
  const hasShift = modifiers.includes("shift");
  const hasAlt = modifiers.includes("alt");
  const hasMeta = modifiers.includes("meta");
  
  return (
    (!hasCtrl || event.ctrlKey) &&
    (!hasShift || event.shiftKey) &&
    (!hasAlt || event.altKey) &&
    (!hasMeta || event.metaKey) &&
    (hasCtrl === event.ctrlKey || !hasCtrl) &&
    (hasShift === event.shiftKey || !hasShift) &&
    (hasAlt === event.altKey || !hasAlt) &&
    (hasMeta === event.metaKey || !hasMeta)
  );
}

/**
 * Register a global keyboard shortcut
 * 
 * @example
 * ```tsx
 * useKeyboardShortcut({
 *   key: "k",
 *   modifiers: ["meta"],
 *   callback: () => setSearchOpen(true),
 *   description: "Open search"
 * });
 * ```
 */
export function useKeyboardShortcut(config: ShortcutConfig) {
  const callbackRef = useRef(config.callback);
  
  // Update callback ref when it changes
  useEffect(() => {
    callbackRef.current = config.callback;
  }, [config.callback]);
  
  useEffect(() => {
    const {
      key,
      modifiers = [],
      preventDefault = true,
      enabled = true,
      ignoreElements = ["INPUT", "TEXTAREA", "SELECT"],
      description,
    } = config;
    
    if (!enabled) return;
    
    const handler = (event: KeyboardEvent) => {
      // Ignore shortcuts when typing in form elements
      const targetElement = event.target as HTMLElement;
      if (ignoreElements.includes(targetElement.tagName)) {
        return;
      }
      
      // Check if key and modifiers match
      const keyMatch = event.key.toLowerCase() === key.toLowerCase();
      const modMatch = modifiersMatch(event, modifiers);
      
      if (keyMatch && modMatch) {
        if (preventDefault) {
          event.preventDefault();
          event.stopPropagation();
        }
        callbackRef.current(event);
      }
    };
    
    document.addEventListener("keydown", handler);
    
    // Register shortcut for display
    const shortcutId = `${modifiers.join("+")}+${key}`;
    const registryConfig: ShortcutConfig = {
      key,
      modifiers,
      callback: callbackRef.current,
      description,
      preventDefault,
      enabled,
      ignoreElements,
    };
    SHORTCUT_REGISTRY.set(shortcutId, registryConfig);
    
    return () => {
      document.removeEventListener("keydown", handler);
      SHORTCUT_REGISTRY.delete(shortcutId);
    };
  }, [config]);
}

/**
 * Hook to register multiple keyboard shortcuts at once
 * 
 * @example
 * ```tsx
 * useKeyboardShortcuts([
 *   { key: "k", modifiers: ["meta"], callback: openSearch },
 *   { key: "b", modifiers: ["meta"], callback: openCart },
 *   { key: "/", callback: focusSearch }
 * ]);
 * ```
 */
export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  shortcuts.forEach((shortcut) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useKeyboardShortcut(shortcut);
  });
}

/**
 * Get all registered shortcuts (for displaying help)
 */
export function getRegisteredShortcuts(): Array<{
  key: string;
  description: string;
}> {
  return Array.from(SHORTCUT_REGISTRY.values())
    .filter((config) => config.description)
    .map((config) => ({
      key: getShortcutKey(config),
      description: config.description!,
    }));
}

/**
 * Hook to get all registered shortcuts (reactive)
 */
export function useRegisteredShortcuts() {
  return getRegisteredShortcuts();
}

/**
 * Common keyboard shortcuts for the app
 */
export const COMMON_SHORTCUTS = {
  SEARCH: { key: "k", modifiers: ["meta"] as ModifierKey[] },
  CART: { key: "b", modifiers: ["meta"] as ModifierKey[] },
  HELP: { key: "?", modifiers: ["shift"] as ModifierKey[] },
  ESCAPE: { key: "Escape", modifiers: [] as ModifierKey[] },
  FOCUS_SEARCH: { key: "/", modifiers: [] as ModifierKey[] },
  TOGGLE_THEME: { key: "d", modifiers: ["meta"] as ModifierKey[] },
  GO_HOME: { key: "h", modifiers: ["meta"] as ModifierKey[] },
  GO_ACCOUNT: { key: "u", modifiers: ["meta"] as ModifierKey[] },
  GO_ORDERS: { key: "o", modifiers: ["meta"] as ModifierKey[] },
} as const;
