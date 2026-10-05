"use client";

/**
 * «Qué volvió a la sierra» — los reprocesos que la planta ya declaró
 * (ADR-316 · ADR-407, pedido de Brandon 2026-09-09).
 *
 * El reproceso se registraba desde Productos disponibles y descontaba stock,
 * pero vivía **suelto**: cada asiento por su lado. La pregunta que llega
 * después —de un fiscalizador o del propio dueño— es de conjunto: «¿cuánta
 * madera volvió a la sierra este mes, cuánta salió, y por qué en el libro
 * figura comercial saliendo de una tabla?». Contestarla obligaba a abrir
 * asiento por asiento.
 *
 * Tres lecturas, en el orden en que se preguntan:
 *  1. **Lo que entró, lo que salió y la merma** del período, arriba.
 *  2. **Qué se convirtió en qué**, sumado — con lo no habitual primero.
 *  3. **Cada reproceso**, con sus corridas de origen y la explicación que se
 *     escribió al declararlo.
 *
 * Es sólo lectura: acá no se registra nada. La merma y el juicio sobre la
 * conversión salen de `lib/forestal/reprocesos-declarados.ts`, que es puro y
 * tiene tests — la pantalla no vuelve a decidir qué es raro.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ChevronRight,
  Loader2,
  RefreshCw,
  Scissors,
} from "@buleje/design-system/icons";
import { StatCard } from "@buleje/design-system";
import { CtpKpisPlegables } from "./kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { fmtM3, fmtPiezas } from "@/lib/forestal/cubicacion-formato";
import { FRASE_REGLA } from "@/lib/forestal/reproceso-reglas";
import {
  analizarReproceso,
  conversionesFrecuentes,
  resumirReprocesos,
  type ReprocesoAnalizado,
  type ReprocesoDeclarado,
} from "@/lib/forestal/reprocesos-declarados";
import { formatDateNumeric } from "@/lib/format";
import {
  BarraFiltrosTabla,
  FiltroEnCabecera,
  SinCoincidenciasFila,
  useFiltrosTabla,
  type ColumnaFiltro,
} from "./filtros-tabla-forestal";

const TH =
  "px-2 py-1 text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 text-sm text-[var(--text-secondary)]";
const NUM = `${TD} text-right font-mono tabular-nums`;
const CHIP =
  "inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide";

/** Un m³ sólo se compara con otro m³: un reproceso en otra unidad queda fuera de un rango. */
const enM3 = (r: ReprocesoAnalizado, v: number) => (r.unidad && r.unidad !== "m3" ? null : v);

const COLUMNAS_UNO_POR_UNO: ColumnaFiltro<ReprocesoAnalizado>[] = [
  { id: "fecha", label: "Fecha", tipo: "fecha", numero: (r) => r.fecha.slice(0, 10), formatearValor: (v) => fmtFecha(String(v)) },
  { id: "corrida", label: "Corrida", tipo: "texto", valor: (r) => `N° ${r.lineNo ?? "—"}` },
  { id: "producto", label: "Salió", tipo: "multi", valor: (r) => [r.producto, r.especie].filter(Boolean).join(" · ") || null },
  { id: "entro", label: "Entró", tipo: "rango", numero: (r) => enM3(r, r.entro), unidad: "m³", paso: 0.01 },
  { id: "salio", label: "Salió (m³)", tipo: "rango", numero: (r) => enM3(r, r.salio), unidad: "m³", paso: 0.01 },
  { id: "merma", label: "Merma", tipo: "rango", numero: (r) => enM3(r, r.mermaM3), unidad: "m³", paso: 0.01 },
  { id: "origen", label: "De dónde", tipo: "multi", valor: (r) => r.conversiones.map((c) => `${c.desde} → ${c.hacia}`) },
];

/** Date-only en UTC: con la hora de Lima el asiento del día 1 se ve como el 31. */
const fmtFecha = (iso: string) =>
  formatDateNumeric(iso, { soloFecha: true });

