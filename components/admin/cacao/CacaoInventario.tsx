"use client";

/**
 * CacaoInventario — inventario de cacao seco (ADR-128, v2 potenciado).
 * Integra el precio internacional EN VIVO (cacao-market) para valorizar el stock
 * a mercado y calcular la ganancia potencial vs. costo de acopio. Desglose por
 * variedad/grado, lotes en proceso de beneficio con progreso, rendimiento y export.
 */
import { useCallback, useEffect, useState } from "react";
import {
  Warehouse,
  Coins,
  TrendingUp,
  Droplets,
  Scale,
  Award,
  AlertCircle,
  RefreshCw,
  Globe,
  Banknote,
  Clock,
  Download,
  Leaf,
  SlidersHorizontal,
  AlertTriangle,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  CACAO_AJUSTE_LABEL,
  GRADO_LABEL,
  type CacaoAjusteTipo,
  type CacaoGrado,
} from "@/lib/cacao/cacao-quality";
import CacaoAjusteModal from "./CacaoAjusteModal";

interface Inv {
  kgSecoDisponible: number;
  kgProducido: number;
  kgVendido: number;
  ingresosVenta: number;
  kgSecoBeneficio: number;
  kgSecoAcopiado: number;
  kgHumedoProceso: number;
  kgSecoProyectado: number;
  ajusteNeto: number;
  ajusteSalidas: number;
  stockMinimoKg: number | null;
  bajoStockMinimo: boolean;
  precioRefProm: number;
  valorEstimado: number;
  rendimientoProm: number | null;
  lotesEnProceso: number;
  porVariedad: { variedad: string; kg: number }[];
  porGrado: { grado: string; kg: number }[];
  enProceso: {
    loteCode: string | null;
    estado: string;
    pesoHumedoKg: number;
    secoProyectado: number;
    diasEnProceso: number;
    diasEnEtapa: number;
    alerta: "ok" | "atencion" | "urgente";
  }[];
}
interface Ajuste {
  id: string;
  fecha: string;
  tipo: string;
  cantidadKg: string;
  variedad: string | null;
  grado: string | null;
  motivo: string;
  status: string;
}

