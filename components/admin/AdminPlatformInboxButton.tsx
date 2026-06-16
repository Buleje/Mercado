"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "@buleje/design-system/icons";

/**
 * Botón del header admin que lleva a la bandeja de mensajes de la PLATAFORMA
 * (Buleje → dueño). Muestra badge de no-leídos. Lado tenant del Messenger ADR-132.
 * Self-fetch + auto-oculta el badge si no hay no-leídos.
 */
export default function AdminPlatformInboxButton() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/platform-chat", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setUnread(d.unread ?? 0); })
      .catch((err) => console.warn("[AdminPlatformInboxButton] platform-chat fetch failed:", String(err)));
    return () => { cancelled = true; };
  }, []);

  return (
    <Link
      href="/admin/buleje"
      title="Mensajes de Buleje (soporte de la plataforma)"
      className="relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)]"
    >
      <ShieldCheck className="h-5 w-5" strokeWidth={2} aria-hidden />
      {unread > 0 && (
        <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[length:var(--ts-2xs)] font-black text-white tabular-nums">
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
