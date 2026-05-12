"use client";

/**
 * PagosPendientesClient — módulo del superadmin para aprobar/rechazar
 * pagos manuales (Yape/Plin/transferencia) de tiendas que se están
 * registrando.
 *
 * Brandon mayo 2026: cuando un cliente paga vía Yape y sube la captura,
 * llega acá. Vos revisás (mirás la foto, validás el monto y la
 * referencia), y aprobás o rechazás. Al aprobar:
 *   - Se crea el Tenant + Store automáticamente.
 *   - WhatsApp de bienvenida con link al panel.
 */

import { useEffect, useMemo, useState, useCallback } from "react";
import Image from "next/image";
import {
  Loader2,
  Check,
  X,
  MessageCircle,
  ExternalLink,
  RefreshCw,
  Search,
  Receipt,
  Wallet,
  Clock,
  Filter,
  Phone,
  MapPin,
  Hash,
  Calendar,
  Banknote,
  Eye,
} from "@buleje/design-system/icons";
import type { LucideIcon } from "lucide-react";

interface PaymentProof {
  id: string;
  tenantSlug: string;
  ownerName: string;
  ownerPhone: string;
  ownerEmail: string | null;
  storeName: string;
  category: string;
  departamento: string | null;
  provincia: string | null;
  distrito: string | null;
  direccion: string | null;
  planTier: string;
  billingCycle: string;
  amountPEN: number;
  method: string;
  proofUrl: string;
  reference: string | null;
  status: string;
  createdAt: string;
}

const PLAN_LABEL: Record<string, string> = {
  basico: "Free",
  pro: "Starter",
  enterprise: "Pro",
  max: "Business",
};

const METHOD_LABEL: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  transfer: "Transferencia",
};

const STATUS_META = {
  pending: {
    label: "Pendiente",
    pill: "border-amber-300 bg-amber-100/80 text-amber-800 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    dot: "bg-amber-500",
  },
  approved: {
    label: "Aprobado",
    pill: "border-emerald-300 bg-emerald-100/80 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    dot: "bg-emerald-500",
  },
  rejected: {
    label: "Rechazado",
    pill: "border-rose-300 bg-rose-100/80 text-rose-800 dark:border-rose-700 dark:bg-rose-950/50 dark:text-rose-300",
    dot: "bg-rose-500",
  },
} as const;

