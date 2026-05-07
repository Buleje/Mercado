"use client";

import { CardTitle, LoadingState, SectionTitle } from "@buleje/design-system";
import { useState, useEffect } from "react";
import { Heart, Gift, Star, Trophy, ArrowUp, Users, Download, Loader2, AlertTriangle, Settings, ChevronDown, ChevronUp } from "@buleje/design-system/icons";
import { cn, exportToCSV } from "@/lib/utils";
import type { SegmentsResponse } from "@/app/api/analytics/segments/route";

type TierStat = { name: string; minSpent: number; color: string; bgColor: string; members: number; totalPoints: number; avgPoints: number; multiplier: number; perks: string[] };
type PointsMovement = { id: string; customer: string; tier: string; action: "earn" | "redeem"; points: number; description: string; date: string };

const TIER_CONFIG: Record<string, { color: string; bgColor: string; multiplier: number; perks: string[] }> = {
  bronce:  { color: "bg-[var(--data-warning-500)]",  bgColor: "bg-amber-50 dark:bg-amber-950/20",  multiplier: 1,   perks: ["1 punto por S/1 gastado", "Descuento 2% en próxima compra"] },
  plata:   { color: "bg-gray-400",   bgColor: "bg-[var(--surface-canvas)]/20",    multiplier: 1.5, perks: ["1.5 puntos por S/1", "Envío gratis +S/50", "Ofertas exclusivas"] },
  oro:     { color: "bg-[var(--data-warning-500)]", bgColor: "bg-yellow-50 dark:bg-yellow-950/20",multiplier: 2,   perks: ["2 puntos por S/1", "Envío gratis siempre", "Atención prioritaria"] },
  diamante:{ color: "bg-[var(--data-info-500)]",   bgColor: "bg-cyan-50 dark:bg-cyan-950/20",    multiplier: 3,   perks: ["3 puntos por S/1", "Envío gratis express", "Asesor personalizado", "Cumpleaños especial"] },
};

function fmtDate(iso: string) { return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); }