export default function CtpReprocesosDeclarados({ period }: { period: CtpPeriod }) {
  const [filas, setFilas] = useState<ReprocesoDeclarado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<string | null>(null);
  /** Sólo lo que hay que poder explicar: el filtro que usa el fiscalizador. */
  const [soloRaros, setSoloRaros] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const qs = applyCtpPeriodParams(new URLSearchParams(), period);
      const j = await ctpGet<{ reprocesos: ReprocesoDeclarado[] }>(
        `/api/admin/forestal/ctp/reproceso/declarados?${qs.toString()}`,
      );
      setFilas(Array.isArray(j?.reprocesos) ? j.reprocesos : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCargando(false);
    }
  }, [period]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const analizados = useMemo(() => filas.map(analizarReproceso), [filas]);
  const resumen = useMemo(() => resumirReprocesos(analizados), [analizados]);
  const pares = useMemo(() => conversionesFrecuentes(analizados), [analizados]);
  const visibles = useMemo(
    () => (soloRaros ? analizados.filter((r) => r.tieneNoHabitual || r.sospechoso) : analizados),
    [analizados, soloRaros],
  );

  const f = useFiltrosTabla(visibles, COLUMNAS_UNO_POR_UNO);

  if (cargando) {
    return (
      <p className="flex items-center gap-2 px-1 py-6 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Buscando los reprocesos del período…
      </p>
    );
  }
  if (error) {
    return (
      <p className="flex items-start gap-1.5 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{error}</span>
      </p>
    );
  }
  if (analizados.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-4 py-8 text-center">
        <Scissors className="mx-auto h-6 w-6 text-[var(--text-tertiary)]" aria-hidden />
        <p className="mt-2 flex flex-wrap items-center justify-center gap-1 text-sm font-bold text-[var(--text-primary)]">
          En este período no volvió madera a la sierra.
          <InfoTip
            title="Reprocesos"
            what="Un reproceso se declara desde Productos disponibles: es el producto terminado que vuelve a producción y sale como otro."
            affects="Acá se ve todo junto cuando lo haya."
            example="Comercial que se recorta en paquetería corta."
          />
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 1 · Lo que entró, lo que salió y la merma del conjunto — plegables
          (Brandon 05-10); «Actualizar» sube a la misma fila. */}
      <CtpKpisPlegables
        claveMemoria="ctp-reprocesos"
        resumen={`${fmtM3(resumen.entro)} m³ entró · ${fmtM3(resumen.salio)} m³ salió${resumen.mermaPct != null ? ` · merma ${resumen.mermaPct} %` : ""}${resumen.noHabituales + resumen.sospechosos > 0 ? ` · ${resumen.noHabituales + resumen.sospechosos} por explicar` : ""}`}
        acciones={
          <button
            type="button"
            onClick={() => void cargar()}
            className="inline-flex h-12 items-center gap-1 rounded-2xl border-[1.5px] border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            <RefreshCw className="h-4 w-4" aria-hidden /> Actualizar
          </button>
        }
        tarjetas={[
          <StatCard key="0"
            label="Volvió a la sierra"
            value={`${fmtM3(resumen.entro)} m³`}
            icon={Scissors}
            subValue={`${resumen.cuantos} ${resumen.cuantos === 1 ? "reproceso" : "reprocesos"} · ${resumen.especies.join(" · ") || "sin especie"}`}
          />,
          <StatCard key="1"
            label="Salió del reproceso"
            value={`${fmtM3(resumen.salio)} m³`}
            subValue="Lo que declaró la corrida nueva"
          />,
          <StatCard key="2"
            label="Merma de aserrío"
            value={`${fmtM3(resumen.mermaM3)} m³`}
            /* Sobre 40 % ya no es merma de corte: es un asiento para mirar. El
               umbral se dice en el subtítulo para que no sea un color mudo. */
            emphasis={resumen.mermaPct != null && resumen.mermaPct > 40 ? "warning" : "neutral"}
            subValue={
              resumen.mermaPct != null
                ? `${resumen.mermaPct} % de lo que entró${resumen.mermaPct > 40 ? " — alto para un reaserrado" : ""}`
                : "sin base para el %"
            }
          />,
          <StatCard key="3"
            label="Hay que explicarlos"
            value={String(resumen.noHabituales + resumen.sospechosos)}
            emphasis={resumen.noHabituales + resumen.sospechosos > 0 ? "warning" : "success"}
            subValue={
              resumen.noHabituales + resumen.sospechosos === 0
                ? "todas las conversiones son de las habituales"
                : `${resumen.noHabituales} fuera de lo habitual · ${resumen.sospechosos} salió más de lo que entró`
            }
          />
        ]}
      />

      {/* 2 · Qué se convirtió en qué, sumado. Lo raro primero. */}
      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
          <span className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
            Qué salió de qué
            <InfoTip
              title="Qué se puede reprocesar"
              what={FRASE_REGLA}
              affects="Lo que no es habitual no está prohibido —el libro registra lo que pasó— pero tiene que quedar explicado; esa explicación es la que se muestra en la tabla de abajo."
              example="Un reproceso se declara desde Productos disponibles."
            />
          </span>
          <span className="text-xs text-[var(--text-tertiary)]">
            {pares.length} {pares.length === 1 ? "conversión" : "conversiones"} distintas
          </span>
        </div>
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--rule-soft)]">
                <th className={TH}>De</th>
                <th className={TH}>Salió</th>
                <th className={`${TH} text-right`}>Veces</th>
                <th className={`${TH} text-right`}>m³ que entró</th>
                <th className={TH}>Qué dice la regla</th>
              </tr>
            </thead>
            <tbody>
              {pares.map((p) => (
                <tr key={p.clave} className="border-b border-[var(--rule-soft)] last:border-0">
                  <td className={TD}>
                    <span className={`${CHIP} bg-[var(--data-warning-500)]/15 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]`}>
                      {p.desde}
                    </span>
                  </td>
                  <td className={TD}>
                    <span
                      className={`${CHIP} ${
                        p.habitual
                          ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                          : "bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                      }`}
                    >
                      {p.hacia}
                    </span>
                  </td>
                  <td className={NUM}>{fmtPiezas(p.veces)}</td>
                  <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(p.cantidad)}</td>
                  <td className={`${TD} text-[length:var(--ts-2xs)] leading-snug`}>
                    {p.habitual ? (
                      <span className="text-[var(--text-tertiary)]">Es de las habituales.</span>
                    ) : (
                      <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                        {p.porque}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3 · Cada reproceso, con su origen y su explicación. */}
      <div className="overflow-hidden rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2">
          <span className="text-sm font-bold text-[var(--text-primary)]">Uno por uno</span>
          <span className="text-xs text-[var(--text-tertiary)]">
            {f.filtradas.length} de {analizados.length}
          </span>
          <label className="ml-auto inline-flex cursor-pointer items-center gap-1.5 text-xs font-bold text-[var(--text-secondary)]">
            <input
              type="checkbox"
              checked={soloRaros}
              onChange={(e) => setSoloRaros(e.target.checked)}
              className="h-4 w-4 rounded border-[var(--rule-base)] accent-[var(--accent)]"
            />
            Sólo los que hay que explicar
          </label>
        </div>
        <BarraFiltrosTabla f={f} className="px-3 pt-2" />
        <div className="overflow-x-auto px-3 pb-3">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--rule-soft)] align-top">
                <th className={TH}>Fecha<FiltroEnCabecera id="fecha" f={f} /></th>
                <th className={TH}>Corrida<FiltroEnCabecera id="corrida" f={f} /></th>
                <th className={TH}>Salió<FiltroEnCabecera id="producto" f={f} /></th>
                <th className={`${TH} text-right`}>Entró<FiltroEnCabecera id="entro" f={f} /></th>
                <th className={`${TH} text-right`}>Salió<FiltroEnCabecera id="salio" f={f} /></th>
                <th className={`${TH} text-right`}>Merma<FiltroEnCabecera id="merma" f={f} /></th>
                <th className={TH}>De dónde<FiltroEnCabecera id="origen" f={f} /></th>
              </tr>
            </thead>
            <tbody>
              {f.filtradas.length === 0 && <SinCoincidenciasFila colSpan={7} />}
              {f.filtradas.map((r) => {
                const marcado = r.tieneNoHabitual || r.sospechoso;
                const abierta = abierto === r.destinoEntryId;
                return [
                  <tr
                    key={r.destinoEntryId}
                    className={`border-b border-[var(--rule-soft)] ${marcado ? "bg-[var(--data-error-500)]/5" : ""}`}
                  >
                    <td className={TD}>{fmtFecha(r.fecha)}</td>
                    <td className={TD}>
                      <button
                        type="button"
                        onClick={() => setAbierto(abierta ? null : r.destinoEntryId)}
                        aria-expanded={abierta}
                        className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)]"
                      >
                        <ChevronRight
                          className={`h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierta ? "rotate-90" : ""}`}
                          aria-hidden
                        />
                        N° {r.lineNo ?? "—"}
                      </button>
                    </td>
                    <td className={TD}>
                      {r.producto ?? "—"}
                      <span className="ml-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                        {r.especie ?? ""}
                      </span>
                    </td>
                    <td className={NUM}>{fmtM3(r.entro)}</td>
                    <td className={`${NUM} font-bold text-[var(--text-primary)]`}>{fmtM3(r.salio)}</td>
                    <td className={NUM}>
                      {r.sospechoso ? (
                        <span className="text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                          salió de más
                        </span>
                      ) : (
                        <>
                          {fmtM3(r.mermaM3)}
                          {r.mermaPct != null && (
                            <span className="ml-1 text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]">
                              {r.mermaPct} %
                            </span>
                          )}
                        </>
                      )}
                    </td>
                    <td className={`${TD} text-[length:var(--ts-2xs)]`}>
                      {r.conversiones.map((c) => (
                        <span
                          key={`${c.desde}-${c.hacia}`}
                          className={`mr-1 inline-block ${
                            c.habitual
                              ? "text-[var(--text-tertiary)]"
                              : "font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                          }`}
                        >
                          {c.desde} → {c.hacia}
                        </span>
                      ))}
                    </td>
                  </tr>,
                  abierta ? (
                    <tr key={`${r.destinoEntryId}:detalle`} className="border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)]">
                      <td colSpan={7} className="px-3 py-2">
                        <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                          Corridas que entraron
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {r.origenes.map((o) => (
                            <li key={o.entryId} className="text-sm text-[var(--text-secondary)]">
                              <b className="text-[var(--text-primary)]">N° {o.lineNo ?? "—"}</b> ·{" "}
                              {o.producto ?? "—"} · {o.especie ?? "—"} ·{" "}
                              <span className="font-mono tabular-nums">{fmtM3(o.cantidad)}</span>{" "}
                              {r.unidad ?? "m3"}
                            </li>
                          ))}
                        </ul>
                        {r.permiso && (
                          <p className="mt-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                            N° de permiso declarado <span className="font-mono">{r.permiso}</span>
                          </p>
                        )}
                        {r.observaciones && (
                          <p className="mt-1.5 rounded-lg bg-[var(--surface-canvas)] px-2 py-1.5 text-sm text-[var(--text-secondary)]">
                            <b>Lo que se escribió al declararlo:</b> {r.observaciones}
                          </p>
                        )}
                        {r.sospechoso && (
                          <p className="mt-1.5 flex items-start gap-1.5 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                            <span>
                              Salieron {fmtM3(r.salio)} m³ de {fmtM3(r.entro)} que entraron: un
                              reproceso no crea madera. Revisa el asiento.
                            </span>
                          </p>
                        )}
                      </td>
                    </tr>
                  ) : null,
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
