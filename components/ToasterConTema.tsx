"use client";

/**
 * El Toaster de sonner con el tema del panel (claro / oscuro de `theme-context`,
 * que pone `.dark` en <html>). Sin `theme`, sonner se quedaba en claro: las
 * notificaciones flotantes salían blancas en modo oscuro (20-10).
 */
import { Toaster } from "sonner";
import { useTheme } from "@/contexts/theme-context";

export function ToasterConTema() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      richColors
      closeButton
      position="bottom-right"
      duration={3800}
      toastOptions={{
        classNames: {
          toast: "rounded-xl border border-gray-200 dark:border-gray-800",
          title: "text-sm font-bold",
          description: "text-xs text-gray-500 dark:text-gray-400",
        },
      }}
    />
  );
}
