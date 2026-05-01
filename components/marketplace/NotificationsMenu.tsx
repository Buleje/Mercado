"use client";

/**
 * NotificationsMenu — Dropdown de notificaciones del navbar.
 *
 * Botón campana con badge de no-leídas + panel deslizante abajo del botón
 * con listado editorial (kicker + clamp + chips). Se cierra con click-out
 * o ESC. Marca como leídas al abrir.
 *
 * Autenticación:
 *   - Si el customer NO está logueado: botón sin badge + dropdown con CTA
 *     "Inicia sesión" (sin mostrar notificaciones).
 *   - Si está logueado: fetchea /api/notifications (scoped por phone cookie).
 *     Si la API falla o devuelve vacío, muestra empty state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, m as motion } from "framer-motion";
import {
  Bell,
  Check,
  CheckCheck,
  Package,
  Tag,
  Truck,
  MessageCircle,
  Sparkles,
  LogIn,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { useCustomer } from "@/contexts/customer-context";

// ── Tipos ─────────────────────────────────────────────────────────────────
type NotifKind = "order" | "promo" | "delivery" | "chat" | "system";

type Notification = {
  id: string;
  kind: NotifKind;
  title: string;
  desc: string;
  timeAgo: string;
  href: string;
  unread: boolean;
};

const KIND_META: Record<NotifKind, { Icon: LucideIcon; label: string; tone: string }> = {
  order: { Icon: Package, label: "Pedido", tone: "text-blue-500 bg-blue-500/10" },
  promo: { Icon: Tag, label: "Oferta", tone: "text-[var(--accent)] bg-[var(--accent-soft)]" },
  delivery: { Icon: Truck, label: "Envío", tone: "text-amber-500 bg-amber-500/10" },
  chat: { Icon: MessageCircle, label: "Mensaje", tone: "text-violet-500 bg-violet-500/10" },
  system: { Icon: Sparkles, label: "Sistema", tone: "text-emerald-500 bg-emerald-500/10" },
};

async function fetchNotificationsForCustomer(
  phone: string,
): Promise<Notification[]> {
  try {
    const res = await fetch(
      `/api/marketplace/notifications?customerId=${encodeURIComponent(phone)}`,
      { cache: "no-store", credentials: "include" },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: Notification[] };
    return json.data ?? [];
  } catch {
    return [];
  }
}

interface NotificationsMenuProps {
  className?: string;
}

export default function NotificationsMenu({ className }: NotificationsMenuProps) {
  const { customer } = useCustomer();
  const isLoggedIn = !!customer;
  const [open, setOpen] = useState(false);
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const unreadCount = isLoggedIn ? notifs.filter((n) => n.unread).length : 0;

  const customerPhone = customer?.phone;

  // Fetch notificaciones del usuario solo cuando está logueado.
  // Se refresca al abrir el dropdown (lectura reciente).
  useEffect(() => {
    if (!isLoggedIn || !customerPhone) {
      setNotifs([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchNotificationsForCustomer(customerPhone).then((list) => {
      if (!cancelled) {
        setNotifs(list);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn, customerPhone, open]);

  // Click-out + ESC close
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const markAllRead = useCallback(() => {
    setNotifs((prev) => prev.map((n) => ({ ...n, unread: false })));
  }, []);

  const markOneRead = useCallback((id: string) => {
    setNotifs((prev) =>
      prev.map((n) => (n.id === id ? { ...n, unread: false } : n)),
    );
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* ── Bell button ── */}
      <button
        type="button"
        aria-label={`Notificaciones — ${unreadCount} sin leer`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "relative inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors",
          open
            ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
            : "border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)]",
        )}
      >
        <Bell className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
        {unreadCount > 0 && (
          <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--accent)] px-1.5 text-[length:var(--ts-xs)] font-black text-white shadow-md ring-2 ring-[var(--surface-canvas)]">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* ── Dropdown panel ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Lista de notificaciones"
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            // Anchoring viewport-safe: en desktop el panel mide 380px y se
            // ancla al borde derecho del botón. En mobile (≤640px) el panel
            // se extiende a casi todo el ancho del viewport con margen
            // lateral de 1rem para no recortarse.
            className="absolute top-full mt-3 right-0 w-[380px] max-w-[calc(100vw-2rem)] sm:max-w-[380px] rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-2xl shadow-black/10 overflow-hidden z-50"
          >
            {/* Header editorial */}
            <div className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-5 py-4">
              <div>
                <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
                  Notificaciones
                </p>
                <p className="mt-0.5 text-base font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                  {!isLoggedIn
                    ? "Inicia sesión"
                    : unreadCount > 0
                      ? `${unreadCount} sin leer`
                      : "Todo al día"}
                </p>
              </div>
              {isLoggedIn && unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-soft)] bg-[var(--surface-raised)] px-3 py-1.5 text-xs font-bold text-[var(--text-primary)] hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                >
                  <CheckCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Marcar todas
                </button>
              )}
            </div>

            {/* Lista */}
            {!isLoggedIn ? (
              <div className="px-5 py-10 text-center">
                <div className="mx-auto mb-4 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                  <LogIn className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <p className="text-base font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
                  Inicia sesión para ver tus notificaciones
                </p>
                <p className="mt-2 text-xs text-[var(--text-tertiary)] leading-relaxed">
                  Te avisamos del estado de tus pedidos, promos de tus bodegas
                  favoritas y mensajes de bodegueros.
                </p>
                <Link
                  href="/ingresar"
                  onClick={() => setOpen(false)}
                  className="mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--text-primary)] px-5 py-2.5 text-sm font-bold text-[var(--surface-canvas)] hover:bg-[var(--accent)] transition-colors"
                >
                  <LogIn className="h-4 w-4" strokeWidth={2} />
                  Iniciar sesión
                </Link>
              </div>
            ) : loading ? (
              <div className="px-5 py-12 text-center">
                <div className="mx-auto mb-3 h-6 w-6 animate-spin rounded-full border-2 border-[var(--rule-soft)] border-t-[var(--accent)]" />
                <p className="text-xs text-[var(--text-tertiary)]">
                  Cargando notificaciones…
                </p>
              </div>
            ) : notifs.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <div className="mx-auto mb-3 inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
                  <Bell className="h-6 w-6" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  Sin notificaciones
                </p>
                <p className="mt-1 text-xs text-[var(--text-tertiary)]">
                  Te avisamos cuando haya algo nuevo.
                </p>
              </div>
            ) : (
              <ul className="max-h-[420px] overflow-y-auto divide-y divide-[var(--rule-soft)]">
                {notifs.map((n) => {
                  const meta = KIND_META[n.kind];
                  const Icon = meta.Icon;
                  return (
                    <li key={n.id}>
                      <Link
                        href={n.href}
                        onClick={() => {
                          markOneRead(n.id);
                          setOpen(false);
                        }}
                        className={cn(
                          "group flex items-start gap-3 px-5 py-4 transition-colors",
                          n.unread
                            ? "bg-[var(--accent-soft)]/40 hover:bg-[var(--accent-soft)]"
                            : "hover:bg-[var(--surface-sunken)]",
                        )}
                      >
                        <span
                          className={cn(
                            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                            meta.tone,
                          )}
                        >
                          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-black tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-snug">
                              {n.title}
                            </p>
                            {n.unread && (
                              <span
                                aria-hidden
                                className="mt-1.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]"
                              />
                            )}
                          </div>
                          <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed line-clamp-2">
                            {n.desc}
                          </p>
                          <p className="mt-2 text-[length:var(--ts-xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                            {meta.label} · {n.timeAgo}
                          </p>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}

            {/* Footer — solo si está logueado */}
            {isLoggedIn && notifs.length > 0 && (
              <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-5 py-3">
                <Link
                  href="/marketplace/mi-cuenta?tab=notificaciones"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[var(--accent)] hover:underline"
                >
                  <Check className="h-3.5 w-3.5" strokeWidth={2.25} />
                  Ver todas en Mi cuenta
                </Link>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
