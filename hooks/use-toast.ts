import { useState, useCallback, useEffect } from 'react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';
export type ToastPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' | 'top-center' | 'bottom-center';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface Toast {
  id: string;
  type: ToastType;
  title?: string;
  message: string;
  duration?: number; // milliseconds, 0 = no auto-dismiss
  action?: ToastAction;
  dismissible?: boolean;
  onDismiss?: () => void;
  createdAt: number;
}

// Global toast store (singleton pattern)
const toastStore = {
  toasts: [] as Toast[],
  listeners: new Set<() => void>(),
  
  add(toast: Omit<Toast, 'id' | 'createdAt'>): string {
    const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newToast: Toast = {
      ...toast,
      id,
      createdAt: Date.now(),
      dismissible: toast.dismissible !== false,
    };
    
    this.toasts = [...this.toasts, newToast];
    this.notify();
    
    // Auto-dismiss after duration (default 5 seconds)
    const duration = toast.duration !== undefined ? toast.duration : 5000;
    if (duration > 0) {
      setTimeout(() => {
        this.remove(id);
      }, duration);
    }
    
    return id;
  },
  
  remove(id: string): void {
    const toast = this.toasts.find((t) => t.id === id);
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
    toast?.onDismiss?.();
  },
  
  clear(): void {
    this.toasts.forEach((toast) => toast.onDismiss?.());
    this.toasts = [];
    this.notify();
  },
  
  notify(): void {
    this.listeners.forEach((listener) => listener());
  },
  
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },
};

/**
 * Hook for accessing toast queue
 */
export function useToastStore() {
  const [toasts, setToasts] = useState<Toast[]>(toastStore.toasts);
  
  useEffect(() => {
    const unsubscribe = toastStore.subscribe(() => {
      setToasts([...toastStore.toasts]);
    });
    return unsubscribe;
  }, []);
  
  return {
    toasts,
    add: toastStore.add.bind(toastStore),
    remove: toastStore.remove.bind(toastStore),
    clear: toastStore.clear.bind(toastStore),
  };
}

/**
 * Hook for easy toast management
 * 
 * Features:
 * - Type-safe toast creation
 * - Automatic queue management
 * - Auto-dismiss with configurable duration
 * - Action buttons
 * - Custom callbacks
 * 
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { success, error, warning, info } = useToast();
 * 
 *   const handleSave = async () => {
 *     try {
 *       await saveData();
 *       success('Saved successfully!');
 *     } catch (err) {
 *       error('Failed to save', {
 *         action: {
 *           label: 'Retry',
 *           onClick: handleSave
 *         }
 *       });
 *     }
 *   };
 * 
 *   return <button onClick={handleSave}>Save</button>;
 * }
 * ```
 */
export function useToast() {
  const add = useCallback((toast: Omit<Toast, 'id' | 'createdAt'>) => {
    return toastStore.add(toast);
  }, []);
  
  const remove = useCallback((id: string) => {
    toastStore.remove(id);
  }, []);
  
  const clear = useCallback(() => {
    toastStore.clear();
  }, []);
  
  const success = useCallback((message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message' | 'createdAt'>>) => {
    return add({ type: 'success', message, ...options });
  }, [add]);
  
  const error = useCallback((message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message' | 'createdAt'>>) => {
    return add({ type: 'error', message, duration: 7000, ...options });
  }, [add]);
  
  const warning = useCallback((message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message' | 'createdAt'>>) => {
    return add({ type: 'warning', message, ...options });
  }, [add]);
  
  const info = useCallback((message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message' | 'createdAt'>>) => {
    return add({ type: 'info', message, ...options });
  }, [add]);
  
  /**
   * Promise-based toast for async operations
   * Shows loading state, then success/error based on promise result
   */
  const promise = useCallback(async <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    }
  ): Promise<T> => {
    const loadingId = add({
      type: 'info',
      message: messages.loading,
      duration: 0,
      dismissible: false,
    });
    
    try {
      const result = await promise;
      remove(loadingId);
      const successMessage = typeof messages.success === 'function'
        ? messages.success(result)
        : messages.success;
      success(successMessage);
      return result;
    } catch (err) {
      remove(loadingId);
      const errorMessage = typeof messages.error === 'function'
        ? messages.error(err)
        : messages.error;
      error(errorMessage);
      throw err;
    }
  }, [add, remove, success, error]);
  
  return {
    success,
    error,
    warning,
    info,
    promise,
    add,
    remove,
    clear,
  };
}

/**
 * Standalone toast functions (can be called from anywhere, not just React components)
 */
export const toast = {
  success: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message' | 'createdAt'>>) =>
    toastStore.add({ type: 'success', message, ...options }),
  
  error: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message' | 'createdAt'>>) =>
    toastStore.add({ type: 'error', message, duration: 7000, ...options }),
  
  warning: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message' | 'createdAt'>>) =>
    toastStore.add({ type: 'warning', message, ...options }),
  
  info: (message: string, options?: Partial<Omit<Toast, 'id' | 'type' | 'message' | 'createdAt'>>) =>
    toastStore.add({ type: 'info', message, ...options }),
  
  promise: async <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: unknown) => string);
    }
  ): Promise<T> => {
    const loadingId = toastStore.add({
      type: 'info',
      message: messages.loading,
      duration: 0,
      dismissible: false,
    });
    
    try {
      const result = await promise;
      toastStore.remove(loadingId);
      const successMessage = typeof messages.success === 'function'
        ? messages.success(result)
        : messages.success;
      toastStore.add({ type: 'success', message: successMessage });
      return result;
    } catch (err) {
      toastStore.remove(loadingId);
      const errorMessage = typeof messages.error === 'function'
        ? messages.error(err)
        : messages.error;
      toastStore.add({ type: 'error', message: errorMessage, duration: 7000 });
      throw err;
    }
  },
  
  remove: (id: string) => toastStore.remove(id),
  clear: () => toastStore.clear(),
};
