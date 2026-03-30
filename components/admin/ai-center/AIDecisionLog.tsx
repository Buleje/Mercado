"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { cn } from "@/lib/utils";
import { BookOpen, Filter, TrendingUp, AlertTriangle, BarChart3 } from "lucide-react";

// -- Types --

type DecisionCategory = "Precios" | "Inventario" | "Personal" | "Marketing" | "Fiado" | "Otro";
type ImpactResult = "Positivo" | "Neutro" | "Negativo";
type Reversibility = "reversible" | "dificil" | "irreversible";

type Decision = {
  id: string;
  text: string;
  category: DecisionCategory;
  date: string;
  reversibility?: Reversibility;
  impact?: {
    text: string;
    result: ImpactResult;
    date: string;
  };
};

const CATEGORIES: DecisionCategory[] = ["Precios", "Inventario", "Personal", "Marketing", "Fiado", "Otro"];

const STORAGE_KEY = "ai-decision-log";

const categoryColors: Record<DecisionCategory, string> = {
  Precios: "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300",
  Inventario: "bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300",
  Personal: "bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300",
  Marketing: "bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300",
  Fiado: "bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300",
  Otro: "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300",
};

const REVERSIBILITY_CFG: Record<Reversibility, { label: string; color: string }> = {
  reversible: { label: "Reversible", color: "text-emerald-600 dark:text-emerald-400" },
  dificil: { label: "Dificil revertir", color: "text-amber-600 dark:text-amber-400" },
  irreversible: { label: "Irreversible", color: "text-red-600 dark:text-red-400" },
};

// -- Component --