function csrf(): string {
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

const fmtDate = (d: string) =>
  new Date(d).toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function PagosPendientesClient() {
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [actioning, setActioning] = useState<string | null>(null);
  const [active, setActive] = useState<PaymentProof | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectOpen, setRejectOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/payment-proofs?status=${filter}`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) {
        setError("No se pudieron cargar los pagos.");
        return;
      }
      const data = (await res.json()) as { proofs: PaymentProof[] };
      setProofs(data.proofs ?? []);
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  const approve = async (id: string) => {
    if (!confirm("¿Aprobar este pago y crear la tienda?")) return;
    setActioning(id);
    try {
      const res = await fetch(`/api/superadmin/payment-proofs/${id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Error al aprobar");
        return;
      }
      setActive(null);
      await load();
    } finally {
      setActioning(null);
    }
  };

  const reject = async (id: string) => {
    if (!rejectReason || rejectReason.length < 5) {
      alert("Escribí un motivo (mínimo 5 caracteres).");
      return;
    }
    setActioning(id);
    try {
      const res = await fetch(`/api/superadmin/payment-proofs/${id}/reject`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf() },
        body: JSON.stringify({ reason: rejectReason }),
      });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error ?? "Error al rechazar");
        return;
      }
      setRejectReason("");
      setRejectOpen(false);
      setActive(null);
      await load();
    } finally {
      setActioning(null);
    }
  };

  // ── Stats derivados ─────────────────────────────────────────────
  const stats = useMemo(() => {
    const pending = proofs.filter((p) => p.status === "pending");
    const approved = proofs.filter((p) => p.status === "approved");
    const sumPending = pending.reduce((a, p) => a + p.amountPEN, 0);
    const sumApproved = approved.reduce((a, p) => a + p.amountPEN, 0);
    return {
      total: proofs.length,
      pending: pending.length,
      approved: approved.length,
      sumPending,
      sumApproved,
    };
  }, [proofs]);

  return (
    <div className="min-h-screen bg-[var(--surface-canvas)]">
      {/* ─── Hero canónico ───────────────────────────────────────── */}
      <header className="border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <div className="max-w-[1400px] mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3.5">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--accent-600,var(--accent))] text-white shrink-0">
                <Receipt className="h-6 w-6" strokeWidth={1.75} aria-hidden />
              </span>
              <div>
                <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--accent)] mb-1">
                  Tesorería · Aprobaciones
                </p>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-[var(--text-primary)]">
                  Pagos pendientes
                </h1>
                <p className="text-sm text-[var(--text-secondary)] mt-1 max-w-2xl">
                  Revisá las capturas de Yape, Plin y transferencias. Al aprobar se crea el tenant
                  automáticamente y se envía el WhatsApp de bienvenida.
                </p>
              </div>
            </div>

            {/* Stat pills canónicos */}
            <div className="flex items-stretch gap-2 flex-wrap">
              <StatPill label="Pendientes" value={stats.pending} accent="warning" />
              <StatPill label="En revisión" value={fmt(stats.sumPending)} />
              <StatPill label="Aprobados" value={stats.approved} accent="success" />
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6">

      {/* ─── Toolbar ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] p-3">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden />
          <div
            className="flex gap-1 rounded-xl bg-[var(--surface-sunken)] p-1"
            role="tablist"
          >
            <FilterTab
              active={filter === "pending"}
              onClick={() => setFilter("pending")}
              label="Pendientes"
              count={filter === "pending" ? stats.pending : undefined}
            />
            <FilterTab
              active={filter === "all"}
              onClick={() => setFilter("all")}
              label="Todos"
              count={filter === "all" ? stats.total : undefined}
              hint="200 últimos"
            />
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3.5 text-sm font-bold text-[var(--text-primary)] transition hover:border-[var(--accent)]/40 hover:text-[var(--accent)] disabled:opacity-60"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
            strokeWidth={2.25}
          />
          Refrescar
        </button>
      </div>

      {/* ─── Error ──────────────────────────────────────────────── */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border-2 border-rose-300/50 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700 dark:border-rose-700/50 dark:bg-rose-950/40 dark:text-rose-300">
          <X className="h-4 w-4 shrink-0" strokeWidth={2.5} aria-hidden />
          {error}
        </div>
      )}

      {/* ─── Body ───────────────────────────────────────────────── */}
      {loading && proofs.length === 0 ? (
        <div className="flex items-center justify-center py-20">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[var(--accent)]" />
            <p className="text-sm text-[var(--text-secondary)]">Cargando comprobantes…</p>
          </div>
        </div>
      ) : proofs.length === 0 ? (
        <div className="rounded-3xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] py-20 text-center">
          <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--surface-sunken)]">
            <Search
              className="h-8 w-8 text-[var(--text-tertiary)]"
              strokeWidth={1.5}
              aria-hidden
            />
          </div>
          <p className="mt-4 font-display text-lg font-bold text-[var(--text-primary)]">
            {filter === "pending" ? "No hay pagos pendientes" : "Sin registros"}
          </p>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {filter === "pending"
              ? "Cuando un cliente suba un comprobante de Yape/Plin, aparecerá aquí."
              : "Probá cambiar el filtro o refrescar la vista."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {proofs.map((p) => (
            <ProofCard
              key={p.id}
              proof={p}
              onClick={() => {
                setActive(p);
                setRejectReason("");
                setRejectOpen(false);
              }}
            />
          ))}
        </div>
      )}

      </div>{/* /max-w-1400 content wrapper */}

      {/* ─── Modal ──────────────────────────────────────────────── */}
      {active && (
        <ProofModal
          proof={active}
          actioning={actioning === active.id}
          rejectOpen={rejectOpen}
          rejectReason={rejectReason}
          setRejectOpen={setRejectOpen}
          setRejectReason={setRejectReason}
          onClose={() => setActive(null)}
          onApprove={() => approve(active.id)}
          onReject={() => reject(active.id)}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════ components ═══════════════════════════ */

function StatPill({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: "success" | "warning" | "default";
}) {
  const cls =
    accent === "success"
      ? "border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/5 text-[var(--data-success-500)]"
      : accent === "warning"
        ? "border-amber-300/60 bg-amber-50/60 text-amber-700 dark:border-amber-700/40 dark:bg-amber-950/30 dark:text-amber-300"
        : "border-[var(--rule-base)] bg-[var(--surface-canvas)] text-[var(--text-primary)]";
  return (
    <div className={`rounded-xl border px-3.5 py-2 min-w-[88px] ${cls}`}>
      <p className="text-[length:var(--ts-2xs)] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)] leading-none">
        {label}
      </p>
      <p className="font-display text-xl font-extrabold tabular-nums tracking-tight mt-1 leading-none">
        {value}
      </p>
    </div>
  );
}

function FilterTab({
  active,
  onClick,
  label,
  count,
  hint,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
  hint?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-bold transition ${
        active
          ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-sm"
          : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
      }`}
    >
      {label}
      {typeof count === "number" && (
        <span
          className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 text-[10px] font-extrabold tabular-nums ${
            active
              ? "bg-[var(--accent)]/15 text-[var(--accent)]"
              : "bg-[var(--surface-canvas)] text-[var(--text-tertiary)]"
          }`}
        >
          {count}
        </span>
      )}
      {hint && !count && (
        <span className="text-[10px] font-semibold text-[var(--text-tertiary)]">
          · {hint}
        </span>
      )}
    </button>
  );
}

