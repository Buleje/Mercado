"use client";

import { useState, useEffect, useMemo } from "react";
import { cn } from "@/lib/utils";
import { CreditCard, AlertTriangle, MessageCircle, ArrowUpDown, Filter } from "lucide-react";

// -- Types --

type FiadoPago = {
  id: string;
  amount: number;
  date: string;
};

type Fiado = {
  id: string;
  customerName: string;
  originalAmount: number;
  balance: number;
  createdAt: string;
  dueDate?: string;
  status: "pagado" | "activo" | "vencido";
  payments?: FiadoPago[];
};

type RiskLevel = "al-dia" | "atrasado" | "moroso" | "perdido";

type SortKey = "balance" | "days" | "risk" | "name";

// -- Risk classification --

function classifyRisk(f: Fiado): RiskLevel {
  if (f.status === "pagado") return "al-dia";
  const days = Math.floor((Date.now() - new Date(f.createdAt).getTime()) / 86_400_000);
  if (days <= 7) return "al-dia";
  if (days <= 15) return "atrasado";
  if (days <= 30) return "moroso";
  return "perdido";
}

function creditLimitSuggestion(f: Fiado): number {
  const risk = classifyRisk(f);
  const base = f.originalAmount;
  if (risk === "al-dia") return Math.round(base * 1.5 / 10) * 10;
  if (risk === "atrasado") return Math.round(base * 0.8 / 10) * 10;
  if (risk === "moroso") return Math.round(base * 0.3 / 10) * 10;
  return 0; // No more credit for "perdido"
}

const RISK_CONFIG: Record<RiskLevel, { label: string; color: string; badge: string; priority: number }> = {
  "al-dia": {
    label: "Al dia",
    color: "text-emerald-600 dark:text-emerald-400",
    badge: "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400",
    priority: 3,
  },
  atrasado: {
    label: "Atrasado",
    color: "text-yellow-600 dark:text-yellow-400",
    badge: "bg-yellow-50 dark:bg-yellow-950/30 text-yellow-600 dark:text-yellow-400",
    priority: 2,
  },
  moroso: {
    label: "Moroso",
    color: "text-orange-600 dark:text-orange-400",
    badge: "bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400",
    priority: 1,
  },
  perdido: {
    label: "Perdido",
    color: "text-red-600 dark:text-red-400",
    badge: "bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400",
    priority: 0,
  },
};

// -- WhatsApp Templates --

const WA_TEMPLATES: Record<RiskLevel, { label: string; msg: string }> = {
  "al-dia": {
    label: "Recordatorio amable",
    msg: "Hola {nombre}! Te recordamos que tienes un saldo pendiente de S/{saldo} en Buleje. Puedes pasar a cancelarlo cuando gustes. Gracias por tu preferencia!",
  },
  atrasado: {
    label: "Cobro suave",
    msg: "Hola {nombre}, esperamos que estes bien. Queremos recordarte que tienes un credito de S/{saldo} pendiente desde hace {dias} dias. Te esperamos pronto para ponernos al dia. Gracias!",
  },
  moroso: {
    label: "Cobro firme",
    msg: "Estimado/a {nombre}, tu deuda de S/{saldo} tiene {dias} dias de retraso. Necesitamos regularizar este saldo lo antes posible. Por favor comunicate con nosotros hoy. Buleje.",
  },
  perdido: {
    label: "Ultimo aviso",
    msg: "IMPORTANTE - {nombre}: Tu deuda de S/{saldo} tiene mas de {dias} dias sin pago. Este es nuestro ultimo recordatorio antes de tomar medidas. Te pedimos saldarlo esta semana. Buleje.",
  },
};

function buildWhatsAppMsg(template: string, f: Fiado): string {
  const days = Math.floor((Date.now() - new Date(f.createdAt).getTime()) / 86_400_000);
  return template
    .replace("{nombre}", f.customerName)
    .replace("{saldo}", Math.round(f.balance).toString())
    .replace("{dias}", String(days));
}

// -- Component --

