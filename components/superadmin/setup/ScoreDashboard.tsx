"use client";

import { Bot, CheckCircle2, ExternalLink, TrendingUp } from "lucide-react";
import { calcScore, type ScoreSnapshot } from "@/lib/superadmin/setup-types";

interface ScoreDashboardProps {
  scores: ScoreSnapshot[];
}

export default function ScoreDashboard({ scores }: ScoreDashboardProps) {
  return (
    <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="w-4 h-4 text-teal-600 dark:text-teal-400" />
        <h2 className="text-sm font-bold text-gray-900 dark:text-white">
          Score de Buenas Prácticas
        </h2>
        <span className="text-[10px] text-gray-400 uppercase tracking-wide ml-auto">
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
              className="border border-gray-100 dark:border-gray-900 rounded-xl p-4"
            >
              <div className="flex items-center gap-2 mb-3">
                {isAgentIA ? (
                  <Bot className="w-4 h-4 text-purple-500" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-teal-500" />
                )}
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  {score.label}
                </span>
              </div>

              {/* Buckets */}
              <div className="grid grid-cols-4 gap-2 mb-3">
                <div className="text-center">
                  <div className="text-lg font-extrabold text-emerald-500">{score.applied}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">✅ Aplicadas</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-extrabold text-amber-500">{score.partial}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">⚠️ Parciales</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-extrabold text-red-500">{score.missing}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">❌ Faltan</div>
                </div>
                <div className="text-center">
                  <div className="text-lg font-extrabold text-gray-400">{score.na}</div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide">➖ N/A</div>
                </div>
              </div>

              {/* Score sólido */}
              <div className="mb-2">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Score sólido (✅ + ⚠️×0.5)
                  </span>
                  <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                    {c.solidPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-teal-500 to-emerald-500"
                    style={{ width: `${c.solidPct}%` }}
                  />
                </div>
              </div>

              {/* Score perfecto */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-600 dark:text-gray-400">
                    Score perfecto (solo ✅)
                  </span>
                  <span className="text-xs font-bold text-blue-600 dark:text-blue-400">
                    {c.perfectPct}%
                  </span>
                </div>
                <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-blue-500 to-indigo-500"
                    style={{ width: `${c.perfectPct}%` }}
                  />
                </div>
              </div>

              {score.link && (
                <a
                  href={score.link.url}
                  className="inline-flex items-center gap-1 text-[10px] text-teal-600 dark:text-teal-400 hover:underline mt-3"
                >
                  {score.link.label}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-gray-400 dark:text-gray-600 mt-3 leading-relaxed">
        <strong>Techo realista del Excel 2026:</strong> 87.5% sólido / 77% perfecto (las 3 ❌ y 4 ➖ son decisiones conscientes de NO aplicar — Scrum, Service Mesh, Sharding, Monorepo, Factory DI, Hexagonal completa, Terraform).
        <br />
        <strong>Path al máximo Excel Agentes IA:</strong> faltan RAG vectorial, structured output JSON, modelo mixto (router LLM), temperaturas diferenciadas por agente, LangSmith/Helicone, LlamaGuard.
      </p>
    </div>
  );
}
