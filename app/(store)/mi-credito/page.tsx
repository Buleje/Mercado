/**
 * /mi-credito — Portal de transparencia de crédito para el cliente
 *
 * Fiado Digital Phase 1. El cliente ve su propio score, desglose de factores,
 * fiados activos, historial de pagos y tips personalizados.
 *
 * Arquitectura:
 * - Server Component: lee cookie directamente, llama scoring engine y FiadosDB
 *   sin roundtrip HTTP al API route propio.
 * - Datos sensibles (session, scores) nunca expuestos al bundle cliente.
 * - "use client" solo en CreditTransparencyBanner (tiene useState para toggle).
 *
 * Auth: getCustomerPayload() desde cookie → redirect /cuenta si no autenticado.
 * Gate: isFiadoDigitalPhase1Enabled() → "Próximamente" si off.
 *
 * ADR-021 §3: tenant-isolated, read-only para clientes.
 */

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  TrendingUp,
  TrendingDown,
  Minus,
  Lightbulb,
  History,
  AlertCircle,
  CheckCircle2,
  Clock,
  BadgeAlert,
} from "lucide-react";
import { getCustomerPayload } from "@/lib/auth/customer-session";
import { CUSTOMER_SESSION } from "@/lib/auth/customer-session";
import { calculateCreditScore } from "@/lib/credit/scoring-engine";
import { getAvailableCredit } from "@/lib/credit/installment-manager";
import { FiadosDB } from "@/lib/db/fiados.db";
import { MeCreditScoreDB } from "@/lib/db/me-credit-score.db";
import { isFiadoDigitalPhase1Enabled } from "@/lib/feature-flags/fiado-digital";
import { CreditScoreCard } from "@/components/credit/CreditScoreCard";
import { CreditTransparencyBanner } from "@/components/credit/CreditTransparencyBanner";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatPEN(amount: number): string {
  return new Intl.NumberFormat("es-PE", {
    style: "currency",
    currency: "PEN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-PE", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

const RISK_CONFIG: Record<
  string,
  { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }
> = {
  none: {
    label: "Sin riesgo",
    cls: "bg-emerald-50 text-[var(--data-success-700)] border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  low: {
    label: "Riesgo bajo",
    cls: "bg-emerald-50 text-[var(--data-success-700)] border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800",
    icon: CheckCircle2,
  },
  medium: {
    label: "Riesgo medio",
    cls: "bg-amber-50 text-[var(--data-warning-700)] border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
    icon: Clock,
  },
  high: {
    label: "Riesgo alto",
    cls: "bg-red-50 text-[var(--data-error-700)] border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
    icon: AlertCircle,
  },
};

const FIADO_STATUS_CONFIG: Record<
  string,
  { label: string; cls: string; dot: string }
> = {
  ACTIVO: {
    label: "Activo",
    cls: "bg-emerald-50 text-[var(--data-success-700)] dark:bg-emerald-900/20 dark:text-emerald-300",
    dot: "bg-emerald-400",
  },
  PAGADO: {
    label: "Pagado",
    cls: "bg-emerald-50 text-[var(--data-success-700)] dark:bg-emerald-900/20 dark:text-emerald-300",
    dot: "bg-emerald-400",
  },
  VENCIDO: {
    label: "Vencido",
    cls: "bg-red-50 text-[var(--data-error-700)] dark:bg-red-900/20 dark:text-red-300",
    dot: "bg-red-400",
  },
  CANCELADO: {
    label: "Cancelado",
    cls: "bg-slate-50 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
    dot: "bg-slate-300",
  },
};

const BREAKDOWN_LABELS: Record<string, string> = {
  purchaseHistory: "Historial de compras",
  paymentPunctuality: "Puntualidad de pagos",
  avgTicket: "Ticket promedio",
  seniority: "Antigüedad",
  loyaltyPoints: "Puntos de lealtad",
};

// ── Componente de desglose de score ───────────────────────────────────────────

function ScoreBreakdown({
  breakdown,
}: {
  breakdown: Record<string, number>;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
        Desglose de tu score
      </p>
      <div className="mt-3 space-y-3">
        {Object.entries(breakdown).map(([key, value]) => {
          const pct = Math.min(100, (value / 1000) * 100);
          const label = BREAKDOWN_LABELS[key] ?? key;
          const color =
            value >= 700
              ? "bg-[var(--data-success-500)]"
              : value >= 400
                ? "bg-amber-400"
                : "bg-red-400";
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
                <span>{label}</span>
                <span className="font-medium tabular-nums">{value}/1000</span>
              </div>
              <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${color}`}
                  style={{ width: `${pct}%` }}
                  role="presentation"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Componente de historial de score ──────────────────────────────────────────

function ScoreHistory({
  history,
}: {
  history: Array<{
    score: number;
    riskLevel: string;
    trigger: string;
    date: string;
  }>;
}) {
  if (history.length === 0) return null;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
        <History className="h-4 w-4 shrink-0" aria-hidden />
        Historial de score
      </div>
      <div className="mt-3 space-y-2">
        {history.map((h, i) => {
          const prev = i > 0 ? history[i - 1].score : null;
          const delta = prev !== null ? h.score - prev : null;
          const DeltaIcon =
            delta === null || delta === 0
              ? Minus
              : delta > 0
                ? TrendingUp
                : TrendingDown;
          const deltaColor =
            delta === null || delta === 0
              ? "text-slate-400"
              : delta > 0
                ? "text-[var(--data-success-600)] dark:text-emerald-400"
                : "text-[var(--data-error-500)] dark:text-red-400";

          return (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2.5 dark:bg-slate-700/50"
            >
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-slate-800 tabular-nums dark:text-slate-100">
                  {h.score}
                </span>
                {delta !== null && (
                  <span className={`flex items-center gap-0.5 text-xs font-medium ${deltaColor}`}>
                    <DeltaIcon className="h-3 w-3" aria-hidden />
                    {delta !== 0 && (
                      <span>
                        {delta > 0 ? "+" : ""}
                        {delta}
                      </span>
                    )}
                  </span>
                )}
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {formatDateShort(h.date)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Componente de fiados activos ───────────────────────────────────────────────

function FiadosActivos({
  fiados,
}: {
  fiados: Array<{
    id: string;
    total: number;
    saldo: number;
    status: string;
    descripcion?: string;
    fechaVence?: string;
  }>;
}) {
  const activos = fiados.filter(
    (f) => f.status === "ACTIVO" || f.status === "VENCIDO",
  );

  if (activos.length === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <BadgeAlert className="h-4 w-4 shrink-0" aria-hidden />
          Mis Fiados
        </div>
        <p className="mt-3 text-center text-sm text-slate-500 dark:text-slate-400">
          No tienes fiados activos. Buena señal!
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-200">
          <BadgeAlert className="h-4 w-4 shrink-0" aria-hidden />
          Mis Fiados
        </div>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-400">
          {activos.length}
        </span>
      </div>
      <div className="mt-3 space-y-2">
        {activos.map((f) => {
          const cfg = FIADO_STATUS_CONFIG[f.status] ?? FIADO_STATUS_CONFIG.ACTIVO;
          const pagado = f.total - f.saldo;
          const pct = f.total > 0 ? Math.min(100, (pagado / f.total) * 100) : 0;

          return (
            <div
              key={f.id}
              className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-700/50"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
                    {f.descripcion ?? "Fiado"}
                  </p>
                  {f.fechaVence && (
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      Vence: {formatDateShort(f.fechaVence)}
                    </p>
                  )}
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}
                >
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${cfg.dot}`} aria-hidden />
                  {cfg.label}
                </span>
              </div>

              {/* Barra de progreso del pago */}
              <div className="mt-2">
                <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                  <span>Pagado: {formatPEN(pagado)}</span>
                  <span>Total: {formatPEN(f.total)}</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-600">
                  <div
                    className="h-full rounded-full bg-[var(--data-success-500)] transition-all"
                    style={{ width: `${pct}%` }}
                    role="presentation"
                  />
                </div>
              </div>

              <p className="mt-1.5 text-right text-sm font-bold text-slate-800 dark:text-slate-100">
                Saldo: {formatPEN(f.saldo)}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Componente de tips ────────────────────────────────────────────────────────

function TipsSection({ tips }: { tips: string[] }) {
  if (tips.length === 0) return null;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800/40 dark:bg-amber-950/20">
      <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
        <Lightbulb className="h-4 w-4 shrink-0" aria-hidden />
        Cómo mejorar tu score
      </div>
      <ul className="mt-2 space-y-1.5">
        {tips.map((tip, i) => (
          <li
            key={i}
            className="flex items-start gap-1.5 text-sm text-[var(--data-warning-700)] dark:text-amber-400"
          >
            <span className="mt-0.5 shrink-0 text-amber-400 dark:text-[var(--data-warning-600)]">
              •
            </span>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── Risk Level Badge ──────────────────────────────────────────────────────────

function RiskBadge({ riskLevel }: { riskLevel: string }) {
  const cfg = RISK_CONFIG[riskLevel] ?? RISK_CONFIG.low;
  const Icon = cfg.icon;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${cfg.cls}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {cfg.label}
    </span>
  );
}

// ── Página principal (Server Component) ───────────────────────────────────────

export default async function MiCreditoPage() {
  // Gate de feature flag — "Próximamente" si está apagado
  if (!isFiadoDigitalPhase1Enabled()) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
          <Clock className="h-8 w-8 text-slate-400" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Próximamente
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          El portal de crédito digital estará disponible muy pronto.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#2d6a4f] px-6 text-sm font-medium text-white hover:bg-[#245a42] dark:bg-[#2d6a4f] dark:hover:bg-[#245a42]"
        >
          Volver a la tienda
        </Link>
      </div>
    );
  }

  // Autenticación server-side — leer cookie directamente
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION.COOKIE_NAME)?.value;
  const customer = token ? await getCustomerPayload(token) : null;

  if (!customer) {
    redirect("/cuenta");
  }

  const { tenantId, customerId: customerPhone, name: customerName } = customer;

  if (!customerPhone) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Cuenta no vinculada
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Tu cuenta de correo aún no está vinculada a un perfil de cliente.
          Completa tu registro para ver tu crédito.
        </p>
        <Link
          href="/cuenta"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#2d6a4f] px-6 text-sm font-medium text-white hover:bg-[#245a42]"
        >
          Ir a mi cuenta
        </Link>
      </div>
    );
  }

  // Fetch en paralelo — scoring + crédito disponible + fiados + historial
  const [scoreResult, creditInfo, fiados, history] = await Promise.all([
    calculateCreditScore(tenantId, customerPhone).catch(() => null),
    getAvailableCredit(tenantId, customerPhone).catch(() => null),
    FiadosDB.list(tenantId, { customerId: customerPhone }).catch(() => []),
    // Acceso canónico vía DB class (regla #1): MeCreditScoreDB cachea + scopea
    // por tenant. Devuelve DESC; acá el chart/deltas esperan ASC → reverse.
    MeCreditScoreDB.getHistory(tenantId, customerPhone, 12).then((h) => [...h].reverse()),
  ]);

  // Si el scoring engine falla completamente (sin historial en DB aún)
  if (!scoreResult || !creditInfo) {
    return (
      <div className="mx-auto max-w-md px-4 py-12 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 dark:bg-amber-900/20">
          <AlertCircle className="h-8 w-8 text-[var(--data-warning-500)]" aria-hidden />
        </div>
        <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
          Sin datos aún
        </h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          Todavía no tenemos suficiente historial para calcular tu score.
          Sigue comprando y vuelve pronto.
        </p>
        <Link
          href="/tienda"
          className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-xl bg-[#2d6a4f] px-6 text-sm font-medium text-white hover:bg-[#245a42]"
        >
          Ir a la tienda
        </Link>
      </div>
    );
  }

  // Calcular delta vs snapshot anterior
  const previousScore = history.length > 1 ? history[history.length - 2].score : null;
  const delta =
    previousScore !== null ? scoreResult.score - previousScore : null;

  // Reason string
  let reason = "Tu score se revisa cada semana automáticamente.";
  if (delta !== null) {
    if (delta > 0) reason = `Subió ${delta} puntos desde la última revisión.`;
    else if (delta < 0)
      reason = `Bajó ${Math.abs(delta)} puntos desde la última revisión.`;
    else reason = "Tu score se mantuvo igual desde la última revisión.";
  }

  // Próxima revisión (próximo domingo)
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + (7 - nextReview.getDay()));
  nextReview.setHours(0, 0, 0, 0);

  // Tips personalizados basados en factores débiles
  const tips = generateTips(scoreResult.breakdown);

  // Historial serializable
  const historyForUI = history.map((h) => ({
    score: h.score,
    riskLevel: h.riskLevel,
    trigger: h.trigger,
    date: h.createdAt.toISOString(),
  }));

  // Fiados serializables
  const fiadosForUI = fiados.map((f) => ({
    id: f.id,
    total: f.total,
    saldo: f.saldo,
    status: f.status,
    descripcion: f.descripcion,
    fechaVence: f.fechaVence,
  }));

  return (
    <div className="mx-auto max-w-lg px-4 pb-10 pt-6">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/cuenta"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"
          aria-label="Volver a mi cuenta"
        >
          <ArrowLeft className="h-4 w-4 text-slate-600 dark:text-slate-300" aria-hidden />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-slate-800 dark:text-slate-100">
            Mi Crédito
          </h1>
          {customerName && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {customerName}
            </p>
          )}
        </div>
        <RiskBadge riskLevel={scoreResult.riskLevel} />
      </div>

      {/* Transparency Banner — "use client" por el toggle interno */}
      <CreditTransparencyBanner
        score={scoreResult.score}
        reason={reason}
        nextReviewDate={nextReview}
      />

      {/* Score Card */}
      <div className="mt-4">
        <CreditScoreCard
          customerId={customerPhone}
          currentScore={scoreResult.score}
          limit={creditInfo.creditLimit}
          used={creditInfo.usedCredit}
        />
      </div>

      {/* Fiados activos */}
      <div className="mt-4">
        <FiadosActivos fiados={fiadosForUI} />
      </div>

      {/* Tips de mejora */}
      <div className="mt-4">
        <TipsSection tips={tips} />
      </div>

      {/* Historial de score */}
      <div className="mt-4">
        <ScoreHistory history={historyForUI} />
      </div>

      {/* Desglose de factores */}
      <div className="mt-4">
        <ScoreBreakdown breakdown={scoreResult.breakdown} />
      </div>

      {/* CTA footer */}
      <div className="mt-6 rounded-2xl border border-[#2d6a4f]/20 bg-[#2d6a4f]/5 p-4 text-center dark:border-[#2d6a4f]/30 dark:bg-[#2d6a4f]/10">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Cada compra y pago puntual mejora tu score.
        </p>
        <Link
          href="/tienda"
          className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#2d6a4f] text-sm font-semibold text-white hover:bg-[#245a42] dark:bg-[#2d6a4f] dark:hover:bg-[#245a42]"
        >
          Ir a comprar
        </Link>
      </div>
    </div>
  );
}

// ── Tips personalizados ───────────────────────────────────────────────────────

function generateTips(breakdown: Record<string, number>): string[] {
  const tips: string[] = [];
  const entries = Object.entries(breakdown).sort((a, b) => a[1] - b[1]);

  for (const [factor, score] of entries) {
    if (tips.length >= 3) break;
    if (score >= 700) continue;

    switch (factor) {
      case "purchaseHistory":
        tips.push(
          score < 300
            ? "Compra con más frecuencia para construir tu historial."
            : "Mantén tus compras regulares para seguir subiendo.",
        );
        break;
      case "paymentPunctuality":
        tips.push(
          score < 300
            ? "Paga tus fiados a tiempo — es lo que más pesa en tu score."
            : "Sigue pagando puntual, ya vas muy bien.",
        );
        break;
      case "avgTicket":
        tips.push("Compras de mayor monto mejoran tu score gradualmente.");
        break;
      case "seniority":
        tips.push(
          "Tu antigüedad como cliente sube automáticamente con el tiempo.",
        );
        break;
      case "loyaltyPoints":
        tips.push("Acumula puntos de lealtad comprando seguido en la bodega.");
        break;
    }
  }

  if (tips.length === 0) {
    tips.push(
      "Excelente! Mantén tus hábitos actuales para conservar tu score alto.",
    );
  }

  return tips;
}