export default function AIFiadoDashboard() {
  const [fiados, setFiados] = useState<Fiado[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedFiado, setSelectedFiado] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("risk");
  const [filterRisk, setFilterRisk] = useState<RiskLevel | "all">("all");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    async function fetchFiados() {
      try {
        const res = await fetch("/api/fiados");
        if (!res.ok) throw new Error("fetch failed");
        const data = await res.json();
        setFiados(Array.isArray(data) ? data : data.fiados ?? []);
      } catch {
        setError("No se pudieron cargar los fiados. El endpoint /api/fiados puede no estar disponible aun.");
        setFiados([]);
      } finally {
        setLoading(false);
      }
    }
    fetchFiados();
  }, []);

  // -- Computed metrics --

  const metrics = useMemo(() => {
    const pending = fiados.filter((f) => f.status !== "pagado");
    const totalPendiente = pending.reduce((s, f) => s + f.balance, 0);
    const fiadosActivos = fiados.filter((f) => f.status === "activo").length;

    const pagados = fiados.filter((f) => f.status === "pagado" && f.payments && f.payments.length > 0);
    const avgDiasPago = pagados.length > 0
      ? pagados.reduce((sum, f) => {
          const created = new Date(f.createdAt).getTime();
          const lastPayment = f.payments!.reduce((latest, p) => Math.max(latest, new Date(p.date).getTime()), 0);
          return sum + (lastPayment - created) / 86_400_000;
        }, 0) / pagados.length
      : 0;

    const vencidos = fiados.filter((f) => f.status === "vencido").length;
    const totalConDeuda = pending.length;
    const tasaMorosidad = totalConDeuda > 0 ? (vencidos / totalConDeuda) * 100 : 0;

    // Risk segmentation
    const riskCounts: Record<RiskLevel, number> = { "al-dia": 0, atrasado: 0, moroso: 0, perdido: 0 };
    const riskAmounts: Record<RiskLevel, number> = { "al-dia": 0, atrasado: 0, moroso: 0, perdido: 0 };
    for (const f of pending) {
      const risk = classifyRisk(f);
      riskCounts[risk]++;
      riskAmounts[risk] += f.balance;
    }

    // Recovery estimate (al-dia: 90%, atrasado: 70%, moroso: 40%, perdido: 10%)
    const recoveryRates: Record<RiskLevel, number> = { "al-dia": 0.9, atrasado: 0.7, moroso: 0.4, perdido: 0.1 };
    const estimatedRecovery = Object.entries(riskAmounts).reduce(
      (s, [risk, amt]) => s + amt * recoveryRates[risk as RiskLevel], 0
    );

    return { totalPendiente, fiadosActivos, avgDiasPago, tasaMorosidad, riskCounts, riskAmounts, estimatedRecovery };
  }, [fiados]);

  // -- Aging buckets --

  const aging = useMemo(() => {
    const buckets = [
      { label: "0-7 dias", min: 0, max: 7, color: "bg-emerald-500" },
      { label: "8-15 dias", min: 8, max: 15, color: "bg-yellow-500" },
      { label: "16-30 dias", min: 16, max: 30, color: "bg-orange-500" },
      { label: "30+ dias", min: 31, max: Infinity, color: "bg-red-500" },
    ];
    const pending = fiados.filter((f) => f.status !== "pagado");
    return buckets.map((b) => ({
      ...b,
      count: pending.filter((f) => {
        const days = Math.floor((Date.now() - new Date(f.createdAt).getTime()) / 86_400_000);
        return days >= b.min && days <= b.max;
      }).length,
      amount: pending.filter((f) => {
        const days = Math.floor((Date.now() - new Date(f.createdAt).getTime()) / 86_400_000);
        return days >= b.min && days <= b.max;
      }).reduce((s, f) => s + f.balance, 0),
    }));
  }, [fiados]);

  // -- Sorted & filtered fiados --

  const displayFiados = useMemo(() => {
    let list = [...fiados];
    if (filterRisk !== "all") {
      list = list.filter((f) => classifyRisk(f) === filterRisk);
    }
    list.sort((a, b) => {
      if (sortKey === "balance") return b.balance - a.balance;
      if (sortKey === "name") return a.customerName.localeCompare(b.customerName);
      if (sortKey === "days") {
        const da = Date.now() - new Date(a.createdAt).getTime();
        const db = Date.now() - new Date(b.createdAt).getTime();
        return db - da;
      }
      // risk: priority asc (perdido first)
      return RISK_CONFIG[classifyRisk(a)].priority - RISK_CONFIG[classifyRisk(b)].priority;
    });
    return list;
  }, [fiados, sortKey, filterRisk]);

  const handleCopyWA = (f: Fiado) => {
    const risk = classifyRisk(f);
    const msg = buildWhatsAppMsg(WA_TEMPLATES[risk].msg, f);
    navigator.clipboard.writeText(msg).then(() => {
      setCopiedId(f.id);
      setTimeout(() => setCopiedId(null), 2000);
    }).catch(() => {});
  };

  // -- Render --

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        <div className="animate-pulse space-y-4">
          <div className="h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-20 bg-gray-100 dark:bg-gray-800 rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error && fiados.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-3">
          Dashboard de Fiados
        </h2>
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3">
            <CreditCard className="w-6 h-6 text-gray-400" />
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 max-w-sm">{error}</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
            Cuando el modulo de fiados este activo, veras deudores, morosidad y herramientas de cobro.
          </p>
        </div>
      </div>
    );
  }

  const daysSince = (dateStr: string) => Math.floor((Date.now() - new Date(dateStr).getTime()) / 86_400_000);

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          <div>
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
              Dashboard de Fiados
            </h2>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Control de creditos, riesgo y cobro
            </p>
          </div>
        </div>
        {metrics.estimatedRecovery > 0 && (
          <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400 font-semibold">
            Recuperable: ~S/{Math.round(metrics.estimatedRecovery).toLocaleString("es-PE")}
          </span>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className={cn("rounded-lg border p-3",
          metrics.totalPendiente > 500 ? "border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20"
            : metrics.totalPendiente > 200 ? "border-yellow-200 dark:border-yellow-800/40 bg-yellow-50/50 dark:bg-yellow-950/20"
            : "border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-950/20"
        )}>
          <p className="text-xs text-gray-500 dark:text-gray-400">Total pendiente</p>
          <p className={cn("text-lg font-bold",
            metrics.totalPendiente > 500 ? "text-red-600 dark:text-red-400"
              : metrics.totalPendiente > 200 ? "text-yellow-600 dark:text-yellow-400"
              : "text-emerald-600 dark:text-emerald-400"
          )}>S/{Math.round(metrics.totalPendiente).toLocaleString("es-PE")}</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Fiados activos</p>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{metrics.fiadosActivos}</p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 p-3">
          <p className="text-xs text-gray-500 dark:text-gray-400">Prom. dias de pago</p>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-200">{Math.round(metrics.avgDiasPago)}d</p>
        </div>
        <div className={cn("rounded-lg border p-3",
          metrics.tasaMorosidad > 30 ? "border-red-200 dark:border-red-800/40 bg-red-50/50 dark:bg-red-950/20"
            : "border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50"
        )}>
          <p className="text-xs text-gray-500 dark:text-gray-400">Morosidad</p>
          <p className={cn("text-lg font-bold", metrics.tasaMorosidad > 30 ? "text-red-600 dark:text-red-400" : "text-gray-800 dark:text-gray-200")}>
            {metrics.tasaMorosidad.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Risk segmentation */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {(["al-dia", "atrasado", "moroso", "perdido"] as RiskLevel[]).map((risk) => {
          const cfg = RISK_CONFIG[risk];
          return (
            <button
              key={risk}
              onClick={() => setFilterRisk(filterRisk === risk ? "all" : risk)}
              className={cn(
                "rounded-lg p-2 text-center border transition-colors",
                filterRisk === risk ? "ring-2 ring-[#00B4A6] border-[#00B4A6]" : "border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              )}
            >
              <p className={cn("text-sm font-bold", cfg.color)}>{metrics.riskCounts[risk]}</p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400">{cfg.label}</p>
              {metrics.riskAmounts[risk] > 0 && (
                <p className="text-[10px] text-gray-400">S/{Math.round(metrics.riskAmounts[risk])}</p>
              )}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Debtors table */}
        <div className="lg:col-span-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400">
              Deudores {filterRisk !== "all" && `(${RISK_CONFIG[filterRisk].label})`}
            </h3>
            <div className="flex items-center gap-1.5">
              <Filter className="w-3 h-3 text-gray-400" />
              {(["risk", "balance", "days", "name"] as SortKey[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setSortKey(k)}
                  className={cn("text-[10px] px-1.5 py-0.5 rounded transition-colors",
                    sortKey === k ? "bg-[#00B4A6] text-white" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  )}
                >
                  {k === "risk" ? "Riesgo" : k === "balance" ? "Saldo" : k === "days" ? "Dias" : "Nombre"}
                </button>
              ))}
            </div>
          </div>

          {displayFiados.length === 0 ? (
            <p className="text-xs text-gray-400 dark:text-gray-500 py-8 text-center">No hay fiados en esta categoria.</p>
          ) : (
            <div className="rounded-lg border border-gray-100 dark:border-gray-800 overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr className="bg-gray-50 dark:bg-gray-800">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Cliente</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Saldo</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Dias</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Riesgo</th>
                    <th className="text-center px-3 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400">Cobro</th>
                  </tr>
                </thead>
                <tbody>
                  {displayFiados.map((f) => {
                    const risk = classifyRisk(f);
                    const rcfg = RISK_CONFIG[risk];
                    const days = daysSince(f.createdAt);
                    const creditLimit = creditLimitSuggestion(f);
                    const isExp = selectedFiado === f.id;
                    return (
                      <tr key={f.id}>
                        <td colSpan={5} className="p-0">
                          <button
                            type="button"
                            onClick={() => setSelectedFiado(isExp ? null : f.id)}
                            className={cn("w-full text-left transition-colors",
                              isExp ? "bg-gray-50 dark:bg-gray-800/60" : "hover:bg-gray-50/50 dark:hover:bg-gray-800/30"
                            )}
                          >
                            <div className="grid grid-cols-5 items-center">
                              <div className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 truncate">{f.customerName}</div>
                              <div className="px-3 py-2 text-xs font-semibold text-right text-gray-800 dark:text-gray-200">
                                S/{Math.round(f.balance).toLocaleString("es-PE")}
                              </div>
                              <div className="px-3 py-2 text-xs text-gray-500 text-right">{days}d</div>
                              <div className="px-3 py-2 text-center">
                                <span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", rcfg.badge)}>
                                  {rcfg.label}
                                </span>
                              </div>
                              <div className="px-3 py-2 text-center">
                                <button
                                  onClick={(e) => { e.stopPropagation(); handleCopyWA(f); }}
                                  className="p-1 rounded hover:bg-green-50 dark:hover:bg-green-950/30 transition-colors"
                                  title="Copiar mensaje de cobro para WhatsApp"
                                >
                                  <MessageCircle className={cn("w-3.5 h-3.5", copiedId === f.id ? "text-emerald-500" : "text-gray-400")} />
                                </button>
                              </div>
                            </div>
                          </button>
                          {isExp && (
                            <div className="px-4 pb-3 bg-gray-50/50 dark:bg-gray-800/20">
                              <div className="grid grid-cols-2 gap-2 mb-2">
                                <div className="text-xs">
                                  <span className="text-gray-400">Original: </span>
                                  <span className="text-gray-600 dark:text-gray-300">S/{Math.round(f.originalAmount).toLocaleString("es-PE")}</span>
                                </div>
                                <div className="text-xs">
                                  <span className="text-gray-400">Limite sugerido: </span>
                                  <span className={cn("font-medium", creditLimit === 0 ? "text-red-500" : "text-gray-600 dark:text-gray-300")}>
                                    {creditLimit === 0 ? "Sin credito" : `S/${creditLimit}`}
                                  </span>
                                </div>
                              </div>
                              {f.payments && f.payments.length > 0 ? (
                                <div>
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Pagos:</p>
                                  {f.payments.map((p) => (
                                    <div key={p.id} className="flex justify-between text-xs text-gray-500 dark:text-gray-400 py-0.5">
                                      <span>{new Date(p.date).toLocaleDateString("es-PE")}</span>
                                      <span className="font-medium text-emerald-600 dark:text-emerald-400">+S/{Math.round(p.amount)}</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-xs text-gray-400 dark:text-gray-500">Sin pagos registrados.</p>
                              )}
                              <div className="mt-2 p-2 rounded bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30">
                                <p className="text-[10px] text-gray-400 mb-0.5">Mensaje de cobro ({WA_TEMPLATES[risk].label}):</p>
                                <p className="text-xs text-gray-600 dark:text-gray-400 italic">
                                  {buildWhatsAppMsg(WA_TEMPLATES[risk].msg, f)}
                                </p>
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Aging + Distribution */}
        <div className="space-y-5">
          <div>
            <h3 className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Antiguedad de deuda</h3>
            <div className="space-y-2">
              {aging.map((a) => {
                const maxAmt = Math.max(...aging.map((x) => x.amount), 1);
                return (
                  <div key={a.label}>
                    <div className="flex items-center justify-between mb-0.5">
                      <span className="text-xs text-gray-600 dark:text-gray-400">{a.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400">{a.count} fiado{a.count !== 1 ? "s" : ""}</span>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">S/{Math.round(a.amount)}</span>
                      </div>
                    </div>
                    <div className="h-3 bg-gray-100 dark:bg-gray-800 rounded overflow-hidden">
                      <div
                        className={cn("h-full rounded transition-all duration-500", a.color)}
                        style={{ width: `${Math.max(2, (a.amount / maxAmt) * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Collection priority */}
          {metrics.riskCounts.moroso + metrics.riskCounts.perdido > 0 && (
            <div className="p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/30">
              <div className="flex items-center gap-1.5 mb-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">Prioridad de cobro</span>
              </div>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {metrics.riskCounts.perdido > 0 && (
                  <span className="block">
                    <span className="font-medium text-red-600 dark:text-red-400">{metrics.riskCounts.perdido} perdido{metrics.riskCounts.perdido > 1 ? "s" : ""}</span>
                    {" "}(S/{Math.round(metrics.riskAmounts.perdido)}) — Contactar HOY
                  </span>
                )}
                {metrics.riskCounts.moroso > 0 && (
                  <span className="block mt-0.5">
                    <span className="font-medium text-orange-600 dark:text-orange-400">{metrics.riskCounts.moroso} moroso{metrics.riskCounts.moroso > 1 ? "s" : ""}</span>
                    {" "}(S/{Math.round(metrics.riskAmounts.moroso)}) — Contactar esta semana
                  </span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}