"use client";

import { useEffect, useRef, useState } from "react";
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

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative p-2 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] transition-colors"
        title={hasUnread ? `${total} notificaciones pendientes` : "Notificaciones"}
        aria-label="Abrir notificaciones"
      >
        <Bell className="w-4 h-4" />
        {hasUnread && (
          <>
            <span
              className="absolute top-1 right-1 inline-flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full text-[10px] font-bold tabular-nums bg-[var(--data-error-500)] text-white"
              aria-hidden
            >
              {total > 99 ? "99+" : total}
            </span>
            <span
              className="absolute top-1 right-1 h-4 w-4 rounded-full bg-[var(--data-error-500)]/40 animate-ping pointer-events-none"
              aria-hidden
            />
          </>
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80]" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <aside
            ref={drawerRef}
            className="absolute right-0 top-0 h-full w-full sm:w-[420px] bg-[var(--surface-canvas)] border-l border-[var(--rule-base)] shadow-[var(--shadow-2xl)] flex flex-col animate-in slide-in-from-right duration-200"
          >
            {/* Header */}
            <header className="flex items-center justify-between px-5 py-4 border-b border-[var(--rule-base)] shrink-0">
              <div>
                <p className="text-base font-bold text-[var(--text-primary)]">
                  Centro de notificaciones
                </p>
                <p className="text-xs text-[var(--text-tertiary)]">
                  {loading
                    ? "Actualizando..."
                    : total === 0
                      ? "Todo al día — sin pendientes"
                      : `${total} ${total === 1 ? "asunto pendiente" : "asuntos pendientes"}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)]"
                aria-label="Cerrar"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            {/* Body */}
            <div className="flex-1 overflow-y-auto">
              {!data && loading && (
                <div className="flex items-center justify-center py-12 text-[var(--text-tertiary)]">
                  <Loader2 className="w-5 h-5 animate-spin" />
                </div>
              )}

              {data && total === 0 && (
                <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-[var(--surface-sunken)] flex items-center justify-center mb-4">
                    <Bell className="w-6 h-6 text-[var(--text-tertiary)]" />
                  </div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Bandeja limpia
                  </p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-1">
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
                      <div className="flex items-center gap-3 mb-3">
                        <div
                          className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                          style={{
                            background: `color-mix(in oklch, ${meta.tone} 14%, transparent)`,
                            color: meta.tone,
                          }}
                        >
                          <Icon className="w-4 h-4" strokeWidth={2.25} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-[var(--text-primary)] flex items-center gap-2">
                            {meta.label}
                            <span
                              className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums bg-[var(--data-error-500)] text-white"
                              aria-label={`${bucket.count} pendientes`}
                            >
                              {bucket.count}
                            </span>
                          </p>
                          <p className="text-xs text-[var(--text-tertiary)] truncate">
                            {meta.description}
                          </p>
                        </div>
                      </div>

                      <ul className="space-y-2">
                        {bucket.items.map((it) => (
                          <li key={it.id}>
                            <Link
                              href={it.href}
                              onClick={() => setOpen(false)}
                              className="group flex items-start gap-2 px-3 py-2 rounded-lg hover:bg-[var(--surface-sunken)] transition-colors"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
                                  {it.title}
                                </p>
                                <p className="text-xs text-[var(--text-tertiary)] truncate">
                                  {it.subtitle}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 text-[10px] text-[var(--text-tertiary)] tabular-nums">
                                {timeAgo(it.createdAt)}
                                <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </Link>
                          </li>
                        ))}
                      </ul>

                      <Link
                        href={bucket.href}
                        onClick={() => setOpen(false)}
                        className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--accent)] hover:underline"
                      >
                        Ver todos ({bucket.count})
                        <ChevronRight className="w-3 h-3" />
                      </Link>
                    </section>
                  );
                })}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
