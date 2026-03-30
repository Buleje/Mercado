"use client";

/**
 * Kiosk Mode — fullscreen POS for cashier tablets.
 * Accessed via /admin/kiosk
 * Auto-hides all nav, shows only the POS.
 */

import dynamic from "next/dynamic";
import { Loader2, Minimize2, Maximize2 } from "lucide-react";
import { useState } from "react";
import Link from "next/link";

const POSView = dynamic(() => import("@/components/admin/POSView"), {
  loading: () => (
    <div className="flex items-center justify-center h-screen bg-gray-50">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  ),
});

export default function KioskPage() {
  const [showExit, setShowExit] = useState(false);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 relative">
      {/* Minimal kiosk toolbar */}
      <div
        className="fixed top-0 inset-x-0 z-50 flex items-center justify-between px-4 py-2 bg-white/90 backdrop-blur border-b border-gray-200 shadow-sm"
        style={{ height: 44 }}
      >
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-primary text-white flex items-center justify-center">
            <span className="text-[10px] font-extrabold">B</span>
          </div>
          <span className="text-xs font-bold text-gray-700">Buleje</span>
          <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-extrabold uppercase tracking-wide">Kiosk</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={toggleFullscreen}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
            title="Pantalla completa"
          >
            <Maximize2 className="h-4 w-4" />
          </button>
          <button
            onClick={() => setShowExit(v => !v)}
            className="px-3 py-1 rounded-lg text-xs font-semibold text-gray-500 hover:bg-gray-100 transition-colors"
          >
            Salir del kiosk
          </button>
        </div>
      </div>

      {/* POS takes full screen below toolbar */}
      <div className="pt-11">
        <POSView />
      </div>

      {/* Exit confirmation */}
      {showExit && (
        <div className="fixed inset-0 z-999 flex items-center justify-center bg-black/60" onClick={() => setShowExit(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-xs w-full mx-4 text-center" onClick={e => e.stopPropagation()}>
            <Minimize2 className="h-9 w-9 text-gray-400 mx-auto mb-3" />
            <h3 className="font-extrabold text-gray-900 text-base mb-1">¿Salir del modo Kiosk?</h3>
            <p className="text-sm text-gray-500 mb-5">Regresarás al panel de administración completo.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowExit(false)} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <Link href="/admin" className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-colors text-center">
                Salir
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
