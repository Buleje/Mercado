"use client";

/**
 * PerfScoreHero — el "número que importa" del tab Rendimiento: score 0-100
 * con el gauge semicircular firma del DS (misma receta que SocioCalculadora)
 * + desglose de las 3 Core Web Vitals con umbrales oficiales.
 */

import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import {
  useWebVitals,
  scoreVitals,
  gradeVital,
  VITALS_THRESHOLDS,
  type VitalGrade,
} from "@/hooks/use-web-vitals";

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

export default function PerfScoreHero() {
  const vitals = useWebVitals();
  const score = scoreVitals(vitals);
  const grade = scoreGrade(score);
  const ui = GRADE_UI[grade];
  const frac = score == null ? 0 : score / 100;
  const tip = polar(Math.max(0.001, frac));

  return (
    <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-6">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[0.9fr_1fr] lg:items-center">
        {/* Gauge */}
        <div className="flex flex-col items-center">
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
          <p className="mt-3 text-center text-sm text-[var(--text-secondary)]">
            {grade === "bueno" && "Tu tienda vuela — así se queda la gente comprando."}
            {grade === "regular" && "Tu tienda carga, pero se siente la espera. Hay margen."}
            {grade === "pobre" && "Tu tienda está lenta — cada segundo de espera son ventas que se van."}
            {grade === "sin-dato" && "Navegá un poco el panel para que junte mediciones."}
          </p>
        </div>

        {/* Desglose por métrica */}
        <div>
          <CardTitle className="text-base font-bold text-[var(--text-primary)]">
            ¿Qué tan rápida se siente tu tienda?
          </CardTitle>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Medido en este dispositivo, ahora mismo — como un velocímetro.
          </p>
          <div className="mt-4 space-y-2.5">
            {METRICS.map((m) => {
              const value = vitals[m.key];
              const g = gradeVital(value, VITALS_THRESHOLDS[m.key]);
              const gui = GRADE_UI[g];
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
  );
}
