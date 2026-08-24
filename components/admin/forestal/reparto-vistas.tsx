"use client";

/**
 * reparto-vistas — el dibujo de la distribución de rolliza: la especie, sus
 * jornadas y la fila con sus medidas.
 *
 * Salió de `ResumenReparto` cuando el componente pasó de 630 líneas: ahí quedó
 * el estado (bloques, marcas, exports) y acá el render, que es puro salvo el
 * plegado de medidas. Mismo criterio que el resto del módulo (≤300 LOC por
 * archivo).
 */

import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, ChevronRight, FileText, Plus } from "@buleje/design-system/icons";
import { ETIQUETA_DIMENSION, type DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import {
  claveMarca, claveOverrideLinea, juzgarRendimiento,
  type AsignacionGrupo, type BloqueDistribuido, type BloqueRolliza, type DiaDistribuido, type EspecieDistribucion,
} from "@/lib/forestal/cubicacion-reparto";
import { fmtM3, fmtPct, fmtPiezas, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { TipoBadge } from "./tipo-badge";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";

/** Tonos de juicio del rendimiento — mismos que usa la cabecera de la sección. */
const TONO = {
  success: "text-[var(--data-success-600)] dark:text-[var(--data-success-500)]",
  warning: "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]",
  neutral: "text-[var(--text-tertiary)]",
} as const;

/** Una especie: sus bloques llenados y lo que le quedó sin respaldo. */
export function BloqueEspecie({
  e, dim, conCosto, marcadas, marcar, onAnexo,
  editarBloque, valorTexto, onCambioDecimal, onBlurDecimal, onAgregarBloqueSugerido,
  onEditarLinea, valorTextoLinea, onCambioDecimalLinea, onBlurDecimalLinea,
}: {
  e: EspecieDistribucion;
  dim: DimensionResumen;
  conCosto: boolean;
  /** Líneas ya registradas en el Libro. */
  marcadas: Set<string>;
  marcar: (claves: string[], estado?: boolean) => void;
  /** Abre el Anexo 04 con las piezas de ESE bloque. */
  onAnexo?: (b: BloqueDistribuido) => void;
  /**
   * Editar `amparaManualM3`/`piezasManual` DESDE el resultado ya distribuido:
   * mismo campo que la tabla de entrada de arriba (misma fuente de verdad),
   * sólo que acá se ve al lado de lo que ese tope reparte — el operario no
   * tiene que subir la pantalla a corregir un bloque que está mirando abajo.
   * Al mandar un valor, `llenarBloque` reparte de nuevo TODO lo pendiente de
   * ese bloque bajo el nuevo tope, en la misma proporción de siempre — no es
   * un campo aparte, es releer el mismo estado con el límite editado.
   */
  editarBloque?: (id: string, campo: "amparaManualM3" | "piezasManual", valor: string) => void;
  valorTexto?: (id: string, campo: string, actual: number | null | undefined, mostrarCero: boolean) => string;
  onCambioDecimal?: (id: string, campo: "amparaManualM3") => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlurDecimal?: (id: string, campo: string) => () => void;
  /** Agrega un bloque nuevo ya cargado con la especie y los m³ de rolliza que hacen falta para cubrir el faltante. */
  onAgregarBloqueSugerido?: (especie: string, m3: number) => void;
  /**
   * Editar piezas/m³ de UNA LÍNEA puntual del desglose (ej. sólo «Comercial»),
   * en vez del bloque entero. `llenarBloque` toma esa línea PRIMERO con su
   * propio tope y reparte el resto del bloque con lo que sobra — el mismo
   * «prorratea el resto» de arriba, pero a nivel de línea. Sólo tiene sentido
   * con un único día (`dias === 1`): con más de uno, la fila que se ve acá es
   * la porción de ESE día, no el total del bloque, y editar ahí sería ambiguo.
   */
  onEditarLinea?: (bloqueId: string, claveGrupo: string, campo: "piezas" | "m3", valor: string) => void;
  valorTextoLinea?: (bloqueId: string, claveGrupo: string, actual: number | null | undefined) => string;
  onCambioDecimalLinea?: (bloqueId: string, claveGrupo: string) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlurDecimalLinea?: (bloqueId: string, claveGrupo: string) => () => void;
}) {
  const editable = editarBloque && valorTexto && onCambioDecimal && onBlurDecimal;
  const editableLinea = !!(onEditarLinea && valorTextoLinea && onCambioDecimalLinea && onBlurDecimalLinea);
  const j = juzgarRendimiento(e.rendimientoPct);
  const etiquetaCol = ETIQUETA_DIMENSION[dim].replace("Por ", "");
  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-[var(--rule-base)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2">
        <span className="font-display text-lg text-[var(--text-primary)]">{e.especie}</span>
        <span className="font-mono text-sm tabular-nums text-[var(--text-secondary)]">
          {fmtM3(e.rollizaM3)} m³ rolliza · ampara {fmtM3(e.capacidadM3)} → usa {fmtM3(e.amparadaM3)} de {fmtM3(e.aserradaM3)} m³ ·{" "}
          <b className={TONO[j.tono]}>{e.rendimientoPct == null ? "—" : `${fmtPct(e.rendimientoPct)} %`}</b>{" "}
          <span className="text-[var(--text-tertiary)]">{j.label}</span>
        </span>
      </div>

      {e.bloques.map((b) => {
        // Todas las claves del bloque, cruzando días × grupos — es lo mismo que
        // recorre el papel: si se tildan todas ahí, se tildan todas acá de un
        // solo click, en vez de día por día o fila por fila.
        const clavesBloque = b.porDia.flatMap((dia) => dia.grupos.map((g) => claveMarca(b.bloque.id, dia.dia, g.clave)));
        const listasBloque = clavesBloque.filter((k) => marcadas.has(k)).length;
        const todoElBloque = clavesBloque.length > 0 && listasBloque === clavesBloque.length;
        // Se nota de un vistazo, en la tabla de abajo, por qué acá no entró
        // todo lo pendiente — con el % cuando es parcial, para no confundir
        // «filtrado a 12'» con «filtrado a 12' pero sólo el 30 %».
        const filtroLargo = b.bloque.largoFiltro?.length
          ? b.bloque.largoFiltro.map((f) => (f.pct >= 100 ? `${f.largo}'` : `${f.largo}'·${f.pct}%`)).join(", ")
          : null;
        return (
        <div key={b.bloque.id} className="border-b border-[var(--rule-soft)] last:border-b-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2 px-3 py-1.5">
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {b.bloque.etiqueta || "Bloque sin etiqueta"}{" "}
              {filtroLargo && (
                <span
                  title="Prioridad para este largo — si sobra capacidad, se completa con otros largos y tipos"
                  className="inline-flex items-center rounded-full border border-[var(--accent)] bg-primary/10 px-2 py-0.5 align-middle text-[length:var(--ts-2xs)] font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                >
                  Sólo {filtroLargo}
                </span>
              )}{" "}
              <span className="font-normal text-[var(--text-tertiary)]">
                {fmtM3(b.bloque.m3)} m³ × {fmtPct(b.aprovechablePct)} % ampara
              </span>{" "}
              {editable ? (
                <label className="inline-flex items-center gap-1 align-middle">
                  <input
                    value={valorTexto(b.bloque.id, "amparaManualM3", b.bloque.amparaManualM3, true)}
                    onChange={onCambioDecimal(b.bloque.id, "amparaManualM3")}
                    onBlur={onBlurDecimal(b.bloque.id, "amparaManualM3")}
                    inputMode="decimal"
                    placeholder={fmtM3(b.bloque.m3 * (b.aprovechablePct / 100))}
                    aria-label={`Ampara m³ del bloque ${b.bloque.etiqueta || "sin etiqueta"}, editable`}
                    title={b.bloque.amparaManualM3 == null
                      ? "Se calcula como m³ × % aprovechable. Escribí el tuyo para decirlo a mano — el resto del bloque (los tipos y medidas de abajo) se reparte de nuevo dentro de esta capacidad."
                      : "Dicho a mano: manda sobre el % aprovechable — el resto del bloque ya se repartió dentro de esta capacidad."}
                    className={`h-7 w-20 rounded-md border-2 bg-[var(--surface-raised)] px-1.5 text-right font-mono text-xs font-bold tabular-nums outline-none focus:border-[var(--accent)] ${b.bloque.amparaManualM3 == null ? "border-dashed border-[var(--rule-base)] text-[var(--accent)]" : "border-[var(--accent)] text-[var(--accent)]"}`}
                  />
                  <span className="font-normal text-[var(--text-tertiary)]">m³</span>
                </label>
              ) : (
                <span className="font-normal text-[var(--text-tertiary)]">{fmtM3(b.capacidadM3)} m³</span>
              )}
            </span>
            <span className="flex flex-wrap items-center gap-2 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
              {editarBloque && (
                <label className="inline-flex items-center gap-1">
                  <span className="font-sans text-[var(--text-tertiary)]">piezas</span>
                  <input
                    value={b.bloque.piezasManual ?? ""}
                    onChange={(ev) => editarBloque(b.bloque.id, "piezasManual", ev.target.value)}
                    inputMode="numeric"
                    placeholder="todas"
                    aria-label={`Tope de piezas del bloque ${b.bloque.etiqueta || "sin etiqueta"}, editable`}
                    title="Cuántas piezas salieron de este bloque. Vacío = las que entren por volumen — escribí un tope y el bloque se llena de nuevo con la misma mezcla hasta ahí."
                    className={`h-7 w-14 rounded-md border-2 bg-[var(--surface-raised)] px-1.5 text-right font-mono tabular-nums outline-none focus:border-[var(--accent)] ${b.bloque.piezasManual == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`}
                  />
                </label>
              )}
              {clavesBloque.length > 0 && (
                <label className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] print:hidden">
                  <input
                    type="checkbox"
                    checked={todoElBloque}
                    ref={(el) => { if (el) el.indeterminate = listasBloque > 0 && !todoElBloque; }}
                    onChange={() => marcar(clavesBloque, !todoElBloque)}
                    aria-label={`Marcar todo el bloque ${b.bloque.etiqueta || "sin etiqueta"} como registrado en el Libro`}
                    className="h-3.5 w-3.5 accent-[var(--data-success-600)]"
                  />
                  Bloque {listasBloque}/{clavesBloque.length}
                </label>
              )}
              {onAnexo && b.asignado.length > 0 && (
                <button
                  type="button"
                  onClick={() => onAnexo(b)}
                  title="Imprimir el Anexo 04 con las piezas de este bloque"
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-0.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] print:hidden"
                >
                  <FileText className="h-3.5 w-3.5" aria-hidden /> Anexo 04
                </button>
              )}
              <span className="text-sm">usa <b className="text-[var(--text-primary)]">{fmtM3(b.usadoM3)}</b></span>
              {b.libreM3 > 0 && <span className="text-sm text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]"> · libre {fmtM3(b.libreM3)}</span>}
              {b.costoPorM3Aserrada != null && <span className="text-[var(--text-tertiary)]"> · S/ {fmtSoles(b.costoPorM3Aserrada)} por m³ aserrado</span>}
            </span>
          </div>
          {b.asignado.length === 0 ? (
            <p className="px-3 pb-2 text-xs text-[var(--text-tertiary)]">Sin usar todavía: no quedó aserrada que asignarle.</p>
          ) : (
            /* Siempre por jornada: con un solo día `porDia` trae una entrada y
               la tabla se ve igual que antes. Así hay UNA sola forma de dibujar
               esto, en vez de dos que se desincronizan. */
            b.porDia.map((dia) => (
              <JornadaBloque
                key={dia.dia}
                bloque={b.bloque}
                dia={dia}
                dias={b.dias}
                dim={dim}
                etiquetaCol={etiquetaCol}
                marcadas={marcadas}
                marcar={marcar}
                editableLinea={editableLinea}
                onEditarLinea={onEditarLinea}
                valorTextoLinea={valorTextoLinea}
                onCambioDecimalLinea={onCambioDecimalLinea}
                onBlurDecimalLinea={onBlurDecimalLinea}
              />
            ))
          )}
        </div>
        );
      })}

      {/* ── Lo que sobró: la tabla que espera la próxima rolliza ───────────── */}
      {e.faltante.length > 0 && (
        <div className="border-t-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10">
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
            <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="h-4 w-4" aria-hidden />
              Falta por distribuir · {fmtM3(e.faltanteM3)} m³ sin respaldo — pide {fmtM3(e.rollizaFaltanteM3)} m³ de troza
            </p>
            {onAgregarBloqueSugerido && e.rollizaFaltanteM3 > 0 && (
              <button
                type="button"
                onClick={() => onAgregarBloqueSugerido(e.especie, e.rollizaFaltanteM3)}
                title={`Agrega un bloque de ${e.especie} con ${fmtM3(e.rollizaFaltanteM3)} m³ de rolliza — la capacidad exacta para cubrir este faltante al aprovechamiento vigente. Completá la etiqueta (GTF/lote) con la troza real cuando llegue.`}
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--data-warning-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--data-warning-700)] transition-colors hover:bg-[var(--data-warning-500)]/10 dark:text-[var(--data-warning-500)] print:hidden"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden /> Agregar bloque de {fmtM3(e.rollizaFaltanteM3)} m³
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <DataTable aria-label={`Faltante por distribuir de ${e.especie}`} className="w-full min-w-[520px] text-base">
              <thead>
                <tr className="border-b-2 border-[var(--data-warning-500)]/40 text-left text-sm font-bold uppercase tracking-wide text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  <th scope="col" className="px-3 py-2.5">{etiquetaCol}</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Piezas</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Pie tablar</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Sin amparar (m³)</th>
                  <th scope="col" className="px-3 py-2.5 text-right">Rolliza que pide</th>
                </tr>
              </thead>
              <tbody>
                {e.faltante.map((f) => (
                  <tr key={f.clave} className="border-t border-[var(--rule-soft)] transition-colors hover:bg-primary/5">
                    <td className="px-3 py-2.5">{dim === "tipo" ? <TipoBadge tipo={f.label as TipoComercial} /> : f.label}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtPiezas(f.piezas)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtPt(f.pieTablar)}</td>
                    <td className="px-3 py-2.5 text-right font-mono font-bold tabular-nums text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{fmtM3(f.m3)}</td>
                    <td className="px-3 py-2.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(f.rollizaNecesariaM3)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/15 text-base font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  <th scope="row" className="px-3 py-2.5 text-left">Total sin distribuir</th>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPiezas(e.faltante.reduce((a, f) => a + f.piezas, 0))}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPt(e.faltante.reduce((a, f) => a + f.pieTablar, 0))}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtM3(e.faltanteM3)}</td>
                  <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtM3(e.rollizaFaltanteM3)}</td>
                </tr>
              </tfoot>
            </DataTable>
          </div>
        </div>
      )}
      {conCosto && e.costoRolliza != null && (
        <p className="px-3 py-2 text-sm text-[var(--text-tertiary)]">
          Costo de la rolliza de {e.especie}: S/ {fmtSoles(e.costoRolliza)}
        </p>
      )}
    </div>
  );
}

/**
 * Una jornada del bloque: su tabla, con el check de «ya lo registré en el Libro».
 *
 * El Libro de Operaciones se llena día por día, así que la unidad que se tilda
 * es la línea de un día. La cabecera de la jornada trae su propio check para
 * marcar todo el día de una — que es como se registra en la práctica.
 */
function JornadaBloque({
  bloque, dia, dias, dim, etiquetaCol, marcadas, marcar,
  editableLinea, onEditarLinea, valorTextoLinea, onCambioDecimalLinea, onBlurDecimalLinea,
}: {
  bloque: BloqueRolliza;
  dia: DiaDistribuido;
  /** Jornadas del bloque: con una sola no se dibuja la cabecera de día. */
  dias: number;
  dim: DimensionResumen;
  etiquetaCol: string;
  marcadas: Set<string>;
  marcar: (claves: string[], estado?: boolean) => void;
  editableLinea: boolean;
  onEditarLinea?: (bloqueId: string, claveGrupo: string, campo: "piezas" | "m3", valor: string) => void;
  valorTextoLinea?: (bloqueId: string, claveGrupo: string, actual: number | null | undefined) => string;
  onCambioDecimalLinea?: (bloqueId: string, claveGrupo: string) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlurDecimalLinea?: (bloqueId: string, claveGrupo: string) => () => void;
}) {
  const bloqueId = bloque.id;
  const claves = dia.grupos.map((g) => claveMarca(bloqueId, dia.dia, g.clave));
  const listas = claves.filter((k) => marcadas.has(k)).length;
  const todas = claves.length > 0 && listas === claves.length;

  return (
    <div className="border-t border-[var(--rule-soft)] first:border-t-0">
      {dias > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--surface-sunken)] px-3 py-1.5">
          <label className="inline-flex items-center gap-2 text-xs font-bold text-[var(--text-primary)]">
            <input
              type="checkbox"
              checked={todas}
              // Parcial: ni tildado ni vacío, para que se vea que el día quedó a medias.
              ref={(el) => { if (el) el.indeterminate = listas > 0 && !todas; }}
              onChange={() => marcar(claves, !todas)}
              aria-label={`Marcar el día ${dia.dia} como distribuido`}
              className="h-4 w-4 accent-[var(--data-success-600)]"
            />
            Día {dia.dia}
            <span className="font-normal text-[var(--text-tertiary)]">de {dias}</span>
          </label>
          <span className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
            {dia.piezas === 0 ? (
              <span className="text-[var(--text-tertiary)]">sin producción de este bloque</span>
            ) : (
              <>{dia.piezas} pzas · {fmtPt(dia.pieTablar)} PT · {fmtM3(dia.m3)} m³</>
            )}
            {claves.length > 0 && (
              <span className={`ml-2 rounded-full px-2 py-0.5 text-sm font-bold ${todas
                ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
                : "bg-[var(--surface-canvas)] text-[var(--text-tertiary)]"}`}>
                {listas}/{claves.length} distribuidas
              </span>
            )}
          </span>
        </div>
      )}
      {dia.grupos.length === 0 ? null : (
        <div className="overflow-x-auto">
          <DataTable className="w-full min-w-[500px] text-sm">
            <thead>
              <tr className="text-left text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                <th scope="col" className="w-24 px-3 py-2.5" title="Tildá la línea cuando ya la distribuiste y la pasaste al Libro de Operaciones">Distribuido</th>
                <th scope="col" className="px-3 py-2.5">{etiquetaCol}</th>
                <th scope="col" className="px-3 py-2.5 text-right">Piezas</th>
                <th scope="col" className="px-3 py-2.5 text-right">Pie tablar</th>
                <th scope="col" className="px-3 py-2.5 text-right">Ampara (m³)</th>
              </tr>
            </thead>
            <tbody>
              {dia.grupos.map((a) => {
                const k = claveMarca(bloqueId, dia.dia, a.clave);
                // Sólo con UN día el total de la fila es el total del bloque —con
                // más de uno, editar acá tocaría la porción de ese día, ambiguo.
                const editable = editableLinea && dias === 1;
                const overrideActual = editable ? (bloque.overridesLinea?.[claveOverrideLinea(dim, a.clave)] ?? null) : null;
                return (
                  <FilaConMedidas
                    key={a.clave}
                    a={a}
                    dim={dim}
                    marcada={marcadas.has(k)}
                    onMarcar={() => marcar([k])}
                    editable={editable}
                    bloqueId={bloqueId}
                    overrideActual={overrideActual}
                    onEditarLinea={onEditarLinea}
                    valorTextoLinea={valorTextoLinea}
                    onCambioDecimalLinea={onCambioDecimalLinea}
                    onBlurDecimalLinea={onBlurDecimalLinea}
                  />
                );
              })}
            </tbody>
            {/* Cada tabla cierra con su suma: es el número que se copia al Libro
                y el que se compara contra la pila. */}
            <tfoot>
              <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 text-base font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                <td className="px-3 py-2.5" />
                <th scope="row" className="px-3 py-2.5 text-left">Total del día {dia.dia}</th>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPiezas(dia.piezas)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtPt(dia.pieTablar)}</td>
                <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmtM3(dia.m3)}</td>
              </tr>
            </tfoot>
          </DataTable>
        </div>
      )}
    </div>
  );
}

