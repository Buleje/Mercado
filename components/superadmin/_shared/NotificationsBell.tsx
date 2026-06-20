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
  ChevronDown,
  Loader2,
  Inbox,
  Package,
  User,
  Banknote,
  HeartHandshake,
  ShieldAlert,
} from "@buleje/design-system/icons";

interface InboxOrderItem {
  id: number;
  name: string;
  quantity: number;
  unit: string;
  price: number;
  image: string | null;
}

/** Detalle expandible del pedido (solo bucket pendingOrders, 2026-06-05). */
interface InboxOrderDetail {
  customerName: string;
  tenantName: string;
  tenantSlug: string | null;
  total: number;
  paymentMethod: string | null;
  itemsCount: number;
  items: InboxOrderItem[];
}

interface InboxItem {
  id: string;
  title: string;
  subtitle: string;
  status: string;
  createdAt: string;
  href: string;
  order?: InboxOrderDetail;
}

interface BucketPayload {
  count: number;
  href: string;
  items: InboxItem[];
}

interface InboxResponse {
  total: number;
  buckets: {
    atRisk: BucketPayload;
    panelErrors: BucketPayload;
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
  atRisk: {
    label: "Negocios en riesgo",
    description: "Tiendas con riesgo de churn alto o crítico — necesitan rescate",
    icon: HeartHandshake,
    tone: "var(--data-error-500)",
  },
  panelErrors: {
    label: "Errores en paneles",
    description: "Errores en el panel admin de los negocios — ayudalos a resolverlos",
    icon: ShieldAlert,
    tone: "var(--data-error-500)",
  },
  paymentProofs: {
    label: "Yape de apertura de tienda",
    description: "Comprobantes esperando verificación para crear el tenant",
    icon: ReceiptText,
    tone: "#0d9488",
  },
  paymentApprovals: {
    label: "Aprobaciones Yape",
    description: "Pagos detectados por Yape Vision pendientes de revisión",
    icon: CreditCard,
    tone: "#0d9488",
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
  "atRisk",
  "panelErrors",
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

const PAYMENT_LABEL: Record<string, string> = {
  efectivo: "Efectivo",
  yape: "Yape",
  tarjeta: "Tarjeta",
  transferencia: "Transferencia",
};

/** Thumbnail de artículo con fallback a icono cuando no hay imagen o falla. */
function ItemThumb({ src, alt, size = "h-10 w-10" }: { src: string | null; alt: string; size?: string }) {
  const [broken, setBroken] = useState(false);
  if (!src || broken) {
    return (
      <div className={`${size} shrink-0 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] flex items-center justify-center`}>
        <Package className="h-4 w-4 text-[var(--text-tertiary)]" />
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- imagen de OrderItem: URL externa o base64, sin remotePatterns
    <img
      src={src}
      alt={alt}
      loading="lazy"
      onError={() => setBroken(true)}
      className={`${size} shrink-0 rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-sunken)] object-cover`}
    />
  );
}

/**
 * Fila de pedido pendiente EXPANDIBLE — Brandon 2026-06-05: al presionar se
 * despliegan los artículos con su imagen, cantidad y precio, más cliente,
 * tienda, método de pago y CTA al pedido completo.
 */
function PendingOrderRow({
  item,
  expanded,
  onToggle,
  onNavigate,
}: {
  item: InboxItem;
  expanded: boolean;
  onToggle: () => void;
  onNavigate: () => void;
}) {
  const o = item.order!;
  const preview = o.items.slice(0, 3);
  return (
    <div
      className={`rounded-xl border transition-colors ${
        expanded
          ? "border-[var(--accent)]/40 bg-[var(--surface-raised)] shadow-sm"
          : "border-transparent hover:bg-[var(--surface-sunken)]"
      }`}
    >
      {/* Fila colapsada: cliente + total + tienda + mini-stack de thumbnails */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 px-3 py-2.5 text-left"
      >
        {/* Stack de miniaturas — adelanto visual de qué pidió */}
        <div className="flex shrink-0 -space-x-2">
          {preview.map((it) => (
            <div key={it.id} className="ring-2 ring-[var(--surface-canvas)] rounded-lg">
              <ItemThumb src={it.image} alt={it.name} size="h-9 w-9" />
            </div>
          ))}
          {o.items.length > 3 && (
            <div className="h-9 w-9 shrink-0 rounded-lg ring-2 ring-[var(--surface-canvas)] bg-[var(--surface-sunken)] border border-[var(--rule-soft)] flex items-center justify-center text-[10px] font-bold text-[var(--text-secondary)] tabular-nums">
              +{o.items.length - 3}
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
            <span className="truncate">{o.customerName}</span>
            <span className="shrink-0 tabular-nums text-[var(--accent)]">
              S/{Number(o.total).toFixed(2)}
            </span>
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
            <Store className="h-3 w-3 shrink-0" />
            <span className="truncate">{o.tenantName}</span>
            <span aria-hidden>·</span>
            <span className="shrink-0 tabular-nums">{o.itemsCount} art.</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[var(--text-tertiary)] tabular-nums">
          {timeAgo(item.createdAt)}
          <ChevronDown
            className={`h-4 w-4 transition-transform ${expanded ? "rotate-180 text-[var(--accent)]" : ""}`}
          />
        </div>
      </button>

      {/* Detalle expandido: artículos con imagen + meta + CTA */}
      {expanded && (
        <div className="border-t border-[var(--rule-soft)] px-3 pb-3">
          <ul className="divide-y divide-[var(--rule-soft)]/60">
            {o.items.map((it) => (
              <li key={it.id} className="flex items-center gap-3 py-2">
                <ItemThumb src={it.image} alt={it.name} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{it.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)] tabular-nums">
                    {it.quantity} {it.unit} × S/{Number(it.price).toFixed(2)}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  S/{(it.quantity * it.price).toFixed(2)}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center gap-2 rounded-lg bg-[var(--surface-sunken)] px-3 py-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
              <User className="h-3.5 w-3.5" /> {o.customerName}
            </span>
            {o.paymentMethod && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--text-secondary)]">
                <Banknote className="h-3.5 w-3.5" /> {PAYMENT_LABEL[o.paymentMethod] ?? o.paymentMethod}
              </span>
            )}
            <span className="flex-1" />
            <span className="text-sm font-extrabold tabular-nums text-[var(--text-primary)]">
              S/{Number(o.total).toFixed(2)}
            </span>
          </div>
          <Link
            href={item.href}
            onClick={onNavigate}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-2 text-xs font-extrabold text-white shadow-sm transition-all hover:brightness-110 active:scale-[0.99]"
          >
            Ver pedido completo
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(false);
  // Pedido expandido (artículos con imagen) — uno a la vez, acordeón.
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  // FIX 2026-05-06: prevenir race condition cuando polling y click-open
  // disparan load() concurrente (segundo fetch pisaba al primero en setData).
  const inFlight = useRef<AbortController | null>(null);
  // QA Brandon 2026-06-10: si la sesión de plataforma expiró, el endpoint
  // responde 401. Antes el poll seguía cada 60s → 401 en bucle (ruido en
  // consola). Ahora al primer 401/403 dejamos de pollear (el banner de
  // "sesión expirada" del shell se encarga de mandar al login).
  const stopped = useRef(false);

  const load = async () => {
    if (stopped.current) return;
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
      if (r.status === 401 || r.status === 403) {
        stopped.current = true; // sesión ausente/expirada → no reintentar
        return;
      }
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
  // Audit QW-1: visibility guard — no gastamos request si el tab está oculto.
  useEffect(() => {
    void load();
    const id = setInterval(() => {
      if (stopped.current) { clearInterval(id); return; }
      if (typeof document !== "undefined" && document.hidden) return;
      void load();
    }, 60_000);
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
                        {it.order ? (
                          /* Pedido pendiente → expandible con artículos e imagen */
                          <PendingOrderRow
                            item={it}
                            expanded={expandedId === it.id}
                            onToggle={() => setExpandedId((cur) => (cur === it.id ? null : it.id))}
                            onNavigate={() => setOpen(false)}
                          />
                        ) : (
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
                        )}
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
