"use client";

/**
 * PerfScoreHero — el "número que importa" del tab Rendimiento: score 0-100
 * con el gauge semicircular firma del DS (misma receta que SocioCalculadora).
 *
 * El protagonista es la experiencia REAL de los clientes (RUM, últimos 7 días);
 * la medición del equipo del admin queda como referencia en vivo. Si todavía no
 * hay visitas de clientes, muestra el equipo mientras tanto. Cierra con un
 * consejo accionable según la métrica más floja.
 */

import { CardTitle } from "@buleje/design-system";
import { Lightbulb, Monitor, Users } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import {
  useWebVitals,
  scoreVitals,
  gradeVital,
  VITALS_THRESHOLDS,
  type VitalGrade,
  type WebVitals,
} from "@/hooks/use-web-vitals";
import { useCustomerPerf } from "@/hooks/use-customer-perf";
import { pickAdvice } from "./perf-advice";

// ── Gauge helpers (semicírculo 180° — receta SocioCalculadora) ───────────────
const CX = 120;
const CY = 118;
const R = 96;
function polar(frac: number) {
  const a = ((180 - 180 * Math.min(1, Math.max(0, frac))) * Math.PI) / 180;
  return { x: CX + R * Math.cos(a), y: CY - R * Math.sin(a) };
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function arc(f0: number, f1: number) {
  const s = polar(f0);
  const e = polar(f1);
  return `M ${round2(s.x)} ${round2(s.y)} A ${R} ${R} 0 0 1 ${round2(e.x)} ${round2(e.y)}`;
}

const GRADE_UI: Record<VitalGrade, { stroke: string; text: string; pill: string; label: string }> = {
  bueno: {
    stroke: "var(--data-success-500)",
    text: "text-[var(--data-success-500)]",
    pill: "bg-[var(--data-success-500)] text-white",
    label: "Bueno",
  },
  regular: {
    stroke: "var(--data-warning-500)",
    text: "text-[var(--data-warning-500)]",
    pill: "bg-[var(--data-warning-500)] text-white",
    label: "Regular",
  },
  pobre: {
    stroke: "var(--data-error-500)",
    text: "text-[var(--data-error-500)]",
    pill: "bg-[var(--data-error-500)] text-white",
    label: "Lento",
  },
  "sin-dato": {
    stroke: "var(--rule-strong)",
    text: "text-[var(--text-tertiary)]",
    pill: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
    label: "Sin dato",
  },
};

function scoreGrade(score: number | null): VitalGrade {
  if (score == null) return "sin-dato";
  if (score >= 90) return "bueno";
  if (score >= 50) return "regular";
  return "pobre";
}

const METRICS = [
  {
    key: "lcp" as const,
    label: "Carga principal",
    tech: "LCP",
    explain: "Cuánto tarda en aparecer lo importante",
    fmt: (v: number) => `${v.toFixed(1)} s`,
  },
  {
    key: "cls" as const,
    label: "Estabilidad visual",
    tech: "CLS",
    explain: "Si la página 'salta' mientras carga",
    fmt: (v: number) => v.toFixed(3),
  },
  {
    key: "inp" as const,
    label: "Respuesta al toque",
    tech: "INP",
    explain: "Cuánto tarda en reaccionar cuando tocás",
    fmt: (v: number) => `${Math.round(v)} ms`,
  },
];

/** Gauge semicircular firma reutilizable (device + clientes comparten receta). */
function Gauge({ score, grade }: { score: number | null; grade: VitalGrade }) {
  const ui = GRADE_UI[grade];
  const frac = score == null ? 0 : score / 100;
  const tip = polar(Math.max(0.001, frac));
  return (
    <div className="relative w-full max-w-[260px]">
      <svg
        viewBox="0 0 240 138"
        className="w-full"
        role="img"
        aria-label={score == null ? "Score de velocidad: sin datos aún" : `Score de velocidad: ${score} de 100`}
      >
        <defs>
          <linearGradient id="perf-gauge-fill" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={ui.stroke} stopOpacity="0.45" />
            <stop offset="100%" stopColor={ui.stroke} />
          </linearGradient>
        </defs>
        <path d={arc(0, 1)} fill="none" stroke="var(--surface-sunken)" strokeWidth="16" strokeLinecap="round" />
        {score != null && (
          <>
            <path
              d={arc(0, Math.max(0.001, frac))}
              fill="none"
              stroke="url(#perf-gauge-fill)"
              strokeWidth="16"
              strokeLinecap="round"
              style={{ transition: "all 300ms cubic-bezier(0.22,1,0.36,1)" }}
            />
            <circle
              cx={tip.x}
              cy={tip.y}
              r="7"
              fill="var(--surface-raised)"
              stroke={ui.stroke}
              strokeWidth="3"
              style={{ transition: "all 300ms cubic-bezier(0.22,1,0.36,1)" }}
            />
          </>
        )}
      </svg>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
        <span className={cn("font-display text-5xl font-extrabold tabular-nums leading-none", ui.text)}>
          {score ?? "—"}
        </span>
        <span className="mt-1 text-sm font-semibold text-[var(--text-secondary)]">de 100</span>
      </div>
    </div>
  );
}

export default function PerfScoreHero() {
  const deviceVitals = useWebVitals();
  const customer = useCustomerPerf();

  // Normalizo la experiencia del cliente a la misma forma que el dispositivo
  // (lcp en segundos) para puntuar/graduar con los mismos umbrales.
  const customerVitals: WebVitals = {
    lcp: customer.lcpMs == null ? null : customer.lcpMs / 1000,
    cls: customer.cls,
    inp: customer.inpMs,
  };

  // Protagonista = clientes si ya hay visitas; si no, el equipo mientras tanto.
  const hasCustomerData = customer.visits > 0;
  const primaryVitals = hasCustomerData ? customerVitals : deviceVitals;
  const primaryScore = hasCustomerData ? customer.score : scoreVitals(deviceVitals);
  const primaryGrade = scoreGrade(primaryScore);
  const secondaryScore = hasCustomerData ? scoreVitals(deviceVitals) : null;

  const grades = {
    lcp: gradeVital(primaryVitals.lcp, VITALS_THRESHOLDS.lcp),
    cls: gradeVital(primaryVitals.cls, VITALS_THRESHOLDS.cls),
    inp: gradeVital(primaryVitals.inp, VITALS_THRESHOLDS.inp),
  };
  // Consejo solo cuando hay margen real: alguna métrica pobre, o el score
  // general no llegó a "bueno". A tienda ya rápida, no colgamos un nag.
  const hasPoor = Object.values(grades).some((g) => g === "pobre");
  const advice = hasPoor || primaryGrade !== "bueno" ? pickAdvice(grades) : null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1fr] lg:items-center">
          {/* Gauge protagonista */}
          <div className="flex flex-col items-center">
            <span className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-[length:var(--ts-xs)] font-bold text-[var(--accent-dark)]">
              {hasCustomerData ? (
                <>
                  <Users className="h-3.5 w-3.5" aria-hidden /> Lo que viven tus clientes · 7 días
                </>
              ) : (
                <>
                  <Monitor className="h-3.5 w-3.5" aria-hidden /> En tu equipo · ahora
                </>
              )}
            </span>
            <Gauge score={primaryScore} grade={primaryGrade} />
            <p className="mt-3 text-center text-sm text-[var(--text-secondary)]">
              {primaryGrade === "bueno" && "Tu tienda vuela — así se queda la gente comprando."}
              {primaryGrade === "regular" && "Tu tienda carga, pero se siente la espera. Hay margen."}
              {primaryGrade === "pobre" && "Tu tienda está lenta — cada segundo de espera son ventas que se van."}
              {primaryGrade === "sin-dato" && "Navegá un poco el panel para que junte mediciones."}
            </p>
            {/* Referencia cruzada equipo ↔ clientes */}
            <div className="mt-3 flex items-center gap-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
              {hasCustomerData ? (
                <>
                  <Monitor className="h-3.5 w-3.5" aria-hidden />
                  En tu equipo ahora:{" "}
                  <strong className="text-[var(--text-secondary)]">{secondaryScore ?? "—"}</strong>
                  <span>· {customer.visits.toLocaleString("es-PE")} visitas medidas</span>
                </>
              ) : (
                <>
                  <Users className="h-3.5 w-3.5" aria-hidden />
                  Aún sin visitas de clientes — se llena solo cuando entren a tu tienda
                </>
              )}
            </div>
          </div>

          {/* Desglose por métrica */}
          <div>
            <CardTitle className="text-base font-bold text-[var(--text-primary)]">
              ¿Qué tan rápida se siente tu tienda?
            </CardTitle>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {hasCustomerData
                ? "Promedio real de tus clientes en los últimos 7 días."
                : "Medido en este dispositivo, ahora mismo — como un velocímetro."}
            </p>
            <div className="mt-4 space-y-2.5">
              {METRICS.map((m) => {
                const value = primaryVitals[m.key];
                const gui = GRADE_UI[grades[m.key]];
                return (
                  <div
                    key={m.key}
                    className="flex items-center justify-between gap-3 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-sunken)]/40 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">
                        {m.label}{" "}
                        <span className="text-[length:var(--ts-xs)] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                          {m.tech}
                        </span>
                      </p>
                      <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{m.explain}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2.5">
                      <span className="text-base font-extrabold tabular-nums text-[var(--text-primary)]">
                        {value == null ? "—" : m.fmt(value)}
                      </span>
                      <span className={cn("rounded-full px-2.5 py-1 text-[length:var(--ts-xs)] font-bold", gui.pill)}>
                        {gui.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Consejo accionable — qué tocar para mejorar el número */}
      {advice && (
        <div className="flex items-start gap-3 rounded-xl border border-[var(--accent)]/25 bg-[var(--accent-soft)] p-4">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent)]/15 text-[var(--accent-dark)]">
            <Lightbulb className="h-5 w-5" strokeWidth={2} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-[var(--text-primary)]">
              Para mejorar: {advice.title}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{advice.body}</p>
          </div>
        </div>
      )}
    </div>
  );
}