/**
 * Un grupo asignado, con sus medidas a un click.
 *
 * Las medidas van plegadas y no en la tabla principal: un bloque con seis tipos
 * y cuatro medidas cada uno son veinticuatro filas donde había seis, y la
 * lectura de «cuánto ampara cada tipo» se pierde. Desplegado se ve el registro
 * que pide el papel — qué 2×8×10 entró acá.
 */
function FilaConMedidas({
  a, dim, marcada, onMarcar,
  editable, bloqueId, overrideActual, onEditarLinea, valorTextoLinea, onCambioDecimalLinea, onBlurDecimalLinea,
}: {
  a: AsignacionGrupo;
  dim: DimensionResumen;
  /** Ya se registró en el Libro: la fila se pinta y se corre al final del ojo. */
  marcada: boolean;
  onMarcar: () => void;
  /** Piezas/m³ de ESTA línea editables — sólo con un único día en el bloque. */
  editable: boolean;
  bloqueId: string;
  overrideActual: { piezas?: number | null; m3?: number | null } | null;
  onEditarLinea?: (bloqueId: string, claveGrupo: string, campo: "piezas" | "m3", valor: string) => void;
  valorTextoLinea?: (bloqueId: string, claveGrupo: string, actual: number | null | undefined) => string;
  onCambioDecimalLinea?: (bloqueId: string, claveGrupo: string) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlurDecimalLinea?: (bloqueId: string, claveGrupo: string) => () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const hayDetalle = a.medidas.length > 0;
  return (
    <>
      <tr
        onClick={onMarcar}
        className={`cursor-pointer border-t border-[var(--rule-soft)] transition-colors ${marcada
          ? "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/12"
          : "hover:bg-primary/5"}`}
      >
        <td className="px-3 py-2">
          {/* El checkbox es el control de verdad (teclado, lectores); el click en
              la fila es el atajo para el operario con guantes. */}
          <input
            type="checkbox"
            checked={marcada}
            onChange={onMarcar}
            onClick={(ev) => ev.stopPropagation()}
            aria-label={`Marcar ${a.label} como distribuido`}
            className="h-4 w-4 accent-[var(--data-success-600)]"
          />
        </td>
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1.5">
            {hayDetalle && (
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); setAbierto((v) => !v); }}
                aria-expanded={abierto}
                aria-label={`${abierto ? "Ocultar" : "Ver"} las medidas de ${a.label}`}
                title={`${a.medidas.length} ${a.medidas.length === 1 ? "medida" : "medidas"}`}
                className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
              >
                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${abierto ? "rotate-90" : ""}`} aria-hidden />
              </button>
            )}
            {dim === "tipo" ? <TipoBadge tipo={a.label as TipoComercial} /> : a.label}
            {hayDetalle && (
              <span className="text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                {a.medidas.length} {a.medidas.length === 1 ? "medida" : "medidas"}
              </span>
            )}
          </span>
        </td>
        <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-tertiary)]">
          {editable ? (
            <input
              value={overrideActual?.piezas ?? ""}
              onChange={(ev) => onEditarLinea!(bloqueId, a.clave, "piezas", ev.target.value)}
              onClick={(ev) => ev.stopPropagation()}
              inputMode="numeric"
              placeholder={fmtPiezas(a.piezas)}
              aria-label={`Piezas de ${a.label}, editable`}
              title="Piezas declaradas a mano para ESTA línea. Vacío = lo que reparte el cálculo — el resto del bloque se reparte de nuevo con lo que sobre."
              className={`h-7 w-16 rounded-md border-2 bg-[var(--surface-raised)] px-1.5 text-right font-mono text-xs tabular-nums outline-none focus:border-[var(--accent)] ${overrideActual?.piezas == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`}
            />
          ) : fmtPiezas(a.piezas)}
        </td>
        <td className="px-3 py-1.5 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtPt(a.pieTablar)}</td>
        <td className="px-3 py-1.5 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
          {editable ? (
            <input
              value={valorTextoLinea!(bloqueId, a.clave, overrideActual?.m3)}
              onChange={onCambioDecimalLinea!(bloqueId, a.clave)}
              onBlur={onBlurDecimalLinea!(bloqueId, a.clave)}
              onClick={(ev) => ev.stopPropagation()}
              inputMode="decimal"
              placeholder={fmtM3(a.m3)}
              aria-label={`Ampara m³ de ${a.label}, editable`}
              title="m³ declarados a mano para ESTA línea. Vacío = lo que reparte el cálculo — el resto del bloque se reparte de nuevo con lo que sobre."
              className={`h-7 w-20 rounded-md border-2 bg-[var(--surface-raised)] px-1.5 text-right font-mono text-xs font-bold tabular-nums outline-none focus:border-[var(--accent)] ${overrideActual?.m3 == null ? "border-dashed border-[var(--rule-base)] text-[var(--accent)]" : "border-[var(--accent)] text-[var(--accent)]"}`}
            />
          ) : fmtM3(a.m3)}
        </td>
      </tr>
      {abierto &&
        a.medidas.map((m) => (
          <tr key={m.clave} className="border-l-2 border-[var(--accent)]/30 bg-[var(--surface-sunken)]">
            <td />
            <td className="py-1.5 pl-9 pr-3 font-mono text-sm text-[var(--text-secondary)]">{m.medida}</td>
            <td className="px-3 py-1.5 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)]">{fmtPiezas(m.piezas)}</td>
            <td className="px-3 py-1.5 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)]">{fmtPt(m.pieTablar)}</td>
            <td className="px-3 py-1.5 text-right font-mono text-sm tabular-nums text-[var(--text-primary)]">{fmtM3(m.m3)}</td>
          </tr>
        ))}
    </>
  );
}
