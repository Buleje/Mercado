/**
 * Type-safe localStorage hook with SSR support
 * Provides a React-friendly API for localStorage with automatic JSON serialization
 */

import { useState, useEffect, useCallback, Dispatch, SetStateAction } from "react";

/**
 * Custom hook for managing localStorage with TypeScript support
 * 
 * Features:
 * - Type-safe values
 * - Automatic JSON serialization/deserialization
 * - SSR-safe (works during server-side rendering)
 * - Sync across tabs/windows
 * - Error handling
 * 
 * @param key - localStorage key
 * @param initialValue - Default value if key doesn't exist
 * @returns Tuple of [value, setValue, remove]
 * 
 * @example
 * ```tsx
 * const [user, setUser, removeUser] = useLocalStorage<User>("user", null);
 * 
 * // Set value
 * setUser({ id: 1, name: "John" });
 * 
 * // Remove value
 * removeUser();
 * ```
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>, () => void] {
  // SSR-safe: check if window is defined
  const isClient = typeof window !== "undefined";

  // Initialize state with stored value or initial value
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (!isClient) {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Update localStorage when state changes
  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (value: SetStateAction<T>) => {
      try {
        // Allow value to be a function (same API as useState)
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;

        setStoredValue(valueToStore);

        if (isClient) {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
          
          // Dispatch custom event for cross-tab synchronization
          window.dispatchEvent(
            new CustomEvent("local-storage", {
              detail: { key, value: valueToStore },
            })
          );
        }
      } catch (error) {
        console.error(`Error setting localStorage key "${key}":`, error);
      }
    },
    [key, storedValue, isClient]
  );

  // Remove value from localStorage
  const remove = useCallback(() => {
    try {
      setStoredValue(initialValue);
      
      if (isClient) {
        window.localStorage.removeItem(key);
        
        // Dispatch custom event
        window.dispatchEvent(
          new CustomEvent("local-storage", {
            detail: { key, value: null },
          })
        );
      }
    } catch (error) {
      console.error(`Error removing localStorage key "${key}":`, error);
    }
  }, [key, initialValue, isClient]);

  // Listen for changes from other tabs/windows
  useEffect(() => {
    if (!isClient) return;

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue) as T);
        } catch (error) {
          console.warn(`Error parsing localStorage value for key "${key}":`, error);
        }
      } else if (e.key === key && e.newValue === null) {
        setStoredValue(initialValue);
      }
    };

    const handleCustomEvent = (e: Event) => {
      const customEvent = e as CustomEvent<{ key: string; value: T | null }>;
      
      if (customEvent.detail.key === key) {
        setStoredValue(customEvent.detail.value ?? initialValue);
      }
    };

    // Listen to storage events from other tabs
    window.addEventListener("storage", handleStorageChange);
    
    // Listen to custom events from same tab
    window.addEventListener("local-storage", handleCustomEvent);

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("local-storage", handleCustomEvent);
    };
  }, [key, initialValue, isClient]);

  return [storedValue, setValue, remove];
}

/**
 * Hook for managing a specific localStorage key with session-like behavior
 * Value is cleared when tab/window is closed
 * 
 * @param key - sessionStorage key
 * @param initialValue - Default value
 * @returns Tuple of [value, setValue, remove]
 */
export function useSessionStorage<T>(
  key: string,
  initialValue: T
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const isClient = typeof window !== "undefined";

  const [storedValue, setStoredValue] = useState<T>(() => {
    if (!isClient) {
      return initialValue;
    }

    try {
      const item = window.sessionStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.warn(`Error reading sessionStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue: Dispatch<SetStateAction<T>> = useCallback(
    (value: SetStateAction<T>) => {
      try {
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;

        setStoredValue(valueToStore);

        if (isClient) {
          window.sessionStorage.setItem(key, JSON.stringify(valueToStore));
        }
      } catch (error) {
        console.error(`Error setting sessionStorage key "${key}":`, error);
      }
    },
    [key, storedValue, isClient]
  );

  const remove = useCallback(() => {
    try {
      setStoredValue(initialValue);
      
      if (isClient) {
        window.sessionStorage.removeItem(key);
      }
    } catch (error) {
      console.error(`Error removing sessionStorage key "${key}":`, error);
    }
  }, [key, initialValue, isClient]);

  return [storedValue, setValue, remove];
}

/**
 * Hook for managing multiple related localStorage keys
 * Useful for form data, preferences, etc.
 * 
 * @param prefix - Common prefix for all keys
 * @param config - Configuration object with key-value pairs
 * @returns Object with get/set/remove methods for each key
 * 
 * @example
 * ```tsx
 * const prefs = useLocalStorageGroup("preferences", {
 *   theme: "light",
 *   language: "es",
 *   notifications: true,
 * });
 * 
 * // Access values
 * console.log(prefs.theme.value);
 * 
 * // Update values
 * prefs.theme.set("dark");
 * 
 * // Remove values
 * prefs.theme.remove();
 * ```
 */
export function useLocalStorageGroup<T extends Record<string, unknown>>(
  prefix: string,
  config: T
) {
  type ResultType = {
    [K in keyof T]: {
      value: T[K];
      set: Dispatch<SetStateAction<T[K]>>;
      remove: () => void;
    };
  };

  const result = {} as ResultType;

  for (const key in config) {
    const fullKey = `${prefix}.${key}`;
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const [value, setValue, remove] = useLocalStorage(fullKey, config[key]);
    
    result[key] = {
      value,
      set: setValue,
      remove,
    };
  }

  return result;
}
