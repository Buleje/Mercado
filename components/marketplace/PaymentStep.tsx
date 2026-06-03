"use client";

/**
 * PaymentStep — paso de pago al final del registro de tienda.
 *
 * 2 flujos:
 *   1. Stripe (tarjeta) — próximamente.
 *   2. Yape / Plin / Transferencia — muestra QR/datos de Brandon,
 *      el dueño sube la captura → llega a /superadmin/pagos-pendientes.
 *
 * El plan + datos del registro vienen del paso anterior. Acá sólo
 * elegís cómo pagás.
 */

import { useState, useEffect } from "react";
import Image from "next/image";
import {
  Loader2,
  CheckCircle,
  CreditCard,
  Smartphone,
  Upload,
  Copy,
  Check,
  ShieldCheck,
  Banknote,
  QrCode,
  Clock,
  AlertCircle,
} from "@buleje/design-system/icons";
import { PLANS, firstMonthPrice, type PlanTier } from "@/lib/billing/plan-tiers";
import { PLATFORM_CONFIG_DEFAULTS, type PlatformConfig } from "@/lib/platform-config";
import { csrfHeaders } from "@/lib/csrf-client";
import { cn } from "@/lib/utils";

export interface RegistrationPayload {
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
  planTier: PlanTier;
  billingCycle: "mensual" | "anual";
}

interface Props {
  data: RegistrationPayload;
  onSuccess: () => void;
}

const fmt = (n: number) => `S/ ${Math.round(n)}`;

type Tab = "stripe" | "yape" | "plin" | "transfer";

const METHODS: { id: Tab; label: string; hint: string; icon: typeof Smartphone }[] = [
  { id: "yape", label: "Yape", hint: "Escaneá o copiá", icon: Smartphone },
  { id: "plin", label: "Plin", hint: "Escaneá o copiá", icon: Smartphone },
  { id: "transfer", label: "Transferencia", hint: "Banco / CCI", icon: Banknote },
  { id: "stripe", label: "Tarjeta", hint: "Próximamente", icon: CreditCard },
];

export default function PaymentStep({ data, onSuccess }: Props) {
  const plan = PLANS[data.planTier];
  const [tab, setTab] = useState<Tab>("yape");

  // Datos de Yape/Plin/banco se administran desde /superadmin/configuracion.
  // Endpoint público sin auth, cache 60s.
  const [platformCfg, setPlatformCfg] = useState<PlatformConfig>(PLATFORM_CONFIG_DEFAULTS);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/platform-config/public", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { config?: PlatformConfig } | null) => {
        if (!cancelled && d?.config) setPlatformCfg(d.config);
      })
      .catch(() => {
        /* fallback silencioso a defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const totalToPay =
    data.billingCycle === "anual"
      ? Math.round(plan.monthlyPrice * 12 * (1 - plan.annualDiscount / 100))
      : firstMonthPrice(plan);
  const showFirstMonthFree = data.billingCycle === "mensual" && plan.firstMonthDiscount === 100;

  return (
    <div className="mx-auto max-w-xl px-4 sm:px-6 py-10 space-y-5">
      {/* ── Encabezado ── */}
      <div>
        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
          Último paso
        </p>
        <h2 className="mt-1 text-2xl font-black tracking-[var(--ls-tight)] text-[var(--text-primary)]">
          Confirmá tu suscripción
        </h2>
      </div>

      {/* ── Resumen del plan ── */}
      <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-sm)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-base font-extrabold text-[var(--text-primary)]">
              Plan {plan.label}
            </p>
            <p className="mt-0.5 text-xs font-semibold text-[var(--text-tertiary)]">
              {data.billingCycle === "anual" ? "Facturación anual" : "Facturación mensual"} · {data.storeName}
            </p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-2xl font-black tabular-nums text-[var(--accent)] leading-none">
              {showFirstMonthFree ? "GRATIS" : fmt(totalToPay)}
            </p>
            {!showFirstMonthFree && (
              <p className="mt-1 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">
                {data.billingCycle === "anual" ? "por 12 meses" : "primer mes"}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-start gap-1.5 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-xs text-[var(--text-secondary)]">
          <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-[var(--text-tertiary)]" strokeWidth={2.25} />
          {showFirstMonthFree ? (
            <span>
              Tu primer mes es <strong className="text-[var(--text-primary)]">gratis</strong>. Después se
              renueva en {fmt(plan.monthlyPrice)}/mes — cancelás cuando quieras.
            </span>
          ) : (
            <span>
              Pagás {fmt(totalToPay)} ahora y luego {fmt(plan.monthlyPrice)}/mes. Cancelás cuando quieras.
            </span>
          )}
        </div>
      </div>

      {/* ── Selector de método ── */}
      <div>
        <p className="mb-2 text-xs font-bold text-[var(--text-secondary)]">¿Cómo querés pagar?</p>
        <div role="tablist" className="grid grid-cols-2 gap-2">
          {METHODS.map((m) => (
            <MethodCard key={m.id} {...m} active={tab === m.id} onClick={() => setTab(m.id)} />
          ))}
        </div>
      </div>

      {/* ── Pane según método ── */}
      {tab === "stripe" ? (
        <StripePane amount={totalToPay} onSwitch={() => setTab("yape")} />
      ) : (
        <ManualPane
          method={tab}
          data={data}
          amount={totalToPay}
          onSuccess={onSuccess}
          platformCfg={platformCfg}
        />
      )}

      {/* ── Sello de confianza ── */}
      <p className="flex items-center justify-center gap-1.5 text-[length:var(--ts-2xs)] font-semibold text-[var(--text-tertiary)]">
        <ShieldCheck className="h-3.5 w-3.5" strokeWidth={2.25} />
        Pago verificado manualmente · aprobamos en menos de 1 hora
      </p>
    </div>
  );
}