function ProofCard({ proof, onClick }: { proof: PaymentProof; onClick: () => void }) {
  const status =
    STATUS_META[proof.status as keyof typeof STATUS_META] ?? STATUS_META.pending;

  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-left transition-all hover:-translate-y-0.5 hover:border-[var(--accent)]/50 hover:shadow-xl"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden bg-[var(--surface-sunken)]">
        <Image
          src={proof.proofUrl}
          alt={`Comprobante de ${proof.storeName}`}
          fill
          sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
          unoptimized
        />
        {/* Bottom gradient overlay */}
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/70 via-black/30 to-transparent"
        />
        {/* Top badges */}
        <div className="absolute inset-x-3 top-3 flex items-start justify-between gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${status.pill}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
            {status.label}
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white backdrop-blur-sm">
            <Banknote className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            {METHOD_LABEL[proof.method] ?? proof.method}
          </span>
        </div>
        {/* Amount overlay bottom */}
        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-2 text-white">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">
              {PLAN_LABEL[proof.planTier] ?? proof.planTier} ·{" "}
              {proof.billingCycle === "anual" ? "Anual" : "Mensual"}
            </p>
            <p className="font-display text-2xl font-extrabold leading-none tabular-nums">
              {fmt(proof.amountPEN)}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-[10px] font-bold backdrop-blur-sm transition group-hover:bg-white/25">
            <Eye className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            Revisar
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <h3 className="font-display text-base font-extrabold leading-tight text-[var(--text-primary)] truncate">
          {proof.storeName}
        </h3>
        <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">{proof.ownerName}</p>
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-[var(--rule-soft)] pt-2.5 text-[11px] text-[var(--text-tertiary)]">
          <span className="inline-flex items-center gap-1">
            <Phone className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            {proof.ownerPhone}
          </span>
          <span className="inline-flex items-center gap-1">
            <Calendar className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            {fmtDate(proof.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

function ProofModal({
  proof,
  actioning,
  rejectOpen,
  rejectReason,
  setRejectOpen,
  setRejectReason,
  onClose,
  onApprove,
  onReject,
}: {
  proof: PaymentProof;
  actioning: boolean;
  rejectOpen: boolean;
  rejectReason: string;
  setRejectOpen: (v: boolean) => void;
  setRejectReason: (v: string) => void;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
}) {
  const status =
    STATUS_META[proof.status as keyof typeof STATUS_META] ?? STATUS_META.pending;
  const isPending = proof.status === "pending";

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex w-full max-w-4xl max-h-[92vh] flex-col overflow-hidden rounded-3xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-5 py-3.5">
          <div className="flex items-center gap-3 min-w-0">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-wider ${status.pill}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
              {status.label}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent)]">
                {PLAN_LABEL[proof.planTier] ?? proof.planTier} ·{" "}
                {proof.billingCycle === "anual" ? "Anual" : "Mensual"}
              </p>
              <h2 className="font-display text-lg font-extrabold leading-tight text-[var(--text-primary)] truncate">
                {proof.storeName}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Cerrar"
            className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] transition hover:border-[var(--rule-base)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" strokeWidth={2.25} aria-hidden />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 gap-0 overflow-y-auto sm:grid-cols-5">
          {/* Image */}
          <div className="relative aspect-square bg-[var(--surface-sunken)] sm:col-span-2 sm:aspect-auto">
            <Image
              src={proof.proofUrl}
              alt={`Comprobante de ${proof.storeName}`}
              fill
              sizes="(min-width: 640px) 40vw, 100vw"
              className="object-contain p-3"
              unoptimized
            />
            <a
              href={proof.proofUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-black/70 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white backdrop-blur-sm hover:bg-black/85"
            >
              <ExternalLink className="h-3 w-3" strokeWidth={2.5} aria-hidden />
              Abrir original
            </a>
          </div>

          {/* Info */}
          <div className="space-y-4 p-5 sm:col-span-3">
            <div className="grid grid-cols-2 gap-3">
              <Field icon={Wallet} label="Monto" value={fmt(proof.amountPEN)} accent />
              <Field icon={Banknote} label="Método" value={METHOD_LABEL[proof.method] ?? proof.method} />
              <Field icon={Phone} label="Teléfono" value={proof.ownerPhone} />
              <Field icon={Hash} label="Referencia" value={proof.reference ?? "—"} />
              <Field icon={Receipt} label="Dueño" value={proof.ownerName} />
              <Field icon={MapPin} label="Email" value={proof.ownerEmail ?? "—"} />
            </div>

            <div className="rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3.5">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
                Ubicación
              </p>
              <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                {[proof.distrito, proof.provincia, proof.departamento]
                  .filter(Boolean)
                  .join(", ") || "—"}
              </p>
              {proof.direccion && (
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{proof.direccion}</p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field icon={Calendar} label="Recibido" value={fmtDate(proof.createdAt)} />
              <Field icon={Filter} label="Categoría" value={proof.category} />
            </div>

            <div className="flex items-center gap-2 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-3 py-2 text-xs text-[var(--text-tertiary)]">
              <span className="font-bold uppercase tracking-wider">slug</span>
              <code className="font-mono text-[var(--text-secondary)]">{proof.tenantSlug}</code>
            </div>
          </div>
        </div>

        {/* Sticky actions */}
        <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-4">
          {isPending ? (
            <div className="space-y-2.5">
              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  disabled={actioning}
                  onClick={onApprove}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-extrabold uppercase tracking-wider text-white shadow-md shadow-emerald-600/20 transition hover:bg-emerald-700 disabled:opacity-60"
                >
                  {actioning ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Check className="h-4 w-4" strokeWidth={3} aria-hidden />
                  )}
                  Aprobar y crear tienda
                </button>
                <a
                  href={`https://wa.me/51${proof.ownerPhone.replace(/\D/g, "")}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-[var(--rule-soft)] bg-[var(--surface-raised)] px-4 py-3 text-sm font-bold text-[var(--text-primary)] transition hover:border-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-400"
                >
                  <MessageCircle className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                  WhatsApp
                </a>
                <button
                  type="button"
                  onClick={() => setRejectOpen(!rejectOpen)}
                  className={`inline-flex items-center justify-center gap-2 rounded-xl border-2 px-4 py-3 text-sm font-bold transition ${
                    rejectOpen
                      ? "border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      : "border-[var(--rule-soft)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-rose-300 hover:text-rose-600 dark:hover:text-rose-400"
                  }`}
                >
                  <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
                  Rechazar
                </button>
              </div>
              {rejectOpen && (
                <div className="rounded-xl border-2 border-rose-300/60 bg-rose-50/60 p-3 dark:border-rose-700/40 dark:bg-rose-950/30">
                  <label className="text-[10px] font-extrabold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                    Motivo del rechazo (lo recibe por WhatsApp)
                  </label>
                  <textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Ej: La captura no coincide con el monto del plan..."
                    className="mt-1.5 h-20 w-full rounded-lg border border-rose-300/60 bg-[var(--surface-raised)] px-3 py-2 text-sm outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-500/20 dark:border-rose-700/40"
                  />
                  <button
                    disabled={actioning || rejectReason.length < 5}
                    onClick={onReject}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white transition hover:bg-rose-700 disabled:opacity-60"
                  >
                    {actioning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <X className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                    )}
                    Confirmar rechazo y notificar
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[var(--text-secondary)]">
                Estado final:{" "}
                <span className="font-bold text-[var(--text-primary)]">{status.label}</span>
              </p>
              {proof.status === "approved" && (
                <a
                  href={`/admin?tenant=${proof.tenantSlug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3.5 py-2 text-xs font-extrabold uppercase tracking-wider text-white transition hover:opacity-90"
                >
                  Ir al panel
                  <ExternalLink className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-3 ${
        accent
          ? "border-[var(--accent)]/30 bg-[var(--accent)]/10"
          : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]"
      }`}
    >
      <p className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        <Icon className="h-3 w-3" strokeWidth={2.25} aria-hidden />
        {label}
      </p>
      <p
        className={`mt-0.5 truncate font-display font-extrabold ${
          accent ? "text-[var(--accent)] text-base" : "text-[var(--text-primary)] text-sm"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