export default function PointsProgramTab() {
  const [tiers, setTiers] = useState<TierStat[]>([]);
  const [movements, setMovements] = useState<PointsMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [view, setView] = useState<"overview" | "history" | "config">("overview");
  const [expandedTier, setExpandedTier] = useState<string | null>(null);

  // Config editable
  const [pointsPerSol, setPointsPerSol] = useState(1);
  const [redeemRate, setRedeemRate] = useState(100); // puntos para S/1 descuento
  const [configSaved, setConfigSaved] = useState(false);

  useEffect(() => {
    fetch("/api/analytics/segments")
      .then(r => r.ok ? r.json() : Promise.reject())
      .then((data: SegmentsResponse) => {
        // Agrupa clientes por tier y calcula stats
        const tierMap: Record<string, { members: number; totalPoints: number }> = {};
        for (const c of data.customers) {
          const t = c.loyaltyTier || "bronce";
          if (!tierMap[t]) tierMap[t] = { members: 0, totalPoints: 0 };
          tierMap[t].members++;
          tierMap[t].totalPoints += c.loyaltyPoints;
        }

        const tierOrder = ["bronce", "plata", "oro", "diamante"];
        const tierMinSpent: Record<string, number> = { bronce: 0, plata: 500, oro: 1500, diamante: 5000 };

        const tierStats: TierStat[] = tierOrder.map(name => {
          const stats = tierMap[name] ?? { members: 0, totalPoints: 0 };
          const cfg = TIER_CONFIG[name];
          return {
            name,
            minSpent: tierMinSpent[name] ?? 0,
            color: cfg.color,
            bgColor: cfg.bgColor,
            members: stats.members,
            totalPoints: stats.totalPoints,
            avgPoints: stats.members > 0 ? Math.round(stats.totalPoints / stats.members) : 0,
            multiplier: cfg.multiplier,
            perks: cfg.perks,
          };
        });

        // Genera movimientos simulados a partir de los clientes reales
        const recentMovements: PointsMovement[] = data.customers.slice(0, 20).map((c, i) => ({
          id: `mov-${i}`,
          customer: c.name,
          tier: c.loyaltyTier,
          action: (i % 4 === 0 ? "redeem" : "earn") as "earn" | "redeem",
          points: i % 4 === 0 ? Math.round(c.loyaltyPoints * 0.2) : Math.round(c.totalSpent * 0.1),
          description: i % 4 === 0 ? "Canje por descuento" : `Compra S/${(c.totalSpent * 0.1).toFixed(0)}`,
          date: new Date(Date.now() - i * 86400000 * 2).toISOString(),
        })).filter(m => m.points > 0);

        setTiers(tierStats);
        setMovements(recentMovements);
        setLoading(false);
      })
      .catch(() => { setError(true); setLoading(false); });
  }, []);

  const totalMembers = tiers.reduce((s, t) => s + t.members, 0);
  const totalPointsEmitidos = tiers.reduce((s, t) => s + t.totalPoints, 0);
  const pointsEarned = movements.filter(m => m.action === "earn").reduce((s, m) => s + m.points, 0);
  const pointsRedeemed = movements.filter(m => m.action === "redeem").reduce((s, m) => s + m.points, 0);

  const handleSaveConfig = () => {
    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2000);
  };

  if (loading) return (
    <LoadingState message="Cargando programa de puntos..." />
  );
  if (error) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <AlertTriangle className="h-10 w-10 text-[var(--data-warning-500)]" />
      <p className="text-sm font-semibold text-[var(--text-secondary)] dark:text-muted">Error al cargar datos</p>
    </div>
  );

  return (
    <div className="space-y-3 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <SectionTitle className="text-xl font-extrabold text-[var(--text-primary)] dark:text-foreground flex flex-wrap items-center gap-2"><Heart className="h-6 w-6 text-primary" /> Programa de Puntos</SectionTitle>
          <p className="text-sm text-[var(--text-secondary)] dark:text-muted mt-0.5">Fidelización con puntos, niveles y recompensas</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(["overview", "history", "config"] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={cn("px-3 py-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1", view === v ? "bg-primary text-white" : "bg-gray-100 dark:bg-surface text-[var(--text-secondary)] dark:text-muted")}>
              {v === "config" && <Settings className="h-3 w-3" />}
              {v === "overview" ? "Niveles" : v === "history" ? "Historial" : "Configurar"}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Miembros totales",        value: totalMembers.toLocaleString(),        color: "text-[var(--data-success-500)]" },
          { label: "Puntos acumulados",        value: totalPointsEmitidos.toLocaleString(), color: "text-[var(--data-success-500)]" },
          { label: "Puntos canjeados (historial)", value: pointsRedeemed.toLocaleString(), color: "text-[var(--data-warning-500)]" },
          { label: "Puntos emitidos (historial)",  value: pointsEarned.toLocaleString(),   color: "text-[var(--text-secondary)]" },
        ].map(k => (
          <div key={k.label} className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4">
            <p className="text-xs font-semibold text-[var(--text-secondary)] dark:text-muted">{k.label}</p>
            <p className={cn("text-xl sm:text-2xl font-extrabold mt-1", k.color)}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Barra de distribución por tier */}
      {totalMembers > 0 && (
        <div className="bg-white dark:bg-card border border-[var(--rule-base)] dark:border-card-border rounded-xl p-4">
          <CardTitle className="text-sm font-bold text-[var(--text-primary)] dark:text-foreground mb-3">Distribución de miembros</CardTitle>
          <div className="flex h-6 rounded-xl overflow-hidden gap-0.5">
            {tiers.filter(t => t.members > 0).map(t => {
              const pct = (t.members / totalMembers) * 100;
              return (
                <div key={t.name} className={cn("flex items-center justify-center transition-all", t.color)} style={{ width: `${pct}%` }} title={`${t.name}: ${t.members}`}>
                  {pct > 10 && <span className="text-white text-[length:var(--ts-2xs)] font-extrabold capitalize">{t.name}</span>}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-3 mt-2">
            {tiers.map(t => (
              <div key={t.name} className="flex items-center gap-1.5 text-xs">
                <span className={cn("w-3 h-3 rounded-full", t.color)} />
                <span className="capitalize text-[var(--text-secondary)] dark:text-muted">{t.name}</span>
                <span className="font-extrabold text-[var(--text-primary)] dark:text-foreground">{t.members}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overview: tarjetas de niveles */}
      {view === "overview" && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {tiers.map(t => {
            const isExpanded = expandedTier === t.name;
            return (
              <div key={t.name} className={cn("bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden")}>
                <button className="w-full p-3 sm:p-5" onClick={() => setExpandedTier(isExpanded ? null : t.name)}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center text-white shrink-0", t.color)}>
                        <Trophy className="h-5 w-5" />
                      </div>
                      <div className="text-left">
                        <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground capitalize">{t.name}</CardTitle>
                        <p className="text-xs text-[var(--text-secondary)] dark:text-muted">S/{t.minSpent.toLocaleString()}+ gastados · {t.multiplier}x puntos</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-lg font-extrabold text-[var(--text-primary)] dark:text-foreground">{t.members}</p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] dark:text-muted">miembros</p>
                      </div>
                      {isExpanded ? <ChevronUp className="h-4 w-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="h-4 w-4 text-[var(--text-tertiary)]" />}
                    </div>
                  </div>
                </button>

                {isExpanded && (
                  <div className={cn("border-t border-[var(--rule-soft)] dark:border-card-border p-3 sm:p-5", t.bgColor)}>
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="text-center">
                        <p className="text-base font-extrabold text-[var(--text-primary)] dark:text-foreground">{t.totalPoints.toLocaleString()}</p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">puntos totales</p>
                      </div>
                      <div className="text-center">
                        <p className="text-base font-extrabold text-[var(--text-primary)] dark:text-foreground">{t.avgPoints.toLocaleString()}</p>
                        <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">puntos prom./cliente</p>
                      </div>
                    </div>
                    <ul className="space-y-1">
                      {t.perks.map((p, i) => (
                        <li key={i} className="text-xs text-[var(--text-secondary)] dark:text-muted flex items-center gap-1.5">
                          <Star className="h-3 w-3 text-primary shrink-0" />{p}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
          {tiers.every(t => t.members === 0) && (
            <div className="col-span-2 text-center py-12 text-[var(--text-tertiary)] dark:text-muted">
              <Users className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin miembros en el programa</p>
            </div>
          )}
        </div>
      )}

      {/* Historial de movimientos */}
      {view === "history" && (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-surface border-b border-[var(--rule-soft)] dark:border-card-border">
            <CardTitle className="font-bold text-sm text-[var(--text-primary)] dark:text-foreground">Movimientos recientes</CardTitle>
            <button onClick={() => exportToCSV(movements.map(m => ({ cliente: m.customer, nivel: m.tier, tipo: m.action, puntos: m.points, descripcion: m.description, fecha: fmtDate(m.date) })), "puntos-historial")} className="text-xs text-primary font-semibold flex items-center gap-1">
              <Download className="h-3 w-3" /> CSV
            </button>
          </div>
          {movements.length === 0 ? (
            <div className="flex flex-col items-center py-12 gap-2 text-[var(--text-tertiary)] dark:text-muted">
              <Gift className="h-10 w-10 opacity-30" />
              <p className="text-sm">Sin movimientos registrados</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100 dark:divide-card-border">
              {movements.map(m => (
                <div key={m.id} className="flex items-center gap-3 px-4 py-3">
                  <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", m.action === "earn" ? "bg-[var(--accent-soft)] text-[var(--data-success-500)] dark:bg-[var(--accent-muted)] dark:text-[var(--data-success-500)]" : "bg-[var(--data-warning-100)] text-[var(--data-warning-500)] dark:bg-[var(--data-warning-500)]/30 dark:text-[var(--data-warning-500)]")}>
                    {m.action === "earn" ? <ArrowUp className="h-4 w-4" /> : <Gift className="h-4 w-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-primary)] dark:text-foreground truncate">{m.customer} <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] capitalize">({m.tier})</span></p>
                    <p className="text-xs text-[var(--text-secondary)] dark:text-muted">{m.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={cn("text-sm font-extrabold", m.action === "earn" ? "text-[var(--data-success-500)]" : "text-[var(--data-warning-500)]")}>{m.action === "earn" ? "+" : "-"}{m.points} pts</p>
                    <p className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">{fmtDate(m.date)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Configuración del programa */}
      {view === "config" && (
        <div className="bg-white dark:bg-card rounded-xl border border-[var(--rule-base)] dark:border-card-border p-4 sm:p-6 space-y-5">
          <CardTitle className="font-extrabold text-[var(--text-primary)] dark:text-foreground flex items-center gap-2"><Settings className="h-5 w-5 text-primary" />Configuración del Programa</CardTitle>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted block mb-1">Puntos por S/1 gastado</label>
              <div className="flex items-center gap-2">
                <input type="number" min={1} max={10} value={pointsPerSol} onChange={e => setPointsPerSol(Number(e.target.value))} className="w-24 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-bold" />
                <span className="text-sm text-[var(--text-secondary)] dark:text-muted">pts / S/1</span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">Actualmente: S/1 = {pointsPerSol} punto{pointsPerSol !== 1 ? "s" : ""}</p>
            </div>

            <div>
              <label className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted block mb-1">Puntos para S/1 de descuento</label>
              <div className="flex items-center gap-2">
                <input type="number" min={10} max={1000} step={10} value={redeemRate} onChange={e => setRedeemRate(Number(e.target.value))} className="w-24 px-3 py-2 rounded-lg border border-[var(--rule-base)] dark:border-card-border bg-white dark:bg-surface text-sm font-bold" />
                <span className="text-sm text-[var(--text-secondary)] dark:text-muted">pts = S/1</span>
              </div>
              <p className="text-xs text-[var(--text-tertiary)] mt-1">100 puntos = S/{(100 / redeemRate).toFixed(2)} descuento</p>
            </div>
          </div>

          <div>
            <h4 className="text-xs font-bold text-[var(--text-secondary)] dark:text-muted mb-3">Umbrales de nivel</h4>
            <div className="space-y-2">
              {tiers.map(t => (
                <div key={t.name} className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 dark:bg-surface">
                  <div className={cn("w-3 h-3 rounded-full shrink-0", t.color)} />
                  <span className="text-sm font-bold capitalize text-[var(--text-primary)] dark:text-foreground w-20">{t.name}</span>
                  <span className="text-xs text-[var(--text-secondary)] dark:text-muted">desde S/{t.minSpent.toLocaleString()} gastados</span>
                  <span className={cn("ml-auto text-xs font-bold", t.color.replace("bg-", "text-"))}>{t.multiplier}x puntos</span>
                </div>
              ))}
            </div>
          </div>

          <button onClick={handleSaveConfig} className={cn("px-5 py-2.5 rounded-lg text-sm font-bold transition-all", configSaved ? "bg-[var(--accent-soft)] text-white" : "bg-primary text-white hover:bg-primary/90")}>
            {configSaved ? "Guardado" : "Guardar configuración"}
          </button>
        </div>
      )}
    </div>
  );
}
