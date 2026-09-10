"use client";

/**
 * Producir SIN lote: cubicar acá mismo y declarar la corrida (ADR-408).
 *
 * El caso real del aserradero (Brandon, 2026-09-09): *«quiero registrar una
 * producción sin lote ni consumo — poner la producción ahí mismo»*. Pasa todo
 * el tiempo: la sierra cortó el sábado, el parte llega el lunes y el lote con
 * sus trozas se arma después. Obligar a tener el lote ANTES empuja a inventar
 * uno —o a no anotar la jornada, que es peor.
 *
 * ## Lo que hace
 *
 * 1. Abre el **cubicador de madera entero** (medidas, voz, tabla, apartados) en
 *    su propio espacio de almacenamiento: lo que se cubica acá NO toca el lote
 *    del cubicador, ni Resúmenes, ni el reparto, ni el papel.
 * 2. Con lo cubicado arma los **paquetes** —uno por medida, con su escuadría en
 *    cm/m como los pide el Libro— y declara la corrida de Producción.
 *
 * ## Lo que NO hace, a propósito
 *
 * No inventa el origen. La corrida nace **sin consumos y sin lote**: el Libro ya
 * sabe mostrar eso (una corrida que declaró producción y todavía no dice de qué
 * madera salió). Vincularla con su lote es un acto aparte —con sus reglas de
 * especie, volumen y largo— y hasta que ocurra, la corrida se ve como lo que
 * es: producción declarada sin materia prima atribuida. Declararle un origen
 * que nadie eligió sería fabricar trazabilidad.
 */
