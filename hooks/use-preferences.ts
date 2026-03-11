import { useState, useEffect, useCallback } from "react";

/**
 * User preference schema
 */
export interface UserPreferences {
  /** Theme preference */
  theme?: "light" | "dark" | "system";
  /** Language preference */
  language?: "es" | "en";
  /** Compact mode for lists */
  compactMode?: boolean;
  /** Show images in product lists */
  showImages?: boolean;
  /** Enable notifications */
  notifications?: boolean;
  /** Enable sound effects */
  soundEffects?: boolean;
  /** Reduce animations (accessibility) */
  reduceMotion?: boolean;
  /** High contrast mode (accessibility) */
  highContrast?: boolean;
  /** Font size preference */
  fontSize?: "small" | "medium" | "large";
  /** Currency format */
  currency?: "PEN" | "USD";
  /** Date format */
  dateFormat?: "dd/mm/yyyy" | "mm/dd/yyyy";
  /** Items per page in catalogs */
  itemsPerPage?: 12 | 24 | 48;
  /** Default view mode */
  viewMode?: "grid" | "list";
  /** Show prices with tax included */
  showPricesWithTax?: boolean;
  /** Auto-save cart */
  autoSaveCart?: boolean;
  /** Remember filters */
  rememberFilters?: boolean;
}

/**
 * Default preferences
 */
export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  language: "es",
  compactMode: false,
  showImages: true,
  notifications: true,
  soundEffects: false,
  reduceMotion: false,
  highContrast: false,
  fontSize: "medium",
  currency: "PEN",
  dateFormat: "dd/mm/yyyy",
  itemsPerPage: 24,
  viewMode: "grid",
  showPricesWithTax: true,
  autoSaveCart: true,
  rememberFilters: true,
};

const STORAGE_KEY = "user-preferences";

/**
 * Get preferences from localStorage
 */
function getStoredPreferences(): UserPreferences {
  if (typeof window === "undefined") {
    return DEFAULT_PREFERENCES;
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      return DEFAULT_PREFERENCES;
    }

    const parsed = JSON.parse(stored) as UserPreferences;
    // Merge with defaults to ensure all keys exist
    return { ...DEFAULT_PREFERENCES, ...parsed };
  } catch (error) {
    console.error("Failed to load preferences:", error);
    return DEFAULT_PREFERENCES;
  }
}

/**
 * Save preferences to localStorage
 */
function savePreferences(preferences: UserPreferences): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    
    // Dispatch storage event for cross-tab sync
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: JSON.stringify(preferences),
        url: window.location.href,
      })
    );
  } catch (error) {
    console.error("Failed to save preferences:", error);
  }
}

/**
 * Hook to manage user preferences with localStorage persistence
 * 
 * Features:
 * - Type-safe preference management
 * - Automatic localStorage sync
 * - Cross-tab synchronization
 * - Bulk updates with updatePreferences
 * - Reset to defaults
 * 
 * @example
 * ```tsx
 * function Settings() {
 *   const { preferences, updatePreference, updatePreferences, resetPreferences } = usePreferences();
 * 
 *   return (
 *     <div>
 *       <label>
 *         <input
 *           type="checkbox"
 *           checked={preferences.compactMode}
 *           onChange={(e) => updatePreference("compactMode", e.target.checked)}
 *         />
 *         Compact mode
 *       </label>
 *     </div>
 *   );
 * }
 * ```
 */
export function usePreferences() {
  const [preferences, setPreferences] = useState<UserPreferences>(getStoredPreferences);

  // Sync with localStorage changes (cross-tab)
  useEffect(() => {
    function handleStorageChange(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          const parsed = JSON.parse(e.newValue) as UserPreferences;
          setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
        } catch (error) {
          console.error("Failed to parse preferences from storage:", error);
        }
      }
    }

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  /**
   * Update a single preference
   */
  const updatePreference = useCallback(
    <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => {
      setPreferences((prev) => {
        const updated = { ...prev, [key]: value };
        savePreferences(updated);
        return updated;
      });
    },
    []
  );

  /**
   * Update multiple preferences at once
   */
  const updatePreferences = useCallback((updates: Partial<UserPreferences>) => {
    setPreferences((prev) => {
      const updated = { ...prev, ...updates };
      savePreferences(updated);
      return updated;
    });
  }, []);

  /**
   * Reset all preferences to defaults
   */
  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_PREFERENCES);
    savePreferences(DEFAULT_PREFERENCES);
  }, []);

  /**
   * Get a specific preference value
   */
  const getPreference = useCallback(
    <K extends keyof UserPreferences>(key: K): UserPreferences[K] => {
      return preferences[key];
    },
    [preferences]
  );

  return {
    preferences,
    updatePreference,
    updatePreferences,
    resetPreferences,
    getPreference,
  };
}

/**
 * Export preferences as JSON (for backup/export)
 */
export function exportPreferences(): string {
  const preferences = getStoredPreferences();
  return JSON.stringify(preferences, null, 2);
}

/**
 * Import preferences from JSON (for restore/import)
 */
export function importPreferences(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as UserPreferences;
    
    // Validate that it's a valid preferences object
    if (typeof parsed !== "object" || parsed === null) {
      throw new Error("Invalid preferences format");
    }

    // Merge with defaults and save
    const merged = { ...DEFAULT_PREFERENCES, ...parsed };
    savePreferences(merged);
    
    return true;
  } catch (error) {
    console.error("Failed to import preferences:", error);
    return false;
  }
}

/**
 * Clear all preferences (delete from localStorage)
 */
export function clearPreferences(): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    localStorage.removeItem(STORAGE_KEY);
    
    // Dispatch storage event
    window.dispatchEvent(
      new StorageEvent("storage", {
        key: STORAGE_KEY,
        newValue: null,
        url: window.location.href,
      })
    );
  } catch (error) {
    console.error("Failed to clear preferences:", error);
  }
}
