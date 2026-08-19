"use client";

/**
 * LothRentabilidadPanel — pestaña "Rentabilidad" del Libro TH. Reencuadra el
 * costeo (que la Analítica muestra como tabla) en un dashboard de NEGOCIO:
 * ¿cuánto gano por especie? ¿cuál deja más y cuál pierde plata?
 *
 * Reusa el mismo `costeo` de `/plan?analytics=1` (computeCosteo) → nunca dice
 * números distintos que la Analítica. Margen = precio venta − (derecho VEN +
 * extracción + transformación + flete), por m³ movilizado.
 */

import { useCallback, useEffect, useState } from "react";
import { Coins, TrendingUp, TrendingDown, Award, Wallet, RefreshCw, Calculator } from "@buleje/design-system/icons";
import { StatCard, LoadingState, ErrorAlert, WarningAlert } from "@buleje/design-system";
import { Btn } from "./ctp-shared";
import type { CosteoRow, LothEntryDTO } from "@/lib/forestal/loth-constants";
import { buildTraceOperations } from "@/lib/forestal/loth-trace";
import { margenPorArbol, resumirMargenArbol } from "@/lib/forestal/loth-margen-arbol";

// El tipo vive en el motor (`computeCosteo`): duplicarlo acá fue lo que dejó el
// desglose del costo fuera de la pantalla durante todo este tiempo.
interface Costeo {
  rows: CosteoRow[];
  ingresoTotal: number;
  costoTotal: number;
  margenTotal: number;
  margenPctTotal: number;
  costoOperativoM3: number;
}

