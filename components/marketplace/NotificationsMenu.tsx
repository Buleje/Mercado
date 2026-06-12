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

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

const KIND_META: Record<NotifKind, { Icon: LucideIcon; label: string; tone: string; dot: string }> = {
  order: { Icon: Package, label: "Pedido", tone: "text-blue-500 bg-blue-500/10", dot: "bg-blue-500" },
  promo: { Icon: Tag, label: "Oferta", tone: "text-[var(--accent)] bg-[var(--accent-soft)]", dot: "bg-[var(--accent)]" },
  delivery: { Icon: Truck, label: "Envío", tone: "text-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10", dot: "bg-[var(--data-warning-500)]" },
  chat: { Icon: MessageCircle, label: "Mensaje", tone: "text-violet-500 bg-violet-500/10", dot: "bg-violet-500" },
  system: { Icon: Sparkles, label: "Sistema", tone: "text-[var(--data-success-500)] bg-[var(--data-success-500)]/10", dot: "bg-[var(--data-success-500)]" },
};

/**
 * Agrupa por recencia leyendo el `timeAgo` ("2m", "15 min", "3h", "1 sem", "2d").
 * Minutos/horas/"ahora"/"hoy" → Hoy; el resto (días en adelante) → Antes.
 */
function isToday(timeAgo: string | undefined | null): boolean {
  if (!timeAgo) return true; // sin dato → tratar como reciente (va a "Hoy")
  const t = timeAgo.trim().toLowerCase();
  if (/^(ahora|reci[eé]n|hoy)/.test(t)) return true;
  // Solo minutos u horas = hoy. Días/semanas/meses ("d"/"sem"/"mes") → Antes.
  // (segundos no aplican: relativeTime devuelve "ahora" cuando <1 min.)
  return /^\d+\s*(min|h|hora)\b/.test(t);
}

// Shape REAL que devuelve /api/marketplace/notifications (migración 2026-05-19
// a CustomerNotificationsDB). Los nombres NO coinciden con el tipo del
// componente — se mapean abajo. Antes el componente leía campos inexistentes
// (timeAgo/kind/desc/href/unread = undefined) → notifs en blanco + crash.
type ApiNotification = {
  id: string;
  type?: string;
  title?: string;
  body?: string;
  link?: string;
  read?: boolean;
  createdAt?: string;
};

