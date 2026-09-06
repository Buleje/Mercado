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

import { useMemo, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, ChevronRight, FileText, Info, Plus, Ruler } from "@buleje/design-system/icons";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { ETIQUETA_DIMENSION, type DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import {
  claveMarca, claveOverrideLinea, juzgarRendimiento,
  esAserradaDirecta, gruposAdmitidos,
  type AsignacionGrupo, type BloqueDistribuido, type BloqueRolliza, type DiaDistribuido, type EspecieDistribucion, type FaltanteGrupo,
} from "@/lib/forestal/cubicacion-reparto";
import { fmtM3, fmtPct, fmtPiezas, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { colorDeBloque } from "./reparto-colores";
import { TipoBadge } from "./tipo-badge";
import type { TipoComercial } from "@/lib/forestal/cubicacion-tipo";

/**
 * Diez litros. Debajo de eso, «capacidad libre» es el redondeo del reparto —
 * que asigna piezas ENTERAS y por eso casi nunca cierra al milímetro cúbico—,
 * no madera esperando. Sale de cómo se mide en el aserradero (con cinta), no
 * del epsilon del float: con 0.001 la pantalla mostraba «libre 0.007» en
 * bloques que estaban perfectos, y siete avisos falsos enseñan a ignorar la
 * lista entera.
 */
const TOL_M3_VISTA = 0.01;

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
  indiceBloque,
}: {
  e: EspecieDistribucion;
  dim: DimensionResumen;
  conCosto: boolean;
  /**
   * `id de bloque → posición en la lista maestra`, para pintar cada tarjeta
   * del mismo color que su fila en la tabla de arriba. Sin esto habría que
   * numerar por especie y dos filas distintas compartirían color.
   */
  indiceBloque?: Map<string, number>;
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
  /**
   * TODOS los grupos con volumen REAL en algún lado de esta especie — ya
   * asignados a otro bloque, o todavía en «Falta por distribuir» (Brandon,
   * 2026-09-01: "poder presionar un + ... el tipo, el volumen, piezas").
   * El "+" de cada bloque sólo puede ofrecer ESTOS: `onEditarLinea` toma de
   * lo que YA existe (`pendientes`, sourced en `PiezaCubicada[]` reales) —
   * nunca puede inventar un tipo que nadie aserró, así que ni la lista lo
   * ofrece. Si el tipo que hace falta agregar no está acá, no existe todavía
   * en la cubicación: hay que cargarlo primero (Cubicador → "Comercial
   * mínimo" o cualquier medida real), no forzarlo desde este bloque.
   */
  const clavesConocidas = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const b of e.bloques) for (const g of b.asignado) mapa.set(g.clave, g.label);
    for (const f of e.faltante) mapa.set(f.clave, f.label);
    return [...mapa.entries()].map(([clave, label]) => ({ clave, label }));
  }, [e]);
  /**
   * Rótulo de cada clave de grupo, para mostrar «Comercial» donde el filtro
   * guardó `comercial`. Sale de lo que la especie ya trae repartido o
   * pendiente — las dos listas juntas cubren todo lo que se pudo elegir.
   */
  const rotuloDeGrupo = useMemo(() => {
    const m = new Map<string, string>();
    for (const bl of e.bloques) for (const g of bl.asignado) m.set(g.clave, g.label);
    for (const f of e.faltante) m.set(f.clave, f.label);
    return m;
  }, [e]);

  return (
    <div className="mb-3 overflow-hidden rounded-xl border border-[var(--rule-base)]">
      {/*
        Cabecera de especie. Antes era un renglón corrido —«20.000 m³ rolliza +
        1.500 ya aserrados · ampara 12.500 → usa 2.674 de 2.674 m³ · 13.4 %
        bajo para aserrío»— donde el número que importa (lo AMPARADO de
        verdad) estaba enterrado en el medio, entre dos capacidades teóricas.
        Ahora se ve primero lo real y la aritmética vive detrás del ⓘ.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-3 py-2.5">
        <span className="flex items-center gap-2 font-display text-lg text-[var(--text-primary)]">
          {e.especie}
          <AdminTooltip
            className="max-w-[300px] text-sm font-normal leading-relaxed"
            content={
              <>
                Entró <b>{fmtM3(e.rollizaM3)} m³</b> de rolliza
                {e.aserradaDirectaM3 > 0 && <> y <b>{fmtM3(e.aserradaDirectaM3)} m³</b> de madera ya aserrada (no se suman: troza y tabla no se miden igual)</>}.
                Con eso, los bloques podrían amparar hasta <b>{fmtM3(e.capacidadM3)} m³</b>, y el reparto les
                asignó <b>{fmtM3(e.amparadaM3)} m³</b> de los <b>{fmtM3(e.aserradaM3)} m³</b> que hay cubicados de esta especie.
                Rendimiento real: <b>{e.rendimientoPct == null ? "—" : `${fmtPct(e.rendimientoPct)} %`}</b> — {j.label}.
              </>
            }
          >
            <button type="button" aria-label={`Cómo se calculó ${e.especie}`} className="shrink-0 rounded-full text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)] print:hidden">
              <Info className="h-4 w-4" aria-hidden />
            </button>
          </AdminTooltip>
        </span>
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono tabular-nums">
          <span className="flex items-baseline gap-1 text-lg font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]" title="Lo que el reparto asignó de verdad a los bloques de esta especie">
            {fmtM3(e.amparadaM3)}<span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">m³ amparados</span>
          </span>
          <span className="flex items-baseline gap-1 text-lg font-extrabold text-[var(--text-primary)]" title="Las piezas realmente asignadas — las que salen en el Anexo 04">
            {fmtPiezas(e.bloques.reduce((a, bl) => a + bl.asignado.reduce((x, g) => x + g.piezas, 0), 0))}
            <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">pzas</span>
          </span>
          <b className={`text-sm ${TONO[j.tono]}`} title={`Rendimiento real — ${j.label}`}>
            {e.rendimientoPct == null ? "—" : `${fmtPct(e.rendimientoPct)} %`}
          </b>
        </span>
      </div>

      {/* Dos o más permisos de la misma especie NUNCA quedan combinados sin
          que se note (Brandon, 2026-09-01): el llenado sigue siendo un solo
          pool por especie —la aserrada no dice de qué permiso salió cada
          tabla—, pero acá se ve, permiso por permiso, cuánto ampara CADA
          UNO, para no declarar en el Anexo 04 una madera mezclando títulos
          habilitantes por error. */}
      {e.porPermiso.length > 1 && (
        <div className="border-b border-[var(--rule-soft)] bg-[var(--data-warning-500)]/8 px-3 py-2">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {e.especie} combina bloques de {e.porPermiso.length} permisos — elegí los de UN permiso a la vez para el Anexo 04.
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
            {e.porPermiso.map((p) => (
              <li key={p.permiso ?? "—"}>
                <b className="text-[var(--text-primary)]">{p.permiso ?? "Sin permiso"}</b>: {fmtM3(p.rollizaM3)} m³ rolliza ·
                ampara {fmtM3(p.amparadaM3)} m³ ({fmtPt(p.amparadaPt)} PT)
              </li>
            ))}
          </ul>
        </div>
      )}

      {/*
        Separación REAL entre bloques (Brandon, 2026-09-02): un borde gris
        sobre blanco no alcanzaba —en LIGHT es gris clarísimo sobre blanco,
        casi invisible—. La señal es una franja de COLOR sólido a la izquierda
        (uno distinto por bloque, el mismo que lleva su fila en la tabla de
        arriba) más el número «Bloque N de M».

        DOS POR FILA de `xl` para arriba (Brandon, tercera vuelta: «en los
        bloques distribuidos quiero que sea en una fila dos bloques bien
        hechas y separadas»). Sólo desde 1280 px: cada tarjeta lleva adentro
        una tabla de cinco columnas con números, y a la mitad del ancho en un
        portátil chico quedaría con scroll horizontal propio — que es peor que
        apilarlas. `items-start` para que dos bloques de distinto alto no se
        estiren al del más largo.
      */}
      <div className="grid grid-cols-1 items-start gap-4 bg-[var(--surface-canvas)] p-3 xl:grid-cols-2">
      {e.bloques.map((b, iBloque) => {
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
        /**
         * Los tipos a los que este bloque está limitado, bajo la vista vigente.
         * Se muestran los RÓTULOS que ya se leen en la tabla de abajo, no las
         * claves: el operario eligió «Comercial», no `tipo|comercial`.
         */
        const grupos = gruposAdmitidos(b.bloque, dim);
        const filtroGrupos = grupos && grupos.size > 0
          ? [...grupos].map((k) => rotuloDeGrupo.get(k) ?? k).join(", ")
          : null;
        /* El filtro lo dejó sin nada y encima le sobra capacidad: sin este
           aviso, el bloque se ve vacío y no hay forma de saber si es porque no
           quedaba pendiente de ese tipo o porque el filtro está mal puesto. */
        const vacioPorFiltro = filtroGrupos != null && b.asignado.length === 0 && b.libreM3 > 0.05;
        /** Las piezas REALES del bloque: las que se imprimen en su Anexo 04. */
        const piezasDelBloque = b.asignado.reduce((a, g) => a + g.piezas, 0);
        /** Su color en la lista maestra — el mismo de su fila en la tabla de arriba. */
        const color = colorDeBloque(indiceBloque?.get(b.bloque.id));
        /** Madera que ya vino aserrada: no hay troza ni % que mostrar. */
        const directa = esAserradaDirecta(b.bloque);
        return (
        /* La franja izquierda queda igual para los dos tipos y el que
           distingue es el rótulo «Ya aserrada». Dos intentos descartados,
           medidos en el navegador, no en el editor: (1) un segundo color de
           token —dentro del panel admin la familia «info» está redefinida al
           MISMO teal del acento, así que el color no distinguía nada; (2)
           `border-l-dashed` —Tailwind no tiene utilidades de ESTILO de borde
           por lado, sólo `border-dashed` para los cuatro, así que la clase no
           existe y la franja seguía sólida—. El rótulo, además, se lee sin
           depender de ver un color. */
        <div
          key={b.bloque.id}
          className="overflow-hidden rounded-xl border-2 border-l-[6px] border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-md"
          style={{ borderLeftColor: color }}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5 border-b-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-3">
            <span className="text-base font-bold text-[var(--text-primary)]">
              {/*
                El color va en un PUNTO, no de fondo del badge. Medido: blanco
                sobre `--bloque-1` en light da 3.93:1 y sobre los tonos claros
                de dark baja de 2:1 — texto ilegible en los dos modos. Con el
                punto, el color sólo tiene que cumplir el 3:1 de elemento no
                textual (todos pasan) y el rótulo se lee siempre.

                Y el rótulo se queda: el color solo no alcanza para distinguir
                de dónde salió el volumen, y con daltonismo no alcanza nada.
              */}
              <span className="mr-2 inline-flex items-center gap-1.5 rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 py-0.5 align-middle text-xs font-bold text-[var(--text-secondary)]">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
                Bloque {iBloque + 1} de {e.bloques.length}
              </span>
              {directa && (
                <span
                  title="Madera que ya vino aserrada: no hubo troza que convertir, su m³ (A) es el que ampara"
                  className="mr-2 inline-flex items-center gap-1 rounded-full border-2 border-dashed border-[var(--accent)] bg-primary/10 px-2 py-0.5 align-middle text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                >
                  <Ruler className="h-3 w-3" aria-hidden /> Ya aserrada
                </span>
              )}
              {b.bloque.etiqueta || "Bloque sin etiqueta"}{" "}
              {filtroGrupos && (
                <span
                  title="Este bloque lleva SÓLO esto: lo demás no entra ni aunque le sobre capacidad (a diferencia del filtro de largo, que es una prioridad)"
                  className="inline-flex items-center rounded-full border-2 border-[var(--accent)] bg-primary/10 px-2 py-0.5 align-middle text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                >
                  Lleva sólo {filtroGrupos}
                </span>
              )}{" "}
              {filtroLargo && (
                <span
                  title="Prioridad para este largo — si sobra capacidad, se completa con otros largos y tipos"
                  className="inline-flex items-center rounded-full border border-[var(--accent)] bg-primary/10 px-2 py-0.5 align-middle text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
                >
                  Sólo {filtroLargo}
                </span>
              )}{" "}
              {/* La aritmética del bloque (m³ × % → capacidad) ya no compite
                  con el resultado: vive detrás del ⓘ. Lo que se ve es lo
                  amparado de verdad, abajo. */}
              <AdminTooltip
                className="max-w-[300px] text-sm font-normal leading-relaxed"
                content={directa
                  ? <>Madera que ya vino aserrada: no hubo troza que convertir, así que sus <b>{fmtM3(b.bloque.m3)} m³ (A)</b> son el techo de lo que puede amparar. El reparto le asignó <b>{fmtM3(b.usadoM3)} m³</b>.</>
                  : <>Entraron <b>{fmtM3(b.bloque.m3)} m³</b> de troza; al <b>{fmtPct(b.aprovechablePct)} %</b> aprovechable, este bloque puede amparar hasta <b>{fmtM3(b.capacidadM3)} m³</b>. El reparto le asignó <b>{fmtM3(b.usadoM3)} m³</b> — lo que va a imprimirse en su Anexo 04.</>}
              >
                <button type="button" aria-label="Cómo se calculó este bloque" className="ml-1 shrink-0 rounded-full align-middle text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)] print:hidden">
                  <Info className="h-4 w-4" aria-hidden />
                </button>
              </AdminTooltip>
              {vacioPorFiltro && (
                <span
                  title="Cambiá el filtro en la columna «Lleva sólo» de la tabla de arriba, o sacalo para que el bloque tome de todo"
                  className="ml-2 inline-flex items-center gap-1 rounded-full border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-2 py-0.5 align-middle text-xs font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                >
                  <AlertTriangle className="h-3 w-3" aria-hidden /> el filtro lo dejó sin nada
                </span>
              )}
            </span>
            {/*
              Lo REAL primero y grande (Brandon, 2026-09-02: «nada de
              aproximado de ampara, sino lo real … porque saldrá en el Anexo»).
              Los topes editables quedan abajo, en gris y en chico: son la
              perilla, no el resultado.
            */}
            <span className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 font-mono tabular-nums">
                <span className="flex items-baseline gap-1 text-lg font-extrabold text-[var(--accent-ink)] dark:text-[var(--accent)]" title="Los m³ que el reparto asignó de verdad a este bloque">
                  {fmtM3(b.usadoM3)}<span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">m³</span>
                </span>
                <span className="flex items-baseline gap-1 text-lg font-extrabold text-[var(--text-primary)]" title="Las piezas realmente asignadas — las que salen en el Anexo 04 de este bloque">
                  {fmtPiezas(piezasDelBloque)}<span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">pzas</span>
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
                {editable && !directa ? (
                  <label className="inline-flex items-center gap-1">
                    {/* «máx.» y no «tope»: el mismo rótulo que la tabla de
                        arriba. Ver la nota en `TopeDeBloque`. */}
                    <span className="font-sans font-bold uppercase tracking-wide">máx.</span>
                    <input
                      value={valorTexto(b.bloque.id, "amparaManualM3", b.bloque.amparaManualM3, true)}
                      onChange={onCambioDecimal(b.bloque.id, "amparaManualM3")}
                      onBlur={onBlurDecimal(b.bloque.id, "amparaManualM3")}
                      inputMode="decimal"
                      placeholder={fmtM3(b.bloque.m3 * (b.aprovechablePct / 100))}
                      aria-label={`Tope de m³ que ampara el bloque ${b.bloque.etiqueta || "sin etiqueta"}`}
                      title={b.bloque.amparaManualM3 == null
                        ? "Techo del bloque. Se calcula como m³ × % aprovechable; escribí el tuyo para decirlo a mano — el bloque se reparte de nuevo dentro de esa capacidad."
                        : "Dicho a mano: manda sobre el % aprovechable."}
                      className={`h-7 w-20 rounded-md border bg-[var(--surface-raised)] px-1.5 text-right font-mono text-xs font-bold tabular-nums outline-none focus:border-[var(--accent)] ${b.bloque.amparaManualM3 == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]"}`}
                    />
                    m³
                  </label>
                ) : (
                  <span title={directa ? "Su m³ (A) es el techo: la madera ya vino aserrada" : undefined}>máx. {fmtM3(b.capacidadM3)} m³</span>
                )}
                {editarBloque && (
                  <label className="inline-flex items-center gap-1">
                    <input
                      value={b.bloque.piezasManual ?? ""}
                      onChange={(ev) => editarBloque(b.bloque.id, "piezasManual", ev.target.value)}
                      inputMode="numeric"
                      placeholder="todas"
                      aria-label={`Tope de piezas del bloque ${b.bloque.etiqueta || "sin etiqueta"}`}
                      title="Hasta cuántas piezas se lleva este bloque. Vacío = las que entren por volumen."
                      className={`h-7 w-16 rounded-md border bg-[var(--surface-raised)] px-1.5 text-right font-mono text-xs font-bold tabular-nums outline-none focus:border-[var(--accent)] ${b.bloque.piezasManual == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]"}`}
                    />
                    pzas
                  </label>
                )}
                {b.libreM3 > TOL_M3_VISTA && (
                  <span className="text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" title="Capacidad de este bloque que quedó sin usar">
                    libre {fmtM3(b.libreM3)}
                  </span>
                )}
                {b.costoPorM3Aserrada != null && <span>S/ {fmtSoles(b.costoPorM3Aserrada)}/m³</span>}
              </span>
              <span className="flex flex-wrap items-center gap-2 print:hidden">
                {clavesBloque.length > 0 && (
                  <label className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2 py-1 font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
                    <input
                      type="checkbox"
                      checked={todoElBloque}
                      ref={(el) => { if (el) el.indeterminate = listasBloque > 0 && !todoElBloque; }}
                      onChange={() => marcar(clavesBloque, !todoElBloque)}
                      aria-label={`Marcar todo el bloque ${b.bloque.etiqueta || "sin etiqueta"} como registrado en el Libro`}
                      className="h-4 w-4 accent-[var(--data-success-600)]"
                    />
                    {listasBloque}/{clavesBloque.length}
                  </label>
                )}
                {onAnexo && b.asignado.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onAnexo(b)}
                    title="Imprimir el Anexo 04 con las piezas de este bloque"
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--rule-base)] px-2 py-1 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
                  >
                    <FileText className="h-4 w-4" aria-hidden /> Anexo 04
                  </button>
                )}
              </span>
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
          {/* "+" agregar un tipo que este bloque todavía no muestra (Brandon,
              2026-09-01) — sólo con un día: con más de uno, a qué jornada le
              tocaría la línea nueva es ambiguo, mismo límite que editar una
              línea existente. */}
          {editableLinea && b.dias === 1 && (
            <AgregarLineaBloque
              bloqueId={b.bloque.id}
              opciones={clavesConocidas.filter((o) => !b.asignado.some((g) => g.clave === o.clave))}
              overridesLinea={b.bloque.overridesLinea}
              dim={dim}
              onEditarLinea={onEditarLinea!}
              valorTextoLinea={valorTextoLinea!}
              onCambioDecimalLinea={onCambioDecimalLinea!}
              onBlurDecimalLinea={onBlurDecimalLinea!}
            />
          )}
        </div>
        );
      })}
      </div>

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
            {/* Mismo `table-fixed` + ancho fijo por columna que la tabla de
                arriba: la de Cedro y la de Bolaina son DOS `<table>`
                distintas — sin ancho fijo, sus columnas no calzan una
                debajo de la otra al bajar la pantalla. */}
            <DataTable aria-label={`Faltante por distribuir de ${e.especie}`} className="w-full min-w-[640px] table-fixed text-base">
              <thead>
                <tr className="border-b-2 border-[var(--data-warning-500)]/40 text-left text-xs font-bold uppercase tracking-wide text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  <th scope="col" className="px-3 py-3">{etiquetaCol}</th>
                  <th scope="col" className="w-28 px-3 py-3 text-right">Piezas</th>
                  <th scope="col" className="w-32 px-3 py-3 text-right">Pie tablar</th>
                  <th scope="col" className="w-36 px-3 py-3 text-right">Sin amparar (m³)</th>
                  <th scope="col" className="w-36 px-3 py-3 text-right">Rolliza que pide</th>
                </tr>
              </thead>
              <tbody>
                {e.faltante.map((f) => <FilaFaltanteConMedidas key={f.clave} f={f} dim={dim} />)}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/15 text-base font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
                  <th scope="row" className="px-3 py-3 text-left">Total sin distribuir</th>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{fmtPiezas(e.faltante.reduce((a, f) => a + f.piezas, 0))}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{fmtPt(e.faltante.reduce((a, f) => a + f.pieTablar, 0))}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{fmtM3(e.faltanteM3)}</td>
                  <td className="px-3 py-3 text-right font-mono tabular-nums">{fmtM3(e.rollizaFaltanteM3)}</td>
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
          {/*
            `table-fixed` + un ancho fijo por columna (Brandon, 2026-09-01:
            "que las columnas estén mejor alineados"): cada bloque dibuja SU
            PROPIA tabla (`DataTable` envuelve en su propio `<table>`), así
            que sin ancho fijo el navegador calcula cada una según SU
            contenido — la de «Lote 13-2026» y la de «019-...0011» terminaban
            con columnas de ancho distinto y los números no formaban una
            columna recta al bajar la pantalla. Con el mismo ancho en las
            tres tablas de esta sección (acá y en `BloqueEspecie` más abajo),
            las cifras SIEMPRE caen una debajo de la otra.
          */}
          <DataTable className="w-full min-w-[620px] table-fixed text-base">
            <thead>
              <tr className="text-left text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                <th scope="col" className="w-24 px-3 py-3" title="Tildá la línea cuando ya la distribuiste y la pasaste al Libro de Operaciones">Distribuido</th>
                <th scope="col" className="px-3 py-3">{etiquetaCol}</th>
                <th scope="col" className="w-28 px-3 py-3 text-right">Piezas</th>
                <th scope="col" className="w-32 px-3 py-3 text-right">Pie tablar</th>
                <th scope="col" className="w-32 px-3 py-3 text-right">Ampara (m³)</th>
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
                <td className="px-3 py-3" />
                <th scope="row" className="px-3 py-3 text-left">Total del día {dia.dia}</th>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{fmtPiezas(dia.piezas)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{fmtPt(dia.pieTablar)}</td>
                <td className="px-3 py-3 text-right font-mono tabular-nums">{fmtM3(dia.m3)}</td>
              </tr>
            </tfoot>
          </DataTable>
        </div>
      )}
    </div>
  );
}