const soles = (n: number) => `S/ ${n.toLocaleString("es-PE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number) => `${n.toLocaleString("es-PE", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

export default function LothRentabilidadPanel({
  reloadSignal,
  entries = [],
}: {
  reloadSignal?: number;
  /** El libro completo: habilita bajar el margen de la especie al árbol. */
  entries?: LothEntryDTO[];
}) {
  const [costeo, setCosteo] = useState<Costeo | null>(null);
  const [porArbol, setPorArbol] = useState(false);
  const [hasPlan, setHasPlan] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/admin/forestal/plan?analytics=1", { credentials: "include" });
      if (!r.ok) {
        const d = await r.json().catch(() => ({}));
        throw new Error(d.message ?? d.error ?? `HTTP ${r.status}`);
      }
      const a = (await r.json()).analytics;
      setHasPlan(!!a?.hasPlan);
      setCosteo(a?.costeo ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load, reloadSignal]);

  if (loading && costeo === null && !error) return <LoadingState message="Calculando rentabilidad..." />;
  if (error && costeo === null) {
    return <ErrorAlert title="No se pudo calcular la rentabilidad" description={error} action={<Btn variant="secondary" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Reintentar</Btn>} />;
  }

  // Sin costeo: el plan no declara precios de venta / VEN por especie, o no hay
  // volumen movilizado. La rentabilidad no se puede calcular todavía.
  if (!costeo || costeo.rows.length === 0) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Btn variant="secondary" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Recargar</Btn>
        </div>
        <WarningAlert
          title="Todavía no se puede calcular la rentabilidad"
          description={
            hasPlan
              ? "Cargá el precio de venta y el valor al estado natural (VEN) por especie en el Plan de Manejo, y registrá despachos, para ver el margen."
              : "Registrá o activá un Plan de Manejo con precios por especie para calcular la rentabilidad."
          }
        />
      </div>
    );
  }

  const rows = [...costeo.rows].sort((a, b) => b.margen - a.margen);
  const mejor = rows[0];
  const peor = rows[rows.length - 1];
  const maxAbs = Math.max(...rows.map((r) => Math.abs(r.margen)), 1);

  // El margen bajado al árbol: el promedio por especie esconde justo al fuste
  // que no convino tumbar. Se calcula acá porque el libro ya está en memoria.
  const arboles = margenPorArbol(buildTraceOperations(entries), costeo.rows);
  const resArboles = resumirMargenArbol(arboles);
  const maxAbsArbol = Math.max(...arboles.map((a) => Math.abs(a.margen)), 1);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[var(--text-tertiary)]">Margen por especie = precio de venta − (derecho VEN + extracción + transformación + flete). Mismos números que la Analítica.</p>
        <div className="flex items-center gap-2">
          {entries.length > 0 && (
            <div className="flex h-10 items-center gap-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-1">
              <button
                type="button"
                onClick={() => setPorArbol(false)}
                aria-pressed={!porArbol}
                className={`h-8 rounded-lg px-3 text-sm font-bold transition-colors ${!porArbol ? "bg-[var(--brand-ink)] text-white" : "text-[var(--text-secondary)]"}`}
              >
                Por especie
              </button>
              <button
                type="button"
                onClick={() => setPorArbol(true)}
                aria-pressed={porArbol}
                className={`h-8 rounded-lg px-3 text-sm font-bold transition-colors ${porArbol ? "bg-[var(--brand-ink)] text-white" : "text-[var(--text-secondary)]"}`}
              >
                Por árbol
              </button>
            </div>
          )}
          <Btn variant="secondary" size="sm" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" /> Recargar</Btn>
        </div>
      </div>

      {/* Insight accionable */}
      <div className="grid gap-3 sm:grid-cols-2">
        {mejor && mejor.margen > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-success-500)]/30 bg-[var(--data-success-50)] p-4">
            <Award className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-success-700)]" />
            <div>
              <p className="text-sm font-bold text-[var(--data-success-700)]">La que más deja: {mejor.species}</p>
              <p className="text-xs text-[var(--text-secondary)]">{soles(mejor.margen)} de margen ({pct(mejor.margenPct)}) sobre {mejor.movilizadoM3.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m³ movilizados.</p>
            </div>
          </div>
        )}
        {peor && peor.margen < 0 && (
          <div className="flex items-start gap-3 rounded-2xl border-2 border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] p-4">
            <TrendingDown className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-error-700)]" />
            <div>
              <p className="text-sm font-bold text-[var(--data-error-700)]">Pierde plata: {peor.species}</p>
              <p className="text-xs text-[var(--text-secondary)]">{soles(peor.margen)} ({pct(peor.margenPct)}). Revisá el precio de venta o los costos de esta especie.</p>
            </div>
          </div>
        )}
      </div>

      {/* P&L del aprovechamiento */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard density="compact" label="Ingreso (movilizado)" value={soles(costeo.ingresoTotal)} subValue="ventas estimadas" icon={Wallet} emphasis="neutral" />
        <StatCard density="compact" label="Costo total" value={soles(costeo.costoTotal)} subValue={`operativo ${soles(costeo.costoOperativoM3)}/m³`} icon={Calculator} emphasis="neutral" />
        <StatCard
          density="compact"
          label="Margen"
          value={soles(costeo.margenTotal)}
          subValue={pct(costeo.margenPctTotal)}
          icon={costeo.margenTotal >= 0 ? TrendingUp : TrendingDown}
          emphasis={costeo.margenTotal > 0 ? "success" : costeo.margenTotal < 0 ? "error" : "neutral"}
        />
      </div>

      {/* Ranking por margen */}
      {porArbol ? (
        <ArbolesTabla filas={arboles} resumen={resArboles} maxAbs={maxAbsArbol} />
      ) : (
      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th>Especie</Th>
              <Th className="text-right">Movilizado</Th>
              <Th className="text-right">Precio/m³</Th>
              <Th className="text-right">Costo/m³</Th>
              <Th className="text-right">Margen/m³</Th>
              <Th className="text-right">Margen total</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.species} className="border-t border-[var(--rule-soft)]">
                <Td>
                  <span className="inline-flex items-center gap-1.5">
                    {i === 0 && r.margen > 0 && <Award className="h-3.5 w-3.5 text-[var(--data-warning-600)]" />}
                    <span className="font-medium text-[var(--text-primary)]">{r.species}</span>
                    {r.cites && <span className="rounded bg-[var(--data-error-100)] px-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-error-700)]">CITES</span>}
                  </span>
                </Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{r.movilizadoM3.toLocaleString("es-PE", { maximumFractionDigits: 2 })} m³</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{soles(r.precioVentaM3)}</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{soles(r.costoTotalM3)}</Td>
                <Td className={`text-right font-mono tabular-nums font-bold ${r.margenM3 >= 0 ? "text-[var(--data-success-700)]" : "text-[var(--data-error-700)]"}`}>{soles(r.margenM3)}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)] sm:block">
                      <span className={`block h-full ${r.margen >= 0 ? "bg-[var(--data-success-500)]" : "bg-[var(--data-error-500)]"}`} style={{ width: `${Math.max(4, (Math.abs(r.margen) / maxAbs) * 100)}%` }} />
                    </span>
                    <span className={`font-mono tabular-nums font-bold ${r.margen >= 0 ? "text-[var(--data-success-700)]" : "text-[var(--data-error-700)]"}`}>{soles(r.margen)}</span>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      {/* De qué se compone el costo. Un número sin fórmula es un número que no
          se puede discutir con el contador. */}
      {!porArbol && rows[0]?.desglose && (
        <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-[var(--text-secondary)]">
            <Calculator className="h-3.5 w-3.5" /> De dónde sale cada cifra
          </p>
          <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
            <li>
              <b>Costo/m³</b> = derecho VEN + extracción + transformación + flete ={" "}
              <span className="font-mono tabular-nums">
                {soles(rows[0].desglose.venM3)} + {soles(rows[0].desglose.extraccionM3)} + {soles(rows[0].desglose.transformacionM3)} +{" "}
                {soles(rows[0].desglose.fleteM3)}
              </span>
              . El VEN sale del plan por especie; los otros tres, de «Costos operativos» en la Analítica.
            </li>
            <li>
              <b>Ingreso</b> = precio de venta del plan × m³ <b>movilizados</b> (no lo talado ni lo trozado: lo que salió con guía).
            </li>
            <li>
              <b>Derecho de aprovechamiento</b> (Analítica) = pago por área + VEN × movilizado. La parte del área no depende del volumen,
              por eso existe aunque todavía no se haya movido madera.
            </li>
            <li className="text-[var(--text-tertiary)]">
              El precio es el <b>estimado del plan</b>: el sistema todavía no registra el precio real de cada venta.
            </li>
          </ul>
        </div>
      )}

      <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
        <Coins className="h-3.5 w-3.5" /> El margen no incluye el pago por derecho de aprovechamiento de área (0.01% UIT × ha), que es fijo del plan.
      </p>
    </div>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return <th className={`px-4 py-3 font-bold text-[var(--text-primary)] ${className ?? ""}`}>{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={`px-4 py-3 ${className ?? ""}`}>{children}</td>;
}


