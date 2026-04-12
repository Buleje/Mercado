"use client";

import { useState, useEffect } from "react";

/**
 * WhatsApp floating button — bottom-right corner.
 * Links to the store's WhatsApp number for quick customer support.
 * Shows after 3 seconds delay (not intrusive on page load).
 *
 * Reads phone from Settings via the tenant API.
 * Dismissed for the session if user closes it.
 */
export default function WhatsAppFloatingButton() {
  const [phone, setPhone] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Check if already dismissed this session
    if (sessionStorage.getItem("wa-btn-dismissed")) {
      setDismissed(true);
      return;
    }

    // Fetch store phone from settings
    (async () => {
      try {
        const res = await fetch("/api/settings");
        if (res.ok) {
          const data = await res.json();
          const storePhone = data?.businessPhone ?? data?.whatsappPhone;
          if (storePhone) setPhone(storePhone);
        }
      } catch { /* silent */ }
    })();

    // Show after delay
    const timer = setTimeout(() => setVisible(true), 3000);
    return () => clearTimeout(timer);
  }, []);

  if (dismissed || !phone || !visible) return null;

  const cleanPhone = phone.replace(/\D/g, "");
  const waUrl = `https://wa.me/51${cleanPhone.startsWith("51") ? cleanPhone.slice(2) : cleanPhone}?text=${encodeURIComponent("Hola! Quiero hacer un pedido")}`;

  return (
    <div className="fixed bottom-20 right-4 z-40 flex items-end gap-2 sm:bottom-6">
      {/* Tooltip */}
      <div className="hidden sm:block bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 px-4 py-2 max-w-48 animate-in slide-in-from-right-2">
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Necesitas ayuda? Escribenos por WhatsApp
        </p>
        <button
          onClick={() => {
            setDismissed(true);
            sessionStorage.setItem("wa-btn-dismissed", "1");
          }}
          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-600 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-300 text-xs"
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>

      {/* WhatsApp button */}
      <a
        href={waUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center w-14 h-14 rounded-full bg-[#25D366] text-white shadow-lg shadow-[#25D366]/30 hover:scale-110 active:scale-95 transition-transform"
        aria-label="Contactar por WhatsApp"
      >
        <svg className="w-7 h-7" fill="currentColor" viewBox="0 0 24 24">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
        </svg>
      </a>
    </div>
  );
}
