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
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Download,
  Loader2,
  Plus,
  Trash2,
  Truck,
} from "@buleje/design-system/icons";
import {
  filaDesdeGtfLoth,
  filaDesdeGuiaEmitida,
  nuevaFilaGuia,
  numerosGuiaRepetidos,
  parseGuiasInforme,
  resumenGuiasInforme,
  serializeGuiasInforme,
  type FilaGuiaInforme,
  type GtfDuplicada,
  type GtfLothLike,
} from "@/lib/forestal/tramites-relacion-guias";
import type { GuiaEmitida } from "@/lib/forestal/guias-emitidas";
import { Btn } from "./ctp-shared";

const ORIGEN_LABEL: Record<FilaGuiaInforme["origen"], string> = {
  ctp: "Libro CTP",
  loth: "Libro TH",
  manual: "",
};

/** Input compacto: estas filas ya tienen 6 celdas, un `h-11` las hace gigantes. */
const IC =
  "h-9 w-full rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-xs text-[var(--text-primary)] outline-none transition-[border-color,box-shadow] focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] placeholder:text-[var(--text-tertiary)]";

let contador = 0;
/** Uid client-only para la key de React — no viaja a ningún lado. */
const uidNueva = () => `fila-${Date.now()}-${(contador += 1)}`;