/** Tiempo relativo en español desde una fecha ISO. */
function relativeTime(iso: string | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} d`;
  const sem = Math.floor(d / 7);
  if (sem < 5) return `${sem} sem`;
  return `${Math.floor(d / 30)} mes`;
}

/**
 * Quita emojis al inicio del título (el backend los antepone: "✅ Pedido…").
 * En la UI web el ícono Lucide ya indica el tipo, así que el emoji es ruido
 * (regla del proyecto: cero emojis genéricos en UI). WhatsApp/email los
 * conservan porque ahí sí aportan — esto solo limpia el render del storefront.
 */
function stripLeadingEmoji(s: string): string {
  return s.replace(/^[\p{Extended_Pictographic}‍️←-⇿☀-➿\s]+/u, "").trim();
}

/** Mapea el `type` del API a un NotifKind conocido (fallback "system"). */
function toKind(type: string | undefined): NotifKind {
  const t = (type ?? "").toLowerCase();
  if (t.includes("order") || t.includes("pedido")) return "order";
  if (t.includes("promo") || t.includes("oferta") || t.includes("cupon")) return "promo";
  if (t.includes("deliver") || t.includes("envio") || t.includes("envío")) return "delivery";
  if (t.includes("chat") || t.includes("mensaje") || t.includes("message")) return "chat";
  return "system";
}

async function fetchNotificationsForCustomer(
  phone: string,
): Promise<Notification[]> {
  try {
    const res = await fetch(
      `/api/marketplace/notifications?customerId=${encodeURIComponent(phone)}`,
      { cache: "no-store", credentials: "include" },
    );
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: ApiNotification[] };
    return (json.data ?? []).map((n) => ({
      id: n.id,
      kind: toKind(n.type),
      title: stripLeadingEmoji(n.title ?? "") || "Notificación",
      desc: n.body ?? "",
      timeAgo: relativeTime(n.createdAt),
      href: n.link ?? "",
      unread: n.read === false, // read=false → sin leer
    }));
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

  // Render de una fila (reusado por los grupos Hoy / Antes).
  const renderNotifRow = (n: Notification) => {
    // Fallback a "system" si llega un kind desconocido desde el API
    // (antes meta=undefined → crash "Cannot read 'Icon' of undefined").
    const meta = KIND_META[n.kind] ?? KIND_META.system;
    const Icon = meta.Icon;
    return (
      <li key={n.id}>
        <Link
          // El API puede entregar notificaciones sin href (el tipo dice string
          // pero llega undefined) → fallback "#" y prevenimos el salto.
          href={n.href || "#"}
          onClick={(e) => {
            if (!n.href) e.preventDefault();
            markOneRead(n.id);
            setOpen(false);
          }}
          className={cn(
            "group flex items-start gap-3 px-5 py-3.5 transition-colors",
            n.unread
              ? "bg-[var(--accent-soft)]/40 hover:bg-[var(--accent-soft)]"
              : "hover:bg-[var(--surface-sunken)]",
          )}
        >
          <span
            className={cn(
              "relative inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              meta.tone,
            )}
          >
            <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            {/* Dot de color por tipo cuando está sin leer */}
            {n.unread && (
              <span
                aria-hidden
                className={cn(
                  "absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-[var(--surface-raised)]",
                  meta.dot,
                )}
              />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "text-sm tracking-[var(--ls-tight)] text-[var(--text-primary)] leading-snug",
                n.unread ? "font-black" : "font-bold",
              )}
            >
              {n.title}
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-secondary)] leading-relaxed line-clamp-2">
              {n.desc}
            </p>
            <p className="mt-1.5 text-[length:var(--ts-xs)] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
              {meta.label} · {n.timeAgo}
            </p>
          </div>
        </Link>
      </li>
    );
  };

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
          // Brandon 2026-06-12: más grande (h-12) + fondo de reposo para resaltar.
          "relative inline-flex h-12 w-12 items-center justify-center rounded-full transition-colors",
          open
            ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
            : "bg-[var(--surface-sunken)]/70 text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]",
        )}
      >
        <Bell className="h-6 w-6 shrink-0" strokeWidth={2} aria-hidden="true" />
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
                <p className="mt-2 text-sm text-[var(--text-tertiary)] leading-relaxed">
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
                <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                  Te avisamos cuando haya algo nuevo.
                </p>
              </div>
            ) : (
              (() => {
                const hoy = notifs.filter((n) => isToday(n.timeAgo));
                const antes = notifs.filter((n) => !isToday(n.timeAgo));
                const GroupLabel = ({ children }: { children: ReactNode }) => (
                  <p className="sticky top-0 z-10 bg-[var(--surface-raised)]/95 backdrop-blur px-5 pt-3 pb-1.5 text-[length:var(--ts-2xs)] font-black uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    {children}
                  </p>
                );
                return (
                  <div className="max-h-[440px] overflow-y-auto">
                    {hoy.length > 0 && (
                      <>
                        <GroupLabel>Hoy</GroupLabel>
                        <ul className="divide-y divide-[var(--rule-soft)]">
                          {hoy.map(renderNotifRow)}
                        </ul>
                      </>
                    )}
                    {antes.length > 0 && (
                      <>
                        <GroupLabel>Antes</GroupLabel>
                        <ul className="divide-y divide-[var(--rule-soft)]">
                          {antes.map(renderNotifRow)}
                        </ul>
                      </>
                    )}
                  </div>
                );
              })()
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
