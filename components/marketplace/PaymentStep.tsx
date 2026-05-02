"use client";

/**
 * PaymentStep — paso de pago al final del registro de tienda.
 *
 * 2 flujos:
 *   1. Stripe (tarjeta) — redirige al checkout existente.
 *   2. Yape / Plin / Transferencia — muestra QR/datos de Brandon,
 *      cliente sube la captura, llega a /superadmin/pagos-pendientes.
 *
 * El plan + datos del registro vienen del paso anterior. Acá sólo
 * elegís cómo pagás.
 */

import { useState } from "react";
import Image from "next/image";
import { Loader2, CheckCircle, CreditCard, Smartphone, Upload, ArrowRight, Copy, Check } from "@buleje/design-system/icons";
import { PLANS, firstMonthPrice, type PlanTier } from "@/lib/billing/plan-tiers";

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

const YAPE_NUMBER = process.env.NEXT_PUBLIC_YAPE_NUMBER ?? "987 654 321";
const PLIN_NUMBER = process.env.NEXT_PUBLIC_PLIN_NUMBER ?? "987 654 321";
const YAPE_QR = process.env.NEXT_PUBLIC_YAPE_QR_URL ?? null;

const fmt = (n: number) => `S/ ${Math.round(n)}`;

type Tab = "stripe" | "yape" | "plin" | "transfer";

export default function PaymentStep({ data, onSuccess }: Props) {
  const plan = PLANS[data.planTier];
  const [tab, setTab] = useState<Tab>("yape");

  const totalToPay = data.billingCycle === "anual"
    ? Math.round(plan.monthlyPrice * 12 * (1 - plan.annualDiscount / 100))
    : firstMonthPrice(plan);
  const showFirstMonthFree = data.billingCycle === "mensual" && plan.firstMonthDiscount === 100;

  return (
    <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10">
      {/* Resumen del plan */}
      <div className="rounded-3xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] p-5 mb-6">
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent)]">
          Tu suscripción
        </p>
        <div className="mt-1 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-black">
            Plan {plan.label} · {data.billingCycle === "anual" ? "anual" : "mensual"}
          </h2>
          <p className="text-2xl font-black tabular-nums text-[var(--accent)]">
            {showFirstMonthFree ? "GRATIS" : fmt(totalToPay)}
          </p>
        </div>
        {showFirstMonthFree ? (
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Tu primer mes es gratis. Después se renueva en {fmt(plan.monthlyPrice)}/mes (cancelás
            cuando quieras antes).
          </p>
        ) : (
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Pagás {fmt(totalToPay)}{" "}
            {data.billingCycle === "anual" ? "ahora por 12 meses" : "ahora por el primer mes"} y
            después {fmt(plan.monthlyPrice)}/mes.
          </p>
        )}
      </div>

      {/* Selector de método */}
      <div role="tablist" className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
        <TabBtn id="yape" label="Yape" icon={<Smartphone className="h-4 w-4" />} active={tab === "yape"} onClick={() => setTab("yape")} />
        <TabBtn id="plin" label="Plin" icon={<Smartphone className="h-4 w-4" />} active={tab === "plin"} onClick={() => setTab("plin")} />
        <TabBtn id="transfer" label="Transferencia" icon={<Upload className="h-4 w-4" />} active={tab === "transfer"} onClick={() => setTab("transfer")} />
        <TabBtn id="stripe" label="Tarjeta" icon={<CreditCard className="h-4 w-4" />} active={tab === "stripe"} onClick={() => setTab("stripe")} />
      </div>

      {/* Pane según método */}
      {tab === "stripe" ? (
        <StripePane data={data} amount={totalToPay} onSuccess={onSuccess} />
      ) : (
        <ManualPane
          method={tab}
          data={data}
          amount={totalToPay}
          onSuccess={onSuccess}
        />
      )}
    </div>
  );
}

