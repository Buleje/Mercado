import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  usePreferences,
  exportPreferences,
  importPreferences,
  clearPreferences,
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "@/hooks/use-preferences";

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, "localStorage", {
  value: localStorageMock,
  writable: true,
});

// Mock StorageEvent
const dispatchStorageEvent = (key: string, newValue: string | null) => {
  const event = new StorageEvent("storage", {
    key,
    newValue,
    url: window.location.href,
  });
  window.dispatchEvent(event);
};

describe("usePreferences", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("initializes with default preferences", () => {
    const { result } = renderHook(() => usePreferences());

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it("loads stored preferences from localStorage", () => {
    const stored: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      theme: "dark",
      compactMode: true,
    };
    localStorageMock.setItem("user-preferences", JSON.stringify(stored));

    const { result } = renderHook(() => usePreferences());

    expect(result.current.preferences.theme).toBe("dark");
    expect(result.current.preferences.compactMode).toBe(true);
  });

  it("updates a single preference", () => {
    const { result } = renderHook(() => usePreferences());

    act(() => {
      result.current.updatePreference("theme", "dark");
    });

    expect(result.current.preferences.theme).toBe("dark");
    
    // Should persist to localStorage
    const stored = localStorageMock.getItem("user-preferences");
    expect(stored).toBeTruthy();
    const parsed = JSON.parse(stored!) as UserPreferences;
    expect(parsed.theme).toBe("dark");
  });

  it("updates multiple preferences at once", () => {
    const { result } = renderHook(() => usePreferences());

    act(() => {
      result.current.updatePreferences({
        theme: "dark",
        language: "en",
        compactMode: true,
      });
    });

    expect(result.current.preferences.theme).toBe("dark");
    expect(result.current.preferences.language).toBe("en");
    expect(result.current.preferences.compactMode).toBe(true);
  });

  it("resets preferences to defaults", () => {
    const { result } = renderHook(() => usePreferences());

    // First, update some preferences
    act(() => {
      result.current.updatePreferences({
        theme: "dark",
        language: "en",
      });
    });

    expect(result.current.preferences.theme).toBe("dark");

    // Reset to defaults
    act(() => {
      result.current.resetPreferences();
    });

    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
  });

  it("gets a specific preference value", () => {
    const { result } = renderHook(() => usePreferences());

    act(() => {
      result.current.updatePreference("fontSize", "large");
    });

    const fontSize = result.current.getPreference("fontSize");
    expect(fontSize).toBe("large");
  });

  it("syncs across tabs via storage event", () => {
    const { result } = renderHook(() => usePreferences());

    // Simulate another tab updating preferences
    const newPreferences: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      theme: "dark",
    };

    act(() => {
      dispatchStorageEvent("user-preferences", JSON.stringify(newPreferences));
    });

    expect(result.current.preferences.theme).toBe("dark");
  });

  it("merges stored preferences with defaults", () => {
    // Store partial preferences (missing some keys)
    const partial = {
      theme: "dark",
      language: "en",
    };
    localStorageMock.setItem("user-preferences", JSON.stringify(partial));

    const { result } = renderHook(() => usePreferences());

    // Should have stored values
    expect(result.current.preferences.theme).toBe("dark");
    expect(result.current.preferences.language).toBe("en");
    
    // Should have default values for missing keys
    expect(result.current.preferences.compactMode).toBe(DEFAULT_PREFERENCES.compactMode);
    expect(result.current.preferences.fontSize).toBe(DEFAULT_PREFERENCES.fontSize);
  });

  it("handles corrupted localStorage data gracefully", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    
    // Store invalid JSON
    localStorageMock.setItem("user-preferences", "invalid json{");

    const { result } = renderHook(() => usePreferences());

    // Should fall back to defaults
    expect(result.current.preferences).toEqual(DEFAULT_PREFERENCES);
    
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("exportPreferences", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("exports preferences as JSON string", () => {
    const preferences: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      theme: "dark",
      language: "en",
    };
    localStorageMock.setItem("user-preferences", JSON.stringify(preferences));

    const exported = exportPreferences();
    const parsed = JSON.parse(exported) as UserPreferences;

    expect(parsed.theme).toBe("dark");
    expect(parsed.language).toBe("en");
  });
});

describe("importPreferences", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("imports valid preferences JSON", () => {
    const preferences: UserPreferences = {
      ...DEFAULT_PREFERENCES,
      theme: "dark",
      language: "en",
    };
    const json = JSON.stringify(preferences);

    const success = importPreferences(json);

    expect(success).toBe(true);
    
    const stored = localStorageMock.getItem("user-preferences");
    const parsed = JSON.parse(stored!) as UserPreferences;
    expect(parsed.theme).toBe("dark");
  });

  it("rejects invalid JSON", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    
    const success = importPreferences("invalid json{");

    expect(success).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    
    consoleError.mockRestore();
  });

  it("rejects non-object JSON", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    
    const success = importPreferences(JSON.stringify("not an object"));

    expect(success).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    
    consoleError.mockRestore();
  });

  it("merges imported preferences with defaults", () => {
    const partial = {
      theme: "dark" as const,
    };
    const json = JSON.stringify(partial);

    importPreferences(json);

    const stored = localStorageMock.getItem("user-preferences");
    const parsed = JSON.parse(stored!) as UserPreferences;
    
    // Should have imported value
    expect(parsed.theme).toBe("dark");
    
    // Should have default values for missing keys
    expect(parsed.language).toBe(DEFAULT_PREFERENCES.language);
    expect(parsed.fontSize).toBe(DEFAULT_PREFERENCES.fontSize);
  });
});

describe("clearPreferences", () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it("removes preferences from localStorage", () => {
    localStorageMock.setItem("user-preferences", JSON.stringify(DEFAULT_PREFERENCES));

    clearPreferences();

    const stored = localStorageMock.getItem("user-preferences");
    expect(stored).toBeNull();
  });

  it("dispatches storage event when clearing", () => {
    const eventListener = vi.fn();
    window.addEventListener("storage", eventListener);

    clearPreferences();

    expect(eventListener).toHaveBeenCalled();
    
    window.removeEventListener("storage", eventListener);
  });
});
