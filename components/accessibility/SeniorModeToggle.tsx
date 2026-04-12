"use client";

import { useEffect, useState, useCallback } from "react";
import {
  SENIOR_MODE_COOKIE,
  SENIOR_MODE_VALUE,
  SENIOR_MODE_CLASS,
} from "@/lib/accessibility/senior-mode";

/**
 * ROADMAP ITEM #71 — Modo senora mayor.
 *
 * Toggle visible en el footer o settings del cliente. Persiste en cookie
 * y aplica la clase al <body>. Cero dependencias — cookie propia, sin
 * context provider.
 */
function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|; )${name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1")}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function writeCookie(name: string, value: string, days = 365) {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

export default function SeniorModeToggle() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const current = readCookie(SENIOR_MODE_COOKIE);
    const on = current === SENIOR_MODE_VALUE;
    setEnabled(on);
    if (on) document.body.classList.add(SENIOR_MODE_CLASS);
  }, []);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      if (next) {
        writeCookie(SENIOR_MODE_COOKIE, SENIOR_MODE_VALUE);
        document.body.classList.add(SENIOR_MODE_CLASS);
      } else {
        writeCookie(SENIOR_MODE_COOKIE, "", -1);
        document.body.classList.remove(SENIOR_MODE_CLASS);
      }
      return next;
    });
  }, []);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={enabled}
      className="inline-flex items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <span aria-hidden className="text-lg">
        {enabled ? "👀" : "🔍"}
      </span>
      {enabled ? "Modo normal" : "Texto grande"}
    </button>
  );
}