export default function AIDecisionLog() {
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formText, setFormText] = useState("");
  const [formCategory, setFormCategory] = useState<DecisionCategory>("Precios");
  const [formReversibility, setFormReversibility] = useState<Reversibility>("reversible");
  const [filterCat, setFilterCat] = useState<DecisionCategory | "all">("all");
  const [searchTerm, setSearchTerm] = useState("");

  const [impactTarget, setImpactTarget] = useState<string | null>(null);
  const [impactText, setImpactText] = useState("");
  const [impactResult, setImpactResult] = useState<ImpactResult>("Positivo");

  // -- Load --

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/ai-assistant/decision-log");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        setDecisions(Array.isArray(data) ? data : data.decisions ?? []);
      } catch {
        try {
          const stored = localStorage.getItem(STORAGE_KEY);
          if (stored) setDecisions(JSON.parse(stored));
        } catch { /* ignore */ }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const persist = useCallback((updated: Decision[]) => {
    setDecisions(updated);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(updated)); } catch { /* ignore */ }
  }, []);

  // -- Add decision --

  const handleAdd = () => {
    if (!formText.trim()) return;
    const newDecision: Decision = {
      id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      text: formText.trim(),
      category: formCategory,
      reversibility: formReversibility,
      date: new Date().toISOString().slice(0, 10),
    };
    persist([newDecision, ...decisions]);
    setFormText("");
    setFormCategory("Precios");
    setFormReversibility("reversible");
    setShowForm(false);
  };

  // -- Record impact --

  const handleImpact = (decisionId: string) => {
    if (!impactText.trim()) return;
    const updated = decisions.map((d) =>
      d.id === decisionId
        ? { ...d, impact: { text: impactText.trim(), result: impactResult, date: new Date().toISOString().slice(0, 10) } }
        : d
    );
    persist(updated);
    setImpactTarget(null);
    setImpactText("");
    setImpactResult("Positivo");
  };

  // -- Delete decision --

  const handleDelete = (id: string) => {
    persist(decisions.filter((d) => d.id !== id));
  };

  // -- Analysis (ALL decisions, not just last 5) --

  const analysis = useMemo(() => {
    const withImpact = decisions.filter((d) => d.impact);
    if (withImpact.length < 2) return null;

    const catStats: Record<string, { positive: number; neutral: number; negative: number; total: number }> = {};
    for (const d of withImpact) {
      if (!catStats[d.category]) catStats[d.category] = { positive: 0, neutral: 0, negative: 0, total: 0 };
      catStats[d.category].total++;
      if (d.impact!.result === "Positivo") catStats[d.category].positive++;
      else if (d.impact!.result === "Negativo") catStats[d.category].negative++;
      else catStats[d.category].neutral++;
    }

    const insights: string[] = [];
    const positiveTotal = withImpact.filter((d) => d.impact!.result === "Positivo").length;
    const negativeTotal = withImpact.filter((d) => d.impact!.result === "Negativo").length;
    const successRate = Math.round((positiveTotal / withImpact.length) * 100);
    insights.push(`Tasa de exito global: ${successRate}% (${positiveTotal} positivas de ${withImpact.length})`);

    // Best and worst category
    const catEntries = Object.entries(catStats).filter(([, s]) => s.total >= 2);
    if (catEntries.length > 0) {
      const best = catEntries.sort((a, b) => (b[1].positive / b[1].total) - (a[1].positive / a[1].total))[0];
      const worst = catEntries.sort((a, b) => (a[1].positive / a[1].total) - (b[1].positive / b[1].total))[0];
      if (best[0] !== worst[0]) {
        insights.push(`Mejor area: ${best[0]} (${Math.round(best[1].positive / best[1].total * 100)}% exito)`);
        insights.push(`Area a mejorar: ${worst[0]} (${Math.round(worst[1].positive / worst[1].total * 100)}% exito)`);
      }
    }

    // Streak
    if (withImpact.length >= 3) {
      let streak = 0;
      let streakType: ImpactResult | null = null;
      for (const d of withImpact) {
        if (streakType === null) {
          streakType = d.impact!.result;
          streak = 1;
        } else if (d.impact!.result === streakType) {
          streak++;
        } else break;
      }
      if (streak >= 3) {
        if (streakType === "Positivo") insights.push(`Racha positiva: ${streak} decisiones acertadas seguidas!`);
        else if (streakType === "Negativo") insights.push(`Alerta: ${streak} decisiones negativas seguidas. Revisa tu criterio.`);
      }
    }

    return { insights, catStats, successRate, positiveTotal, negativeTotal };
  }, [decisions]);

  // -- Contradiction detection --

  const contradictions = useMemo(() => {
    const recent = decisions.slice(0, 20); // check last 20
    const found: string[] = [];
    for (let i = 0; i < recent.length; i++) {
      for (let j = i + 1; j < recent.length; j++) {
        if (recent[i].category === recent[j].category) {
          const textA = recent[i].text.toLowerCase();
          const textB = recent[j].text.toLowerCase();
          const opposites = [
            ["subir", "bajar"], ["subi", "baje"], ["aumentar", "reducir"],
            ["agregar", "quitar"], ["contratar", "despedir"],
            ["dar", "quitar"], ["activar", "desactivar"],
          ];
          for (const [a, b] of opposites) {
            if ((textA.includes(a) && textB.includes(b)) || (textA.includes(b) && textB.includes(a))) {
              found.push(`"${recent[i].text.slice(0, 40)}..." vs "${recent[j].text.slice(0, 40)}..." (${recent[i].category})`);
              break;
            }
          }
        }
        if (found.length >= 3) break;
      }
      if (found.length >= 3) break;
    }
    return found;
  }, [decisions]);

  // -- Pending impact count --

  const pendingImpact = useMemo(() => {
    const daysSince = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
    return decisions.filter((d) => !d.impact && daysSince(d.date) >= 7).length;
  }, [decisions]);

  // -- Filtered + searched --

  const displayDecisions = useMemo(() => {
    let list = [...decisions];
    if (filterCat !== "all") list = list.filter((d) => d.category === filterCat);
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((d) => d.text.toLowerCase().includes(term) || d.impact?.text.toLowerCase().includes(term));
    }
    return list;
  }, [decisions, filterCat, searchTerm]);

  const daysSince = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);

  const impactBorderColor = (result?: ImpactResult) => {
    if (!result) return "border-l-gray-300 dark:border-l-gray-600";
    if (result === "Positivo") return "border-l-emerald-500";
    if (result === "Negativo") return "border-l-red-500";
    return "border-l-gray-400 dark:border-l-gray-500";
  };

  // -- Render --

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="space-y-3">
            {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg" />)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <BookOpen className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Historial de Decisiones
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Registra decisiones y aprende de tu historial
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {pendingImpact > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-semibold">
              {pendingImpact} sin evaluar
            </span>
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className={cn("px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
              showForm
                ? "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300"
                : "bg-[#0f766e] border-[#0f766e] text-white hover:bg-[#0d5f58]"
            )}
          >
            {showForm ? "Cancelar" : "Nueva Decision"}
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div className="mb-5 p-4 rounded-lg border border-[#0f766e]/30 bg-[#0f766e]/5 dark:bg-[#0f766e]/10">
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Decision</label>
              <textarea
                value={formText}
                onChange={(e) => setFormText(e.target.value)}
                placeholder={`Ej: "Subi el precio del arroz de S/4 a S/4.50"`}
                rows={2}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 focus:ring-2 focus:ring-[#0f766e]/30 focus:border-[#0f766e] outline-none resize-none"
              />
            </div>
            <div className="flex items-end gap-3 flex-wrap">
              <div className="flex-1 min-w-[120px]">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Categoria</label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as DecisionCategory)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-1 block">Reversibilidad</label>
                <select
                  value={formReversibility}
                  onChange={(e) => setFormReversibility(e.target.value as Reversibility)}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none"
                >
                  <option value="reversible">Reversible</option>
                  <option value="dificil">Dificil de revertir</option>
                  <option value="irreversible">Irreversible</option>
                </select>
              </div>
              <button
                onClick={handleAdd}
                disabled={!formText.trim()}
                className={cn("px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                  formText.trim() ? "bg-[#0f766e] text-white hover:bg-[#0d5f58]" : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                )}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analysis dashboard */}
      {analysis && (
        <div className="mb-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="p-3 rounded-lg border border-[#f97316]/30 bg-[#f97316]/10 dark:bg-[#f97316]/5">
            <div className="flex items-center gap-1.5 mb-2">
              <TrendingUp className="w-3.5 h-3.5 text-[#f97316]" />
              <h3 className="text-xs font-semibold text-[#f97316]">Analisis</h3>
            </div>
            <ul className="space-y-1">
              {analysis.insights.map((insight, i) => (
                <li key={i} className="text-xs text-gray-700 dark:text-gray-300">&bull; {insight}</li>
              ))}
            </ul>
          </div>

          {/* Category success rates */}
          {Object.keys(analysis.catStats).length > 0 && (
            <div className="p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <div className="flex items-center gap-1.5 mb-2">
                <BarChart3 className="w-3.5 h-3.5 text-gray-500" />
                <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400">Exito por categoria</h3>
              </div>
              <div className="space-y-1.5">
                {Object.entries(analysis.catStats).map(([cat, stats]) => {
                  const rate = stats.total > 0 ? Math.round((stats.positive / stats.total) * 100) : 0;
                  return (
                    <div key={cat} className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 w-16 shrink-0">{cat}</span>
                      <div className="flex-1 h-2.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className={cn("h-full rounded-full transition-all", rate >= 60 ? "bg-emerald-500" : rate >= 40 ? "bg-amber-500" : "bg-red-500")}
                          style={{ width: `${rate}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-gray-500 w-8 text-right">{rate}%</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Contradictions */}
      {contradictions.length > 0 && (
        <div className="mb-4 p-3 rounded-lg border border-red-200 dark:border-red-800/30 bg-red-50/50 dark:bg-red-950/20">
          <div className="flex items-center gap-1.5 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
            <h3 className="text-xs font-semibold text-red-600 dark:text-red-400">Decisiones contradictorias detectadas</h3>
          </div>
          <ul className="space-y-1">
            {contradictions.map((c, i) => (
              <li key={i} className="text-xs text-gray-600 dark:text-gray-400">&bull; {c}</li>
            ))}
          </ul>
          <p className="text-[10px] text-gray-400 mt-1">Revisa si el cambio fue intencional o si necesitas una estrategia mas consistente.</p>
        </div>
      )}

      {/* Filter + Search bar */}
      {decisions.length > 0 && (
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Filter className="w-3 h-3 text-gray-400" />
            <button
              onClick={() => setFilterCat("all")}
              className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                filterCat === "all" ? "bg-[#0f766e] text-white border-[#0f766e]" : "border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              )}
            >
              Todas
            </button>
            {CATEGORIES.filter((c) => decisions.some((d) => d.category === c)).map((cat) => (
              <button
                key={cat}
                onClick={() => setFilterCat(filterCat === cat ? "all" : cat)}
                className={cn("text-[10px] px-2 py-0.5 rounded-full border transition-colors",
                  filterCat === cat ? "bg-[#0f766e] text-white border-[#0f766e]" : "border-gray-200 dark:border-gray-700 text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar..."
            className="text-xs px-2.5 py-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 placeholder:text-gray-400 outline-none w-32"
          />
        </div>
      )}

      {/* Timeline */}
      {decisions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <BookOpen className="w-8 h-8 text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No hay decisiones registradas.</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Registra tu primera decision para empezar.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
          {displayDecisions.map((d) => {
            const days = daysSince(d.date);
            const canRecordImpact = days >= 7 && !d.impact;
            const revCfg = d.reversibility ? REVERSIBILITY_CFG[d.reversibility] : null;

            return (
              <div
                key={d.id}
                className={cn("border-l-4 rounded-lg border border-gray-100 dark:border-gray-800 p-3", impactBorderColor(d.impact?.result))}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(d.date).toLocaleDateString("es-PE")}
                      </span>
                      <span className={cn("text-xs font-medium px-2 py-0.5 rounded-full", categoryColors[d.category])}>
                        {d.category}
                      </span>
                      {revCfg && (
                        <span className={cn("text-[10px]", revCfg.color)}>{revCfg.label}</span>
                      )}
                    </div>
                    <p className="text-sm text-gray-800 dark:text-gray-200">{d.text}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(d.id)}
                    className="text-gray-300 hover:text-red-500 dark:text-gray-600 dark:hover:text-red-400 transition-colors text-xs shrink-0"
                    title="Eliminar"
                  >
                    &times;
                  </button>
                </div>

                {d.impact && (
                  <div className={cn("mt-2 p-2 rounded-md text-xs",
                    d.impact.result === "Positivo" && "bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400",
                    d.impact.result === "Neutro" && "bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-400",
                    d.impact.result === "Negativo" && "bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400",
                  )}>
                    <span className="font-medium">Impacto ({d.impact.result}):</span> {d.impact.text}
                  </div>
                )}

                {canRecordImpact && impactTarget !== d.id && (
                  <button
                    onClick={() => setImpactTarget(d.id)}
                    className="mt-2 text-xs text-[#0f766e] dark:text-[#14b8a6] font-medium hover:underline"
                  >
                    Registrar Impacto ({days} dias despues)
                  </button>
                )}

                {impactTarget === d.id && (
                  <div className="mt-2 p-3 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 space-y-2">
                    <textarea
                      value={impactText}
                      onChange={(e) => setImpactText(e.target.value)}
                      placeholder="Que paso despues de esta decision?"
                      rows={2}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 placeholder:text-gray-400 outline-none resize-none"
                    />
                    <div className="flex items-center gap-2">
                      <select
                        value={impactResult}
                        onChange={(e) => setImpactResult(e.target.value as ImpactResult)}
                        className="px-2 py-1 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 outline-none"
                      >
                        <option value="Positivo">Positivo</option>
                        <option value="Neutro">Neutro</option>
                        <option value="Negativo">Negativo</option>
                      </select>
                      <button
                        onClick={() => handleImpact(d.id)}
                        disabled={!impactText.trim()}
                        className={cn("px-3 py-1 rounded-lg text-xs font-medium transition-colors",
                          impactText.trim() ? "bg-[#0f766e] text-white hover:bg-[#0d5f58]" : "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                        )}
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => { setImpactTarget(null); setImpactText(""); }}
                        className="px-3 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}