/**
 * El "+" de un bloque (Brandon, 2026-09-01: "poder presionar un + y se
 * habilita una fila donde pondré el tipo, el volumen, piezas... en cualquier
 * bloque sea la 1, 2, 3, etc"): SIEMPRE aparece, en cualquier bloque, para
 * agregar una línea de un tipo/grupo que ese bloque todavía no muestra.
 *
 * `opciones` sólo trae tipos con volumen REAL en algún lado de la especie —ya
 * asignado a otro bloque, o esperando en «Falta por distribuir»— así que esto
 * nunca puede declarar un tipo que nadie aserró: reusa el MISMO
 * `onEditarLinea` que edita una línea ya puesta, sólo que empieza sin fila.
 * Si el tipo elegido no tiene nada real pendiente, el override queda en 0 —
 * no fabrica volumen, sólo redistribuye lo que ya existe.
 *
 * ⛔ NO deja superar la capacidad del bloque (Brandon, 2026-09-01, pedido
 * explícitamente rechazado: "que eso afecte... aprovechable real, puede
 * rebasar lo aprovechable estándar"). `onEditarLinea` corre por el MISMO
 * `llenarBloque` que topea todo lo demás — el mismo blindaje que ya existe
 * en `capacidadDe()` desde una auditoría real (2026-08-17: "un bloque de
 * 10 m³ podía amparar 50 m³ tipeando cualquier número... en el papel que se
 * le muestra al fiscalizador"). Declarar más aserrada de la que la troza
 * pudo dar físicamente es exactamente el hueco que esa auditoría cerró.
 */