function MethodCard({
  label,
  hint,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  hint: string;
  icon: typeof Smartphone;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all",
        active
          ? "border-[var(--accent)] bg-[var(--accent-soft)] shadow-[var(--shadow-sm)]"
          : "border-[var(--rule-base)] bg-[var(--surface-canvas)] hover:border-[var(--accent)]/40",
      )}
    >
      <span
        className={cn(
          "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
          active ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
        )}
      >
        <Icon className="h-4 w-4" strokeWidth={2.25} />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold text-[var(--text-primary)] leading-tight">{label}</span>
        <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] leading-tight">{hint}</span>
      </span>
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stripe (tarjeta) — placeholder hasta habilitar checkout para signups
// ─────────────────────────────────────────────────────────────────────

function StripePane({ amount, onSwitch }: { amount: number; onSwitch: () => void }) {
  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <CreditCard className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-extrabold text-[var(--text-primary)]">Tarjeta de crédito o débito</h3>
          <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">
            El pago con tarjeta vía Stripe se habilita apenas aprobamos tu tienda. Por ahora pagá con
            Yape o Plin — y desde el panel cargás tu tarjeta para los meses siguientes.
          </p>
          <button
            type="button"
            onClick={onSwitch}
            className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-[var(--accent)] px-4 py-2 text-xs font-bold text-white transition-all hover:brightness-110"
          >
            <Smartphone className="h-3.5 w-3.5" strokeWidth={2.25} />
            Pagar con Yape o Plin
          </button>
        </div>
        <span className="text-base font-black tabular-nums text-[var(--text-primary)] shrink-0">
          {fmt(amount)}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Yape / Plin / Transferencia — pago manual con captura
// ─────────────────────────────────────────────────────────────────────

function ManualPane({
  method,
  data,
  amount,
  onSuccess,
  platformCfg,
}: {
  method: "yape" | "plin" | "transfer";
  data: RegistrationPayload;
  amount: number;
  onSuccess: () => void;
  platformCfg: PlatformConfig;
}) {
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);
  const [qrBroken, setQrBroken] = useState(false);

  const handleFile = (f: File | null) => {
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  };

  // Datos del destinatario según método — del PlatformConfig.
  const yapeNum = platformCfg.payment.yapeNumber ?? "—";
  const plinNum = platformCfg.payment.plinNumber ?? "—";
  const bankSummary = platformCfg.payment.bankAccount
    ? `${platformCfg.payment.bankName ?? "Banco"} ${platformCfg.payment.bankAccount}`
    : "—";
  const target = method === "yape" ? yapeNum : method === "plin" ? plinNum : bankSummary;
  const holder =
    method === "yape"
      ? platformCfg.payment.yapeHolder
      : method === "plin"
        ? platformCfg.payment.plinHolder
        : platformCfg.payment.bankHolder;
  const qrUrl =
    method === "yape" ? platformCfg.payment.yapeQrUrl : method === "plin" ? platformCfg.payment.plinQrUrl : null;
  const cciHint =
    method === "transfer" && platformCfg.payment.bankAccountCCI ? platformCfg.payment.bankAccountCCI : null;
  const targetMissing =
    (method === "yape" && !platformCfg.payment.yapeNumber) ||
    (method === "plin" && !platformCfg.payment.plinNumber) ||
    (method === "transfer" && !platformCfg.payment.bankAccount);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(target.replace(/\s/g, ""));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* noop */
    }
  };

  const submit = async () => {
    if (!file) {
      setError("Subí la captura del pago.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("tenantSlug", data.tenantSlug);
      fd.append("ownerName", data.ownerName);
      fd.append("ownerPhone", data.ownerPhone);
      if (data.ownerEmail) fd.append("ownerEmail", data.ownerEmail);
      fd.append("storeName", data.storeName);
      fd.append("category", data.category);
      if (data.departamento) fd.append("departamento", data.departamento);
      if (data.provincia) fd.append("provincia", data.provincia);
      if (data.distrito) fd.append("distrito", data.distrito);
      if (data.direccion) fd.append("direccion", data.direccion);
      fd.append("planTier", data.planTier);
      fd.append("billingCycle", data.billingCycle);
      fd.append("amountPEN", String(amount));
      fd.append("method", method);
      if (reference) fd.append("reference", reference);

      // CSRF: proxy.ts exige x-csrf-token en mutaciones o devuelve 403.
      const res = await fetch("/api/marketplace/payment-proof", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders(),
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "No pudimos guardar tu pago. Intentá de nuevo.");
        return;
      }
      setSuccess(true);
      setTimeout(() => onSuccess(), 1200);
    } catch {
      setError("Error de red. Revisá tu conexión e intentá de nuevo.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-2xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] p-8 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--data-success-500)] text-white">
          <CheckCircle className="h-9 w-9" strokeWidth={2.5} />
        </div>
        <h3 className="mt-4 text-xl font-black text-[var(--text-primary)]">¡Comprobante recibido!</h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-sm mx-auto leading-relaxed">
          Lo estamos revisando. En cuanto aprobemos el pago te avisamos por WhatsApp con los datos para
          entrar a tu panel.
        </p>
      </div>
    );
  }

  const methodLabel =
    method === "yape" ? "Yapeá a este número" : method === "plin" ? "Plin a este número" : "Transferí a esta cuenta";

  return (
    <div className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 shadow-[var(--shadow-sm)] space-y-4">
      {/* Destinatario + QR */}
      {targetMissing ? (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-4 py-3 text-sm font-semibold text-[var(--data-warning-700)]">
          <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" strokeWidth={2.25} />
          Este método aún no está configurado. Elegí Yape, Plin o transferencia (la opción que sí esté activa).
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4">
          <div className="flex items-center gap-4">
            {qrUrl && !qrBroken && (
              <div className="shrink-0 rounded-xl border border-[var(--rule-soft)] bg-white p-2">
                <Image
                  src={qrUrl}
                  alt={`QR ${method}`}
                  width={104}
                  height={104}
                  className="rounded-md"
                  unoptimized
                  onError={() => setQrBroken(true)}
                />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                {methodLabel}
              </p>
              <p className="mt-1 text-xl font-black tabular-nums text-[var(--text-primary)] break-all leading-tight">
                {target}
              </p>
              {holder && (
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  A nombre de <strong className="font-bold">{holder}</strong>
                </p>
              )}
              {cciHint && (
                <p className="mt-0.5 text-xs text-[var(--text-tertiary)] font-mono break-all">CCI: {cciHint}</p>
              )}
              <button
                type="button"
                onClick={copy}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2.5 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-all hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-[var(--data-success-500)]" strokeWidth={3} />
                ) : (
                  <Copy className="h-3.5 w-3.5" strokeWidth={2.25} />
                )}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
          </div>

          {/* Monto destacado */}
          <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--accent-soft)] px-3 py-2">
            <span className="text-xs font-bold text-[var(--text-secondary)]">Monto a pagar</span>
            <span className="text-lg font-black tabular-nums text-[var(--accent)]">{fmt(amount)}</span>
          </div>
        </div>
      )}

      {/* Referencia opcional */}
      <div>
        <label
          htmlFor="payment-reference"
          className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]"
        >
          N° de operación <span className="font-semibold text-[var(--text-tertiary)]">(opcional)</span>
        </label>
        <input
          id="payment-reference"
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={method === "transfer" ? "ej: 12345678" : "ej: 4521"}
          className="h-12 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 text-base font-semibold text-[var(--text-primary)] placeholder:font-normal placeholder:text-[var(--text-tertiary)] outline-none transition-all focus:border-[var(--accent)] focus:ring-4 focus:ring-[var(--accent)]/15"
        />
      </div>

      {/* Captura */}
      <div>
        <label
          htmlFor="payment-proof-file"
          className="mb-1.5 block text-xs font-bold text-[var(--text-secondary)]"
        >
          Captura del pago <span className="text-[var(--data-error-500)]">*</span>
        </label>
        <label
          htmlFor="payment-proof-file"
          className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)]/30"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vista previa del comprobante" className="h-full w-auto object-contain" />
          ) : (
            <>
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
                <QrCode className="h-6 w-6" strokeWidth={1.75} />
              </span>
              <p className="text-sm font-bold text-[var(--text-secondary)]">Tocá para subir la captura</p>
              <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">JPG / PNG · máx 5 MB</p>
            </>
          )}
        </label>
        <input
          id="payment-proof-file"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-3 py-2.5 text-xs font-bold text-[var(--data-error-700)]">
          <AlertCircle className="h-4 w-4 mt-px shrink-0" strokeWidth={2.25} />
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={loading || !file}
        className="inline-flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] text-base font-extrabold text-white shadow-[var(--shadow-md)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Check className="h-5 w-5" strokeWidth={2.5} />}
        Enviar comprobante
      </button>
    </div>
  );
}