import { useMemo, useState } from "react";
import { Boxes, Calculator, Loader2, X } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { unificarPorMedida, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import { tipoDePieza } from "@/lib/forestal/cubicacion-tipo";
import { productoDelTipoComercial } from "@/lib/forestal/loctp-catalogos";
import { fmtM3, fmtPiezas, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { guardarProduccionDeCorrida } from "./hooks/guardar-produccion-corrida";
import CubicadorMadera from "./CubicadorMadera";
import { Btn } from "./ctp-shared";

/** El espacio propio de este cubicador — otra libreta, la misma pantalla. */
export const ESPACIO_PRODUCCION = "-ctp-produccion";

const PULG_A_CM = 2.54;
const PIE_A_M = 0.3048;
const hoyIso = () => new Date().toISOString().slice(0, 10);
const r4 = (n: number) => Math.round(n * 10000) / 10000;

const CAMPO =
  "h-11 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]";
const LABEL = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";

/** Un paquete del Libro armado desde una medida cubicada. */
interface PaqueteDeMedida {
  codigo: string;
  productType: string | null;
  presentacion: string;
  cantidad: number;
  volumenM3: number;
  espesorCm: number;
  anchoCm: number;
  largoM: number;
  medida: string;
  especie: string;
  pieTablar: number;
}

/**
 * De las piezas cubicadas a los paquetes del Libro: una línea por MEDIDA, con
 * las escuadrías pasadas a cm y m, que es como las declara el LO-CTP.
 */
export function paquetesDeLoCubicado(piezas: readonly PiezaCubicada[]): PaqueteDeMedida[] {
  return unificarPorMedida([...piezas])
    .filter((p) => p.cantidad > 0 && (p.m3 ?? 0) > 0)
    .map((p, i) => {
      const tipo = tipoDePieza(p);
      return {
        codigo: `SL-${i + 1}`,
        productType: productoDelTipoComercial(tipo),
        presentacion: "PIEZAS",
        cantidad: p.cantidad,
        volumenM3: r4(p.m3 ?? 0),
        espesorCm: Math.round(p.espesor * PULG_A_CM * 100) / 100,
        anchoCm: Math.round(p.ancho * PULG_A_CM * 100) / 100,
        largoM: Math.round(p.largo * PIE_A_M * 100) / 100,
        medida: `${p.espesor}×${p.ancho}×${p.largo}`,
        especie: (p.especie ?? "").trim(),
        pieTablar: p.pieTablar ?? 0,
      };
    });
}

export default function CtpProducirSinLoteModal({ onCerrar, onListo }: {
  onCerrar: () => void;
  /** Se llama con el id de la corrida creada, para refrescar la vista. */
  onListo: (mensaje: string) => void;
}) {
  const [piezas, setPiezas] = useState<PiezaCubicada[]>([]);
  const [paso, setPaso] = useState<"cubicar" | "declarar">("cubicar");
  const [fecha, setFecha] = useState(hoyIso);
  const [linea, setLinea] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paquetes = useMemo(() => paquetesDeLoCubicado(piezas), [piezas]);
  const total = useMemo(
    () => paquetes.reduce(
      (a, p) => ({ piezas: a.piezas + p.cantidad, m3: a.m3 + p.volumenM3, pt: a.pt + p.pieTablar }),
      { piezas: 0, m3: 0, pt: 0 },
    ),
    [paquetes],
  );
  /** La especie del lote cubicado. Con dos, se dice: el asiento declara UNA. */
  const especies = useMemo(
    () => [...new Set(paquetes.map((p) => p.especie).filter(Boolean))],
    [paquetes],
  );

  const registrar = async () => {
    if (paquetes.length === 0) return;
    setGuardando(true);
    setError(null);
    try {
      /* 1) La corrida nace ABIERTA y sin origen: sin consumos y sin lote. */
      const r = await fetch("/api/admin/forestal/ctp", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          section: "produccion",
          entryDate: fecha,
          speciesCommon: especies[0] ?? null,
          materiaPrimaRef: "Sin lote — cubicado en el Libro",
          observations: observaciones.trim() || null,
        }),
      });
      const j = (await r.json().catch(() => ({}))) as { entry?: { id?: string }; message?: string; error?: string };
      if (!r.ok || !j.entry?.id) throw new Error(j.message ?? j.error ?? `El servidor respondió ${r.status}`);

      /* 2) Y se declara con los paquetes — el mismo camino que una corrida que
            se abrió consumiendo: no hay dos formas de declarar producción. */
      await guardarProduccionDeCorrida(j.entry.id, "declarar", {
        fecha,
        lineaProduccion: linea,
        observaciones: observaciones.trim() || null,
        paquetes: paquetes.map((p) => ({
          /* `id` es del borrador de la UI (React key), no del Libro: el
             servidor sólo lee código, producto, cantidad y medidas. */
          id: p.codigo,
          codigo: p.codigo,
          /* Sin catálogo que lo mapee queda «MADERA ASERRADA» a secas: el Libro
             admite el genérico, inventar un tipo sería peor. */
          productType: p.productType ?? "MADERA ASERRADA",
          presentacion: p.presentacion,
          cantidad: p.cantidad,
          volumenM3: p.volumenM3,
          espesorCm: p.espesorCm,
          anchoCm: p.anchoCm,
          largoM: p.largoM,
          observations: "",
        })),
        volumen: r4(total.m3),
      });
      invalidarCtp();
      onListo(
        `Producción registrada sin lote: ${fmtPiezas(total.piezas)} piezas · ${fmtM3(total.m3)} m³ en ${paquetes.length} paquete(s). Falta vincularle su materia prima.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Producir sin lote"
        className="flex h-[96vh] w-full max-w-[98vw] flex-col rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        {/* Cabecera */}
        <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--rule-base)] px-4 py-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <Calculator className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="font-display text-lg text-[var(--text-primary)]">Producir sin lote</h3>
            <p className="text-xs text-[var(--text-tertiary)]">
              Cubicá acá y declaralo en el Libro. La materia prima se vincula después —
              <b> lo que cubiques acá no toca el lote del cubicador</b>.
            </p>
          </div>
          <span className="ml-auto flex flex-wrap items-center gap-2 font-mono text-sm tabular-nums">
            <span className="rounded-lg border border-[var(--rule-base)] px-2 py-1">
              {fmtPiezas(total.piezas)} <span className="font-sans text-xs text-[var(--text-tertiary)]">pzas</span>
            </span>
            <span className="rounded-lg border border-[var(--rule-base)] px-2 py-1">
              {fmtM3(total.m3)} <span className="font-sans text-xs text-[var(--text-tertiary)]">m³</span>
            </span>
            <span className="rounded-lg border border-[var(--rule-base)] px-2 py-1">
              {fmtPt(total.pt)} <span className="font-sans text-xs text-[var(--text-tertiary)]">PT</span>
            </span>
          </span>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="rounded-xl p-1 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Cuerpo: el cubicador ENTERO, en su propia libreta */}
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {paso === "cubicar" ? (
            <CubicadorMadera espacio={ESPACIO_PRODUCCION} onLote={setPiezas} />
          ) : (
            <div className="mx-auto max-w-3xl space-y-3">
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="block">
                  <span className={LABEL}>Fecha de la producción</span>
                  <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className={`mt-1 ${CAMPO}`} />
                </label>
                <label className="block">
                  <span className={LABEL}>Línea de producción</span>
                  <input value={linea} onChange={(e) => setLinea(e.target.value)} placeholder="Sierra principal" className={`mt-1 ${CAMPO}`} />
                </label>
                <label className="block">
                  <span className={LABEL}>Especie</span>
                  <input
                    value={especies.join(" · ") || "Sin especie declarada"}
                    readOnly
                    title="Sale de lo cubicado: el asiento declara UNA especie"
                    className={`mt-1 ${CAMPO} bg-[var(--surface-sunken)]`}
                  />
                </label>
              </div>
              <label className="block">
                <span className={LABEL}>Observaciones</span>
                <textarea
                  value={observaciones}
                  onChange={(e) => setObservaciones(e.target.value)}
                  rows={2}
                  placeholder="Turno, sierra, quién cortó… lo que haga falta para reconocer esta jornada"
                  className="mt-1 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>

              {especies.length > 1 && (
                <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--text-secondary)]">
                  Lo cubicado tiene <b>{especies.length} especies</b> ({especies.join(", ")}). El asiento
                  declara la primera; si son de verdad distintas, conviene una corrida por especie —
                  el Libro pide una especie por asiento.
                </p>
              )}

              <div className="overflow-x-auto rounded-xl border border-[var(--rule-base)]">
                <table className="w-full text-sm">
                  <caption className="sr-only">Paquetes que se van a declarar</caption>
                  <thead className="bg-[var(--surface-sunken)]">
                    <tr>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-left`}>Paquete</th>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-left`}>Producto</th>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-left`}>Medida</th>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-right`}>Piezas</th>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-right`}>m³</th>
                      <th scope="col" className={`${LABEL} px-2 py-1.5 text-right`}>PT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paquetes.map((p) => (
                      <tr key={p.codigo} className="border-t border-[var(--rule-soft)]">
                        <td className="px-2 py-1.5 font-mono font-bold text-[var(--text-primary)]">{p.codigo}</td>
                        <td className="px-2 py-1.5 text-[var(--text-secondary)]">{p.productType ?? "—"}</td>
                        <td className="px-2 py-1.5 font-mono text-[var(--text-secondary)]">
                          {p.medida}
                          <span className="block text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                            {p.espesorCm} × {p.anchoCm} cm · {p.largoM} m
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtPiezas(p.cantidad)}</td>
                        <td className="px-2 py-1.5 text-right font-mono font-bold tabular-nums">{fmtM3(p.volumenM3)}</td>
                        <td className="px-2 py-1.5 text-right font-mono tabular-nums text-[var(--text-tertiary)]">{fmtPt(p.pieTablar)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                      <th scope="row" className="px-2 py-1.5 text-left" colSpan={3}>
                        {paquetes.length} {paquetes.length === 1 ? "paquete" : "paquetes"}
                      </th>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtPiezas(total.piezas)}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtM3(total.m3)}</td>
                      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{fmtPt(total.pt)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <p className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-secondary)]">
                La corrida se registra <b>sin materia prima atribuida</b>: nace sin consumos y sin
                lote. Queda en el Libro como producción declarada que todavía no dice de qué madera
                salió — vincularla con su lote es el paso siguiente, con sus reglas de especie,
                volumen y largo.
              </p>
              {error && (
                <p className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Pie */}
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-[var(--rule-base)] px-4 py-3">
          {paso === "declarar" && (
            <Btn onClick={() => setPaso("cubicar")} disabled={guardando}>
              Volver a cubicar
            </Btn>
          )}
          <span className="mr-auto text-xs text-[var(--text-tertiary)]">
            {paquetes.length === 0
              ? "Cubicá al menos una medida para poder declarar."
              : `${paquetes.length} ${paquetes.length === 1 ? "medida cubicada" : "medidas cubicadas"}`}
          </span>
          {paso === "cubicar" ? (
            <button
              type="button"
              onClick={() => setPaso("declarar")}
              disabled={paquetes.length === 0}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-50"
            >
              <Boxes className="h-4 w-4" aria-hidden /> Declarar esta producción
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void registrar()}
              disabled={guardando || paquetes.length === 0}
              className="inline-flex h-11 items-center gap-2 rounded-xl bg-[var(--accent)] px-5 text-sm font-semibold text-white transition hover:brightness-95 disabled:opacity-60"
            >
              {guardando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Boxes className="h-4 w-4" aria-hidden />}
              {guardando ? "Registrando…" : "Registrar producción"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
