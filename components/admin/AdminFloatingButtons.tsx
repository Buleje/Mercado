"use client";

/**
 * components/admin/AdminFloatingButtons.tsx
 *
 * Botones flotantes del panel admin (escritorio):
 *  - Expandir sidebar (visible solo en focus mode, esquina inferior izquierda)
 *  - Salir presentación (visible solo en presentation mode, esquina superior derecha)
 *
 * Extraído de app/admin/page.tsx (Paso 5 del refactor — JSX components).
 */

import { EyeOff, Maximize2 } from "lucide-react";

export interface AdminFloatingButtonsProps {
  focusMode: boolean;
  presentationMode: boolean;
  onToggleFocus: () => void;
  onExitPresentation: () => void;
}

export function AdminFloatingButtons({
  focusMode,
  presentationMode,
  onToggleFocus,
  onExitPresentation,
}: AdminFloatingButtonsProps) {
  return (
    <>
      {/* Focus mode floating expand toggle — only on desktop */}
      {focusMode && !presentationMode && (
        <button
          onClick={onToggleFocus}
          className="hidden sm:flex fixed bottom-6 left-4 z-50 h-10 w-10 rounded-full bg-primary text-white shadow-lg items-center justify-center hover:bg-primary/90 transition-all"
          title="Expandir sidebar"
        >
          <Maximize2 className="h-5 w-5" />
        </button>
      )}

      {/* Presentation mode — floating exit button */}
      {presentationMode && (
        <button
          onClick={onExitPresentation}
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-2 rounded-xl bg-black/30 backdrop-blur-md text-white/80 text-sm font-semibold hover:bg-black/50 hover:text-white transition-all shadow-lg"
          title="Salir de presentación (Ctrl+Shift+P)"
        >
          <EyeOff className="h-4 w-4" />
          Salir
        </button>
      )}
    </>
  );
}
