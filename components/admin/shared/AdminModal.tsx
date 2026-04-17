"use client";
import { useEffect, useRef, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface AdminModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  variant?: "default" | "fullscreen" | "side";
  children: React.ReactNode;
  className?: string;
  hideCloseButton?: boolean;
}

export default function AdminModal({ open, onClose, title, variant = "default", children, className, hideCloseButton }: AdminModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  // Close on overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = ""; };
    }
  }, [open]);

  if (!open) return null;

  const variantClasses = {
    default: "max-w-lg w-full mx-4 rounded-xl",
    fullscreen: "w-full h-full",
    side: "ml-auto h-full w-full max-w-md rounded-l-2xl",
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className={cn(
        "fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm",
        variant === "side" ? "justify-end" : "items-center justify-center",
        variant === "fullscreen" && "items-stretch",
      )}
      role="dialog"
      aria-modal="true"
      aria-label={title || "Modal"}
    >
      <div
        className={cn(
          "bg-white dark:bg-gray-900 overflow-hidden flex flex-col",
          variantClasses[variant],
          className,
        )}
      >
        {/* Header */}
        {(title || !hideCloseButton) && (
          <div className="flex items-center justify-between p-4 border-b border-[var(--rule-base)] shrink-0">
            {title && <h2 className="text-sm font-bold text-gray-900 dark:text-white">{title}</h2>}
            {!hideCloseButton && (
              <button
                onClick={onClose}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                aria-label="Cerrar"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