function AgregarLineaBloque({
  bloqueId, opciones, overridesLinea, dim,
  onEditarLinea, valorTextoLinea, onCambioDecimalLinea, onBlurDecimalLinea,
}: {
  bloqueId: string;
  opciones: { clave: string; label: string }[];
  overridesLinea: BloqueRolliza["overridesLinea"];
  dim: DimensionResumen;
  onEditarLinea: (bloqueId: string, claveGrupo: string, campo: "piezas" | "m3", valor: string) => void;
  valorTextoLinea: (bloqueId: string, claveGrupo: string, actual: number | null | undefined) => string;
  onCambioDecimalLinea: (bloqueId: string, claveGrupo: string) => (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBlurDecimalLinea: (bloqueId: string, claveGrupo: string) => () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [clave, setClave] = useState("");

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="m-2 inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--rule-base)] px-2.5 py-1.5 text-sm font-bold text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)] print:hidden"
      >
        <Plus className="h-4 w-4" aria-hidden /> Agregar tipo a este bloque
      </button>
    );
  }

  // Se abre igual, siempre (Brandon, 2026-09-01: "en cualquier bloque sea la
  // 1, 2, 3, etc"), pero honesto: sin nada real sin asignar todavía de esta
  // especie, no hay de dónde elegir — decirlo es mejor que un picker vacío
  // que no explica por qué no tiene opciones.
  if (opciones.length === 0) {
    return (
      <div className="m-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] p-2.5 text-sm text-[var(--text-tertiary)] print:hidden">
        <span>
          Nada de esta especie sin asignar todavía: todo lo que existe ya está en algún bloque o en «Falta por
          distribuir». Un tipo nuevo tiene que aserrarse primero para poder agregarlo acá.
        </span>
        <button type="button" onClick={() => setAbierto(false)} className="shrink-0 font-bold text-[var(--text-secondary)] underline hover:text-[var(--text-primary)]">
          Cerrar
        </button>
      </div>
    );
  }

  const opcionElegida = opciones.find((o) => o.clave === clave);
  const overrideActual = clave ? (overridesLinea?.[claveOverrideLinea(dim, clave)] ?? null) : null;

  return (
    <div className="m-2 flex flex-wrap items-end gap-2 rounded-xl border-2 border-dashed border-[var(--accent)] bg-primary/5 p-2.5 print:hidden">
      <label className="text-sm">
        <span className="mb-0.5 block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Tipo</span>
        <select
          value={clave}
          onChange={(ev) => setClave(ev.target.value)}
          aria-label="Tipo a agregar a este bloque"
          className="h-9 rounded-md border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        >
          <option value="">Elegir…</option>
          {opciones.map((o) => <option key={o.clave} value={o.clave}>{o.label}</option>)}
        </select>
      </label>
      {clave && (
        <>
          <label className="text-sm">
            <span className="mb-0.5 block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Piezas</span>
            <input
              value={overrideActual?.piezas ?? ""}
              onChange={(ev) => onEditarLinea(bloqueId, clave, "piezas", ev.target.value)}
              inputMode="numeric"
              placeholder="0"
              aria-label={`Piezas de ${opcionElegida?.label ?? "el tipo elegido"} a agregar`}
              className="h-9 w-20 rounded-md border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
          <label className="text-sm">
            <span className="mb-0.5 block text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]">m³</span>
            <input
              value={valorTextoLinea(bloqueId, clave, overrideActual?.m3)}
              onChange={onCambioDecimalLinea(bloqueId, clave)}
              onBlur={onBlurDecimalLinea(bloqueId, clave)}
              inputMode="decimal"
              placeholder="0"
              aria-label={`Metros cúbicos de ${opcionElegida?.label ?? "el tipo elegido"} a agregar`}
              className="h-9 w-24 rounded-md border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
          </label>
        </>
      )}
      <button
        type="button"
        onClick={() => { setAbierto(false); setClave(""); }}
        className="h-9 rounded-md border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
      >
        Listo
      </button>
      <p className="w-full text-xs text-[var(--text-tertiary)]">
        Sólo toma de lo que ya existe —asignado a otro bloque o en «Falta por distribuir»— de esta especie. Si ese tipo no
        tiene volumen real en ningún lado todavía, queda en 0.
      </p>
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
        <td className="px-3 py-3">
          {/* El checkbox es el control de verdad (teclado, lectores); el click en
              la fila es el atajo para el operario con guantes. */}
          <input
            type="checkbox"
            checked={marcada}
            onChange={onMarcar}
            onClick={(ev) => ev.stopPropagation()}
            aria-label={`Marcar ${a.label} como distribuido`}
            className="h-5 w-5 accent-[var(--data-success-600)]"
          />
        </td>
        <td className="px-3 py-3">
          <span className="inline-flex items-center gap-1.5">
            {hayDetalle && (
              <button
                type="button"
                onClick={(ev) => { ev.stopPropagation(); setAbierto((v) => !v); }}
                aria-expanded={abierto}
                aria-label={`${abierto ? "Ocultar" : "Ver"} las medidas de ${a.label}`}
                title={`${a.medidas.length} ${a.medidas.length === 1 ? "medida" : "medidas"}`}
                className="shrink-0 text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]"
              >
                <ChevronRight className={`h-4 w-4 transition-transform ${abierto ? "rotate-90" : ""}`} aria-hidden />
              </button>
            )}
            {dim === "tipo" ? <TipoBadge tipo={a.label as TipoComercial} /> : <span className="font-bold text-[var(--text-primary)]">{a.label}</span>}
            {hayDetalle && (
              <span className="text-xs text-[var(--text-tertiary)]">
                {a.medidas.length} {a.medidas.length === 1 ? "medida" : "medidas"}
              </span>
            )}
            {a.m3Declarado && (
              <span
                title="m³ declarado a mano — no es la suma de las medidas reales de esta línea. Puede amparar más de lo que estas piezas dieron físicamente: verificar antes de declarar ante SERFOR."
                className="inline-flex items-center gap-1 rounded-full border border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              >
                <AlertTriangle className="h-3 w-3" aria-hidden /> Declarado
              </span>
            )}
          </span>
        </td>
        <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">
          {editable ? (
            <input
              value={overrideActual?.piezas ?? ""}
              onChange={(ev) => onEditarLinea!(bloqueId, a.clave, "piezas", ev.target.value)}
              onClick={(ev) => ev.stopPropagation()}
              inputMode="numeric"
              placeholder={fmtPiezas(a.piezas)}
              aria-label={`Piezas de ${a.label}, editable`}
              title="Piezas declaradas a mano para ESTA línea. Vacío = lo que reparte el cálculo — el resto del bloque se reparte de nuevo con lo que sobre."
              className={`h-8 w-20 rounded-md border-2 bg-[var(--surface-raised)] px-1.5 text-right font-mono text-sm tabular-nums outline-none focus:border-[var(--accent)] ${overrideActual?.piezas == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`}
            />
          ) : fmtPiezas(a.piezas)}
        </td>
        <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtPt(a.pieTablar)}</td>
        <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
          {editable ? (
            <input
              /*
               * Con override puesto, al perder foco muestra `a.m3` (lo REAL
               * que lograron las piezas que entraron), no el número tipeado
               * (Brandon, 2026-09-02: la fila decía "7.197" pero el Total
               * del día daba 5.377 — el m³ de una pieza es un HECHO físico
               * de sus medidas, no una cuota libre como piezas; el override
               * manda como TOPE de cuánto entra, pero mostrar el tope en vez
               * del logro real es declarar un número que ninguna troza dio).
               * Sin override, sigue en blanco (placeholder) como siempre —
               * si no, cada fila mostraría un valor "puesto" que nadie tipeó.
               * Mientras se tipea, el buffer de `valorTextoLinea` manda.
               */
              value={valorTextoLinea!(bloqueId, a.clave, overrideActual?.m3 != null ? a.m3 : null)}
              onChange={onCambioDecimalLinea!(bloqueId, a.clave)}
              onBlur={onBlurDecimalLinea!(bloqueId, a.clave)}
              onClick={(ev) => ev.stopPropagation()}
              inputMode="decimal"
              placeholder={fmtM3(a.m3)}
              aria-label={`Ampara m³ de ${a.label}, editable`}
              title="Tope de m³ dicho a mano para ESTA línea — el número que queda es el real que lograron las piezas que entraron, nunca más del tope. Vacío = lo reparte el cálculo."
              className={`h-8 w-24 rounded-md border-2 bg-[var(--surface-raised)] px-1.5 text-right font-mono text-sm font-bold tabular-nums outline-none focus:border-[var(--accent)] ${overrideActual?.m3 == null ? "border-dashed border-[var(--rule-base)] text-[var(--accent)]" : "border-[var(--accent)] text-[var(--accent)]"}`}
            />
          ) : fmtM3(a.m3)}
        </td>
      </tr>
      {abierto &&
        a.medidas.map((m) => (
          <tr key={m.clave} className="border-l-2 border-[var(--accent)]/30 bg-[var(--surface-sunken)]">
            <td />
            <td className="py-2 pl-9 pr-3 font-mono text-sm text-[var(--text-secondary)]">{m.medida}</td>
            <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)]">{fmtPiezas(m.piezas)}</td>
            <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)]">{fmtPt(m.pieTablar)}</td>
            <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)]">{fmtM3(m.m3)}</td>
          </tr>
        ))}
    </>
  );
}