export default function TramiteRelacionGuias({
  value,
  onChange,
  periodoDesde,
  periodoHasta,
  numero,
  duplicadosCruzados,
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
}) {
  const [filas, setFilas] = useState<FilaGuiaInforme[]>(() => parseGuiasInforme(value));
  const [trayendo, setTrayendo] = useState(false);
  const [avisoTraer, setAvisoTraer] = useState<string | null>(null);

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

  async function traerDeCtp(): Promise<{ filas: FilaGuiaInforme[]; aviso: string | null }> {
    const qs = new URLSearchParams({ desde: periodoDesde!, hasta: periodoHasta! });
    const res = await fetch(`/api/admin/forestal/ctp/guias-emitidas?${qs}`, { credentials: "include", cache: "no-store" });
    if (!res.ok) {
      return {
        filas: [],
        aviso: res.status === 403 ? "Libro CTP no habilitado" : `Libro CTP: error ${res.status}`,
      };
    }
    const { guias } = (await res.json()) as { guias: GuiaEmitida[] };
    return { filas: (guias ?? []).map((g) => filaDesdeGuiaEmitida(uidNueva(), g)), aviso: null };
  }

  async function traerDeLoth(): Promise<{ filas: FilaGuiaInforme[]; aviso: string | null }> {
    const res = await fetch("/api/admin/forestal/gtf", { credentials: "include", cache: "no-store" });
    if (!res.ok) {
      return {
        filas: [],
        aviso: res.status === 403 ? "Libro TH no habilitado" : `Libro TH: error ${res.status}`,
      };
    }
    const { gtfs } = (await res.json()) as { gtfs: GtfLothLike[] };
    const desde = periodoDesde!;
    const hasta = periodoHasta!;
    const enPeriodo = (gtfs ?? []).filter((g) => {
      if (!g.gtfDate) return false;
      const f = new Date(g.gtfDate).toISOString().slice(0, 10);
      return f >= desde && f <= hasta;
    });
    return { filas: enPeriodo.map((g) => filaDesdeGtfLoth(uidNueva(), g)), aviso: null };
  }

  async function traerDelLibro() {
    if (!periodoDesde || !periodoHasta) {
      setAvisoTraer("Elegí el período (desde / hasta) antes de traer las guías de los libros.");
      return;
    }
    setTrayendo(true);
    setAvisoTraer(null);
    try {
      const [ctp, loth] = await Promise.all([traerDeCtp(), traerDeLoth()]);
      const yaTraidas = new Set(filas.filter((f) => f.origen !== "manual").map((f) => f.numero));
      const traidas = [...ctp.filas, ...loth.filas].filter((f) => !yaTraidas.has(f.numero));

      const avisos = [ctp.aviso, loth.aviso].filter(Boolean);
      if (traidas.length === 0) {
        setAvisoTraer(
          avisos.length === 2
            ? `Ningún libro respondió (${avisos.join(" · ")}). Agregá las guías a mano.`
            : avisos.length === 1
              ? `${avisos[0]}. El otro libro no tiene guías nuevas en el período.`
              : "Ningún libro tiene guías nuevas en ese período.",
        );
        return;
      }
      actualizar([...filas, ...traidas]);
      if (avisos.length > 0) setAvisoTraer(`Se trajeron ${traidas.length}. ${avisos.join(" · ")}.`);
    } catch (err) {
      setAvisoTraer(err instanceof Error ? err.message : String(err));
    } finally {
      setTrayendo(false);
    }
  }

  return (
    <section className="rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
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
            <h4 className="text-base font-bold leading-tight text-[var(--text-primary)]">Guías de transporte forestal</h4>
            <p className="text-xs text-[var(--text-tertiary)]">
              Cada fila es una GTF con su lista de trozas. Traelas del libro o agregalas a mano.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
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
        <p className="mb-3 flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-2.5 text-xs font-medium text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {avisoTraer}
        </p>
      )}

      {repetidos.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-2.5 text-xs font-medium text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          N° repetido entre las vigentes: {repetidos.join(", ")}. Revisalo antes de presentar.
        </p>
      )}

      {/* Duplicado CRUZADO: la guía ya está en OTRA relación guardada — típico
          tipeo repetido, o la misma guía declarada dos veces sin querer
          (ADR-364 ronda 4). Distinto de `repetidos`, que sólo mira ADENTRO. */}
      {duplicadosCruzados && duplicadosCruzados.length > 0 && (
        <p className="mb-3 flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-2.5 text-xs font-medium text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {duplicadosCruzados.length === 1 ? "Esta guía" : "Estas guías"} ya {duplicadosCruzados.length === 1 ? "está" : "están"} en otra relación guardada:{" "}
          {duplicadosCruzados.map((d) => `${d.numero} (${d.otraRelacion})`).join(", ")}. Puede ser un tipeo repetido — revisalo antes de presentar.
        </p>
      )}

      {filas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
          Todavía no agregaste ninguna guía. Traela del Libro CTP o del Libro TH, o agregala a mano.
        </p>
      ) : (
        <ul className="space-y-2">
          {filas.map((f) => (
            <FilaEditable key={f.uid} fila={f} onEditar={(c) => editarFila(f.uid, c)} onQuitar={() => quitarFila(f.uid)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilaEditable({
  fila,
  onEditar,
  onQuitar,
}: {
  fila: FilaGuiaInforme;
  onEditar: (cambios: Partial<FilaGuiaInforme>) => void;
  onQuitar: () => void;
}) {
  return (
    <li
      className={`rounded-xl border-2 p-3 transition-colors ${
        fila.anulada
          ? "border-[var(--rule-base)] bg-[var(--surface-sunken)] opacity-80"
          : "border-[var(--rule-base)] bg-[var(--surface-canvas)]"
      }`}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-6">
        <input
          className={`${IC} sm:col-span-2`}
          placeholder="N° de GTF"
          value={fila.numero}
          onChange={(e) => onEditar({ numero: e.target.value })}
        />
        <input
          type="date"
          className={`${IC} sm:col-span-1`}
          value={fila.fecha}
          onChange={(e) => onEditar({ fecha: e.target.value })}
        />
        <input
          className={`${IC} sm:col-span-3`}
          placeholder="Destinatario"
          value={fila.destinatario}
          onChange={(e) => onEditar({ destinatario: e.target.value })}
        />
        <input
          className={`${IC} sm:col-span-2`}
          placeholder="Especie"
          value={fila.especie}
          onChange={(e) => onEditar({ especie: e.target.value })}
        />
        <input
          className={`${IC} sm:col-span-2`}
          placeholder="Producto"
          value={fila.producto}
          onChange={(e) => onEditar({ producto: e.target.value })}
        />
        <input
          className={`${IC} sm:col-span-1`}
          placeholder="Cantidad"
          value={fila.cantidad}
          onChange={(e) => onEditar({ cantidad: e.target.value })}
        />
        <input
          className={`${IC} sm:col-span-1`}
          placeholder="Unidad"
          value={fila.unidad}
          onChange={(e) => onEditar({ unidad: e.target.value })}
        />
      </div>

      <textarea
        rows={2}
        className={`${IC} mt-2 h-auto py-1.5`}
        placeholder="Lista de trozas: código y medida, una por línea"
        value={fila.trozas}
        onChange={(e) => onEditar({ trozas: e.target.value })}
      />

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onEditar({ anulada: !fila.anulada, motivo: fila.anulada ? "" : fila.motivo })}
          aria-pressed={fila.anulada}
          className={`inline-flex h-8 items-center gap-1.5 rounded-full border-2 px-2.5 text-xs font-bold transition ${
            fila.anulada
              ? "border-[var(--text-tertiary)] bg-[var(--surface-raised)] text-[var(--text-primary)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] hover:border-[var(--rule-strong)]"
          }`}
        >
          <Ban className="h-3.5 w-3.5" /> Anulada
        </button>
        {fila.anulada && (
          <input
            className={`${IC} max-w-xs flex-1`}
            placeholder="Motivo de la anulación"
            value={fila.motivo}
            onChange={(e) => onEditar({ motivo: e.target.value })}
          />
        )}
        {fila.origen !== "manual" && (
          <span className="rounded-full bg-[var(--data-info-500)]/12 px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold text-[var(--data-info-700)] dark:text-[var(--data-info-500)]">
            {ORIGEN_LABEL[fila.origen]}
          </span>
        )}
        <button
          type="button"
          onClick={onQuitar}
          aria-label={`Quitar la guía ${fila.numero || "sin número"}`}
          className="ml-auto inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition hover:bg-[var(--data-error-50)] hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
