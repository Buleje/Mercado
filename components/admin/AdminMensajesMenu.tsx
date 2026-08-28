"use client";

/**
 * AdminMensajesMenu — un solo botón para las DOS bandejas de mensajes del panel.
 *
 * Antes eran dos íconos sueltos en la barra superior (chat con clientes y
 * mensajes de Buleje), cada uno con su propio badge. En pantallas medianas la
 * barra no daba abasto y los badges competían entre sí sin decir cuál importaba.
 * Ahora: un ícono, un badge con el total sin leer, y el desglose adentro.
 *
 * La campana de notificaciones NO se agrupa acá a propósito: es un Centro con
 * panel propio, filtros y atajo de teclado — meterlo dentro de un menú sería
 * anidar un panel en un menú.
 *
 * Las dos bandejas se abren distinto y eso se respeta:
 *   · Chat con clientes → evento `buleje:admin-open-chat` (lo escucha AdminChatHead)
 *   · Mensajes de Buleje → navegación a /admin/buleje
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MessageCircle, ShieldCheck } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";

interface AdminMensajesMenuProps {
  /** Mismo caso que NotificationBell: fondo oscuro del header (temas
   *  Buleje/Ejecutivo) que no depende del modo claro/oscuro del sitio. */
  onDarkHeader?: boolean;
}

export default function AdminMensajesMenu({ onDarkHeader = false }: AdminMensajesMenuProps) {
  const [chatUnread, setChatUnread] = useState(0);
  const [plataformaUnread, setPlataformaUnread] = useState(0);

  // Chat: no pollea acá — AdminChatHead ya lo hace y emite el total.
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent<{ unread: number }>).detail;
      if (typeof d?.unread === "number") setChatUnread(d.unread);
    };
    window.addEventListener("buleje:admin-chat-unread", handler);
    return () => window.removeEventListener("buleje:admin-chat-unread", handler);
  }, []);

  // Plataforma: self-fetch, igual que el botón que reemplaza.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/platform-chat", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setPlataformaUnread(d.unread ?? 0); })
      .catch((err) => console.warn("[AdminMensajesMenu] platform-chat fetch failed:", String(err)));
    return () => { cancelled = true; };
  }, []);

  const total = chatUnread + plataformaUnread;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`Mensajes${total > 0 ? ` — ${total} sin leer` : ""}`}
          title="Mensajes"
          className={cn(
            // Base = light-safe SIEMPRE (el header fuerza fondo claro en
            // mobile con `max-sm:` sin importar el tema — ver AdminTopHeader).
            // El override a blanco sólo aplica desde `sm:`, donde el fondo
            // oscuro del tema realmente se pinta.
            "relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors focus-visible:outline-2 focus-visible:outline-[var(--accent)]",
            "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)]",
            onDarkHeader && "sm:text-white/60 sm:hover:bg-white/10 sm:hover:text-white",
          )}
        >
          <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--data-error-500)] px-1 text-[length:var(--ts-2xs)] font-black leading-none tabular-nums text-white ring-2 ring-[var(--surface-raised)]">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={8}
          className="z-50 min-w-[16rem] overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-[var(--shadow-xl)]"
        >
          <DropdownMenu.Label className="px-2.5 py-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Mensajes
          </DropdownMenu.Label>

          <DropdownMenu.Item
            onSelect={() => window.dispatchEvent(new CustomEvent("buleje:admin-open-chat"))}
            className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm outline-none data-[highlighted]:bg-[var(--surface-sunken)]"
          >
            <MessageCircle className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden />
            <span className="flex-1 font-semibold text-[var(--text-primary)]">Chats con clientes</span>
            <Contador n={chatUnread} />
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link
              href="/admin/buleje"
              className="flex cursor-pointer items-center gap-3 rounded-xl px-2.5 py-2.5 text-sm outline-none data-[highlighted]:bg-[var(--surface-sunken)]"
            >
              <ShieldCheck className="h-4 w-4 shrink-0 text-[var(--accent)]" strokeWidth={2} aria-hidden />
              <span className="flex-1 font-semibold text-[var(--text-primary)]">Mensajes de Buleje</span>
              <Contador n={plataformaUnread} />
            </Link>
          </DropdownMenu.Item>

          {total === 0 && (
            <p className="px-2.5 pb-1.5 pt-1 text-xs text-[var(--text-tertiary)]">Sin mensajes nuevos.</p>
          )}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Contador({ n }: { n: number }) {
  if (n <= 0) return null;
  return (
    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--data-error-500)] px-1.5 text-[length:var(--ts-2xs)] font-black tabular-nums text-white">
      {n > 99 ? "99+" : n}
    </span>
  );
}
