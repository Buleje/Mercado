"use client";

/**
 * AdminChatNavButton — ícono de chat en el TOP HEADER del panel admin.
 *
 * Brandon 2026-06-06: igual que el del marketplace — badge de no-leídos y
 * click abre la bandeja de conversaciones con clientes (estilo Messenger).
 *
 * No pollea por su cuenta: AdminChatHead (overlay) ya pollea los threads y
 * emite `buleje:admin-chat-unread` con el total. El click dispara
 * `buleje:admin-open-chat` y AdminChatHead abre/cierra su bandeja.
 */

import { useEffect, useState } from "react";
import { MessageCircle } from "@buleje/design-system/icons";

export default function AdminChatNavButton() {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ unread: number }>).detail;
      if (typeof d?.unread === "number") setUnread(d.unread);
    };
    window.addEventListener("buleje:admin-chat-unread", handler);
    return () => window.removeEventListener("buleje:admin-chat-unread", handler);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent("buleje:admin-open-chat"))}
      aria-label={`Chats con clientes${unread > 0 ? ` — ${unread} sin leer` : ""}`}
      title="Chats con clientes"
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full text-[var(--text-secondary,#555)] transition-colors hover:bg-[var(--surface-sunken,#f3f4f6)] hover:text-[var(--text-primary,#111)] active:scale-95 focus-visible:outline-2 focus-visible:outline-[var(--accent,#00A0A0)]"
    >
      <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
      {unread > 0 && (
        <span className="absolute -top-0.5 -right-0.5 inline-flex h-[16px] min-w-[16px] items-center justify-center rounded-full bg-[var(--data-error-500,#e11d48)] px-1 text-[length:var(--ts-2xs)] font-black leading-none tabular-nums text-white ring-2 ring-[var(--surface-canvas,#fff)]">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}
