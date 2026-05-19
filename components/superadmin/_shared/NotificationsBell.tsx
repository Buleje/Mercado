"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Bell,
  X,
  Store,
  CreditCard,
  ReceiptText,
  ShoppingBag,
  ChevronRight,
  Loader2,
  Inbox,
} from "lucide-react";

interface InboxItem {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
  href: string;
}

interface BucketPayload {
  count: number;
  href: string;
  items: InboxItem[];
}

interface InboxResponse {
  total: number;
  buckets: {
    vendorApplications: BucketPayload;
    paymentApprovals: BucketPayload;
    paymentProofs: BucketPayload;
    pendingOrders: BucketPayload;
  };
}

const BUCKET_META: Record<
  keyof InboxResponse["buckets"],
  { label: string; description: string; icon: typeof Store; tone: string }
> = {
  paymentProofs: {
    label: "Yape de apertura de tienda",
    description: "Comprobantes esperando verificación para crear el tenant",
    icon: ReceiptText,
    tone: "var(--data-warning-500)",
  },
  paymentApprovals: {
    label: "Aprobaciones Yape",
    description: "Pagos detectados por Yape Vision pendientes de revisión",
    icon: CreditCard,
    tone: "var(--data-warning-500)",
  },
  vendorApplications: {
    label: "Solicitudes de tienda",
    description: "Nuevas aplicaciones para sumarse al marketplace",
    icon: Store,
    tone: "var(--accent)",
  },
  pendingOrders: {
    label: "Pedidos sin atender",
    description: "Órdenes cross-tenant en estado pendiente o confirmado",
    icon: ShoppingBag,
    tone: "var(--data-info-500)",
  },
};

