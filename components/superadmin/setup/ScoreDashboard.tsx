"use client";

import { Bot, CheckCircle2, ExternalLink, TrendingUp, CheckCheck, AlertTriangle, XCircle, MinusCircle } from "lucide-react";
import { StatCard } from "@buleje/design-system";
import { calcScore, type ScoreSnapshot } from "@/lib/superadmin/setup-types";

interface ScoreDashboardProps {
  scores: ScoreSnapshot[];
}

/**
 * Ola 3 — Migrado a StatCard del DS:
 *  - 4 tiles (APLICADAS / PARCIALES / FALTAN / N/A) usan `<StatCard density="default" />`.
 *  - Iconos neutros `text-[var(--text-secondary)]` gris — sin color saturado.
 *  - Emphasis semantico SOLO en el valor cuando N > 0:
 *      APLICADAS  → success (teal)  cuando N > 0
 *      PARCIALES  → warning (amber) cuando N > 0
 *      FALTAN     → error   (red)   cuando N > 0
 *      N/A        → siempre neutral (no es error, es decision consciente)
 *  - Cuando N === 0 → emphasis neutral (gris).
 *  - Sin border-top decorativo — el container card ya lo provee.
 *  - Emojis removidos de los labels (minimalismo holded-style).
 */
export default function ScoreDashboard({ scores }: ScoreDashboardProps) {
  return (
    <div className="bg-[var(--surface-canvas)] border border-[var(--rule-base)] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-[var(--text-secondary)]" />
        <h2 className="text-sm font-bold text-[var(--text-primary)]">
          Score de Buenas Prácticas
        </h2>
        <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] uppercase tracking-wide ml-auto">
          Actualizado 2026-04-06
        </span>
      </div>

      <div className="space-y-4">
        {scores.map((score) => {
          const c = calcScore(score);
          const isAgentIA = score.label.includes("Agentes IA");
          return (
            <div
              key={score.label}
              id={isAgentIA ? "practicas-agentes-ia" : "practicas-2026"}
              className="border border-[var(--rule-base)] rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                {isAgentIA ? (
                  <Bot className="w-4 h-4 text-[var(--text-secondary)]" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-[var(--text-secondary)]" />
                )}
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {score.label}
                </span>
              </div>

              {/* Buckets — StatCard DS semaforo condicional (Ola 3) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <StatCard
                  icon={CheckCheck}
                  label="Aplicadas"
                  value={score.applied}
                  emphasis={score.applied > 0 ? "success" : "neutral"}
                  density="default"
                />
                <StatCard
                  icon={AlertTriangle}
                  label="Parciales"
                  value={score.partial}
                  emphasis={score.partial > 0 ? "warning" : "neutral"}
                  density="default"
                />
                <StatCard
                  icon={XCircle}
                  label="Faltan"
                  value={score.missing}
                  emphasis={score.missing > 0 ? "error" : "neutral"}
                  density="default"
                />
                <StatCard
                  icon={MinusCircle}
                  label="N/A"
                  value={score.na}
                  emphasis="neutral"
                  density="default"
                />
              </div>

              {/* Score sólido */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[var(--text-secondary)]">
                    Score sólido (aplicadas + parciales×0.5)
                  </span>
                  <span className="text-xs font-bold text-[var(--accent)]">
                    {c.solidPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width: `${c.solidPct}%` }}
                  />
                </div>
              </div>

              {/* Score perfecto */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-[var(--text-secondary)]">
                    Score perfecto (solo aplicadas)
                  </span>
                  <span className="text-xs font-bold text-[var(--data-success)]">
                    {c.perfectPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-[var(--surface-sunken)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[var(--accent)]"
                    style={{ width: `${c.perfectPct}%` }}
                  />
                </div>
              </div>

              {score.link && (
                <a
                  href={score.link.url}
                  className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--accent)] hover:underline mt-3"
                >
                  {score.link.label}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] mt-3 leading-relaxed">
        <strong>Techo realista del Excel 2026:</strong> 87.5% sólido / 77% perfecto (las 3 faltantes y 4 N/A son decisiones conscientes de NO aplicar — Scrum, Service Mesh, Sharding, Monorepo, Factory DI, Hexagonal completa, Terraform).
        <br />
        <strong>Path al máximo Excel Agentes IA:</strong> faltan RAG vectorial, structured output JSON, modelo mixto (router LLM), temperaturas diferenciadas por agente, LangSmith/Helicone, LlamaGuard.
      </p>
    </div>
  );
}