/**
 * Una fila de "Falta por distribuir", con sus medidas a un click (Brandon,
 * 2026-09-02: "¿lo que falta distribuir tiene ya las medidas agregadas?").
 *
 * La respuesta era sí a medias: el motor (`distribuirPorCapacidad`) YA arma
 * `FaltanteGrupo.medidas` —el mismo `AsignacionMedida[]` que usa la tabla de
 * arriba—, sólo que esta tabla lo tiraba sin dibujarlo. Mismo patrón que
 * `FilaConMedidas`: el chevron pliega/despliega, sin volver a calcular nada.
 *
 * La columna "Rolliza que pide" de cada medida sale de partir
 * `rollizaNecesariaM3` en la MISMA proporción que usa el grupo entero
 * (`rollizaNecesariaM3 = m³ / % aprovechable`, un solo % para todo el
 * grupo) — no es una aproximación: es la misma fórmula aplicada a la
 * porción de esa medida.
 */
function FilaFaltanteConMedidas({ f, dim }: { f: FaltanteGrupo; dim: DimensionResumen }) {
  const [abierto, setAbierto] = useState(false);
  const hayDetalle = f.medidas.length > 0;
  const razonRolliza = f.m3 > 1e-6 ? f.rollizaNecesariaM3 / f.m3 : 0;
  return (
    <>
      <tr className="border-t border-[var(--rule-soft)] transition-colors hover:bg-primary/5">
        <td className="px-3 py-3">
          <span className="inline-flex items-center gap-1.5">
            {hayDetalle && (
              <button
                type="button"
                onClick={() => setAbierto((v) => !v)}
                aria-expanded={abierto}
                aria-label={`${abierto ? "Ocultar" : "Ver"} las medidas de ${f.label}`}
                title={`${f.medidas.length} ${f.medidas.length === 1 ? "medida" : "medidas"}`}
                className="shrink-0 text-[var(--data-warning-700)] transition-colors hover:text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)]"
              >
                <ChevronRight className={`h-4 w-4 transition-transform ${abierto ? "rotate-90" : ""}`} aria-hidden />
              </button>
            )}
            {dim === "tipo" ? <TipoBadge tipo={f.label as TipoComercial} /> : <span className="font-bold text-[var(--text-primary)]">{f.label}</span>}
            {hayDetalle && (
              <span className="text-xs text-[var(--text-tertiary)]">
                {f.medidas.length} {f.medidas.length === 1 ? "medida" : "medidas"}
              </span>
            )}
          </span>
        </td>
        <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtPiezas(f.piezas)}</td>
        <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtPt(f.pieTablar)}</td>
        <td className="px-3 py-3 text-right font-mono font-bold tabular-nums text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">{fmtM3(f.m3)}</td>
        <td className="px-3 py-3 text-right font-mono tabular-nums text-[var(--text-secondary)]">{fmtM3(f.rollizaNecesariaM3)}</td>
      </tr>
      {abierto &&
        f.medidas.map((m) => (
          <tr key={m.clave} className="border-l-2 border-[var(--data-warning-500)]/40 bg-[var(--surface-sunken)]">
            <td className="py-2 pl-9 pr-3 font-mono text-sm text-[var(--text-secondary)]">{m.medida}</td>
            <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)]">{fmtPiezas(m.piezas)}</td>
            <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)]">{fmtPt(m.pieTablar)}</td>
            <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)]">{fmtM3(m.m3)}</td>
            <td className="px-3 py-2 text-right font-mono text-sm tabular-nums text-[var(--text-tertiary)]">{fmtM3(m.m3 * razonRolliza)}</td>
          </tr>
        ))}
    </>
  );
}
