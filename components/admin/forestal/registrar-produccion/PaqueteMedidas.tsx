"use client";

/**
 * Las medidas de UN paquete y el botón que lo agrega: dimensionado (espesor ×
 * ancho × largo, el volumen se calcula) o por volumen con su pie tablar, más
 * «Repetir», Añadir/Guardar cambios y por qué no entra. Movido tal cual desde
 * `CtpRegistrarProduccionModal.tsx` (28-10).
 */
import { AlertTriangle, Pencil, Plus, X } from "@buleje/design-system/icons";
import { PT_POR_M3 } from "@/lib/forestal/cubicacion";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { button } from "@/components/ui-system/button-variants";
import { Btn } from "../ctp-shared";
import { CAMPO, Campo, Dato } from "./campos";
import type { RegistrarProduccion } from "./use-registrar-produccion";

const MARGEN = button({
  variant: "link",
  className:
    "mt-1 flex h-auto px-0 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]",
});

export default function PaqueteMedidas({ r }: { r: RegistrarProduccion }) {
  const {
    dimensionar,
    espesor,
    setEspesor,
    ancho,
    setAncho,
    largo,
    setLargo,
    volumenCalculado,
    volumen,
    setVolumen,
    margenParaEste,
    obsPaquete,
    setObsPaquete,
    editandoId,
    repetir,
    setRepetir,
    agregar,
    noEntra,
    veces,
    cancelarEdicion,
    volumenAUsar,
  } = r;
  return (
    <>
      <div className="mt-3 grid gap-3 @lg:grid-cols-2 @3xl:grid-cols-4">
        {dimensionar ? (
          <>
            <Campo label="Espesor (cm)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={espesor}
                onChange={(e) => setEspesor(e.target.value)}
                className={CAMPO}
              />
            </Campo>
            <Campo label="Ancho (cm)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={ancho}
                onChange={(e) => setAncho(e.target.value)}
                className={CAMPO}
              />
            </Campo>
            <Campo label="Largo (m)">
              <input
                type="number"
                min={0}
                step="0.01"
                value={largo}
                onChange={(e) => setLargo(e.target.value)}
                className={CAMPO}
              />
            </Campo>
            {/* Calculado, no tipeado: con las medidas puestas, escribir otro
                volumen crea dos verdades sobre el mismo paquete. */}
            <Dato
              label="Volumen (m³)"
              valor={
                volumenCalculado != null
                  ? `${fmtM3(volumenCalculado)}  ·  ${formatNumber(pieTablarDe(volumenCalculado))} pt`
                  : "—"
              }
            />
          </>
        ) : (
          <>
            <Campo label="Volumen (m³)">
              <input
                type="number"
                min={0}
                step="0.0001"
                value={volumen}
                onChange={(e) => setVolumen(e.target.value)}
                className={CAMPO}
              />
              {/* El último paquete siempre se calcula a mano: «me quedan
                  3.030, ¿cuánto pongo?». Acá se pone solo (D1). */}
              {margenParaEste > 0 && Number(volumen) !== margenParaEste && (
                <button
                  type="button"
                  onClick={() => setVolumen(String(margenParaEste))}
                  className={MARGEN}
                >
                  usar el margen restante ({fmtM3(margenParaEste)} m³)
                </button>
              )}
            </Campo>
            {/**
             * El mismo bulto, en la unidad en la que se canta en el patio.
             *
             * El parte del turno viene en pie tablar y el libro se declara en
             * m³: la conversión se hacía en una calculadora aparte, que es
             * donde aparecen los volúmenes que después no cuadran. Se
             * escriben los dos y cada uno actualiza al otro — un solo dato
             * con dos caras, no dos campos que puedan discrepar.
             */}
            <Campo label="Pie tablar (equivale)">
              <input
                type="number"
                min={0}
                step="1"
                value={
                  volumen === "" ? "" : String(Math.round((Number(volumen) || 0) * PT_POR_M3))
                }
                onChange={(e) => {
                  const pt = Number(e.target.value);
                  setVolumen(
                    e.target.value === "" || !Number.isFinite(pt)
                      ? ""
                      : String(Math.round((pt / PT_POR_M3) * 10_000) / 10_000),
                  );
                }}
                className={CAMPO}
              />
            </Campo>
            <Campo label="Observación del paquete">
              <input
                value={obsPaquete}
                onChange={(e) => setObsPaquete(e.target.value)}
                maxLength={300}
                className={CAMPO}
              />
            </Campo>
          </>
        )}
        {/* Repetir y el botón son la ÚLTIMA celda de la grilla, no una fila
            aparte: la fila de medidas termina en la acción, que es donde el
            ojo llega. Al dimensionar caen solos a la línea siguiente. */}
        <div className="flex flex-wrap items-end justify-end gap-3">
          {/* Doce atados iguales se cargan una vez, no doce (A1). */}
          {!editandoId && (
            <label className="flex flex-col gap-1">
              <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                Repetir
              </span>
              <input
                type="number"
                min={1}
                max={200}
                value={repetir}
                onChange={(e) => setRepetir(e.target.value)}
                aria-label="Cuántos paquetes iguales crear"
                className={`${CAMPO} w-20 text-center tabular-nums`}
              />
            </label>
          )}
          <Btn
            variant="primary"
            onClick={agregar}
            disabled={Boolean(noEntra)}
            title={noEntra ?? undefined}
          >
            {editandoId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editandoId ? "Guardar cambios" : veces > 1 ? `Añadir ${veces}` : "Añadir"}
          </Btn>
          {editandoId && (
            <Btn variant="secondary" onClick={cancelarEdicion}>
              <X className="h-4 w-4" /> Cancelar
            </Btn>
          )}
        </div>
      </div>

      {/* Con más de uno, el total se dice ANTES de apretar: es lo que va a
          entrar al libro y lo que puede chocar contra el tope. */}
      {!editandoId && veces > 1 && (volumenAUsar ?? 0) > 0 && (
        <p className="mt-2 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)]">
          {veces} × {fmtM3(volumenAUsar ?? 0)} ={" "}
          <b className="text-[var(--text-primary)]">{fmtM3((volumenAUsar ?? 0) * veces)} m³</b>
        </p>
      )}

      {/* Por qué el botón está apagado. Un botón gris sin motivo se lee como
          que la pantalla se rompió. */}
      {noEntra && (volumenAUsar ?? 0) > 0 && (
        <p className="mt-2 flex items-start gap-2 rounded-xl bg-[var(--data-warning-500)]/12 px-3 py-2 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {noEntra}
        </p>
      )}
    </>
  );
}
