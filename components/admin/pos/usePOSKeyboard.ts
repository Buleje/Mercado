"use client";

import { useEffect, useCallback } from "react";

interface POSKeyboardCallbacks {
  onOpenPayment: () => void;
  onClearCart: () => void;
  onOpenLastTicket: () => void;
  onCancel: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemoveSelected: () => void;
  onAddTopResult: () => void;
  cartLength: number;
}

export function usePOSKeyboard({
  onOpenPayment,
  onClearCart,
  onOpenLastTicket,
  onCancel,
  onIncrement,
  onDecrement,
  onRemoveSelected,
  onAddTopResult,
  cartLength,
}: POSKeyboardCallbacks) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      const isInput = tagName === "input" || tagName === "textarea" || tagName === "select";

      // F1-F4 always work (even in inputs)
      switch (e.key) {
        case "F1":
          e.preventDefault();
          (document.querySelector("[data-pos-search]") as HTMLInputElement)?.focus();
          return;
        case "F2":
          e.preventDefault();
          if (cartLength > 0) onOpenPayment();
          return;
        case "F3":
          e.preventDefault();
          if (cartLength > 0 && window.confirm("Vaciar el carrito?")) {
            onClearCart();
          }
          return;
        case "F4":
          e.preventDefault();
          onOpenLastTicket();
          return;
      }

      // Ignore other shortcuts if focus is in an input (except Enter in search)
      if (isInput) {
        if (e.key === "Enter" && target.hasAttribute("data-pos-search")) {
          e.preventDefault();
          onAddTopResult();
        }
        return;
      }

      switch (e.key) {
        case "Escape":
          e.preventDefault();
          onCancel();
          break;
        case "+":
        case "ArrowUp":
          e.preventDefault();
          onIncrement();
          break;
        case "-":
        case "ArrowDown":
          e.preventDefault();
          onDecrement();
          break;
        case "Delete":
          e.preventDefault();
          onRemoveSelected();
          break;
      }
    },
    [
      onOpenPayment,
      onClearCart,
      onOpenLastTicket,
      onCancel,
      onIncrement,
      onDecrement,
      onRemoveSelected,
      onAddTopResult,
      cartLength,
    ]
  );

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}
