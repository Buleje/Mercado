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

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { Loader2, Check, X, MessageCircle, ExternalLink, RefreshCw, Search } from "@buleje/design-system/icons";

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
  basico: "Estándar",
  pro: "Pro",
  enterprise: "Enterprise",
  max: "Max",
};

const METHOD_LABEL: Record<string, string> = {
  yape: "Yape",
  plin: "Plin",
  transfer: "Transferencia",
};

function csrf(): string {
  return document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/)?.[1] ?? "";
}

const fmt = (n: number) =>
  new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" }).format(n);

export default function PagosPendientesClient() {
  const [proofs, setProofs] = useState<PaymentProof[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "all">("pending");
  const [actioning, setActioning] = useState<string | null>(null);
  const [active, setActive] = useState<PaymentProof | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/superadmin/payment-proofs?status=${filter}`, { credentials: "include", cache: "no-store" });
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

  useEffect(() => { void load(); }, [load]);

  const approve = async (id: string) => {
    if (!confirm("Aprobar este pago y crear la tienda?")) return;
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
      setActive(null);
      await load();
    } finally {
      setActioning(null);
    }
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      <header className="mb-6 flex flex-col sm:flex-row items-start sm:items-end justify-between gap-3">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[var(--ls-wider)] text-[var(--brand-purple)] mb-1">
            Buleje · Plataforma
          </p>
          <h1 className="text-2xl sm:text-3xl font-black tracking-[-0.02em] text-[var(--text-primary)]">
            Pagos pendientes de aprobación
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Revisá las capturas de Yape/Plin y aprobá las tiendas que pagaron.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as "pending" | "all")}
            className="h-10 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold focus:border-[var(--brand-purple)] focus:ring-2 focus:ring-[var(--brand-purple)]/20 outline-none"
          >
            <option value="pending">Solo pendientes</option>
            <option value="all">Todos (200 últimos)</option>
          </select>
          <button
            onClick={load}
            disabled={loading}
            className="h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] text-sm font-bold inline-flex items-center gap-1.5 hover:bg-[var(--surface-sunken)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} strokeWidth={2.25} />
            Refrescar
          </button>
        </div>
      </header>

      {error && (
        <div className="mb-4 rounded-xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-700)] dark:text-red-300">
          {error}
        </div>
      )}

      {loading && proofs.length === 0 ? (
        <div className="py-20 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--brand-purple)]" />
        </div>
      ) : proofs.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] py-16 text-center">
          <Search className="h-10 w-10 mx-auto text-[var(--text-tertiary)]" strokeWidth={1.5} />
          <p className="mt-3 text-base font-bold text-[var(--text-secondary)]">
            {filter === "pending" ? "No hay pagos pendientes" : "Sin registros"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {proofs.map((p) => (
            <button
              key={p.id}
              onClick={() => { setActive(p); setRejectReason(""); }}
              className="text-left group rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] overflow-hidden hover:border-[var(--brand-purple)]/40 hover:shadow-lg transition-all"
            >
              <div className="relative aspect-[4/3] bg-[var(--surface-sunken)]">
                <Image
                  src={p.proofUrl}
                  alt={`Comprobante de ${p.storeName}`}
                  fill
                  sizes="(min-width: 1280px) 33vw, (min-width: 768px) 50vw, 100vw"
                  className="object-cover"
                  unoptimized
                />
                <span className={`absolute top-2 left-2 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                  p.status === "pending" ? "bg-yellow-500 text-white" :
                  p.status === "approved" ? "bg-[var(--data-success-500)] text-white" :
                  "bg-[var(--data-error-500)] text-white"
                }`}>
                  {p.status === "pending" ? "Pendiente" : p.status === "approved" ? "Aprobado" : "Rechazado"}
                </span>
                <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-full bg-black/65 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
                  {METHOD_LABEL[p.method] ?? p.method}
                </span>
              </div>
              <div className="p-3.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">
                  {PLAN_LABEL[p.planTier] ?? p.planTier} · {p.billingCycle}
                </p>
                <h3 className="mt-0.5 text-base font-extrabold leading-tight text-[var(--text-primary)] truncate">
                  {p.storeName}
                </h3>
                <p className="mt-1 text-xs text-[var(--text-secondary)] truncate">
                  {p.ownerName} · {p.ownerPhone}
                </p>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-lg font-black tabular-nums text-[var(--brand-purple)]">
                    {fmt(p.amountPEN)}
                  </span>
                  <span className="text-[10px] text-[var(--text-tertiary)]">
                    {new Date(p.createdAt).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal detail */}
      {active && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setActive(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl bg-[var(--surface-raised)] shadow-2xl"
          >
            <div className="grid sm:grid-cols-2 gap-0">
              <div className="relative aspect-square bg-[var(--surface-sunken)]">
                <Image src={active.proofUrl} alt="Comprobante" fill sizes="400px" className="object-contain" unoptimized />
              </div>
              <div className="p-5 space-y-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--brand-purple)]">
                    {PLAN_LABEL[active.planTier]} · {active.billingCycle === "anual" ? "Anual" : "Mensual"}
                  </p>
                  <h2 className="mt-0.5 text-xl font-black leading-tight">{active.storeName}</h2>
                  <p className="text-sm text-[var(--text-secondary)]">slug: {active.tenantSlug}</p>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <Field label="Dueño" value={active.ownerName} />
                  <Field label="Teléfono" value={active.ownerPhone} />
                  <Field label="Email" value={active.ownerEmail ?? "—"} />
                  <Field label="Categoría" value={active.category} />
                  <Field label="Método" value={METHOD_LABEL[active.method]} />
                  <Field label="Monto" value={fmt(active.amountPEN)} />
                  <Field label="Referencia" value={active.reference ?? "—"} />
                  <Field label="Ciudad" value={[active.distrito, active.provincia].filter(Boolean).join(", ") || "—"} />
                </div>
                {active.direccion && (
                  <Field label="Dirección" value={active.direccion} />
                )}

                {active.status === "pending" ? (
                  <div className="pt-3 border-t border-[var(--rule-base)] space-y-2.5">
                    <button
                      disabled={actioning === active.id}
                      onClick={() => approve(active.id)}
                      className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl bg-[var(--data-success-500)] text-white font-extrabold text-sm uppercase tracking-wider hover:bg-[var(--data-success-500)]/90 disabled:opacity-60"
                    >
                      {actioning === active.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={3} />}
                      Aprobar y crear tienda
                    </button>
                    <details className="rounded-xl border-2 border-[var(--rule-base)]">
                      <summary className="cursor-pointer p-3 text-xs font-extrabold uppercase tracking-wider text-[var(--data-error-600)]">
                        Rechazar pago
                      </summary>
                      <div className="p-3 pt-0 space-y-2">
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          placeholder="Motivo del rechazo (lo recibe por WhatsApp)..."
                          className="w-full h-20 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm focus:border-[var(--data-error-500)] outline-none"
                        />
                        <button
                          disabled={actioning === active.id || rejectReason.length < 5}
                          onClick={() => reject(active.id)}
                          className="w-full h-10 rounded-lg bg-[var(--data-error-600)] text-white text-xs font-extrabold uppercase tracking-wider hover:bg-[var(--data-error-700)] disabled:opacity-60"
                        >
                          <X className="inline h-3.5 w-3.5 mr-1" strokeWidth={2.5} />
                          Rechazar y notificar
                        </button>
                      </div>
                    </details>
                    <a
                      href={`https://wa.me/51${active.ownerPhone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl border-2 border-[var(--rule-base)] text-xs font-extrabold uppercase tracking-wider hover:border-[var(--data-success-500)] hover:text-[var(--data-success-500)]"
                    >
                      <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Hablar por WhatsApp
                    </a>
                  </div>
                ) : (
                  <div className="pt-3 border-t border-[var(--rule-base)] text-sm">
                    <p className="font-bold capitalize">Estado: {active.status}</p>
                    {active.status === "approved" && (
                      <a
                        href={`/admin?tenant=${active.tenantSlug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-[var(--brand-purple)] hover:underline"
                      >
                        Ir al panel del negocio
                        <ExternalLink className="h-3 w-3" strokeWidth={2.5} />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-tertiary)]">
        {label}
      </p>
      <p className="mt-0.5 font-bold text-[var(--text-primary)] truncate">{value}</p>
    </div>
  );
}