function TabBtn({
  id,
  label,
  icon,
  active,
  onClick,
}: {
  id: string;
  label: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 h-12 rounded-xl border-2 text-xs font-extrabold uppercase tracking-wider transition-all ${
        active
          ? "bg-[var(--accent)] border-[var(--accent)] text-white shadow-md"
          : "bg-[var(--surface-canvas)] border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
      }`}
      data-method={id}
    >
      {icon}
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Stripe (tarjeta)
// ─────────────────────────────────────────────────────────────────────

function StripePane({
  data,
  amount,
  onSuccess: _onSuccess,
}: {
  data: RegistrationPayload;
  amount: number;
  onSuccess: () => void;
}) {
  void _onSuccess;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const start = async () => {
    setLoading(true);
    setError(null);
    try {
      // Brandon: el endpoint actual /api/billing/checkout requiere
      // sesión admin. Como acá el cliente todavía NO tiene cuenta,
      // usamos un endpoint de signup-checkout que no necesita auth
      // (se crea on-the-fly en el webhook). Si todavía no existe,
      // mostramos un mensaje para que el cliente pague vía Yape.
      const res = await fetch("/api/billing/signup-checkout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantSlug: data.tenantSlug,
          planTier: data.planTier,
          billingCycle: data.billingCycle,
          ownerEmail: data.ownerEmail,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.url) {
        setError(
          json.error ??
            "El pago con tarjeta aún no está habilitado para registro nuevo. Pagá vía Yape o Plin y aprobamos tu tienda en minutos.",
        );
        return;
      }
      window.location.href = json.url;
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]">
          <CreditCard className="h-5 w-5" strokeWidth={2} />
        </span>
        <div className="flex-1">
          <h3 className="text-base font-extrabold">Tarjeta de crédito o débito</h3>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Pago seguro vía Stripe. Soportamos Visa, Mastercard, Amex.
          </p>
        </div>
        <span className="text-xl font-black tabular-nums text-[var(--text-primary)]">
          {fmt(amount)}
        </span>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border-2 border-yellow-500/30 bg-yellow-500/10 px-3 py-2.5 text-xs font-semibold text-yellow-700 dark:text-yellow-300 leading-snug">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="mt-5 w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-[var(--accent)] text-white text-sm font-extrabold uppercase tracking-wider shadow-lg shadow-[var(--accent)]/30 hover:shadow-xl hover:opacity-95 disabled:opacity-60 transition-all"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
        Pagar con tarjeta
        <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
      </button>
      <p className="mt-3 text-[11px] text-center text-[var(--text-tertiary)]">
        Tu tarjeta queda guardada para los siguientes meses. Cancelás
        cuando quieras desde el panel.
      </p>
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
}: {
  method: "yape" | "plin" | "transfer";
  data: RegistrationPayload;
  amount: number;
  onSuccess: () => void;
}) {
  const [reference, setReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleFile = (f: File | null) => {
    setFile(f);
    if (f) setPreview(URL.createObjectURL(f));
  };

  const target = method === "yape" ? YAPE_NUMBER : method === "plin" ? PLIN_NUMBER : "Cuenta BCP 191-1234567-0-89";

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

      const res = await fetch("/api/marketplace/payment-proof", {
        method: "POST",
        credentials: "include",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "No pudimos guardar tu pago.");
        return;
      }
      setSuccess(true);
      setTimeout(() => onSuccess(), 1200);
    } catch {
      setError("Error de red.");
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="rounded-3xl bg-[var(--data-success)]/10 border-2 border-[var(--data-success)] p-8 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-[var(--data-success)] text-white">
          <CheckCircle className="h-9 w-9" strokeWidth={2.5} />
        </div>
        <h3 className="mt-4 text-xl font-black">¡Comprobante recibido!</h3>
        <p className="mt-2 text-sm text-[var(--text-secondary)] max-w-sm mx-auto">
          Lo estamos revisando. En cuanto aprobemos el pago te avisamos por
          WhatsApp con los datos para entrar a tu panel.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-3xl bg-[var(--surface-raised)] border-2 border-[var(--rule-base)] p-6 space-y-5">
      {/* Datos del destinatario */}
      <div>
        <p className="text-[10px] font-extrabold uppercase tracking-wider text-[var(--accent)] mb-2">
          {method === "yape" ? "Yapeá a este número" : method === "plin" ? "Plin a este número" : "Transferí a esta cuenta"}
        </p>
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xl font-black tabular-nums text-[var(--text-primary)] break-all">
              {target}
            </p>
            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
              A nombre de <strong>Buleje S.A.C.</strong>
            </p>
          </div>
          <button
            onClick={copy}
            className="shrink-0 inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border-2 border-[var(--rule-base)] text-xs font-extrabold uppercase tracking-wider hover:border-[var(--accent)] hover:text-[var(--accent)]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-[var(--data-success)]" strokeWidth={3} /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copiado" : "Copiar"}
          </button>
        </div>
        <p className="mt-2 text-sm">
          Monto a pagar:{" "}
          <strong className="text-[var(--accent)] text-lg tabular-nums">{fmt(amount)}</strong>
        </p>
      </div>

      {/* QR Yape (si está configurado) */}
      {method === "yape" && YAPE_QR && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] p-3 inline-block">
          <Image src={YAPE_QR} alt="QR Yape Buleje" width={200} height={200} className="rounded-lg" unoptimized />
        </div>
      )}

      {/* Referencia opcional */}
      <div>
        <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
          N° de operación (opcional)
        </label>
        <input
          type="text"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          placeholder={method === "transfer" ? "ej: 12345678" : "ej: 4521"}
          className="w-full h-11 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-semibold focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent)]/20 outline-none"
        />
      </div>

      {/* Captura */}
      <div>
        <label className="block text-[10px] font-extrabold uppercase tracking-wider text-[var(--text-secondary)] mb-1.5">
          Captura del pago *
        </label>
        <label
          htmlFor="payment-proof-file"
          className="flex flex-col items-center justify-center gap-2 h-40 rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-canvas)] cursor-pointer hover:border-[var(--accent)] transition-colors overflow-hidden"
        >
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="Vista previa del comprobante" className="h-full w-auto object-contain" />
          ) : (
            <>
              <Upload className="h-7 w-7 text-[var(--text-tertiary)]" strokeWidth={1.75} />
              <p className="text-sm font-bold text-[var(--text-secondary)]">
                Tocá para subir la captura
              </p>
              <p className="text-[10px] text-[var(--text-tertiary)]">JPG / PNG · máx 5 MB</p>
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
        <div className="rounded-xl border-2 border-red-500/30 bg-red-500/10 px-3 py-2.5 text-xs font-bold text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={loading || !file}
        className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-2xl bg-[var(--accent)] text-white text-sm font-extrabold uppercase tracking-wider shadow-lg shadow-[var(--accent)]/30 hover:shadow-xl disabled:opacity-50 transition-all"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Enviar comprobante
      </button>
      <p className="text-[11px] text-center text-[var(--text-tertiary)]">
        Lo revisamos en menos de 1 hora. Te avisamos por WhatsApp cuando
        esté aprobado.
      </p>
    </div>
  );
}