const n2 = (v: number | null) =>
  v == null
    ? "—"
    : v.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function relTime(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "recién";
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(diff / 3.6e6);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} días`;
}
const ESTADO: Record<string, { label: string; cls: string }> = {
  fermentando: {
    label: "Fermentando",
    cls: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]",
  },
  secando: { label: "Secando", cls: "bg-[var(--data-info-100)] text-[var(--data-info-700)]" },
};

export default function CacaoInventario() {
  const [inv, setInv] = useState<Inv | null>(null);
  const [ajustes, setAjustes] = useState<Ajuste[]>([]);
  const [precioIntlKg, setPrecioIntlKg] = useState<number | null>(null);
  const [precioMeta, setPrecioMeta] = useState<{ at: string | null; stale: boolean }>({
    at: null,
    stale: false,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAjuste, setShowAjuste] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [ri, rm, ra] = await Promise.all([
        fetch("/api/admin/cacao?view=inventory", { credentials: "include" }),
        fetch("/api/admin/cacao/market", { credentials: "include" }).catch((err) => {
          console.warn("[cacao] inventario: precio de mercado no disponible", err);
          return null;
        }),
        fetch("/api/admin/cacao?view=ajustes", { credentials: "include" }).catch((err) => {
          console.warn("[cacao] inventario: ajustes no disponibles", err);
          return null;
        }),
      ]);
      if (!ri.ok) throw new Error(`HTTP ${ri.status}`);
      setInv((await ri.json()).inventory ?? null);
      if (rm && rm.ok) {
        const m = await rm.json();
        setPrecioIntlKg(m?.pricePenPerKg ?? null);
        setPrecioMeta({ at: m?.generatedAt ?? null, stale: !!m?.stale });
      }
      if (ra && ra.ok) setAjustes((await ra.json()).ajustes ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function annulAjuste(id: string) {
    try {
      const r = await fetch("/api/admin/cacao", {
        method: "PATCH",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        credentials: "include",
        body: JSON.stringify({ action: "annul_ajuste", id, reason: "anulado desde inventario" }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).message ?? `HTTP ${r.status}`);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  if (loading && !inv)
    return (
      <div className="p-12 text-center text-[var(--text-tertiary)]">
        <RefreshCw className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-2 text-sm">Cargando inventario…</p>
      </div>
    );
  if (error)
    return (
      <div className="flex items-start gap-3 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-4 text-sm text-[var(--data-error-700)]">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <strong>No se pudo cargar el inventario:</strong> {error}
        </div>
      </div>
    );
  if (!inv) return null;

  const valorMercado =
    precioIntlKg != null ? Math.round(inv.kgSecoDisponible * precioIntlKg * 100) / 100 : null;
  const ganancia =
    valorMercado != null ? Math.round((valorMercado - inv.valorEstimado) * 100) / 100 : null;
  const margenPct =
    valorMercado != null && inv.valorEstimado > 0
      ? Math.round(((valorMercado - inv.valorEstimado) / inv.valorEstimado) * 1000) / 10
      : null;

  function exportCsv() {
    const rows: string[][] = [];
    // Resumen de valorización arriba del desglose.
    rows.push(["Resumen", "Valor", ""]);
    rows.push(["Cacao seco disponible (kg)", Number(inv!.kgSecoDisponible).toFixed(2), ""]);
    rows.push(["Valor a costo (S/)", Number(inv!.valorEstimado).toFixed(2), ""]);
    rows.push(["Precio intl. (S/ por kg)", precioIntlKg != null ? Number(precioIntlKg).toFixed(2) : "n/d", ""]);
    rows.push(["Valor a precio intl. (S/)", valorMercado != null ? Number(valorMercado).toFixed(2) : "n/d", ""]);
    rows.push(["Ganancia potencial (S/)", ganancia != null ? Number(ganancia).toFixed(2) : "n/d", ""]);
    rows.push(["", "", ""]);
    rows.push(["Tipo", "Clave", "Kg seco"]);
    inv!.porVariedad.forEach((v) => rows.push(["Variedad", v.variedad, Number(v.kg).toFixed(2)]));
    inv!.porGrado.forEach((g) =>
      rows.push([
        "Grado",
        g.grado === "sin_clasificar"
          ? "Sin clasificar"
          : (GRADO_LABEL[g.grado as CacaoGrado] ?? g.grado),
        Number(g.kg).toFixed(2),
      ]),
    );
    const esc = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = "﻿" + rows.map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `cacao-inventario-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-tertiary)]">
          Cacao seco disponible, valorizado a costo y a precio internacional en vivo.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            type="button"
            onClick={exportCsv}
            disabled={inv.porVariedad.length === 0}
            className="inline-flex h-10 items-center gap-2 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)] disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            CSV
          </button>
          <button
            type="button"
            onClick={() => setShowAjuste(true)}
            className="inline-flex h-10 items-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-sm font-bold text-white shadow-sm hover:opacity-90"
          >
            <SlidersHorizontal className="h-4 w-4" />
            Ajustar stock
          </button>
        </div>
      </div>

      {/* Alerta de stock mínimo */}
      {inv.bajoStockMinimo && inv.stockMinimoKg != null && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] p-4 text-sm text-[var(--data-warning-700)]">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Stock bajo el mínimo: <b>{n2(inv.kgSecoDisponible)} kg</b> disponibles &lt; mínimo de{" "}
            <b>{n2(inv.stockMinimoKg)} kg</b>. Considera acopiar o terminar beneficios en proceso.
          </p>
        </div>
      )}

      {/* Hero: stock + valorización a costo y a mercado */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Cacao seco disponible"
          value={`${n2(inv.kgSecoDisponible)} kg`}
          subValue={
            inv.kgVendido > 0
              ? `${n2(inv.kgProducido)} producido − ${n2(inv.kgVendido)} vendido`
              : "listo para vender"
          }
          icon={Warehouse}
          emphasis={inv.kgSecoDisponible > 0 ? "success" : "neutral"}
        />
        <StatCard
          label="Valor a costo"
          value={`S/ ${n2(inv.valorEstimado)}`}
          subValue={
            inv.precioRefProm > 0
              ? `S/ ${Number(inv.precioRefProm).toFixed(2)}/kg acopio`
              : "sin precio ref."
          }
          icon={Coins}
          emphasis="neutral"
        />
        <StatCard
          label="Valor a precio intl."
          value={valorMercado != null ? `S/ ${n2(valorMercado)}` : "—"}
          subValue={
            precioIntlKg != null
              ? `S/ ${precioIntlKg.toFixed(2)}/kg ICE${
                  precioMeta.stale
                    ? " · desactualizado"
                    : precioMeta.at
                      ? ` · ${relTime(precioMeta.at)}`
                      : ""
                }`
              : "mercado n/d"
          }
          icon={Globe}
          emphasis={precioMeta.stale ? "warning" : "neutral"}
        />
        <StatCard
          label="Ganancia potencial"
          value={ganancia != null ? `${ganancia >= 0 ? "+" : ""}S/ ${n2(ganancia)}` : "—"}
          subValue={
            margenPct != null
              ? `${margenPct >= 0 ? "+" : ""}${margenPct}% vs costo`
              : "vendiendo a intl."
          }
          icon={TrendingUp}
          emphasis={ganancia != null && ganancia >= 0 ? "success" : "warning"}
        />
      </div>

      {/* Integración explicada */}
      {valorMercado != null && (
        <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--accent)]/30 bg-[var(--accent-soft)]/30 p-4 text-sm">
          <Banknote className="mt-0.5 h-5 w-5 shrink-0 text-[var(--accent)]" />
          <p className="text-[var(--text-secondary)]">
            Tienes <b className="text-[var(--text-primary)]">{n2(inv.kgSecoDisponible)} kg</b> de
            cacao seco. Te costaron{" "}
            <b className="text-[var(--text-primary)]">S/ {n2(inv.valorEstimado)}</b> y al precio
            internacional de hoy valen{" "}
            <b className="text-[var(--text-primary)]">S/ {n2(valorMercado)}</b>
            {ganancia != null && (
              <>
                {" "}
                → ganancia bruta potencial de{" "}
                <b
                  style={{
                    color: ganancia >= 0 ? "var(--data-success-700)" : "var(--data-error-700)",
                  }}
                >
                  {ganancia >= 0 ? "+" : ""}S/ {n2(ganancia)}
                </b>{" "}
                (antes de flete, merma y comisión).
              </>
            )}
            {precioMeta.at && (
              <span className="text-[var(--text-tertiary)]">
                {" "}
                Precio ICE {precioMeta.stale ? "desactualizado" : relTime(precioMeta.at)}.
              </span>
            )}
          </p>
        </div>
      )}

      {/* Secundarias: proceso + rendimiento */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="En proceso (húmedo)"
          value={`${n2(inv.kgHumedoProceso)} kg`}
          subValue={`${inv.lotesEnProceso} lote${inv.lotesEnProceso !== 1 ? "s" : ""} beneficiando`}
          icon={Droplets}
          emphasis="neutral"
        />
        <StatCard
          label="Seco proyectado"
          value={`${n2(inv.kgSecoProyectado)} kg`}
          subValue="al terminar secado"
          icon={TrendingUp}
          emphasis="neutral"
        />
        <StatCard
          label="Rendimiento prom."
          value={inv.rendimientoProm != null ? `${inv.rendimientoProm}%` : "—"}
          subValue="seco / húmedo"
          icon={Scale}
          emphasis="neutral"
        />
        <StatCard
          label="De beneficio / acopiado"
          value={`${n2(inv.kgSecoBeneficio)} / ${n2(inv.kgSecoAcopiado)}`}
          subValue="kg seco"
          icon={Warehouse}
          emphasis="neutral"
        />
      </div>

      {/* Desgloses */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Panel icon={Leaf} title="Stock seco por variedad">
          {inv.porVariedad.length === 0 ? (
            <Muted />
          ) : (
            (() => {
              const max = Math.max(...inv.porVariedad.map((v) => v.kg), 1);
              const total = inv.porVariedad.reduce((a, v) => a + v.kg, 0);
              return inv.porVariedad.map((v) => (
                <Bar
                  key={v.variedad}
                  label={v.variedad}
                  value={v.kg}
                  max={max}
                  total={total}
                  color="var(--accent)"
                />
              ));
            })()
          )}
        </Panel>
        <Panel icon={Award} title="Stock seco por grado">
          {inv.porGrado.length === 0 ? (
            <Muted />
          ) : (
            (() => {
              const max = Math.max(...inv.porGrado.map((g) => g.kg), 1);
              const total = inv.porGrado.reduce((a, g) => a + g.kg, 0);
              return inv.porGrado.map((g) => {
                const gg = g.grado as CacaoGrado;
                const color =
                  gg === "I"
                    ? "var(--data-success-500)"
                    : gg === "II"
                      ? "var(--data-warning-500)"
                      : g.grado === "sin_clasificar"
                        ? "var(--rule-strong)"
                        : "var(--data-error-500)";
                const label =
                  g.grado === "sin_clasificar" ? "Sin clasificar" : (GRADO_LABEL[gg] ?? g.grado);
                return (
                  <Bar key={g.grado} label={label} value={g.kg} max={max} total={total} color={color} />
                );
              });
            })()
          )}
        </Panel>
      </div>

      {/* En proceso de beneficio */}
      <Panel icon={Clock} title={`En proceso de beneficio (${inv.enProceso.length})`}>
        {inv.enProceso.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">
            Ningún lote en fermentación/secado ahora.
          </p>
        ) : (
          <div className="space-y-2">
            {inv.enProceso.map((p, i) => {
              const est = ESTADO[p.estado] ?? {
                label: p.estado,
                cls: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
              };
              const alerta = p.alerta !== "ok";
              return (
                <div
                  key={(p.loteCode ?? "") + i}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[var(--text-primary)]">
                      {p.loteCode ?? "—"}
                    </span>
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${est.cls}`}
                    >
                      {est.label}
                    </span>
                  </span>
                  <span className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="text-[var(--text-tertiary)]">
                      {n2(p.pesoHumedoKg)} kg →{" "}
                      <b className="text-[var(--text-primary)]">~{n2(p.secoProyectado)} kg</b> seco
                    </span>
                    <span
                      className={`inline-flex items-center gap-1 ${
                        p.alerta === "urgente"
                          ? "font-bold text-[var(--data-error-600)]"
                          : alerta
                            ? "font-bold text-[var(--data-warning-700)]"
                            : "text-[var(--text-tertiary)]"
                      }`}
                    >
                      {p.diasEnEtapa}d
                      {alerta && <AlertTriangle className="h-3.5 w-3.5" />}
                    </span>
                  </span>
                </div>
              );
            })}
            {inv.enProceso.some((p) => p.alerta !== "ok") && (
              <p className="flex items-center gap-1.5 pt-1 text-sm text-[var(--data-warning-700)]">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Lotes pasados de tiempo en su etapa — revisa fermentación (&gt;7d) o secado (&gt;12d):
                riesgo de sobre-fermentación o moho.
              </p>
            )}
          </div>
        )}
      </Panel>

      {/* Ajustes manuales de stock */}
      <Panel icon={SlidersHorizontal} title={`Ajustes de stock (${ajustes.length})`}>
        {inv.ajusteSalidas > 0 && (
          <p className="mb-2 text-sm text-[var(--text-secondary)]">
            Salidas por ajustes:{" "}
            <b className="text-[var(--data-warning-700)]">−{n2(inv.ajusteSalidas)} kg</b>
            {inv.ajusteNeto !== -inv.ajusteSalidas
              ? ` · neto ${inv.ajusteNeto >= 0 ? "+" : ""}${n2(inv.ajusteNeto)} kg`
              : ""}{" "}
            (ya descontado del disponible).
          </p>
        )}
        {ajustes.length === 0 ? (
          <p className="text-sm text-[var(--text-tertiary)]">
            Sin ajustes. Registra mermas físicas, muestras, pérdidas o correcciones que no salen de
            una venta.
          </p>
        ) : (
          <div className="space-y-1.5">
            {ajustes.map((a) => {
              const sale = a.tipo !== "ajuste_pos";
              return (
                <div
                  key={a.id}
                  className={`flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 text-sm ${a.status === "anulado" ? "opacity-50" : ""}`}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold ${sale ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]" : "bg-[var(--data-success-100)] text-[var(--data-success-700)]"}`}
                    >
                      {CACAO_AJUSTE_LABEL[a.tipo as CacaoAjusteTipo] ?? a.tipo}
                    </span>
                    <span className="truncate text-[var(--text-secondary)]">{a.motivo}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span
                      className={`font-mono text-sm font-bold tabular-nums ${sale ? "text-[var(--data-error-700)]" : "text-[var(--data-success-700)]"}`}
                    >
                      {sale ? "−" : "+"}
                      {n2(Number(a.cantidadKg))} kg
                    </span>
                    {a.status !== "anulado" && (
                      <button
                        type="button"
                        onClick={() => annulAjuste(a.id)}
                        className="text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--data-error-600)]"
                      >
                        Anular
                      </button>
                    )}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>

      {showAjuste && (
        <CacaoAjusteModal
          variedades={inv.porVariedad.map((v) => v.variedad)}
          onClose={() => setShowAjuste(false)}
          onSaved={() => {
            setShowAjuste(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Panel({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Leaf;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5">
      <div
        role="heading"
        aria-level={3}
        className="mb-3 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]"
      >
        <Icon className="h-4 w-4 text-[var(--accent)]" />
        {title}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}
function Bar({
  label,
  value,
  max,
  color,
  total,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
  total?: number;
}) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  const share = total && total > 0 ? Math.round((value / total) * 100) : null;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-mono tabular-nums text-[var(--text-primary)]">
          {value.toFixed(2)} kg
          {share != null && (
            <span className="ml-1 text-[var(--text-tertiary)]">· {share}%</span>
          )}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}
function Muted() {
  return <p className="text-sm text-[var(--text-tertiary)]">Sin stock seco todavía.</p>;
}
