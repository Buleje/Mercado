"use client";

import { useEffect, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useScrollLock } from "@/hooks/use-scroll-lock";

interface ModalProps {
  /**
   * Whether the modal is open
   */
  isOpen: boolean;
  
  /**
   * Callback to close the modal
   */
  onClose: () => void;
  
  /**
   * Modal content
   */
  children: ReactNode;
  
  /**
   * Modal title (for accessibility)
   */
  title?: string;
  
  /**
   * Modal size variant
   */
  size?: "sm" | "md" | "lg" | "xl" | "full";
  
  /**
   * Whether clicking the backdrop closes the modal
   * @default true
   */
  closeOnBackdropClick?: boolean;
  
  /**
   * Whether pressing Escape closes the modal
   * @default true
   */
  closeOnEscape?: boolean;
  
  /**
   * Whether to show the close button
   * @default true
   */
  showCloseButton?: boolean;
  
  /**
   * Custom className for the modal container
   */
  className?: string;
  
  /**
   * Custom className for the backdrop
   */
  backdropClassName?: string;
  
  /**
   * Animation variant
   */
  animation?: "fade" | "scale" | "slide-up" | "slide-down";
  
  /**
   * Callback when modal is fully opened
   */
  onAfterOpen?: () => void;
  
  /**
   * Callback when modal is fully closed
   */
  onAfterClose?: () => void;
  
  /**
   * Z-index value
   */
  zIndex?: number;
  
  /**
   * Whether to trap focus inside the modal
   * @default true
   */
  trapFocus?: boolean;
}

const SIZE_CLASSES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  full: "max-w-full mx-4",
};

const ANIMATION_CLASSES = {
  fade: "animate-[fadeIn_0.2s_ease-out]",
  scale: "animate-[scaleIn_0.2s_ease-out]",
  "slide-up": "animate-[slideUp_0.3s_ease-out]",
  "slide-down": "animate-[slideDown_0.3s_ease-out]",
};

/**
 * Reusable Modal component with focus trap and accessibility
 * 
 * @example
 * ```tsx
 * const [isOpen, setIsOpen] = useState(false);
 * 
 * <Modal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Confirm Action">
 *   <p>Are you sure you want to proceed?</p>
 *   <div className="flex gap-2 mt-4">
 *     <button onClick={() => setIsOpen(false)}>Cancel</button>
 *     <button onClick={handleConfirm}>Confirm</button>
 *   </div>
 * </Modal>
 * ```
 */
export function Modal({
  isOpen,
  onClose,
  children,
  title,
  size = "md",
  closeOnBackdropClick = true,
  closeOnEscape = true,
  showCloseButton = true,
  className,
  backdropClassName,
  animation = "scale",
  onAfterOpen,
  onAfterClose,
  zIndex = 50,
  trapFocus = true,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  
  // Scroll lock
  useScrollLock(isOpen);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen || !closeOnEscape) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, closeOnEscape, onClose]);

  // Handle focus trap
  useEffect(() => {
    if (!isOpen || !trapFocus) return;

    // Store the currently focused element
    previousActiveElement.current = document.activeElement as HTMLElement;

    const modalElement = modalRef.current;
    if (!modalElement) return;

    // Get all focusable elements inside the modal
    const focusableElements = modalElement.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusableElements[0];
    const lastFocusable = focusableElements[focusableElements.length - 1];

    // Focus the first element
    if (firstFocusable) {
      setTimeout(() => firstFocusable.focus(), 100);
    }

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable?.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable?.focus();
        }
      }
    };

    document.addEventListener("keydown", handleTab);

    return () => {
      document.removeEventListener("keydown", handleTab);
      // Restore focus to the previous element
      previousActiveElement.current?.focus();
    };
  }, [isOpen, trapFocus]);

  // Handle callbacks
  useEffect(() => {
    if (isOpen) {
      onAfterOpen?.();
    } else {
      onAfterClose?.();
    }
  }, [isOpen, onAfterOpen, onAfterClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (closeOnBackdropClick && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnBackdropClick, onClose]
  );

  if (!isOpen) return null;

  const modalContent = (
    <div
      className={cn(
        "fixed inset-0 flex items-end sm:items-center justify-center p-0 sm:p-4",
        `z-${zIndex}`
      )}
      style={{ zIndex }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "modal-title" : undefined}
    >
      {/* Backdrop */}
      <div
        className={cn(
          "absolute inset-0 bg-black/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]",
          backdropClassName
        )}
        onClick={handleBackdropClick}
        aria-hidden="true"
      />

      {/* Modal Container */}
      <div
        ref={modalRef}
        className={cn(
          "relative bg-[var(--surface-raised)] w-full",
          "rounded-t-3xl sm:rounded-2xl shadow-[var(--shadow-xl)]",
          "border border-[var(--rule-base)]",
          "max-h-[95vh] sm:max-h-[90vh] overflow-y-auto",
          "pb-[env(safe-area-inset-bottom)]", // Safe area bottom
          SIZE_CLASSES[size],
          ANIMATION_CLASSES[animation],
          className
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        {showCloseButton && (
          <button
            onClick={onClose}
            className={cn(
              "absolute top-3 right-3 z-10",
              "p-2 rounded-lg",
              "bg-gray-100 dark:bg-surface hover:bg-gray-200 dark:hover:bg-gray-700",
              "text-gray-600 dark:text-muted hover:text-gray-900 dark:hover:text-[var(--text-primary)]",
              "transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
            )}
            aria-label="Cerrar modal"
          >
            <X className="h-5 w-5" />
          </button>
        )}

        {/* Handle for Bottom Sheet (mobile only) */}
        <div className="sm:hidden flex justify-center pt-3 pb-1 w-full shrink-0">
          <div className="h-1.5 w-12 bg-gray-300 dark:bg-gray-600 rounded-full" />
        </div>

        {/* Title */}
        {title && (
          <h2
            id="modal-title"
            className="text-xl font-bold text-[var(--text-primary)] px-6 sm:pt-6 pt-2 pb-2"
          >
            {title}
          </h2>
        )}

        {/* Content */}
        <div className={cn("px-6", title ? "pb-6" : "py-6")}>{children}</div>
      </div>
    </div>
  );

  // Render in portal
  if (typeof document !== "undefined") {
    return createPortal(modalContent, document.body);
  }

  return null;
}

/**
 * Modal Header component for consistent styling
 */
export function ModalHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-b border-[var(--rule-base)] pb-4 mb-4", className)}>
      {children}
    </div>
  );
}

/**
 * Modal Footer component for consistent styling
 */
export function ModalFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("border-t border-[var(--rule-base)] pt-4 mt-4 flex gap-2 justify-end", className)}>
      {children}
    </div>
  );
}

/**
 * Modal Body component for consistent styling
 */
export function ModalBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-gray-700 dark:text-muted", className)}>{children}</div>;
}