/**
 * Margen árbol por árbol. Contesta «¿convino tumbar ESTE?», que el promedio por
 * especie no puede contestar: un fuste que rindió 30% y otro que rindió 80%
 * viven en la misma fila.
 */
function ArbolesTabla({
  filas,
  resumen,
  maxAbs,
}: {
  filas: ReturnType<typeof margenPorArbol>;
  resumen: ReturnType<typeof resumirMargenArbol>;
  maxAbs: number;
}) {
  if (filas.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] p-8 text-center text-sm text-[var(--text-tertiary)]">
        Todavía no hay árboles talados para valorizar.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          density="compact"
          label="Árboles que rindieron"
          value={`${resumen.conMovimiento}/${resumen.arboles}`}
          subValue={resumen.sinMovilizar > 0 ? `${resumen.sinMovilizarM3.toFixed(2)} m³ tumbados sin salir` : "todos movilizados"}
          icon={TrendingUp}
          emphasis={resumen.sinMovilizar > 0 ? "warning" : "success"}
        />
        <StatCard
          density="compact"
          label="Margen de trozas vendidas"
          value={soles(resumen.margen)}
          subValue={
            resumen.consumidoM3 > 0
              ? `${resumen.consumidoM3.toFixed(2)} m³ fueron al aserrío (su plata está en el producto)`
              : `ingreso ${soles(resumen.ingreso)}`
          }
          icon={Coins}
          emphasis={resumen.margen > 0 ? "success" : "neutral"}
        />
        <StatCard
          density="compact"
          label="El que más dejó"
          value={resumen.mejor?.tree ?? "—"}
          subValue={resumen.mejor ? `${soles(resumen.mejor.margen)} · ${resumen.mejor.movilizadoM3.toFixed(2)} m³` : "sin movimiento"}
          icon={Award}
          emphasis="neutral"
        />
      </div>

      <div className="overflow-x-auto rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--surface-sunken)] text-left">
            <tr>
              <Th>Árbol</Th>
              <Th>Especie</Th>
              <Th className="text-right">Talado</Th>
              <Th className="text-right">Movilizado</Th>
              <Th className="text-right">Rend.</Th>
              <Th className="text-right">Ingreso</Th>
              <Th className="text-right">Margen</Th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.tree} className={`border-t border-[var(--rule-soft)] ${f.movilizadoM3 <= 0 ? "opacity-60" : ""}`}>
                <Td>
                  <span className="font-mono font-bold text-[var(--text-primary)]">{f.tree}</span>
                </Td>
                <Td className="text-[var(--text-secondary)]">
                  {f.especie ?? "—"}
                  {f.sinPrecio && (
                    <span className="ml-1.5 rounded bg-[var(--data-warning-500)]/15 px-1.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                      sin precio
                    </span>
                  )}
                </Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.taladoM3.toFixed(2)} m³</Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {f.movilizadoM3 > 0 ? `${f.movilizadoM3.toFixed(2)} m³` : "—"}
                </Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">
                  {f.rendimientoPct != null ? `${f.rendimientoPct.toFixed(1)}%` : "—"}
                </Td>
                <Td className="text-right font-mono tabular-nums text-[var(--text-secondary)]">{f.ingreso > 0 ? soles(f.ingreso) : "—"}</Td>
                <Td className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-[var(--surface-sunken)] sm:block">
                      <span
                        className={`block h-full ${f.margen >= 0 ? "bg-[var(--data-success-500)]" : "bg-[var(--data-error-500)]"}`}
                        style={{ width: `${Math.max(2, (Math.abs(f.margen) / maxAbs) * 100)}%` }}
                      />
                    </span>
                    <span
                      className={`font-mono font-bold tabular-nums ${
                        f.margen > 0 ? "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]" : "text-[var(--text-tertiary)]"
                      }`}
                    >
                      {f.margen > 0 ? soles(f.margen) : "—"}
                    </span>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-1 text-xs text-[var(--text-tertiary)]">
        <p>
          El precio y el costo por m³ los hereda cada árbol de su especie (no hay precio por árbol en el sistema); lo que cambia entre
          árboles es <b>cuánto volumen llegó a venderse</b>. Los que muestran «—» todavía tienen su madera en el patio.
        </p>
        {resumen.consumidoM3 > 0 && (
          <p>
            Este total es <b>menor</b> que el de «Por especie» a propósito: acá sólo entra la troza <b>despachada con guía</b>. Los{" "}
            <b className="font-mono tabular-nums">{resumen.consumidoM3.toFixed(2)} m³</b> que se consumieron en el aserrío generan su
            ingreso como producto terminado, y el libro atribuye ese despacho por especie, no por árbol.
          </p>
        )}
      </div>
    </div>
  );
}
