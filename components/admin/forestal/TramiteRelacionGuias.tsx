"use client";

/**
 * TramiteRelacionGuias — la tabla del trámite "Relación de guías emitidas"
 * (ADR-364): una fila por GTF, con su lista de trozas, lista para que SERFOR la
 * registre en el SNIFFS.
 *
 * Tres formas de llenarla, sin que se pisen: **Traer del libro** trae, EN
 * PARALELO, los despachos con GTF del Libro CTP (mismo derivado que
 * `CtpGuiasEmitidasView`, `origen:"ctp"`) y las GTF de trozas del Libro de
 * Títulos Habilitantes (`ForestGtf`, `origen:"loth"`) — las del Libro TH SÍ
 * traen la lista de trozas real (código y medida por pieza, `ForestGtf.items`);
 * las del CTP no (el despacho no la guarda a ese nivel) y quedan para
 * completar a mano. **Fila manual** es para lo que ningún libro tiene: una
 * guía anulada antes de registrarse, o de una comunidad sin libro digital.
 *
 * El permiso manda (Brandon 08-10): «Traer» trae sólo las del permiso del
 * oficio, y una fila que dice otro permiso se marca, con «Quitarlas».
 * «Con detalle de trozas» suma al papel una hoja aparte con cada troza.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Download, Loader2, Plus, Truck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  nuevaFilaGuia,
  numerosGuiaRepetidos,
  parseGuiasInforme,
  resumenGuiasInforme,
  serializeGuiasInforme,
  type FilaGuiaInforme,
  type GtfDuplicada,
} from "@/lib/forestal/tramites-relacion-guias";
import { filasDeOtroPermiso } from "@/lib/forestal/tramites-permiso";
import { Btn } from "./ctp-shared";
import TramiteRelacionGuiaFila from "./TramiteRelacionGuiaFila";
import { uidNueva, useTramiteTraerGuias } from "./hooks/use-tramite-traer-guias";

const AVISO =
  "mb-3 flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-3 text-xs font-medium text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]";

export default function TramiteRelacionGuias({
  value,
  onChange,
  periodoDesde,
  periodoHasta,
  numero,
  duplicadosCruzados,
  permisoCodigo,
  conDetalle,
  onConDetalle,
}: {
  value: string;
  onChange: (json: string) => void;
  periodoDesde?: string;
  periodoHasta?: string;
  /** Orden dentro del formulario, para el chip numerado de la cabecera. */
  numero?: number;
  /** N° de GTF que ya aparecen en OTRA relación guardada (ADR-364 ronda 4) —
   *  lo calcula el padre, que es quien conoce el resto del expediente. */
  duplicadosCruzados?: GtfDuplicada[];
  /** El permiso del oficio: «Traer» trae sólo las suyas y las de otro se marcan. */
  permisoCodigo?: string;
  conDetalle: boolean;
  onConDetalle: (v: boolean) => void;
}) {
  const [filas, setFilas] = useState<FilaGuiaInforme[]>(() => parseGuiasInforme(value));
  const { trayendo, aviso: avisoTraer, traer } = useTramiteTraerGuias();

  /**
   * `TramiteFormulario` arranca `datos` vacío y lo llena recién en su propio
   * `useEffect` de montaje: al reabrir un trámite guardado, este componente
   * monta ANTES de que `value` (`datos.guiasJson`) llegue con el JSON real, así
   * que el `useState` de arriba semilla con `""` → `[]` y se queda así — las
   * guías guardadas desaparecían de la pantalla aunque seguían en el servidor.
   * Este efecto agarra el valor cuando por fin llega, UNA sola vez (`sembrado`
   * bloquea después): si no, cada `onChange` propio re-sembraría por encima de
   * lo que el operador está tipeando.
   */
  const sembrado = useRef(Boolean(value));
  useEffect(() => {
    if (sembrado.current || !value) return;
    sembrado.current = true;
    setFilas(parseGuiasInforme(value));
  }, [value]);

  const actualizar = (next: FilaGuiaInforme[]) => {
    setFilas(next);
    onChange(serializeGuiasInforme(next));
  };

  const resumen = useMemo(() => resumenGuiasInforme(filas), [filas]);
  const repetidos = useMemo(() => numerosGuiaRepetidos(filas), [filas]);

  const agregarFila = () => actualizar([...filas, nuevaFilaGuia(uidNueva())]);
  const quitarFila = (uid: string) => actualizar(filas.filter((f) => f.uid !== uid));
  const editarFila = (uid: string, cambios: Partial<FilaGuiaInforme>) =>
    actualizar(filas.map((f) => (f.uid === uid ? { ...f, ...cambios } : f)));

  const deOtroPermiso = useMemo(() => new Set(filasDeOtroPermiso(filas, permisoCodigo).map((f) => f.uid)), [filas, permisoCodigo]);

  async function traerDelLibro() {
    const yaTraidas = new Set(filas.filter((f) => f.origen !== "manual").map((f) => f.numero));
    const nuevas = await traer({ desde: periodoDesde, hasta: periodoHasta, permisoCodigo, yaTraidas });
    if (nuevas.length > 0) actualizar([...filas, ...nuevas]);
  }

  return (
    <section className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3 border-b-2 border-[var(--rule-soft)] pb-3">
        <div className="flex items-center gap-2.5">
          {numero != null ? (
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-black text-[var(--accent-ink)] dark:text-[var(--accent)]">
              {numero}
            </span>
          ) : (
            <Truck className="h-5 w-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <span className="flex items-center gap-1.5">
              <h4 className="text-base font-bold leading-tight text-[var(--text-primary)]">Guías de transporte forestal</h4>
              <InfoTip
                title="Guías de transporte forestal"
                what="Cada fila es una GTF con su lista de trozas."
                affects="Tráelas del libro o agrégalas a mano."
              />
            </span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex h-8 items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={conDetalle} onChange={(e) => onConDetalle(e.target.checked)} />
              Con detalle de trozas
            </label>
            <InfoTip
              title="Detalle de trozas"
              what="En la carta y el anexo cada guía va con el N° de su lista de trozas. Marcado, el papel suma una hoja aparte con cada troza (código, especie, medidas, volumen)."
            />
          </span>
          <Btn size="sm" variant="secondary" disabled={trayendo} onClick={() => void traerDelLibro()}>
            {trayendo ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Traer de los libros
          </Btn>
          <Btn size="sm" variant="secondary" onClick={agregarFila}>
            <Plus className="h-4 w-4" />
            Fila manual
          </Btn>
        </div>
      </div>

      {filas.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 text-xs font-bold">
          <span className="rounded-full bg-[var(--data-success-500)]/12 px-2.5 py-1 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
            {resumen.emitidas} emitida{resumen.emitidas === 1 ? "" : "s"}
          </span>
          {resumen.anuladas > 0 && (
            <span className="rounded-full bg-[var(--surface-sunken)] px-2.5 py-1 text-[var(--text-tertiary)] line-through">
              {resumen.anuladas} anulada{resumen.anuladas === 1 ? "" : "s"}
            </span>
          )}
          {resumen.sinTrozas > 0 && (
            <span className="rounded-full bg-[var(--data-warning-500)]/15 px-2.5 py-1 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              {resumen.sinTrozas} sin lista de trozas
            </span>
          )}
        </div>
      )}

      {avisoTraer && (
        <p className={AVISO}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {avisoTraer}
        </p>
      )}

      {/* El permiso manda: una guía de otro permiso no va en este oficio (se arma el suyo). */}
      {deOtroPermiso.size > 0 && (
        <p className={AVISO}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">
            {deOtroPermiso.size === 1 ? "1 guía es" : `${deOtroPermiso.size} guías son`} de otro permiso: no {deOtroPermiso.size === 1 ? "va" : "van"} en el oficio del {permisoCodigo}.
          </span>
          <button
            type="button"
            onClick={() => actualizar(filas.filter((f) => !deOtroPermiso.has(f.uid)))}
            className="shrink-0 font-bold underline underline-offset-2"
          >
            Quitar{deOtroPermiso.size === 1 ? "la" : "las"}
          </button>
        </p>
      )}

      {repetidos.length > 0 && (
        <p className={AVISO}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          N° repetido entre las vigentes: {repetidos.join(", ")}. Revísalo antes de presentar.
        </p>
      )}

      {/* Duplicado CRUZADO: la guía ya está en OTRA relación guardada — típico
          tipeo repetido, o la misma guía declarada dos veces sin querer
          (ADR-364 ronda 4). Distinto de `repetidos`, que sólo mira ADENTRO. */}
      {duplicadosCruzados && duplicadosCruzados.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-3 text-xs font-medium text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {duplicadosCruzados.length === 1 ? "Esta guía" : "Estas guías"} ya {duplicadosCruzados.length === 1 ? "está" : "están"} en otra relación guardada:{" "}
          {duplicadosCruzados.map((d) => `${d.numero} (${d.otraRelacion})`).join(", ")}. Puede ser un tipeo repetido — revísalo antes de presentar.
        </p>
      )}

      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
          Todavía no agregaste ninguna guía. Traela del Libro CTP o del Libro TH, o agregala a mano.
        </p>
      ) : (
        <ul className="space-y-2">
          {filas.map((f) => (
            <TramiteRelacionGuiaFila
              key={f.uid}
              fila={f}
              otroPermiso={deOtroPermiso.has(f.uid)}
              onEditar={(c) => editarFila(f.uid, c)}
              onQuitar={() => quitarFila(f.uid)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
