"use client";

import { useToastStore, type Toast, type ToastPosition } from "@/hooks/use-toast";
import { X, CheckCircle, AlertCircle, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

const TOAST_ICONS = {
  success: CheckCircle,
  error: AlertCircle,
  warning: AlertTriangle,
  info: Info,
} as const;

const TOAST_COLORS = {
  success: {
    bg: "bg-green-50 dark:bg-green-900/20",
    border: "border-green-200 dark:border-green-800",
    icon: "text-green-600 dark:text-green-400",
    title: "text-green-900 dark:text-green-100",
    message: "text-green-800 dark:text-green-200",
    button: "text-green-700 dark:text-green-300 hover:text-green-900 dark:hover:text-green-100",
  },
  error: {
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-800",
    icon: "text-red-600 dark:text-red-400",
    title: "text-red-900 dark:text-red-100",
    message: "text-red-800 dark:text-red-200",
    button: "text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-800",
    icon: "text-amber-600 dark:text-amber-400",
    title: "text-amber-900 dark:text-amber-100",
    message: "text-amber-800 dark:text-amber-200",
    button: "text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100",
  },
  info: {
    bg: "bg-blue-50 dark:bg-blue-900/20",
    border: "border-blue-200 dark:border-blue-800",
    icon: "text-blue-600 dark:text-blue-400",
    title: "text-blue-900 dark:text-blue-100",
    message: "text-blue-800 dark:text-blue-200",
    button: "text-blue-700 dark:text-blue-300 hover:text-blue-900 dark:hover:text-blue-100",
  },
} as const;

const POSITION_CLASSES: Record<ToastPosition, string> = {
  "top-right": "top-4 right-4",
  "top-left": "top-4 left-4",
  "bottom-right": "bottom-4 right-4",
  "bottom-left": "bottom-4 left-4",
  "top-center": "top-4 left-1/2 -translate-x-1/2",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
};

interface ToastItemProps {
  toast: Toast;
  onDismiss: () => void;
}

function ToastItem({ toast, onDismiss }: ToastItemProps) {
  const colors = TOAST_COLORS[toast.type];
  const Icon = TOAST_ICONS[toast.type];

  return (
    <div
      className={cn(
        "flex items-start gap-3 w-full max-w-sm rounded-lg border p-4 shadow-lg backdrop-blur-sm",
        "animate-slide-in-right",
        colors.bg,
        colors.border
      )}
      role="alert"
      aria-live={toast.type === "error" ? "assertive" : "polite"}
    >
      {/* Icon */}
      <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", colors.icon)} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        {toast.title && (
          <h4 className={cn("text-sm font-semibold mb-1", colors.title)}>
            {toast.title}
          </h4>
        )}
        <p className={cn("text-sm", colors.message)}>{toast.message}</p>

        {/* Action button */}
        {toast.action && (
          <button
            onClick={() => {
              toast.action!.onClick();
              onDismiss();
            }}
            className={cn(
              "mt-2 text-sm font-semibold underline transition-colors",
              colors.button
            )}
          >
            {toast.action.label}
          </button>
        )}
      </div>

      {/* Dismiss button */}
      {toast.dismissible !== false && (
        <button
          onClick={onDismiss}
          className={cn(
            "shrink-0 p-1 rounded-md hover:bg-black/10 dark:hover:bg-white/10 transition-colors",
            colors.button
          )}
          aria-label="Dismiss"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

interface ToastContainerProps {
  /**
   * Position of toast notifications
   * @default "top-right"
   */
  position?: ToastPosition;
  /**
   * Maximum number of toasts to show at once
   * @default 3
   */
  limit?: number;
}

/**
 * Toast Container component
 * 
 * Renders all active toasts in a fixed position on the screen.
 * Should be placed once in the app layout.
 * 
 * @example
 * ```tsx
 * // In app/layout.tsx
 * export default function RootLayout({ children }) {
 *   return (
 *     <html>
 *       <body>
 *         {children}
 *         <ToastContainer position="top-right" />
 *       </body>
 *     </html>
 *   );
 * }
 * ```
 */
export function ToastContainer({
  position = "top-right",
  limit = 3,
}: ToastContainerProps) {
  const { toasts, remove } = useToastStore();

  // Limit number of visible toasts
  const visibleToasts = toasts.slice(-limit);

  if (visibleToasts.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col gap-2 pointer-events-none",
        POSITION_CLASSES[position]
      )}
    >
      {visibleToasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <ToastItem toast={toast} onDismiss={() => remove(toast.id)} />
        </div>
      ))}
    </div>
  );
}
