import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import {
  useKeyboardShortcut,
  useKeyboardShortcuts,
  getRegisteredShortcuts,
  COMMON_SHORTCUTS,
} from "@/hooks/use-keyboard-shortcuts";

describe("useKeyboardShortcut", () => {
  let callback: (event: KeyboardEvent) => void;

  beforeEach(() => {
    callback = vi.fn() as (event: KeyboardEvent) => void;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("triggers callback when shortcut is pressed", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta"],
        callback,
      })
    );

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
    });
    document.dispatchEvent(event);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not trigger callback when only key is pressed without modifiers", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta"],
        callback,
      })
    );

    const event = new KeyboardEvent("keydown", { key: "k" });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });

  it("triggers callback with multiple modifiers", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["ctrl", "shift"],
        callback,
      })
    );

    const event = new KeyboardEvent("keydown", {
      key: "k",
      ctrlKey: true,
      shiftKey: true,
    });
    document.dispatchEvent(event);

    expect(callback).toHaveBeenCalledTimes(1);
  });

  it("does not trigger when typing in input field", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta"],
        callback,
      })
    );

    const input = document.createElement("input");
    document.body.appendChild(input);

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
      bubbles: true,
    });
    Object.defineProperty(event, "target", { value: input, enumerable: true });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();

    document.body.removeChild(input);
  });

  it("does not trigger when disabled", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta"],
        callback,
        enabled: false,
      })
    );

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
    });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });

  it("cleans up on unmount", () => {
    const { unmount } = renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta"],
        callback,
      })
    );

    unmount();

    const event = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
    });
    document.dispatchEvent(event);

    expect(callback).not.toHaveBeenCalled();
  });

  it("registers shortcut with description", () => {
    renderHook(() =>
      useKeyboardShortcut({
        key: "k",
        modifiers: ["meta"],
        callback,
        description: "Open search",
      })
    );

    const shortcuts = getRegisteredShortcuts();
    const searchShortcut = shortcuts.find((s) => s.description === "Open search");

    expect(searchShortcut).toBeDefined();
    expect(searchShortcut?.key).toContain("K");
  });
});

describe("useKeyboardShortcuts", () => {
  it("registers multiple shortcuts", () => {
    const callback1 = vi.fn() as (event: KeyboardEvent) => void;
    const callback2 = vi.fn() as (event: KeyboardEvent) => void;

    renderHook(() =>
      useKeyboardShortcuts([
        { key: "k", modifiers: ["meta"], callback: callback1 },
        { key: "b", modifiers: ["meta"], callback: callback2 },
      ])
    );

    const event1 = new KeyboardEvent("keydown", {
      key: "k",
      metaKey: true,
    });
    document.dispatchEvent(event1);

    expect(callback1).toHaveBeenCalledTimes(1);
    expect(callback2).not.toHaveBeenCalled();

    const event2 = new KeyboardEvent("keydown", {
      key: "b",
      metaKey: true,
    });
    document.dispatchEvent(event2);

    expect(callback2).toHaveBeenCalledTimes(1);
  });
});

describe("COMMON_SHORTCUTS", () => {
  it("defines search shortcut", () => {
    expect(COMMON_SHORTCUTS.SEARCH).toEqual({
      key: "k",
      modifiers: ["meta"],
    });
  });

  it("defines cart shortcut", () => {
    expect(COMMON_SHORTCUTS.CART).toEqual({
      key: "b",
      modifiers: ["meta"],
    });
  });

  it("defines help shortcut", () => {
    expect(COMMON_SHORTCUTS.HELP).toEqual({
      key: "?",
      modifiers: ["shift"],
    });
  });

  it("defines escape shortcut", () => {
    expect(COMMON_SHORTCUTS.ESCAPE).toEqual({
      key: "Escape",
      modifiers: [],
    });
  });
});