const BUCKET_ORDER: Array<keyof InboxResponse["buckets"]> = [
  "paymentProofs",
  "paymentApprovals",
  "vendorApplications",
  "pendingOrders",
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "ahora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  // FIX 2026-05-06: prevenir race condition cuando polling y click-open
  // disparan load() concurrente (segundo fetch pisaba al primero en setData).
  const inFlight = useRef<AbortController | null>(null);

  const load = async () => {
    inFlight.current?.abort();
    const ctrl = new AbortController();
    inFlight.current = ctrl;
    setLoading(true);
    try {
      const r = await fetch("/api/superadmin/notifications/inbox", {
        credentials: "include",
        cache: "no-store",
        signal: ctrl.signal,
      });
      if (!r.ok || ctrl.signal.aborted) return;
      const json = (await r.json()) as InboxResponse;
      // Guard de igualdad: no re-render si payload idéntico.
      setData((prev) => (JSON.stringify(prev) === JSON.stringify(json) ? prev : json));
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
    } finally {
      if (!ctrl.signal.aborted) setLoading(false);
    }
  };

  // Initial load + 60s polling. Drawer abierto: refresca al abrir.
  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open]);

  // Cierre con Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const total = data?.total ?? 0;
  const hasUnread = total > 0;

  // Portal target — solo en cliente. Sin esto el drawer queda atrapado dentro
  // del header del topbar (que tiene backdrop-blur creando un nuevo containing
  // block para position: fixed, bug clásico de CSS).
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  const drawer = open && (
    <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true" aria-labelledby="notif-title">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
        onClick={() => setOpen(false)}
        aria-hidden
      />
      <aside
        ref={drawerRef}
        className="absolute right-0 top-0 h-full w-full sm:w-[440px] bg-[var(--surface-canvas)] border-l border-[var(--rule-base)] shadow-2xl flex flex-col animate-in slide-in-from-right duration-200"
      >
        {/* Header ejecutivo — gradient sutil del accent al canvas para
            dar peso visual sin gritar. Title 16px bold + counter chip
            grande. Botón cerrar con hit-area cómoda. */}
        <header className="relative shrink-0 px-6 pt-5 pb-4 border-b border-[var(--rule-base)] bg-gradient-to-b from-[var(--accent-soft)]/40 to-transparent">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2.5 mb-1">
                <div className="w-8 h-8 rounded-xl bg-[var(--accent)] text-white flex items-center justify-center shadow-sm shadow-[var(--accent)]/30 shrink-0">
                  <Inbox className="w-4 h-4" strokeWidth={2.25} />
                </div>
                <h2 id="notif-title" className="text-base font-bold text-[var(--text-primary)] truncate">
                  Centro de notificaciones
                </h2>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] pl-[42px]">
                {loading
                  ? "Actualizando…"
                  : total === 0
                    ? "Todo al día — sin pendientes"
                    : `${total} ${total === 1 ? "asunto pendiente" : "asuntos pendientes"}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="p-2 -m-1 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors shrink-0"
              aria-label="Cerrar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {!data && loading && (
            <div className="flex items-center justify-center py-16 text-[var(--text-tertiary)]">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          )}

          {data && total === 0 && (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[var(--surface-sunken)] flex items-center justify-center mb-4 ring-1 ring-[var(--rule-soft)]">
                <Bell className="w-7 h-7 text-[var(--text-tertiary)]" />
              </div>
              <p className="text-base font-bold text-[var(--text-primary)]">
                Bandeja limpia
              </p>
              <p className="text-sm text-[var(--text-tertiary)] mt-2 max-w-[280px]">
                Cuando llegue una solicitud de tienda, un Yape o un pedido nuevo aparecerá acá.
              </p>
            </div>
          )}

          {data &&
            BUCKET_ORDER.map((key) => {
              const bucket = data.buckets[key];
              const meta = BUCKET_META[key];
              if (bucket.count === 0) return null;
              const Icon = meta.icon;
              return (
                <section
                  key={key}
                  className="px-5 py-4 border-b border-[var(--rule-base)] last:border-b-0"
                >
                  {/* Bucket header — icono cuadrado coloreado + label + counter
                      ahora a la derecha (cifra grande tabular). Descripción
                      en línea propia (no truncada) para que se lea entera. */}
                  <header className="flex items-center gap-3 mb-3">
                    <div
                      className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ring-1"
                      style={{
                        background: `color-mix(in oklch, ${meta.tone} 12%, transparent)`,
                        color: meta.tone,
                        // @ts-expect-error CSS custom prop
                        "--tw-ring-color": `color-mix(in oklch, ${meta.tone} 20%, transparent)`,
                      }}
                    >
                      <Icon className="w-4 h-4" strokeWidth={2.25} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-[var(--text-primary)] leading-tight">
                        {meta.label}
                      </p>
                      <p className="text-[11px] text-[var(--text-tertiary)] leading-snug mt-0.5">
                        {meta.description}
                      </p>
                    </div>
                    <span
                      className="shrink-0 inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg text-xs font-bold tabular-nums shadow-sm"
                      style={{
                        background: meta.tone,
                        color: "#fff",
                      }}
                      aria-label={`${bucket.count} pendientes`}
                    >
                      {bucket.count}
                    </span>
                  </header>

                  <ul className="space-y-1">
                    {bucket.items.map((it) => (
                      <li key={it.id}>
                        <Link
                          href={it.href}
                          onClick={() => setOpen(false)}
                          className="group flex items-start gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                              {it.title}
                            </p>
                            <p className="text-xs text-[var(--text-tertiary)] truncate mt-0.5">
                              {it.subtitle}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0 text-[11px] font-semibold text-[var(--text-tertiary)] tabular-nums pt-0.5">
                            {timeAgo(it.createdAt)}
                            <ChevronRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>

                  <Link
                    href={bucket.href}
                    onClick={() => setOpen(false)}
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--accent)] hover:underline group"
                  >
                    Ver todos ({bucket.count})
                    <ChevronRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                </section>
              );
            })}
        </div>
      </aside>
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] transition-colors"
        title={hasUnread ? `${total} notificaciones pendientes` : "Notificaciones"}
        aria-label="Abrir notificaciones"
      >
        <Bell className="w-4 h-4" />
        {hasUnread && (
          <>
            <span
              className="absolute -top-0.5 -right-0.5 inline-flex h-[18px] min-w-[18px] px-1 items-center justify-center rounded-full text-[10px] font-bold tabular-nums bg-[var(--data-error-500)] text-white shadow-sm shadow-[var(--data-error-500)]/40 ring-2 ring-[var(--surface-canvas)]"
              aria-hidden
            >
              {total > 99 ? "99+" : total}
            </span>
            <span
              className="absolute -top-0.5 -right-0.5 h-[18px] w-[18px] rounded-full bg-[var(--data-error-500)]/40 animate-ping pointer-events-none"
              aria-hidden
            />
          </>
        )}
      </button>

      {/* Portal hacia document.body — escapa de cualquier ancestor con
          backdrop-filter / transform / filter que cree un containing block
          para position:fixed. Sin esto el drawer queda atrapado dentro del
          topbar (que tiene backdrop-blur-md). */}
      {mounted && drawer && createPortal(drawer, document.body)}
    </>
  );
}
