"use client";

/**
 * ResumenReparto — qué parte de lo aserrado ampara cada bloque de rolliza.
 *
 * Cada bloque tiene una CAPACIDAD (`m³ × % aprovechable`) y ampara hasta ahí, ni
 * un metro más. La aserrada se va asignando bloque por bloque en el orden
 * cargado; lo que no entra pasa al siguiente, y lo que no entra en ninguno cae
 * en la tabla de **faltante por distribuir** — la madera que espera la próxima
 * troza.
 *
 * No es un prorrateo, y la diferencia importa: el respaldo de volumen es lo que
 * se declara, y declarar de más es el hueco por donde se blanquea madera.
 *
 * La cuenta vive en `lib/forestal/cubicacion-reparto.ts` (pura, 33 tests); acá
 * está el editor de bloques y el dibujo.
 */

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { Trash2, Download, Share2, AlertTriangle, Info, Layers, ArrowDown, FileText, FileSpreadsheet, Scale, HelpCircle, ShieldCheck, SlidersHorizontal, Combine, X, Boxes, Save, FolderOpen, Check, Loader2, Ruler, TreePine } from "@buleje/design-system/icons";
import { AdminTooltip } from "@/components/admin/shared/AdminTooltip";
import { ModuleActionMenu, type ModuleActionItem } from "@/components/admin/shared/ModuleActionMenu";
import { csrfHeaders } from "@/lib/csrf-client";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";
import {
  agruparPor, DIMENSIONES_RESUMEN, ETIQUETA_DIMENSION, type DimensionResumen, type PrecioPt,
} from "@/lib/forestal/cubicacion-resumen";
import {
  APROVECHABLE_DEFAULT, aprovechableDe, bloquesDesdeTrozas, claveOverrideLinea, distribucionACsv,
  distribuirPorCapacidad, esAserradaDirecta, juzgarRendimiento,
  type BloqueDistribuido, type BloqueRolliza, type FiltroLargo,
} from "@/lib/forestal/cubicacion-reparto";
import type { ProcedenciaBloques } from "@/lib/forestal/anexo04-validacion";
import { exportarDistribucionExcel, exportarDistribucionPDF, filtrarPorEspecies, type FirmaResponsable } from "@/lib/forestal/distribucion-export";
import { hoyISO, nombreSugeridoDistribucion, type DistribucionRegistro } from "@/lib/forestal/distribucion-registro";
// Pie tablar entero y m³ con 3 decimales: la misma regla que el resto de Resúmenes.
import { fmtM3, fmtPct, fmtPiezas, fmtPt, fmtSoles } from "@/lib/forestal/cubicacion-formato";
import { ESPECIES_MADERA, toFeet, unificarPorMedida } from "@/lib/forestal/cubicacion";
import { margenLote, volumenLibre, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { useLotesAserrio } from "./hooks/use-lotes-aserrio";
import { KpiResumen, SeccionResumen } from "./resumen-tabla";
import { BloqueEspecie } from "./reparto-vistas";
import { DiferenciaDistribucion } from "./reparto-diferencia";
import { AlertaDescuadre, OpcionesExportacion } from "./reparto-opciones";
import { diagnosticarReparto } from "@/lib/forestal/cubicacion-reparto-diagnostico";
import { FiltroLargoCelda } from "./reparto-filtro-largo";
import { FiltroGruposCelda } from "./reparto-filtro-grupos";
import { contarRevision, revisarDistribucion, type HallazgoRevision } from "@/lib/forestal/reparto-revision";
import { ColumnasMenu, useColumnasVisibles } from "./ctp-shared";
import { colorDeBloque, indicesDeBloques } from "./reparto-colores";
import DistribucionesGuardadas from "./DistribucionesGuardadas";
import RepartoPaquetesPicker, { type PaqueteElegible } from "./reparto-paquetes";
import RepartoImportarBloquesModal from "./RepartoImportarBloquesModal";
import type { BloqueImportado } from "@/lib/forestal/reparto-bloques-import";
import Anexo04Modal from "./Anexo04Modal";


/** Mismo botón que la cabecera de Resúmenes: un solo alto para toda la pestaña. */
const BTN = "inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-40 disabled:hover:border-[var(--rule-base)]";

const TONO = {
  success: "text-[var(--data-success-600)] dark:text-[var(--data-success-500)]",
  warning: "text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]",
  error: "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]",
  neutral: "text-[var(--text-tertiary)]",
} as const;

/**
 * Encabezado de columna con ícono de ayuda: el `title` nativo del navegador
 * es invisible hasta que alguien lo descubre por accidente — acá el «?» se ve
 * siempre, y al pasar (o enfocar con teclado) despliega la explicación en el
 * mismo tooltip que ya usa el resto del admin (`AdminTooltip`, Radix).
 */
function ThAyuda({ children, ayuda, alinear = "right" }: { children: ReactNode; ayuda: ReactNode; alinear?: "left" | "right" }) {
  return (
    <th scope="col" className={`group whitespace-nowrap px-3 py-3.5 ${alinear === "right" ? "text-right" : "text-left"}`}>
      <span className={`inline-flex items-center gap-1 whitespace-nowrap ${alinear === "right" ? "flex-row-reverse" : ""}`}>
        {children}
        {/*
          Catorce «?» encendidos a la vez eran catorce puntos de ruido sobre la
          fila que más se mira (Brandon, 2026-09-02: «confunde mucho el diseño,
          quiero algo más claro, minimalista»). El icono sigue estando: aparece
          al pasar por su cabecera o al enfocarlo con teclado, y el `w-4` fijo
          evita que las columnas salten de ancho al aparecer.
        */}
        <AdminTooltip content={ayuda} className="max-w-[260px] font-normal normal-case leading-relaxed tracking-normal">
          <button
            type="button"
            aria-label={`Qué significa ${typeof children === "string" ? children : "esta columna"}`}
            className="w-4 shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 print:hidden"
          >
            <HelpCircle className="h-4 w-4" />
          </button>
        </AdminTooltip>
      </span>
    </th>
  );
}

function tenantSlug(): string {
  try { return localStorage.getItem("active-tenant-slug") ?? "main"; } catch { return "main"; }
}
/** Derivados del lote de aserrada: `…-{slug}-precio`, `-meta`, `-rolliza`. */
const claveLocal = (sufijo: string) => `buleje-cubicacion-${tenantSlug()}${sufijo}`;
/**
 * El lote de TROZAS tiene el slug al final (`buleje-cubicacion-trozas-{slug}`),
 * no el patrón de los derivados. No es un capricho: es otro lote, no un anexo
 * del de aserrada. Leerlo con el orden equivocado dejaba el botón «Traer del
 * cubicador de trozas» muerto en silencio.
 */
const claveTrozas = () => `buleje-cubicacion-trozas-${tenantSlug()}`;

function leerTrozas(): { especie?: string; m3: number }[] {
  try {
    const raw = localStorage.getItem(claveTrozas());
    const v = raw ? JSON.parse(raw) : [];
    return Array.isArray(v) ? (v as { especie?: string; m3: number }[]) : [];
  } catch {
    return [];
  }
}

let contador = 0;
const nuevoId = () => `blq-${Date.now().toString(36)}-${contador++}`;

/**
 * Diez litros. Debajo de esto un desvío de volumen es redondeo, no madera: el
 * reparto asigna piezas ENTERAS, así que un bloque «lleno» casi nunca cierra
 * al milímetro cúbico. La tolerancia sale de cómo se mide en el mundo real —el
 * aserradero mide con cinta—, nunca del epsilon del punto flotante: con 0.001
 * la tabla marcaba «le sobra capacidad» por 7 litros de arrastre, y avisos
 * falsos enseñan a ignorar los verdaderos.
 */
const TOL_M3 = 0.01;

/**
 * Las columnas que se pueden esconder (Brandon, 2026-09-01: «poder una opción
 * para poder ocultar y mostrar columnas»). La **etiqueta** (GTF / lote) y el
 * botón de quitar quedan siempre: son la identidad de la fila, y una tabla sin
 * identidad no se puede leer ni corregir.
 *
 * `ancho` es lo que ocupa cada una con su input (el `w-*` más el `px-3` de los
 * dos lados) y sólo sirve para calcular el `min-width` de la tabla con las
 * columnas VISIBLES: sin eso, esconder media tabla dejaba el mismo scroll
 * horizontal de antes.
 */
const COLUMNAS_REPARTO = [
  { key: "tipo", label: "Cargado como", ancho: 174 },
  { key: "permiso", label: "N° de permiso", ancho: 154 },
  { key: "especie", label: "Especie", ancho: 134 },
  { key: "m3", label: "m³ (R / A)", ancho: 120 },
  { key: "dias", label: "Días", ancho: 88 },
  { key: "fecha", label: "Fecha", ancho: 176 },
  { key: "aprovechable", label: "% aprovechable", ancho: 104 },
  { key: "pctReal", label: "% real", ancho: 96 },
  { key: "ampara", label: "Ampara m³ (A)", ancho: 136 },
  { key: "piezas", label: "Piezas", ancho: 104 },
  { key: "costo", label: "S/ por m³", ancho: 120 },
  { key: "grupos", label: "Lleva sólo", ancho: 180 },
  { key: "largo", label: "Largo (pies)", ancho: 180 },
  { key: "anexo", label: "Anexo 4", ancho: 96 },
] as const;
type ColReparto = (typeof COLUMNAS_REPARTO)[number]["key"];
/** Etiqueta (164) + la columna del tacho (60): las dos que nunca se esconden. */
const ANCHO_FIJO_REPARTO = 224;
/** Las tres que el pie de tabla absorbe dentro del `colSpan` del rótulo «Total». */
const COLS_IDENTIDAD: readonly ColReparto[] = ["tipo", "permiso", "especie"];

/**
 * Lo que el reparto le asignó DE VERDAD a un bloque: el número GRANDE de la
 * celda (Brandon, 2026-09-02: «nada de aproximado de ampara, sino lo real, y
 * que se ponga grande, porque muchas veces se confunde eso y saldrá en el
 * Anexo»).
 *
 * La jerarquía está invertida a propósito respecto de como nació la tabla. Lo
 * que se tipea —el techo del bloque— es una INTENCIÓN: «este bloque puede
 * amparar hasta 11 m³». Lo que sale del reparto es el HECHO: los 2.674 m³ que
 * las piezas cubicadas realmente suman, y que son los que van a imprimirse en
 * el Anexo 04. Con el techo grande y el hecho en chico, se declaraba la
 * intención. Ahora manda el hecho y el techo queda de contexto, abajo.
 */
function RealDeBloque({ valor, unidad, alerta, titulo }: { valor: string; unidad?: string; alerta: boolean; titulo: string }) {
  return (
    <span
      title={titulo}
      className={`flex items-baseline justify-end gap-1 font-mono text-lg font-extrabold leading-none tabular-nums ${alerta
        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : "text-[var(--accent-ink)] dark:text-[var(--accent)]"}`}
    >
      {valor}
      {unidad && <span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">{unidad}</span>}
    </span>
  );
}

/**
 * Una mitad del balance: m³ · PT · piezas, la misma cifra en las tres unidades
 * con las que se declara. Los tres números juntos y no sólo el m³ porque el
 * que va a cubrir el faltante necesita saber CUÁNTAS piezas le faltan, no sólo
 * cuánto volumen.
 */
function CifraBalance({ titulo, ayuda, m3, pt, piezas, tono }: {
  titulo: string;
  ayuda: string;
  m3: number;
  pt: number;
  piezas: number;
  tono: "ok" | "falta";
}) {
  const alerta = tono === "falta";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${alerta
      ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/8"
      : "border-[var(--rule-soft)] bg-[var(--surface-canvas)]"}`}
    >
      <div className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        {titulo}
        <AdminTooltip content={ayuda} className="max-w-[280px] text-sm font-normal normal-case leading-relaxed tracking-normal">
          <button type="button" aria-label={`Qué es «${titulo}»`} className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)] print:hidden">
            <Info className="h-3.5 w-3.5" aria-hidden />
          </button>
        </AdminTooltip>
      </div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 font-mono tabular-nums">
        <span className={`flex items-baseline gap-1 text-xl font-extrabold leading-none ${alerta
          ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          : "text-[var(--accent-ink)] dark:text-[var(--accent)]"}`}
        >
          {fmtM3(m3)}<span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">m³</span>
        </span>
        <span className="flex items-baseline gap-1 text-base font-bold leading-none text-[var(--text-secondary)]">
          {fmtPt(pt)}<span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">PT</span>
        </span>
        <span className="flex items-baseline gap-1 text-base font-bold leading-none text-[var(--text-secondary)]">
          {fmtPiezas(piezas)}<span className="text-[length:var(--ts-2xs)] font-bold text-[var(--text-tertiary)]">pzas</span>
        </span>
      </div>
    </div>
  );
}

/**
 * El repaso antes de registrar: qué renglón no cuadra y qué hacer con él.
 *
 * Cada hallazgo dice DÓNDE, QUÉ pasa y CÓMO se arregla — un aviso que sólo
 * dice «hay un problema» obliga a adivinar, y adivinar sobre un papel que se
 * presenta ante SERFOR es exactamente lo que esta pantalla existe para evitar.
 */
function PanelRevision({ hallazgos, onCerrar }: { hallazgos: HallazgoRevision[]; onCerrar: () => void }) {
  const errores = hallazgos.filter((h) => h.severidad === "error");
  return (
    <div className="mb-4 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3 print:hidden">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          {hallazgos.length === 0
            ? <><ShieldCheck className="h-4 w-4 text-[var(--data-success-600)] dark:text-[var(--data-success-500)]" aria-hidden /> Todo cuadra: no hay nada que corregir antes de registrar.</>
            : <><AlertTriangle className="h-4 w-4 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden /> Repaso antes de registrar</>}
        </span>
        <button type="button" onClick={onCerrar} aria-label="Cerrar el repaso" className="rounded-lg p-1 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]">
          <X className="h-4 w-4" />
        </button>
      </div>
      {hallazgos.length > 0 && (
        <>
          <p className="mb-2 text-sm text-[var(--text-tertiary)]">
            {errores.length > 0
              ? <><b className="text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">{errores.length}</b> no debería declararse así; el resto conviene mirarlo.</>
              : "Nada impide declarar: son cosas para mirar antes de firmar."}
          </p>
          <ul className="space-y-1.5">
            {hallazgos.map((h) => (
              <li
                key={h.id}
                className={`rounded-lg border-l-[3px] bg-[var(--surface-raised)] px-3 py-2 ${h.severidad === "error"
                  ? "border-l-[var(--data-error-500)]"
                  : "border-l-[var(--data-warning-500)]"}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                  <span className={`text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide ${h.severidad === "error"
                    ? "text-[var(--data-error-600)] dark:text-[var(--data-error-500)]"
                    : "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"}`}
                  >
                    {h.severidad === "error" ? "Falta" : "Mirar"}
                  </span>
                  <b className="text-sm text-[var(--text-primary)]">{h.donde}</b>
                  <span className="text-sm text-[var(--text-secondary)]">{h.que}</span>
                </div>
                <p className="mt-0.5 text-sm text-[var(--text-tertiary)]">{h.comoArreglar}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

/**
 * El techo declarado del bloque, debajo del número real: chiquito y en gris,
 * porque es el dato que se ajusta, no el que se lee. `children` es el input
 * (o el valor fijo, en aserrada directa).
 */
function TopeDeBloque({ children, titulo, alerta }: { children: ReactNode; titulo: string; alerta?: boolean }) {
  return (
    <span className="mt-1 flex items-center justify-end gap-1" title={titulo}>
      {/* «máx.» y no «tope» (Brandon, 2026-09-02: «¿qué significa lo que dice
          tope cuando pongo en ampara m³?»): «tope» se leía como si fuera OTRO
          volumen amparado, cuando es sólo el techo —hasta acá puede llegar—.
          El volumen que se declara es el de arriba: la suma de las medidas
          que el reparto le puso al bloque. */}
      <span className={`text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide ${alerta
        ? "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
        : "text-[var(--text-tertiary)]"}`}>
        máx.
      </span>
      {children}
    </span>
  );
}

/**
 * Las piezas de un bloque, en el formato que entiende el Anexo 04.
 *
 * La asignación guarda MEDIDAS con su conteo (12 piezas de 2×8×10); el anexo
 * pide filas de pieza cubicada. Se reconstruyen con sus dimensiones y unidades
 * originales —no se recalcula el volumen— así el papel declara exactamente lo
 * que la pantalla repartió.
 */
function piezasDelBloque(b: BloqueDistribuido, especie: string): PiezaCubicada[] {
  const out: PiezaCubicada[] = [];
  for (const g of b.asignado) {
    for (const m of g.medidas) {
      if (m.piezas <= 0) continue;
      out.push({
        id: `${b.bloque.id}-${g.clave}-${m.clave}`,
        cantidad: m.piezas,
        espesor: m.espesor,
        ancho: m.ancho,
        largo: m.largo,
        uEspesor: m.uEspesor as PiezaCubicada["uEspesor"],
        uAncho: m.uAncho as PiezaCubicada["uAncho"],
        uLargo: m.uLargo as PiezaCubicada["uLargo"],
        especie,
        /* El tipo se conserva: el Anexo 04 abre UN bloque por especie + tipo de
           producto, así que perderlo mezclaría paquetería con comercial. */
        tipo: g.label as PiezaCubicada["tipo"],
        pieTablar: m.pieTablar,
        m3: m.m3,
      });
    }
  }
  return out;
}

/**
 * El N° de permiso de un lote — según el de sus trozas (Brandon, 2026-09-01:
 * "se tiene que rellenar según el número de permiso de las trozas"), no algo
 * que se tipee de nuevo. Si el lote mezcla trozas de MÁS de un permiso, se
 * deja en blanco a propósito: inventar uno solo escondería justo lo que la
 * columna existe para mostrar — que hay más de un título habilitante ahí
 * adentro (mismo espíritu que el aviso «combina bloques de N permisos» de
 * más abajo). Un lote de inventario nunca tuvo trozas reales, así que no
 * tiene de dónde sacar uno — vuelve `null`, no una adivinanza.
 */
function permisoDelLote(lote: LoteAserrio): string | null {
  const permisos = new Set(lote.trozas.map((t) => (t.permiso ?? "").trim()).filter((p) => p !== ""));
  return permisos.size === 1 ? [...permisos][0] : null;
}

export default function ResumenReparto({ rows, precioDe }: { rows: PiezaCubicada[]; precioDe: PrecioPt }) {
  const [bloques, setBloques] = useState<BloqueRolliza[]>([]);
  const [dim, setDim] = useState<DimensionResumen>("tipo");
  const [hayTrozas, setHayTrozas] = useState(0);
  /**
   * Lotes de aserrío con volumen sobrante — de trozas O de inventario
   * (Brandon, 2026-09-01: "aplica tanto a lotes normal como lotes de
   * inventario"). MISMO «Sobra para Producción» que ya muestra `CtpLoteCard`:
   * un lote abierto ofrece su rolliza sin aserrar (`volumenLibre`, m³ crudo);
   * uno ya aserrado (inventario incluido, que nunca tuvo trozas y por eso
   * `volumenLibre` siempre le da 0) ofrece lo que le falta para tocar el
   * tope del 56 % (`margenLote().margenM3`) — pero ESE número ya está en
   * unidades de ASERRADA, no de rolliza cruda: viene de
   * `topeM3 − declaradoM3`, no de un m³ que todavía haya que aserrar. Por
   * eso ese caso se siembra con `aprovechablePct: 100` — aplicarle el 55 %
   * de nuevo lo estaría descontando dos veces, dejando «ampara» en la mitad
   * de lo que el lote realmente puede cubrir. Un lote ya agregado como
   * bloque no se vuelve a ofrecer: declararlo dos veces duplicaría su m³.
   */
  const { lotes: lotesAserrio } = useLotesAserrio();
  const lotesConRolliza = useMemo(() => {
    const yaAgregados = new Set(bloques.filter((b) => b.loteId).map((b) => b.loteId));
    return lotesAserrio
      .map((lote) => {
        const permiso = permisoDelLote(lote);
        const vLibre = volumenLibre(lote);
        if (vLibre > 1e-4) return { lote, m3: vLibre, aprovechablePct: null as number | null, esMargen: false, permiso };
        const margen = margenLote(lote);
        if (margen && margen.margenM3 > 1e-4) return { lote, m3: margen.margenM3, aprovechablePct: 100, esMargen: true, permiso };
        return null;
      })
      .filter(
        (x): x is { lote: LoteAserrio; m3: number; aprovechablePct: number | null; esMargen: boolean; permiso: string | null } =>
          x !== null && !yaAgregados.has(x.lote.id),
      );
  }, [lotesAserrio, bloques]);
  /**
   * Líneas ya registradas en el Libro de Operaciones. Se guardan porque el
   * aserradero registra de a poco: se marca lo que se pasó hoy y mañana se sigue
   * desde ahí — si se perdiera al recargar, no serviría para nada.
   */
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  /** Quién firma el PDF. Se persiste: es la misma persona semana a semana. */
  const [firmaNombre, setFirmaNombre] = useState("");
  const [firmaCargo, setFirmaCargo] = useState("");
  /** Especies a exportar. Vacío = todas — filtrar es la excepción, no la regla. */
  const [soloEspecies, setSoloEspecies] = useState<Set<string>>(new Set());
  const [opcionesAbiertas, setOpcionesAbiertas] = useState(false);
  /**
   * Qué columnas de la tabla de bloques se ven. Es preferencia de DISPOSITIVO
   * (mismo patrón que las tablas del Libro): quien carga desde la tablet del
   * patio no quiere las mismas catorce columnas que el que costea en la
   * oficina. No toca el CSV/PDF/Excel — el papel se exporta completo siempre,
   * porque esconder una columna es una comodidad de pantalla, no una decisión
   * sobre lo que se declara.
   */
  const [cols, setCols] = useColumnasVisibles<ColReparto>("buleje-reparto-cols", COLUMNAS_REPARTO);
  /**
   * Bloques marcados para JUNTAR en un solo Anexo 04 — «bloque 1 + bloque 3»
   * como si fuera una sola guía. Vive acá (no por bloque) porque la unión es
   * un conjunto que se arma y se descarta entre bloques que ni siquiera son
   * vecinos en la tabla.
   */
  const [seleccionAnexo, setSeleccionAnexo] = useState<Set<string>>(new Set());
  /**
   * Guardar/abrir la distribución de bloques (Brandon, 2026-09-01: "una
   * función para guardar esa distribución de bloques, para cuando quiera en
   * otro lado después pueda escoger eso guardado y se ponga todos los
   * datos"). Vive en el servidor (mismo patrón que `CubicacionesGuardadas`),
   * no en el navegador: tiene que verse desde otra computadora.
   */
  const [mostrarGuardar, setMostrarGuardar] = useState(false);
  const [mostrarGuardadas, setMostrarGuardadas] = useState(false);
  /** Buscador de paquetes YA declarados en el Libro (bloques de aserrada directa). */
  const [mostrarPaquetes, setMostrarPaquetes] = useState(false);
  /** Importador de bloques desde una planilla (pegar o .xlsx/.csv). */
  const [mostrarImportar, setMostrarImportar] = useState(false);
  const [formGuardar, setFormGuardar] = useState({ nombre: "", fecha: hoyISO(), notas: "" });
  const [guardandoDistribucion, setGuardandoDistribucion] = useState(false);
  const [errorGuardarDistribucion, setErrorGuardarDistribucion] = useState<string | null>(null);
  /** La distribución guardada que se está editando — `null` = todavía sin guardar (bloques sueltos o duplicado). */
  const [distribucionActual, setDistribucionActual] = useState<{ id: string; nombre: string } | null>(null);
  const [guardadoOkDistribucion, setGuardadoOkDistribucion] = useState<string | null>(null);
  const [historialDistribucionesToken, setHistorialDistribucionesToken] = useState(0);

  /**
   * Buffer de texto crudo por campo decimal (m³, % aprovechable, ampara m³
   * manual, S/ por m³) — separado del NÚMERO que se guarda en `bloques`.
   *
   * Sin esto, el input mostraba directamente `bloque.m3` (ya convertido a
   * Number en cada tecla): escribir "23.5" se volvía "235", porque al tipear
   * el "." el valor se colapsaba a 23 y el "." desaparecía de la pantalla —
   * el 5 siguiente se pegaba al entero en vez de ser el decimal. Con el
   * buffer, el input muestra EXACTAMENTE lo tipeado hasta que se sale del
   * campo; recién ahí vuelve a mostrar el número ya canonizado.
   */
  const [buffer, setBuffer] = useState<Record<string, string>>({});
  const claveBuffer = (id: string, campo: string) => `${id}:${campo}`;
  const valorTexto = (id: string, campo: string, actual: number | null | undefined, mostrarCero: boolean) => {
    const clave = claveBuffer(id, campo);
    if (clave in buffer) return buffer[clave];
    if (mostrarCero) return actual == null ? "" : String(actual);
    return actual ? String(actual) : "";
  };
  const onCambioDecimal = (id: string, campo: "m3" | "aprovechablePct" | "amparaManualM3" | "costoM3") =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      // Sólo dígitos y un separador decimal — el resto de la validación
      // (coma peruana, número inválido → 0) ya la hace `editar`.
      const crudo = e.target.value.replace(/[^\d.,]/g, "");
      setBuffer((prev) => ({ ...prev, [claveBuffer(id, campo)]: crudo }));
      editar(id, campo, crudo);
    };
  const onBlurDecimal = (id: string, campo: string) => () => {
    setBuffer((prev) => {
      const clave = claveBuffer(id, campo);
      if (!(clave in prev)) return prev;
      const next = { ...prev };
      delete next[clave];
      return next;
    });
  };
  /** El filtro de largo ya no es texto: cada largo trae su % — se guarda directo, sin buffer. */
  const setLargoFiltro = (id: string, next: FiltroLargo[] | null) =>
    guardar(bloques.map((b) => (b.id === id ? { ...b, largoFiltro: next } : b)));
  /** Qué tipos lleva el bloque. Las claves ya vienen con el `dim` adentro. */
  const setGruposFiltro = (id: string, next: string[] | null) =>
    guardar(bloques.map((b) => (b.id === id ? { ...b, gruposFiltro: next } : b)));

  // Los bloques se persisten: en el aserradero se cubica hoy y se costea mañana.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(claveLocal("-rolliza"));
      if (raw) setBloques(JSON.parse(raw) as BloqueRolliza[]);
      const m = localStorage.getItem(claveLocal("-rolliza-marcas"));
      if (m) setMarcadas(new Set(JSON.parse(m) as string[]));
      const s = localStorage.getItem(claveLocal("-rolliza-anexo-sel"));
      if (s) setSeleccionAnexo(new Set(JSON.parse(s) as string[]));
      const f = localStorage.getItem(claveLocal("-rolliza-firma"));
      if (f) {
        const j = JSON.parse(f) as { nombre?: string; cargo?: string };
        setFirmaNombre(j.nombre ?? "");
        setFirmaCargo(j.cargo ?? "");
      }
    } catch { /* ignore */ }
    setHayTrozas(leerTrozas().length);
  }, []);

  /**
   * Escribe la firma al tiro del cambio, no desde un efecto que mira
   * `[firmaNombre, firmaCargo]`: ese efecto corría también en el MISMO commit
   * del mount (antes de que el `setFirmaNombre` del efecto de lectura llegara
   * a pintar), así que pisaba lo recién leído con `""` — la firma no
   * sobrevivía un F5 (auditoría 2026-08-17). Mismo patrón que `marcar`/`guardar`.
   */
  const guardarFirmaNombre = (v: string) => {
    setFirmaNombre(v);
    try { localStorage.setItem(claveLocal("-rolliza-firma"), JSON.stringify({ nombre: v, cargo: firmaCargo })); } catch { /* quota */ }
  };
  const guardarFirmaCargo = (v: string) => {
    setFirmaCargo(v);
    try { localStorage.setItem(claveLocal("-rolliza-firma"), JSON.stringify({ nombre: firmaNombre, cargo: v })); } catch { /* quota */ }
  };

  /** Marca o desmarca líneas; `estado` fuerza el valor (para «todo el día»). */
  const marcar = useCallback((claves: string[], estado?: boolean) => {
    setMarcadas((prev) => {
      const next = new Set(prev);
      const encender = estado ?? !claves.every((k) => prev.has(k));
      for (const k of claves) {
        if (encender) next.add(k); else next.delete(k);
      }
      try { localStorage.setItem(claveLocal("-rolliza-marcas"), JSON.stringify([...next])); } catch { /* quota */ }
      return next;
    });
  }, []);
  const guardar = useCallback((next: BloqueRolliza[]) => {
    setBloques(next);
    try { localStorage.setItem(claveLocal("-rolliza"), JSON.stringify(next)); } catch { /* quota */ }
  }, []);

  /**
   * Persiste la selección del Anexo 04 conjunto — mismo patrón que `marcar`:
   * si no sobrevive un F5, quien viene marcando bloque por bloque durante el
   * día los pierde apenas recarga la pestaña.
   */
  const guardarSeleccionAnexo = (next: Set<string>) => {
    setSeleccionAnexo(next);
    try { localStorage.setItem(claveLocal("-rolliza-anexo-sel"), JSON.stringify([...next])); } catch { /* quota */ }
  };
  /** Marca/desmarca un bloque para juntarlo con otros en un solo Anexo 04. */
  const alternarSeleccionAnexo = (id: string) => {
    const next = new Set(seleccionAnexo);
    if (next.has(id)) next.delete(id); else next.add(id);
    guardarSeleccionAnexo(next);
  };
  /** Borrar un bloque lo saca también de la selección para el Anexo 04 conjunto. */
  const quitarBloque = (id: string) => {
    guardar(bloques.filter((x) => x.id !== id));
    if (seleccionAnexo.has(id)) {
      const next = new Set(seleccionAnexo);
      next.delete(id);
      guardarSeleccionAnexo(next);
    }
  };

  const traerDeTrozas = () => {
    const nuevos = bloquesDesdeTrozas(leerTrozas());
    if (nuevos.length === 0) return;
    // Reemplaza los que ya vinieron de trozas y conserva los cargados a mano:
    // re-importar no puede borrar lo que alguien tipeó.
    guardar([...bloques.filter((b) => b.origen !== "trozas"), ...nuevos]);
  };

  /** Enfoca y centra el último bloque agregado — sin esto, quien tocó el botón no ve que pasó nada. */
  const irAlUltimoBloque = () => {
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[aria-label="Etiqueta del bloque de rolliza"]');
      const ultimo = inputs[inputs.length - 1];
      ultimo?.scrollIntoView({ behavior: "smooth", block: "center" });
      ultimo?.focus();
    });
  };

  const agregarBloqueManual = () => {
    guardar([...bloques, { id: nuevoId(), etiqueta: "", especie: "", m3: 0, origen: "manual", tipo: "rolliza", costoM3: null, aprovechablePct: null }]);
    irAlUltimoBloque();
  };

  /**
   * Bloque de madera YA ASERRADA, sin troza de origen (Brandon, 2026-09-01:
   * "otra función que me permita crear bloques ya aserrada, sin necesidad de
   * crear un bloque de rolliza … pondré el m³ y piezas y se distribuirá con
   * los demás asignándoles las medidas").
   *
   * Convive con los de rolliza en la MISMA tabla y lo reparte el mismo motor:
   * lo único distinto es de dónde sale su capacidad — acá el m³ cargado ya es
   * el amparado, sin porcentaje de por medio. `piezasManual` arranca en
   * `null` (todas las que entren por volumen) para que un bloque recién
   * creado no quede en 0 piezas sin que nadie lo haya dicho.
   */
  /**
   * Bloques de aserrada directa sembrados desde PAQUETES ya declarados en el
   * Libro. El m³ y las piezas bajan tal cual vinieron —no se retipean, que es
   * como el papel y el Libro empiezan a decir números distintos— y el
   * `paqueteId` queda marcado para no volver a ofrecer el mismo paquete.
   *
   * El N° de permiso queda vacío A PROPÓSITO: el payload de disponibles trae
   * la GTF y el titular, no el título habilitante (misma regla que
   * `permisoDelLote`, que prefiere la celda en blanco antes que adivinar).
   */
  const agregarBloquesDePaquetes = (elegidos: PaqueteElegible[]) => {
    if (elegidos.length === 0) return;
    guardar([...bloques, ...elegidos.map((p): BloqueRolliza => ({
      id: nuevoId(),
      etiqueta: p.etiqueta,
      especie: p.especie,
      m3: p.m3,
      permiso: null,
      origen: "manual",
      tipo: "aserrada",
      paqueteId: p.ref,
      costoM3: null,
      aprovechablePct: null,
      piezasManual: p.piezas,
    }))]);
    irAlUltimoBloque();
  };

  /**
   * Bloques leídos de una planilla. Se SUMAN a los que ya hay —nunca los
   * reemplazan—: importar veinte guías no puede borrar la que alguien acaba de
   * tipear a mano (mismo criterio que «Traer del cubicador de trozas»).
   */
  const agregarBloquesImportados = (importados: BloqueImportado[]) => {
    if (importados.length === 0) return;
    guardar([...bloques, ...importados.map((b): BloqueRolliza => ({ ...b, id: nuevoId() }))]);
    irAlUltimoBloque();
  };

  const agregarBloqueAserrada = () => {
    guardar([...bloques, { id: nuevoId(), etiqueta: "", especie: "", m3: 0, origen: "manual", tipo: "aserrada", costoM3: null, aprovechablePct: null, piezasManual: null }]);
    irAlUltimoBloque();
  };

  /**
   * Bloque sembrado desde un lote de aserrío YA creado: etiqueta, especie y
   * N° de permiso salen del lote (no se tipean de nuevo) — el permiso viaja
   * en el `originCode` del ingreso de cada troza (`permisoDelLote`), la MISMA
   * fuente que usa `bloquesDeGuiaDe()` para sembrar desde el Libro. El m³ y
   * el % aprovechable vienen de `lotesConRolliza` — para un lote de trozas es
   * rolliza cruda (el 55 % default calcula lo que ampara); para uno de
   * inventario ya es el margen del 56 % (aprovechablePct: 100, no se
   * descuenta de nuevo). Se integra al resto de la tabla — el reparto no
   * distingue de dónde salió cada bloque, sólo el origen queda marcado para
   * no ofrecer el mismo lote dos veces.
   */
  const agregarBloqueDeLote = (lote: LoteAserrio, m3: number, aprovechablePct: number | null, permiso: string | null, esMargen: boolean) => {
    guardar([...bloques, {
      id: nuevoId(), etiqueta: `Lote ${lote.code}`, especie: lote.speciesCommon || "", m3, permiso,
      origen: "lote", loteId: lote.id, costoM3: null,
      /* El margen del 56 % ya viene en unidades de ASERRADA (`topeM3 −
         declaradoM3`), no en rolliza por aserrar: es exactamente un bloque de
         aserrada directa. Cargarlo como rolliza al 100 % daba el mismo
         número, pero lo contaba como troza en `rollizaM3` y le ensuciaba el
         rendimiento a la sierra con volumen que la sierra nunca cortó. */
      tipo: esMargen ? "aserrada" : "rolliza",
      aprovechablePct: esMargen ? null : aprovechablePct,
    }]);
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[aria-label="Etiqueta del bloque de rolliza"]');
      inputs[inputs.length - 1]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  /**
   * Guarda los bloques cargados como una distribución con nombre, para
   * abrirla después desde cualquier lado (Brandon, 2026-09-01). Los totales
   * que se listan en «Guardadas» los recalcula el servidor desde los
   * bloques — el papel guardado no depende de lo que diga la pantalla.
   */
  const guardarDistribucion = async () => {
    if (bloques.length === 0 || guardandoDistribucion) return;
    setGuardandoDistribucion(true);
    setErrorGuardarDistribucion(null);
    try {
      const r = await fetch("/api/admin/forestal/distribuciones", {
        method: "POST",
        headers: { "content-type": "application/json", ...csrfHeaders() },
        credentials: "include",
        body: JSON.stringify({
          id: distribucionActual?.id || undefined,
          nombre: formGuardar.nombre.trim() || nombreSugeridoDistribucion(bloques),
          fecha: formGuardar.fecha,
          notas: formGuardar.notas.trim() || null,
          bloques,
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error(
          j?.error === "specialization_disabled" ? (j.message as string)
            : j?.error === "validation_error" ? "Revisá los datos de los bloques."
              : (j?.message ?? `HTTP ${r.status}`),
        );
      }
      const { distribucion } = (await r.json()) as { distribucion: DistribucionRegistro };
      setDistribucionActual({ id: distribucion.id, nombre: distribucion.nombre });
      setGuardadoOkDistribucion(distribucion.nombre);
      setMostrarGuardar(false);
      setHistorialDistribucionesToken((v) => v + 1);
      setTimeout(() => setGuardadoOkDistribucion(null), 6000);
    } catch (e) {
      setErrorGuardarDistribucion(`No se pudo guardar: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGuardandoDistribucion(false);
    }
  };

  /**
   * Abre una distribución guardada: REEMPLAZA los bloques de la tabla por
   * los suyos, tal como quedaron — mismo criterio que "Abrir" en el
   * cubicador. Un `id` vacío (viene del botón «Duplicar») deja la próxima
   * guardada como una NUEVA, sin pisar la original.
   */
  const abrirDistribucion = (d: DistribucionRegistro) => {
    guardar(d.bloques);
    setDistribucionActual(d.id ? { id: d.id, nombre: d.nombre } : null);
    setFormGuardar({ nombre: d.nombre, fecha: d.fecha, notas: d.notas ?? "" });
    setMostrarGuardadas(false);
  };

  /**
   * El botón «Agregar bloque» de la zona de descuadre: crea un bloque YA
   * cargado con la especie y los m³ de rolliza que hacen falta para cubrir el
   * faltante — la misma cuenta que ya muestra «pide X m³ de troza», no una
   * nueva. La etiqueta queda vacía a propósito: es un bloque SUGERIDO, no una
   * GTF real todavía, y no hay que inventarle un número que el fiscalizador
   * después no puede cruzar contra ningún papel.
   */
  /**
   * El gemelo de `agregarBloqueSugerido` para la otra forma: en vez de pedir
   * troza para amparar el faltante, lo declara como madera que YA vino
   * aserrada. El m³ es el faltante tal cual (no pasa por ningún %): en un
   * bloque de aserrada directa el volumen cargado es el amparado.
   */
  const agregarBloqueAserradaSugerido = (especie: string, m3: number) => {
    guardar([...bloques, { id: nuevoId(), etiqueta: "", especie: especie === "Sin especie" ? "" : especie, m3, origen: "manual", tipo: "aserrada", costoM3: null, aprovechablePct: null, piezasManual: null }]);
    irAlUltimoBloque();
  };

  const agregarBloqueSugerido = (especie: string, m3: number) => {
    guardar([...bloques, { id: nuevoId(), etiqueta: "", especie: especie === "Sin especie" ? "" : especie, m3, origen: "manual", tipo: "rolliza", costoM3: null, aprovechablePct: null }]);
    // El bloque aparece arriba, en «Rolliza que entró» — sin esto, quien tocó
    // el botón (más abajo, en el resultado) no ve que pasó nada.
    requestAnimationFrame(() => {
      const inputs = document.querySelectorAll<HTMLInputElement>('[aria-label="Etiqueta del bloque de rolliza"]');
      const ultimo = inputs[inputs.length - 1];
      ultimo?.scrollIntoView({ behavior: "smooth", block: "center" });
      ultimo?.focus();
    });
  };

  const editar = (
    id: string,
    campo: "etiqueta" | "permiso" | "especie" | "fecha" | "m3" | "costoM3" | "aprovechablePct" | "dias" | "amparaManualM3" | "piezasManual" | "tipo",
    valor: string,
  ) =>
    guardar(bloques.map((b) => {
      if (b.id !== id) return b;
      const n = () => Number(valor.replace(",", ".")) || 0;
      /* Cambiar de rolliza a aserrada directa (o al revés) LIMPIA los campos
         que dejan de tener sentido: un `amparaManualM3` heredado seguiría
         mandando sobre una capacidad que ya no se calcula así, y el bloque
         ampararía un número que la pantalla no muestra en ninguna columna. */
      if (campo === "tipo") {
        const tipo = valor === "aserrada" ? ("aserrada" as const) : ("rolliza" as const);
        return tipo === "aserrada"
          ? { ...b, tipo, aprovechablePct: null, amparaManualM3: null }
          : { ...b, tipo };
      }
      if (campo === "m3") return { ...b, m3: n() };
      // Días vacío = 1 jornada (`null`), no 0: un bloque siempre se aserró
      // algún día. El saneado real vive en `diasDe` — acá sólo se guarda.
      if (campo === "dias") return { ...b, dias: valor.trim() === "" ? null : Math.max(1, Math.floor(n())) };
      if (campo === "aprovechablePct") return { ...b, aprovechablePct: valor.trim() === "" ? null : n() };
      /* Vacío = «que lo calcule el sistema». 0 es un dato: un bloque que todavía
         no dio nada. Por eso no se puede colapsar vacío con cero. */
      if (campo === "amparaManualM3") return { ...b, amparaManualM3: valor.trim() === "" ? null : n() };
      if (campo === "piezasManual") return { ...b, piezasManual: valor.trim() === "" ? null : Math.max(0, Math.floor(n())) };
      // Costo vacío = `null` (no se conoce), NUNCA 0: un 0 diría que la madera
      // fue gratis y el costo por producto saldría mal sin avisar.
      if (campo === "costoM3") return { ...b, costoM3: valor.trim() === "" ? null : n() };
      return { ...b, [campo]: valor };
    }));

  /**
   * Override manual de UNA LÍNEA del resultado ya distribuido (ej. sólo
   * «Comercial» dentro de un bloque), en vez del bloque entero. Vive aparte de
   * `editar()` porque no es un campo de `BloqueRolliza` sino una entrada del
   * mapa `overridesLinea`, con su propia clave por línea (`claveOverrideLinea`,
   * que incluye el `dim` vigente para no aplicar un override armado bajo otra
   * vista). Piezas y m³ en blanco a la vez = sin override: se borra la
   * entrada, no se arrastra un objeto vacío en el estado.
   */
  const editarLinea = (bloqueId: string, claveGrupo: string, campo: "piezas" | "m3", valor: string) => {
    const clave = claveOverrideLinea(dim, claveGrupo);
    guardar(bloques.map((b) => {
      if (b.id !== bloqueId) return b;
      const actuales = b.overridesLinea ?? {};
      const actual = actuales[clave] ?? {};
      const vacio = valor.trim() === "";
      const n = () => Number(valor.replace(",", ".")) || 0;
      const next = campo === "piezas"
        ? { ...actual, piezas: vacio ? null : Math.max(0, Math.floor(n())) }
        : { ...actual, m3: vacio ? null : Math.max(0, n()) };
      const overridesLinea = { ...actuales };
      if (next.piezas == null && next.m3 == null) delete overridesLinea[clave];
      else overridesLinea[clave] = next;
      return { ...b, overridesLinea };
    }));
  };
  const idLinea = (bloqueId: string, claveGrupo: string) => `${bloqueId}|linea|${claveGrupo}`;
  const onCambioDecimalLinea = (bloqueId: string, claveGrupo: string) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const crudo = e.target.value.replace(/[^\d.,]/g, "");
      setBuffer((prev) => ({ ...prev, [claveBuffer(idLinea(bloqueId, claveGrupo), "m3")]: crudo }));
      editarLinea(bloqueId, claveGrupo, "m3", crudo);
    };
  const onBlurDecimalLinea = (bloqueId: string, claveGrupo: string) => onBlurDecimal(idLinea(bloqueId, claveGrupo), "m3");
  const valorTextoLinea = (bloqueId: string, claveGrupo: string, actual: number | null | undefined) =>
    valorTexto(idLinea(bloqueId, claveGrupo), "m3", actual, true);

  /** Largos (pies) que de verdad hay pendientes de cubicar — para que el
   * filtro se elija de una lista real, no se adivine a mano. */
  /**
   * Los grupos que de verdad hay en el lote bajo la vista vigente — para
   * elegir el tipo de un bloque de una lista real y no tipearlo. Se recalculan
   * al cambiar `dim` porque las claves guardadas llevan la dimensión adentro.
   */
  const gruposDisponibles = useMemo(
    () => agruparPor(rows, dim === "especie" ? "tipo" : dim, precioDe).grupos.map((g) => ({ clave: g.clave, label: g.label })),
    [rows, dim, precioDe],
  );

  const largosDisponibles = useMemo(
    () => Array.from(new Set(rows.map((r) => Math.round(toFeet(r.largo, r.uLargo))))).sort((a, b) => a - b),
    [rows],
  );

  const dist = useMemo(() => distribuirPorCapacidad(bloques, rows, dim, precioDe), [bloques, rows, dim, precioDe]);
  /* Por qué quedó capacidad libre y con qué medidas se cierra. Se calcula con
     el MISMO `dim` que la distribución: los filtros por grupo se guardan con la
     clave de la vista vigente y leerlos con otra los daría por inactivos. */
  const diagnostico = useMemo(() => diagnosticarReparto(dist, dim), [dist, dim]);
  const t = dist.totales;
  /** Cada bloque YA distribuido, con su especie — para poder buscarlo por id
   *  sin importar bajo qué grupo de especie terminó cayendo. */
  const bloquesDistribuidos = useMemo(
    () => dist.especies.flatMap((e) => e.bloques.map((b) => ({ b, especie: e.especie }))),
    [dist],
  );
  /**
   * Lo que juntan los bloques marcados con el checkbox «Anexo 4»: sus piezas
   * concatenadas (cada una ya trae su propia especie, así que mezclar especies
   * no las confunde — el Anexo 04 las separa de nuevo en sus propios bloques
   * especie × tipo) y un rótulo con las etiquetas de origen, para no perder de
   * qué guías salió el papel conjunto.
   *
   * `unificarPorMedida` junta la MISMA medida que salió de DOS bloques
   * distintos en una sola fila (Brandon, 2026-09-02: "15 de 6×6×2 y otro 12
   * 6×6×2... unificar" en 27) — sin esto, el Anexo 04 conjunto imprimía la
   * misma medida dos veces, una por bloque de origen.
   */
  const combinadoAnexo = useMemo(() => {
    const elegidos = bloquesDistribuidos.filter(({ b }) => seleccionAnexo.has(b.bloque.id));
    const piezas = unificarPorMedida(elegidos.flatMap(({ b, especie }) => piezasDelBloque(b, especie)));
    return {
      piezas,
      amparaM3: elegidos.reduce((a, { b }) => a + b.capacidadM3, 0),
      etiqueta: elegidos.map(({ b }) => b.bloque.etiqueta || "sin etiqueta").join(" + "),
      especies: [...new Set(elegidos.map(({ especie }) => especie).filter(Boolean))],
      cantidad: elegidos.length,
      /**
       * De qué clase de bloque salió cada parte del papel conjunto. Va al
       * checklist del Anexo 04: juntar rolliza con madera ya aserrada es
       * legítimo, pero son DOS respaldos distintos en una sola hoja y quien
       * firma tiene que saberlo antes, no cuando se lo pregunten.
       */
      procedencia: {
        rolliza: elegidos.filter(({ b }) => !esAserradaDirecta(b.bloque)).length,
        aserradaDirecta: elegidos.filter(({ b }) => esAserradaDirecta(b.bloque)).length,
      } satisfies ProcedenciaBloques,
      /** Lo REALMENTE distribuido (aserrada) de estos bloques — no confundir
       *  con `amparaM3` (la capacidad de la rolliza): son las piezas que ya
       *  quedaron asignadas, la misma cuenta que va al Anexo 04. */
      piezasCant: piezas.reduce((a, p) => a + p.cantidad, 0),
      pieTablar: piezas.reduce((a, p) => a + p.pieTablar, 0),
      m3Aserrado: piezas.reduce((a, p) => a + p.m3, 0),
    };
  }, [bloquesDistribuidos, seleccionAnexo]);
  const conCosto = dist.especies.some((e) => e.costoRolliza != null && e.rollizaM3 > 0);
  const juicio = juzgarRendimiento(t.rendimientoPct);
  /** El % aprovechable declarado, ponderado por volumen: lo que se ESPERABA sacar. */
  /* Sólo sobre la capacidad que sale de TROZA: la de los bloques de aserrada
     directa no se aprovechó de nada (su m³ ya era aserrada), y meterla en el
     numerador con la rolliza en el denominador daba un «esperabas» inflado. */
  const aprovechableEsperado = t.rollizaM3 > 0 ? ((t.capacidadM3 - t.aserradaDirectaM3) / t.rollizaM3) * 100 : null;
  /**
   * Capacidad y sobrante que salen SÓLO de troza. La capacidad de un bloque
   * de aserrada directa es su propio m³ (`aserradaDirectaM3`), así que
   * restarla deja lo que la rolliza realmente ampara — si no, el KPI decía
   * «9 m³ de rolliza amparan 6.450» cuando amparan 4.950 y el resto venía de
   * madera ya aserrada. Lo mismo con el sobrante: capacidad libre en un
   * bloque de aserrada directa NO es troza esperando la sierra.
   */
  const capacidadRollizaM3 = t.capacidadM3 - t.aserradaDirectaM3;
  const libreRollizaM3 = useMemo(
    () => dist.especies.reduce(
      (a, e) => a + e.bloques.filter((b) => !esAserradaDirecta(b.bloque)).reduce((x, b) => x + b.libreM3, 0),
      0,
    ),
    [dist],
  );

  const exportar = () => {
    const blob = new Blob([`﻿${distribucionACsv(filtrarPorEspecies(dist, soloEspecies), ETIQUETA_DIMENSION[dim])}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "distribucion-rolliza-aserrada.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  /**
   * PDF y Excel traen jsPDF/exceljs por import dinámico: la primera vez tarda,
   * así que el botón lo dice en vez de parecer que no respondió.
   */
  /**
   * El bloque cuyo ANEXO 04 se está viendo. El papel se emite POR BLOQUE: cada
   * uno ampara una guía distinta, y un anexo que mezclara dos no se puede
   * presentar contra ninguna.
   */
  const [anexoDe, setAnexoDe] = useState<{
    piezas: PiezaCubicada[];
    especie: string;
    etiqueta: string;
    /** Cuántos bloques de cada clase aportaron piezas a este anexo (checklist). */
    procedencia: ProcedenciaBloques;
  } | null>(null);
  const [bajando, setBajando] = useState<"pdf" | "excel" | null>(null);
  const [errorBajar, setErrorBajar] = useState<string | null>(null);
  const bajar = async (que: "pdf" | "excel") => {
    setBajando(que);
    setErrorBajar(null);
    try {
      const etiqueta = ETIQUETA_DIMENSION[dim].replace("Por ", "");
      const firma: FirmaResponsable | undefined = firmaNombre.trim() ? { nombre: firmaNombre.trim(), cargo: firmaCargo.trim() || undefined } : undefined;
      // Las marcas viajan al papel: el que recibe el archivo ve qué líneas ya
      // están en el Libro y cuáles no — que es la mitad del valor de tildarlas.
      if (que === "pdf") await exportarDistribucionPDF(dist, etiqueta, marcadas, firma, soloEspecies);
      else await exportarDistribucionExcel(dist, etiqueta, marcadas, firma, soloEspecies);
    } catch (err) {
      // Un `catch` vacío dejaría el botón en «Generando…» para siempre y nadie
      // sabría por qué no bajó el archivo.
      console.error("[distribucion-export] falló la descarga", err);
      setErrorBajar(err instanceof Error ? err.message : String(err));
    } finally {
      setBajando(null);
    }
  };

  /**
   * El balance del reparto en las tres unidades con las que se declara
   * (Brandon, 2026-09-02: «decir cuánto falta de m³ a distribución, o m³, PT y
   * cantidad de piezas»): lo que YA quedó respaldado y lo que todavía no.
   *
   * El faltante sale del propio motor (`e.faltante`), no de restar totales: la
   * resta daría el número pero perdería las piezas y el pie tablar, que son
   * los que dicen QUÉ falta cubrir, no sólo cuánto.
   */
  const balance = useMemo(() => {
    const puestas = dist.especies.reduce(
      (a, e) => a + e.bloques.reduce((x, b) => x + b.asignado.reduce((y, g) => y + g.piezas, 0), 0), 0,
    );
    const falta = dist.especies.flatMap((e) => e.faltante);
    return {
      hechoM3: t.amparadaM3, hechoPt: t.amparadaPt, hechoPiezas: puestas,
      faltaM3: t.faltanteM3,
      faltaPt: falta.reduce((a, f) => a + f.pieTablar, 0),
      faltaPiezas: falta.reduce((a, f) => a + f.piezas, 0),
      /** Rolliza que habría que agregar para taparlo, al aprovechamiento vigente. */
      faltaRollizaM3: t.rollizaFaltanteM3,
    };
  }, [dist, t]);

  /**
   * El repaso antes de registrar. Vive en `lib/forestal/reparto-revision.ts`
   * (puro, con tests) porque son reglas de negocio: qué le falta a un bloque
   * para poder declararse, y qué combinaciones no se pueden presentar.
   */
  const hallazgos = useMemo(() => revisarDistribucion(bloques, dist), [bloques, dist]);
  const cuenta = contarRevision(hallazgos);
  const [revisionAbierta, setRevisionAbierta] = useState(false);

  /**
   * El color con el que se reconoce cada bloque, por su posición en la lista
   * MAESTRA. La tabla de arriba y las tarjetas de abajo leen del mismo mapa:
   * si se calculara en cada lado, el orden por especie del desglose le daría
   * a dos filas distintas el mismo color.
   */
  const indiceBloque = useMemo(() => indicesDeBloques(bloques), [bloques]);

  /** Ancho mínimo de la tabla según lo que quedó visible. */
  const anchoTabla = ANCHO_FIJO_REPARTO + COLUMNAS_REPARTO.reduce((a, c) => a + (cols[c.key] ? c.ancho : 0), 0);
  /** Etiqueta + las columnas de identidad todavía visibles, para el rótulo «Total». */
  const colSpanIdentidad = 1 + COLS_IDENTIDAD.filter((k) => cols[k]).length;

  /** Las cabeceras, en el mismo orden que las celdas — se filtran juntas. */
  const cabeceras: { key: ColReparto; node: ReactNode }[] = [
    {
      key: "tipo",
      node: (
        <ThAyuda alinear="left" ayuda={<><b>Rolliza</b>: entró troza y el sistema calcula qué ampara (m³ × % aprovechable) — la forma de siempre. <b>Aserrada directa</b>: la madera ya vino aserrada, así que el m³ que cargás ES el amparado y las piezas se declaran a mano; no suma rolliza ni entra en el rendimiento de la sierra. Se puede cambiar en cualquier momento.</>}>
          Cargado como
        </ThAyuda>
      ),
    },
    {
      key: "permiso",
      node: (
        <ThAyuda alinear="left" ayuda="El título habilitante (N° de permiso) de origen de este bloque. Dos permisos de la misma especie NUNCA se muestran combinados: cada uno aparece por separado abajo, aunque compartan bloques de rolliza.">
          N° de permiso
        </ThAyuda>
      ),
    },
    {
      key: "especie",
      node: (
        <ThAyuda alinear="left" ayuda="La especie de la rolliza de este bloque (Tornillo, Cedro, etc.) — se usa para agrupar y declarar por especie.">
          Especie
        </ThAyuda>
      ),
    },
    {
      key: "m3",
      node: (
        <ThAyuda ayuda={<>En un bloque de <b>rolliza</b>: los metros cúbicos de troza (R) que entraron, tal como llegó, antes de aserrar. En uno de <b>aserrada directa</b>: los metros cúbicos de madera ya aserrada (A) — ese mismo número es lo que ampara.</>}>
          m³ (R / A)
        </ThAyuda>
      ),
    },
    {
      key: "dias",
      node: (
        <ThAyuda ayuda="En cuántas jornadas se aserró este bloque. El Libro de Operaciones se registra día por día: si tardó más de una, contalas acá.">
          Días
        </ThAyuda>
      ),
    },
    {
      key: "fecha",
      node: (
        <ThAyuda alinear="left" ayuda="El día en que se aserró este bloque — con más de un día (columna anterior), el día en que arrancó. Va al Excel y al PDF de la distribución.">
          Fecha
        </ThAyuda>
      ),
    },
    {
      key: "aprovechable",
      node: (
        <ThAyuda ayuda="Qué parte de esa rolliza se convierte en madera aserrada. Sin dato propio, se usa un supuesto del centro del rango normal de aserrío (55 %). No aplica a los bloques de aserrada directa: esa madera ya salió de la sierra.">
          % aprovechable
        </ThAyuda>
      ),
    },
    {
      key: "pctReal",
      node: (
        <ThAyuda ayuda="% REAL: lo que este bloque terminó amparando (usado ÷ m³ de rolliza), después de repartir. Es un dato DERIVADO del reparto de abajo — distinto del % aprovechable de al lado, que es el supuesto con el que se calculó la capacidad.">
          % real
        </ThAyuda>
      ),
    },
    {
      key: "ampara",
      node: (
        <ThAyuda ayuda={<>Metros cúbicos de madera ASERRADA (A) que este bloque respalda — lo que declarás como salido de esta rolliza. Se calcula solo (m³ × % aprovechable) salvo que lo escribas a mano. En un bloque de aserrada directa es el mismo m³ (A) de la columna anterior, así que no se edita dos veces. Debajo, en chico, va lo <b>real</b>: los m³ que el reparto le asignó de verdad. Si es menos, a ese bloque le sobra respaldo sin usar.</>}>
          Ampara m³ (A)
        </ThAyuda>
      ),
    },
    {
      key: "piezas",
      node: (
        <ThAyuda ayuda={<>Cuántas piezas aserradas salieron de este bloque. Vacío = entran todas las que alcancen por volumen. En un bloque de aserrada directa es donde se declaran las piezas que se contaron. Debajo, en chico, va lo <b>real</b>: las piezas que el reparto le asignó de verdad.</>}>
          Piezas
        </ThAyuda>
      ),
    },
    {
      key: "costo",
      node: (
        <ThAyuda ayuda="Cuánto pagaste por cada metro cúbico de este bloque — de rolliza, o de la madera ya aserrada. Opcional, solo para calcular el costo del bloque.">
          S/ por m³
        </ThAyuda>
      ),
    },
    {
      key: "grupos",
      node: (
        <ThAyuda alinear="left" ayuda={<>Qué lleva este bloque, de lo que hay cubicado. Vacío = <b>de todo</b> (lo de siempre): el bloque toma una tajada proporcional de todos los tipos pendientes. Elegí uno o más para que lleve <b>sólo esos</b> — «este bloque es todo Comercial, el de al lado todo Corta». A diferencia del largo, esto es <b>excluyente</b>: lo que no elegiste no entra ni aunque al bloque le sobre capacidad, queda en «Falta por distribuir». La lista sale de cómo esté agrupada la tabla (el selector «Agrupar» de arriba), así que si cambiás de vista hay que volver a elegir.</>}>
          Lleva sólo
        </ThAyuda>
      ),
    },
    {
      key: "largo",
      node: (
        <ThAyuda alinear="left" ayuda={<>Prioridad para estos largos (en pies) — «esta troza va primero a 12 pies». Escribí o elegí de la lista (son los largos que hay pendientes de cubicar) para agregar uno; tocá su chip para decidir si se lleva TODO lo pendiente de ese largo (completo) o sólo una parte (parcial, en %; el resto queda reservado para otro lado). Si a esos largos les sobra capacidad al bloque, SE COMPLETA con lo que haya (otros largos, otros tipos) — no se desperdicia. Vacío = cualquier largo, sin prioridad, como siempre.</>}>
          Largo (pies)
        </ThAyuda>
      ),
    },
    {
      key: "anexo",
      node: (
        <th scope="col" className="whitespace-nowrap px-3 py-3 text-center">
          <span className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap">
            Anexo 4
            <AdminTooltip
              content="Marcá dos o más bloques para juntarlos en un solo Anexo 04 — como si fuera una sola guía. Cada pieza conserva su especie, así que da igual si los bloques marcados son de especies distintas."
              className="max-w-[220px] font-normal normal-case tracking-normal"
            >
              <button type="button" aria-label="Qué significa Anexo 4" className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]">
                <HelpCircle className="h-4 w-4" />
              </button>
            </AdminTooltip>
          </span>
        </th>
      ),
    },
  ];

  /**
   * El pie, sin las tres columnas de identidad (las absorbe el `colSpan` del
   * rótulo «Total»). Mismas claves y mismo orden que las celdas: se filtra con
   * el mismo `cols`, así nunca se corre respecto de la cabecera.
   */
  const pieCeldas: { key: ColReparto; node: ReactNode }[] = [
    {
      key: "m3",
      /* La columna m³ mezcla dos unidades (R y A), así que el total las lista
         por separado en vez de sumarlas: troza y tabla no se miden igual. */
      node: (
        <td className="px-3 py-3 text-right font-mono tabular-nums">
          {fmtM3(t.rollizaM3)}
          {t.aserradaDirectaM3 > 0 && (
            <span className="block whitespace-nowrap text-[length:var(--ts-2xs)] font-normal text-[var(--text-tertiary)]" title="Cargados como madera ya aserrada — no son rolliza">
              + {fmtM3(t.aserradaDirectaM3)} (A)
            </span>
          )}
        </td>
      ),
    },
    {
      key: "dias",
      node: (
        <td className="px-3 py-3 text-right font-mono tabular-nums">
          {bloques.reduce((a, b) => a + (Number(b.dias) > 1 ? Number(b.dias) : 1), 0)}
        </td>
      ),
    },
    { key: "fecha", node: <td className="px-3 py-3" /> },
    { key: "aprovechable", node: <td className="px-3 py-3" /> },
    {
      key: "pctReal",
      /* % real total: amparado ÷ rolliza — el mismo cociente que ya muestra el
         rótulo "Rendimiento general" de más abajo, acá al lado de la columna
         que resume. */
      node: (
        <td className="px-3 py-3 text-right font-mono tabular-nums" title="Lo amparado por bloques de rolliza ÷ la rolliza que entró — la aserrada directa no cuenta acá, no salió de ninguna troza">
          {t.rollizaM3 > 0 ? `${fmtPct(((t.amparadaM3 - t.amparadaDirectaM3) / t.rollizaM3) * 100)} %` : "—"}
        </td>
      ),
    },
    {
      key: "ampara",
      /**
       * El total dice lo REALMENTE distribuido (`amparadaM3` = suma de los
       * `usadoM3`), no la capacidad. Antes mostraba `capacidadM3` mientras la
       * celda de al lado ya contaba piezas reales: dos criterios en la misma
       * fila, y el m³ de arriba no era el que respaldaba esas piezas. La
       * capacidad sigue a la vista, abajo, cuando sobra algo sin usar.
       */
      node: (
        <td className="px-3 py-3 text-right font-mono tabular-nums" title="Los m³ de aserrada que el reparto asignó de verdad a los bloques. Es lo que respaldan las piezas de la columna siguiente.">
          <span className="block text-lg font-extrabold leading-none">{fmtM3(t.amparadaM3)}</span>
          {t.capacidadM3 - t.amparadaM3 > TOL_M3 && (
            <span className="mt-1 block whitespace-nowrap text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]" title="Capacidad total de los bloques: lo que PODRÍAN amparar si hubiera más aserrada cargada">
              máx. {fmtM3(t.capacidadM3)}
            </span>
          )}
        </td>
      ),
    },
    {
      key: "piezas",
      node: (
        <td className="px-3 py-3 text-right font-mono tabular-nums" title="Las piezas que el reparto asignó de verdad a los bloques">
          <span className="block text-lg font-extrabold leading-none">
            {fmtPiezas(dist.especies.reduce((a, e) => a + e.bloques.reduce((x, b) => x + b.asignado.reduce((y, g) => y + g.piezas, 0), 0), 0))}
          </span>
        </td>
      ),
    },
    {
      key: "costo",
      node: (
        <td className="px-3 py-3 text-right font-mono tabular-nums">
          {t.costoRolliza != null ? `S/ ${fmtSoles(t.costoRolliza)}` : "—"}
        </td>
      ),
    },
    { key: "grupos", node: <td className="px-3 py-3" /> },
    { key: "largo", node: <td className="px-3 py-3" /> },
    { key: "anexo", node: <td className="px-3 py-3" /> },
  ];

  return (
    <SeccionResumen
      icon={Share2}
      titulo="Distribución de rolliza sobre lo aserrado"
      /* El dato, no la explicación: una línea con lo que se vino a ver. */
      hint={bloques.length === 0 ? "Todavía no hay bloques cargados." : (
        <span className="font-mono tabular-nums">
          {fmtM3(t.amparadaM3)} m³ <span className="font-sans">amparados de verdad</span>
          {" · "}{fmtPiezas(dist.especies.reduce((a, e) => a + e.bloques.reduce((x, bl) => x + bl.asignado.reduce((y, g) => y + g.piezas, 0), 0), 0))} <span className="font-sans">piezas</span>
          {" · "}{bloques.length} <span className="font-sans">bloque{bloques.length === 1 ? "" : "s"}</span>
        </span>
      )}
      ayuda={
        <>
          Cada bloque ampara hasta su <b>capacidad</b> y no más. Un bloque de <b>rolliza</b> la calcula
          (m³ × % aprovechable); uno de <b>madera ya aserrada</b> ampara el m³ (A) que cargás, sin troza de origen.
          Los dos conviven en la misma tabla y reciben medidas por el mismo reparto. Lo que no entra pasa al bloque
          siguiente; lo que no entra en ninguno queda abajo, en <b>Falta por distribuir</b>.
          <br /><br />
          En la tabla, el número <b>grande</b> de «Ampara» y «Piezas» es lo que el reparto asignó <b>de verdad</b> —
          lo que va a imprimirse en el Anexo 04. El «tope» de abajo es sólo el techo que le ponés al bloque.
        </>
      }
      acciones={
        <>
          {/* Con el label visible al lado, no hay que abrir el desplegable para
              saber qué controla — antes sólo lo decía el aria-label, invisible. */}
          <label className="flex items-center gap-1.5">
            <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Agrupar</span>
            <select
              value={dim}
              onChange={(e) => setDim(e.target.value as DimensionResumen)}
              aria-label="Cómo agrupar la aserrada"
              className="h-9 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            >
              {DIMENSIONES_RESUMEN.filter((d) => d !== "especie").map((d) => (
                <option key={d} value={d}>{ETIQUETA_DIMENSION[d]}</option>
              ))}
            </select>
          </label>
          {/* Separador — agrupar es una cosa (cómo se lee la tabla), exportar
              es otra (qué te llevás); antes las cuatro cosas se leían como un
              solo racimo de controles sueltos. */}
          <div className="h-6 w-px shrink-0 bg-[var(--rule-base)]" aria-hidden />
          {/* Tres salidas para tres usos: el PDF se firma y se archiva, el
              Excel se cruza contra la planilla del contador, el CSV es el
              pegado rápido. Los tres bajan hasta la MEDIDA. */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void bajar("pdf")} disabled={bloques.length === 0 || bajando !== null} className={BTN}>
              <FileText className="h-4 w-4" /> {bajando === "pdf" ? "Generando…" : "PDF"}
            </button>
            <button type="button" onClick={() => void bajar("excel")} disabled={bloques.length === 0 || bajando !== null} className={BTN}>
              <FileSpreadsheet className="h-4 w-4" /> {bajando === "excel" ? "Generando…" : "Excel"}
            </button>
            <button type="button" onClick={exportar} disabled={bloques.length === 0} className={BTN}>
              <Download className="h-4 w-4" /> CSV
            </button>
            <button
              type="button"
              onClick={() => setOpcionesAbiertas((v) => !v)}
              disabled={bloques.length === 0}
              aria-expanded={opcionesAbiertas}
              title="Firma del responsable y qué especies incluir en el papel"
              className={`${BTN} ${soloEspecies.size > 0 || firmaNombre.trim() ? "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""}`}
            >
              <SlidersHorizontal className="h-4 w-4" /> Opciones
            </button>
            {/* Esconder columnas es de PANTALLA, no de papel: va al lado de
                «Opciones» pero no lo toca — el PDF/Excel/CSV siguen saliendo
                completos. Le pasamos el alto de esta barra (`h-9`), que no es
                el `h-12` de las barras de filtro del Libro. */}
            <ColumnasMenu columnas={COLUMNAS_REPARTO} visibles={cols} onChange={setCols} className="h-9 rounded-xl" />
            {/* El repaso antes de registrar: qué renglón no cuadra y por qué.
                El contador va en el botón porque un panel plegado sin número
                no se abre nunca. */}
            <button
              type="button"
              onClick={() => setRevisionAbierta((v) => !v)}
              disabled={bloques.length === 0}
              aria-expanded={revisionAbierta}
              title={hallazgos.length === 0 ? "Todo cuadra: no hay nada que revisar" : `${cuenta.errores} sin resolver · ${cuenta.avisos} para mirar`}
              className={`${BTN} ${cuenta.errores > 0
                ? "border-[var(--data-error-500)] text-[var(--data-error-600)] dark:text-[var(--data-error-500)]"
                : cuenta.avisos > 0
                  ? "border-[var(--data-warning-500)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
                  : "border-[var(--data-success-500)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"}`}
            >
              {hallazgos.length === 0 ? <ShieldCheck className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
              Revisar
              {hallazgos.length > 0 && (
                <span className="rounded-full bg-current/15 px-1.5 font-mono text-xs tabular-nums">{hallazgos.length}</span>
              )}
            </button>
          </div>
        </>
      }
    >

      {/* ── Balance del reparto: lo hecho y lo que falta, en las tres unidades ── */}
      {bloques.length > 0 && (
        <div className="mb-4 grid gap-2 sm:grid-cols-2">
          <CifraBalance
            titulo="Distribuido"
            ayuda="Lo que los bloques respaldan de verdad — es lo que se imprime en los Anexos 04."
            m3={balance.hechoM3}
            pt={balance.hechoPt}
            piezas={balance.hechoPiezas}
            tono="ok"
          />
          <CifraBalance
            titulo="Falta por distribuir"
            ayuda={balance.faltaM3 > TOL_M3
              ? `Aserrada cubicada que ningún bloque alcanzó a amparar. Para taparla harían falta ${fmtM3(balance.faltaRollizaM3)} m³ de rolliza al aprovechamiento vigente — o declararla como madera ya aserrada.`
              : "Toda la aserrada cubicada quedó respaldada por algún bloque."}
            m3={balance.faltaM3}
            pt={balance.faltaPt}
            piezas={balance.faltaPiezas}
            tono={balance.faltaM3 > TOL_M3 ? "falta" : "ok"}
          />
        </div>
      )}

      {revisionAbierta && bloques.length > 0 && (
        <PanelRevision hallazgos={hallazgos} onCerrar={() => setRevisionAbierta(false)} />
      )}

      <AlertaDescuadre libreM3={t.libreM3} faltanteM3={t.faltanteM3} diagnostico={diagnostico} />

      {opcionesAbiertas && (
        <OpcionesExportacion
          firmaNombre={firmaNombre} onFirmaNombre={guardarFirmaNombre}
          firmaCargo={firmaCargo} onFirmaCargo={guardarFirmaCargo}
          especies={dist.especies.map((e) => e.especie)}
          soloEspecies={soloEspecies} setSoloEspecies={setSoloEspecies}
        />
      )}

      {/* ── Lo que entró ───────────────────────────────────────────────────── */}
      <div className="mb-4 rounded-xl border border-[var(--rule-soft)] bg-[var(--surface-canvas)] p-3">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          {/* Lo que entró → lo que AMPARA DE VERDAD. Antes cerraba con la
              capacidad (`capacidadM3`), que es un techo teórico: el rótulo
              prometía 15.250 m³ mientras el reparto había asignado 3.264. */}
          <span className="flex items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
            Lo que entró{" "}
            {bloques.length > 0 && (
              <>
                · {fmtM3(t.rollizaM3)} m³ (R)
                {/* Los dos volúmenes NO se suman: troza y tabla no se miden igual. */}
                {t.aserradaDirectaM3 > 0 && ` + ${fmtM3(t.aserradaDirectaM3)} m³ (A) directos`}
                {" "}→ ampara <b className="text-[var(--accent-ink)] dark:text-[var(--accent)]">{fmtM3(t.amparadaM3)} m³ (A)</b>
                <AdminTooltip
                  className="max-w-[280px] text-sm font-normal normal-case leading-relaxed tracking-normal"
                  content={<>Es lo que el reparto asignó <b>de verdad</b> a los bloques, no su techo. Entre todos podrían amparar hasta <b>{fmtM3(t.capacidadM3)} m³</b>; se usaron <b>{fmtM3(t.amparadaM3)} m³</b> porque es toda la aserrada cubicada que había para repartir.</>}
                >
                  <button type="button" aria-label="Cómo se calcula lo amparado" className="align-middle text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)] print:hidden">
                    <Info className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </AdminTooltip>
              </>
            )}
          </span>
          <div className="flex flex-wrap gap-2 print:hidden">
            <button type="button" onClick={traerDeTrozas} disabled={hayTrozas === 0} title={hayTrozas === 0 ? "No hay trozas cubicadas en este dispositivo" : `Traer ${hayTrozas} trozas ya cubicadas`} className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40">
              <Layers className="h-3.5 w-3.5" /> Traer del cubicador de trozas{hayTrozas > 0 ? ` (${hayTrozas})` : ""}
            </button>
            <ModuleActionMenu
              label="Agregar bloque"
              align="end"
              className="h-auto rounded-lg border-2 px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              items={[
                { label: "Rolliza nueva", icon: TreePine, description: "La forma de siempre: m³ (R) de troza × % aprovechable", onClick: agregarBloqueManual },
                { label: "Madera ya aserrada", icon: Ruler, description: "Sin troza de origen: cargás m³ (A) y piezas, y se le reparten las medidas", onClick: agregarBloqueAserrada },
                { label: "Paquete ya declarado…", icon: Boxes, description: "Elegilo del Libro: baja con su m³ y sus piezas, sin retipear", onClick: () => setMostrarPaquetes(true) },
                { label: "Importar planilla…", icon: FileSpreadsheet, description: "Pegá el rango de Excel o subí el .xlsx/.csv: una fila, un bloque", onClick: () => setMostrarImportar(true) },
                ...(lotesConRolliza.length > 0
                  ? lotesConRolliza.map(
                      (x, i): ModuleActionItem => ({
                        label: `Lote ${x.lote.code}`,
                        icon: Boxes,
                        description: `${x.lote.speciesCommon || "Sin especie"}${x.permiso ? ` · ${x.permiso}` : ""} · ${fmtM3(x.m3)} m³ ${x.esMargen ? "restante para declarar (56%)" : "rolliza sin aserrar"}`,
                        dividerBefore: i === 0,
                        onClick: () => agregarBloqueDeLote(x.lote, x.m3, x.aprovechablePct, x.permiso, x.esMargen),
                      }),
                    )
                  : [{ label: "Sin lotes con volumen restante", icon: Boxes, disabled: true, dividerBefore: true } satisfies ModuleActionItem]),
              ]}
            />
            {/* Guardar/abrir la distribución de bloques (Brandon, 2026-09-01):
                mismo patrón que "Guardadas" en el Cubicador de madera — vive
                en el servidor para verse desde otro lado después. */}
            <button
              type="button"
              onClick={() => setMostrarGuardar((v) => !v)}
              disabled={bloques.length === 0}
              title={bloques.length === 0 ? "Cargá al menos un bloque para guardar" : distribucionActual ? `Actualizar «${distribucionActual.nombre}»` : "Guardar esta distribución con un nombre"}
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)] disabled:opacity-40"
            >
              <Save className="h-3.5 w-3.5" /> {distribucionActual ? "Actualizar" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => setMostrarGuardadas((v) => !v)}
              title="Ver las distribuciones guardadas"
              className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1 text-xs font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            >
              <FolderOpen className="h-3.5 w-3.5" /> Guardadas
            </button>
          </div>
        </div>

        {distribucionActual && (
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
            <FolderOpen className="h-3.5 w-3.5" aria-hidden /> Editando la distribución guardada «{distribucionActual.nombre}» — «Actualizar» la pisa, o guardá con otro nombre para crear una nueva.
          </p>
        )}

        {guardadoOkDistribucion && (
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 border-[var(--data-success-500)] bg-[var(--data-success-100)] px-3 py-2 dark:bg-[var(--data-success-500)]/12">
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
              <Check className="h-4 w-4" /> Distribución guardada como «{guardadoOkDistribucion}».
            </span>
            <button type="button" onClick={() => { setMostrarGuardadas(true); setGuardadoOkDistribucion(null); }} className="rounded-lg border border-[var(--data-success-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-xs font-bold text-[var(--data-success-700)] hover:brightness-95 dark:text-[var(--data-success-500)]">
              Ver guardadas
            </button>
          </div>
        )}

        {mostrarGuardar && (
          <div className="mb-3 rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] p-3">
            <p className="mb-2 text-sm font-bold text-[var(--text-primary)]">
              {distribucionActual ? `Actualizar «${distribucionActual.nombre}»` : "Guardar esta distribución"}
            </p>
            {errorGuardarDistribucion && (
              <p className="mb-2 flex items-center gap-1.5 rounded-lg border border-[var(--data-error-500)] bg-[var(--data-error-50)] px-2.5 py-1.5 text-xs font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {errorGuardarDistribucion}
              </p>
            )}
            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block sm:col-span-2">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Nombre</span>
                <input
                  value={formGuardar.nombre}
                  onChange={(e) => setFormGuardar({ ...formGuardar, nombre: e.target.value })}
                  placeholder={nombreSugeridoDistribucion(bloques)}
                  maxLength={120}
                  aria-label="Nombre de la distribución"
                  className="mt-1 h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Fecha</span>
                <input
                  type="date"
                  value={formGuardar.fecha}
                  onChange={(e) => setFormGuardar({ ...formGuardar, fecha: e.target.value || hoyISO() })}
                  aria-label="Fecha de la distribución"
                  className="mt-1 h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
              <label className="block sm:col-span-3">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Notas (opcional)</span>
                <input
                  value={formGuardar.notas}
                  onChange={(e) => setFormGuardar({ ...formGuardar, notas: e.target.value })}
                  placeholder="Semana 36, falta la GTF del segundo camión"
                  maxLength={600}
                  aria-label="Notas de la distribución"
                  className="mt-1 h-10 w-full rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => void guardarDistribucion()} disabled={guardandoDistribucion}
                className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:brightness-95 disabled:opacity-50">
                {guardandoDistribucion ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {guardandoDistribucion ? "Guardando…" : distribucionActual ? "Actualizar" : "Guardar"}
              </button>
              <button type="button" onClick={() => setMostrarGuardar(false)} className="h-10 rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-secondary)] hover:text-[var(--text-primary)]">
                Cancelar
              </button>
              <span className="text-xs text-[var(--text-tertiary)]">Queda en tu cuenta: la ves desde cualquier dispositivo.</span>
            </div>
          </div>
        )}

        {mostrarGuardadas && (
          <div className="mb-3">
            <DistribucionesGuardadas onAbrir={abrirDistribucion} onCerrar={() => setMostrarGuardadas(false)} recargarToken={historialDistribucionesToken} />
          </div>
        )}

        {mostrarPaquetes && (
          <RepartoPaquetesPicker
            yaCargados={new Set(bloques.map((b) => b.paqueteId).filter((x): x is string => !!x))}
            onAgregar={agregarBloquesDePaquetes}
            onCerrar={() => setMostrarPaquetes(false)}
          />
        )}

        {bloques.length === 0 ? (
          <p className="py-3 text-center text-sm text-[var(--text-tertiary)]">
            Cargá la rolliza que entró (GTF, lote o troza) para distribuirla sobre lo que salió aserrado — o, si la
            madera ya vino aserrada, agregá un bloque de <b>Madera ya aserrada</b> y poné directamente su m³ y sus piezas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              aria-label="Bloques de rolliza y de madera ya aserrada"
              className="w-full text-base"
              /* El ancho mínimo se calcula con las columnas VISIBLES: con un
                 `min-w` fijo, esconder media tabla dejaba el mismo scroll
                 horizontal de antes y el ejercicio no servía de nada. */
              style={{ minWidth: `${anchoTabla}px` }}
            >
              <thead>
                {/* Cabeceras a 12 px y en `--text-secondary` (Brandon,
                    2026-09-02: «los títulos de la columna, más claros y
                    grandes»): venían en `--ts-2xs` = 9 px medidos y en el gris
                    más flojo de la escala, así que la fila que dice qué es
                    cada columna era la menos legible de la tabla. */}
                <tr className="border-b border-[var(--rule-base)] text-left text-xs font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  <ThAyuda alinear="left" ayuda="El número de guía (GTF) o el código del lote de la troza que entró. Sirve para rastrear de dónde salió este bloque. La franja de color de la izquierda es la de su tarjeta en el desglose de abajo.">
                    Etiqueta (GTF / lote)
                  </ThAyuda>
                  {cabeceras.filter((c) => cols[c.key]).map((c) => <Fragment key={c.key}>{c.node}</Fragment>)}
                  <th className="px-3 py-3" />
                </tr>
              </thead>
              <tbody>
                {bloques.map((b) => {
                  const ap = aprovechableDe(b);
                  /** Madera que ya vino aserrada: su m³ ES el amparado, sin % de por medio. */
                  const directa = esAserradaDirecta(b);
                  /* % REAL: usado ÷ m³ propio del bloque, ya después de repartir
                     — un dato DERIVADO (nunca se declara como si fuera el %
                     supuesto de al lado; ver el `ThAyuda` de la cabecera). */
                  const bDist = bloquesDistribuidos.find((x) => x.b.bloque.id === b.id)?.b;
                  const pctReal = bDist && b.m3 > 0 ? (bDist.usadoM3 / b.m3) * 100 : null;
                  /**
                   * Lo que el reparto le asignó DE VERDAD a este bloque
                   * (Brandon, 2026-09-01: «el ampara quiero que se ponga según
                   * lo que se distribuyó, lo real en el bloque, y también la
                   * cantidad de piezas»).
                   *
                   * No reemplaza a las casillas de al lado —«Ampara» y
                   * «Piezas» son ENTRADAS: el techo que se le pone al bloque—
                   * sino que se muestra debajo de cada una. Un bloque puede
                   * amparar 6 m³ y haber recibido 4.2 porque no había más
                   * aserrada de esa especie: ese hueco es justo lo que había
                   * que poder ver sin bajar al desglose.
                   */
                  const realM3 = bDist ? bDist.usadoM3 : null;
                  const realPiezas = bDist ? bDist.asignado.reduce((a, g) => a + g.piezas, 0) : null;
                  /* Tolerancia en la unidad del negocio (1 litro), no en el
                     epsilon del float: sobre 3 decimales de m³, un 0.0001
                     pintaría de amarillo bloques que están perfectos. */
                  const sobraCapacidad = bDist != null && bDist.libreM3 > TOL_M3;
                  /**
                   * Que a un bloque le sobre capacidad es lo NORMAL —casi
                   * siempre entra más rolliza de la que hay aserrada
                   * cubicada—, así que pintar de ámbar el número real por eso
                   * dejaba la columna entera en ámbar y la alerta perdía todo
                   * su valor (la lección de los «siete rojos falsos»). El
                   * sobrante se avisa en el «tope», que es donde importa.
                   *
                   * Lo que SÍ es un problema es un bloque que teniendo
                   * capacidad no amparó NADA: su Anexo 04 saldría vacío.
                   */
                  const bloqueSinAmparar = bDist != null && bDist.capacidadM3 > TOL_M3 && bDist.usadoM3 <= TOL_M3;
                  /* El texto se arma acá y no en el JSX para no necesitar un
                     `!` sobre `bDist`: la implicación «hay real ⇒ hay bloque
                     distribuido» es cierta, pero el compilador no la ve. */
                  const tituloAmpara = bDist == null
                    ? ""
                    : sobraCapacidad
                      ? `Suma exacta de las medidas que se le distribuyeron: ${fmtM3(bDist.usadoM3)} m³. Este bloque podría amparar hasta ${fmtM3(bDist.capacidadM3)} m³ (su máximo), así que le quedan ${fmtM3(bDist.libreM3)} m³ sin usar.`
                      : "Suma exacta de las medidas que se le distribuyeron. Llegó justo a su máximo.";
                  const celdas: { key: ColReparto; node: ReactNode }[] = [
                    {
                      key: "tipo",
                      /* Cambiar de forma acá reescribe la fila entera: el %
                         aprovechable y el «ampara a mano» dejan de aplicar. */
                      node: (
                        <td className="px-3 py-2.5">
                          <select
                            value={directa ? "aserrada" : "rolliza"}
                            onChange={(e) => editar(b.id, "tipo", e.target.value)}
                            aria-label={`Cómo se cargó el bloque ${b.etiqueta || "sin etiqueta"}`}
                            title={directa ? "Madera que ya vino aserrada: el m³ cargado es el que ampara" : "Troza: el m³ se convierte en aserrada por el % aprovechable"}
                            /* El acento marca la fila que NO es la de siempre.
                               Un segundo color de token no sirve acá: dentro del
                               panel admin la familia «info» está redefinida al
                               MISMO teal del acento (medido con
                               getComputedStyle), así que el color se perdía sin
                               que nada fallara. */
                            className={`h-10 w-full min-w-[150px] rounded-lg border-2 bg-[var(--surface-raised)] px-1 text-sm font-bold outline-none focus:border-[var(--accent)] ${directa ? "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`}
                          >
                            <option value="rolliza">Rolliza (troza)</option>
                            <option value="aserrada">Aserrada directa</option>
                          </select>
                        </td>
                      ),
                    },
                    {
                      key: "permiso",
                      node: (
                        <td className="px-3 py-2.5">
                          <input value={b.permiso ?? ""} onChange={(e) => editar(b.id, "permiso", e.target.value)} placeholder="19-SEC/REG-…" aria-label="N° de permiso de origen del bloque" title="Título habilitante de origen — dos permisos de la misma especie nunca se combinan en el desglose de abajo" className="h-10 w-full min-w-[130px] rounded-lg border-2 border-dashed border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 font-mono text-sm text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]" />
                        </td>
                      ),
                    },
                    {
                      key: "especie",
                      node: (
                        <td className="px-3 py-2.5">
                          <select value={b.especie} onChange={(e) => editar(b.id, "especie", e.target.value)} aria-label="Especie del bloque" className="h-10 w-full min-w-[110px] rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 text-sm font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]">
                            <option value="">Sin especie</option>
                            {ESPECIES_MADERA.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      ),
                    },
                    {
                      key: "m3",
                      node: (
                        <td className="px-3 py-2.5">
                          <input
                            value={valorTexto(b.id, "m3", b.m3, false)}
                            onChange={onCambioDecimal(b.id, "m3")}
                            onBlur={onBlurDecimal(b.id, "m3")}
                            inputMode="decimal"
                            placeholder={directa ? "8" : "20"}
                            aria-label={directa ? "Metros cúbicos de madera ya aserrada" : "Metros cúbicos de rolliza"}
                            title={directa ? "m³ (A): la madera ya aserrada que entró. Es exactamente lo que este bloque ampara." : "m³ (R): la troza tal como llegó, antes de aserrar."}
                            className={`h-10 w-24 rounded-lg border-2 bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold tabular-nums outline-none focus:border-[var(--accent)] ${directa ? "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`}
                          />
                        </td>
                      ),
                    },
                    {
                      key: "dias",
                      /* Un día es lo normal; el placeholder lo dice sin
                         escribirlo, igual que el % aprovechable. */
                      node: (
                        <td className="px-3 py-2.5">
                          <input value={b.dias ?? ""} onChange={(e) => editar(b.id, "dias", e.target.value)} inputMode="numeric" placeholder="1" aria-label="Días de aserrío del bloque" title="Se reparte lo amparado entre estas jornadas" className={`h-10 w-16 rounded-lg border-2 bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold tabular-nums outline-none focus:border-[var(--accent)] ${b.dias == null || b.dias <= 1 ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`} />
                        </td>
                      ),
                    },
                    {
                      key: "fecha",
                      node: (
                        <td className="px-3 py-2.5">
                          <input
                            type="date"
                            value={b.fecha ?? ""}
                            onChange={(e) => editar(b.id, "fecha", e.target.value)}
                            aria-label="Fecha en que se aserró el bloque"
                            title="El día que va al Libro de Operaciones — con más de un día, el día en que arrancó"
                            className={`h-10 w-[9.5rem] rounded-lg border-2 bg-[var(--surface-raised)] px-2 font-mono text-sm font-bold tabular-nums outline-none focus:border-[var(--accent)] ${!b.fecha ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`}
                          />
                        </td>
                      ),
                    },
                    {
                      key: "aprovechable",
                      /* El placeholder muestra el default en vez de escribirlo:
                         un 55 tipeado se lee como un dato medido, y es un supuesto.
                         En un bloque de aserrada directa no hay nada que
                         aprovechar: la madera ya salió de la sierra. Un input
                         editable ahí prometería una conversión que el reparto no hace. */
                      node: (
                        <td className="px-3 py-2.5">
                          {directa ? (
                            <span className="block text-right font-mono text-sm tabular-nums text-[var(--text-tertiary)]" title="No aplica: la madera ya vino aserrada">—</span>
                          ) : (
                            <input value={valorTexto(b.id, "aprovechablePct", b.aprovechablePct, true)} onChange={onCambioDecimal(b.id, "aprovechablePct")} onBlur={onBlurDecimal(b.id, "aprovechablePct")} inputMode="decimal" placeholder={String(APROVECHABLE_DEFAULT)} aria-label="Porcentaje aprovechable del bloque" title={b.aprovechablePct == null ? `Supuesto: ${APROVECHABLE_DEFAULT} % (centro del rango normal de aserrío). Escribí el tuyo.` : undefined} className={`h-10 w-20 rounded-lg border-2 bg-[var(--surface-raised)] px-2 text-right font-mono text-sm font-bold tabular-nums outline-none focus:border-[var(--accent)] ${b.aprovechablePct == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--rule-base)] text-[var(--text-primary)]"}`} />
                          )}
                        </td>
                      ),
                    },
                    {
                      key: "pctReal",
                      /* Sólo lectura: es un DERIVADO del reparto (usado ÷ m³),
                         no un dato que se tipee — tipearlo sería fabricar el
                         mismo número que ya calcula el reparto de abajo. */
                      node: (
                        <td className="px-3 py-2.5 text-right font-mono text-sm tabular-nums text-[var(--text-secondary)]" title={directa ? "Qué parte del m³ (A) cargado alcanzó a cubrirse con piezas reales, después de repartir — derivado, no editable" : "Usado ÷ m³ de rolliza, después de repartir — derivado, no editable"}>
                          {pctReal == null ? "—" : `${fmtPct(pctReal)} %`}
                        </td>
                      ),
                    },
                    {
                      key: "ampara",
                      /* Editable: lo MEDIDO le gana al porcentaje supuesto. El
                         placeholder muestra lo que calcularía el sistema.
                         Aserrada directa: ampara su propio m³. Se muestra, no se
                         edita — dos casillas para el mismo número son dos formas
                         de contradecirse. */
                      node: (
                        <td className="px-3 py-2.5">
                          {/* Arriba, grande: lo que el reparto asignó de verdad
                              — el m³ que van a sumar las piezas del Anexo 04. */}
                          <RealDeBloque
                            valor={realM3 == null ? "—" : fmtM3(realM3)}
                            unidad={realM3 == null ? undefined : "m³"}
                            alerta={bloqueSinAmparar}
                            titulo={tituloAmpara}
                          />
                          {/* Abajo, chico: el techo. En aserrada directa no se
                              edita — es el mismo m³ (A) que ya se cargó, y dos
                              casillas para el mismo número son dos formas de
                              contradecirse. */}
                          <TopeDeBloque alerta={sobraCapacidad} titulo={directa
                            ? "Máximo del bloque: el mismo m³ (A) que cargaste, porque la madera ya vino aserrada. No es lo amparado — lo amparado es el número de arriba."
                            : "Máximo del bloque: hasta acá puede llegar (m³ de troza × % aprovechable). NO es lo que ampara: lo amparado es el número de arriba, la suma de las medidas distribuidas. Escribí otro si querés bajarle el techo a mano."}>
                            {directa ? (
                              <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-tertiary)]">{fmtM3(Number(b.m3) || 0)}</span>
                            ) : (
                              <input
                                value={valorTexto(b.id, "amparaManualM3", b.amparaManualM3, true)}
                                onChange={onCambioDecimal(b.id, "amparaManualM3")}
                                onBlur={onBlurDecimal(b.id, "amparaManualM3")}
                                inputMode="decimal"
                                placeholder={fmtM3((Number(b.m3) || 0) * (ap / 100))}
                                aria-label="Tope de metros cúbicos que puede amparar el bloque"
                                className={`h-7 w-24 rounded-md border bg-[var(--surface-raised)] px-1.5 text-right font-mono text-xs font-bold tabular-nums outline-none focus:border-[var(--accent)] ${b.amparaManualM3 == null ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]" : "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]"}`}
                              />
                            )}
                          </TopeDeBloque>
                        </td>
                      ),
                    },
                    {
                      key: "piezas",
                      node: (
                        <td className="px-3 py-2.5">
                          {/* Las piezas REALES son las que se van a imprimir,
                              una por una, en el Anexo 04: van grandes. */}
                          <RealDeBloque
                            valor={realPiezas == null ? "—" : fmtPiezas(realPiezas)}
                            unidad={realPiezas == null ? undefined : "pzas"}
                            /* Sólo es un aviso cuando se pidió un tope y el
                               reparto no lo alcanzó: sin tope («todas»), que
                               entren menos piezas no es un descuadre. */
                            alerta={realPiezas != null && b.piezasManual != null && realPiezas < b.piezasManual}
                            titulo={realPiezas != null && b.piezasManual != null && realPiezas < b.piezasManual
                              ? `Pediste ${fmtPiezas(b.piezasManual)} piezas y el reparto sólo encontró ${fmtPiezas(realPiezas)} de esa especie.`
                              : "Las piezas que el reparto le asignó de verdad a este bloque — una por una, las que salen en el Anexo 04."}
                          />
                          <TopeDeBloque titulo={directa
                            ? "Máximo de piezas: cuántas contaste en esta madera ya aserrada. Vacío = las que entren por volumen."
                            : "Máximo de piezas que se lleva este bloque. Vacío = las que entren por volumen. Las que realmente le tocaron son el número de arriba."}>
                            <input
                              value={b.piezasManual ?? ""}
                              onChange={(e) => editar(b.id, "piezasManual", e.target.value)}
                              inputMode="numeric"
                              placeholder="todas"
                              aria-label={directa ? "Piezas de la madera ya aserrada" : "Tope de piezas del bloque"}
                              className={`h-7 w-16 rounded-md border bg-[var(--surface-raised)] px-1.5 text-right font-mono text-xs font-bold tabular-nums outline-none focus:border-[var(--accent)] ${b.piezasManual == null
                                ? "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)]"
                                : "border-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]"}`}
                            />
                          </TopeDeBloque>
                        </td>
                      ),
                    },
                    {
                      key: "costo",
                      node: (
                        <td className="px-3 py-2.5">
                          <input value={valorTexto(b.id, "costoM3", b.costoM3, true)} onChange={onCambioDecimal(b.id, "costoM3")} onBlur={onBlurDecimal(b.id, "costoM3")} inputMode="decimal" placeholder="opcional" aria-label="Costo por metro cúbico de rolliza" className="h-10 w-24 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-right font-mono text-sm tabular-nums text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
                        </td>
                      ),
                    },
                    {
                      key: "grupos",
                      node: (
                        <td className="px-3 py-2.5">
                          <FiltroGruposCelda
                            valor={b.gruposFiltro}
                            disponibles={gruposDisponibles}
                            dim={dim}
                            onChange={(next) => setGruposFiltro(b.id, next)}
                          />
                        </td>
                      ),
                    },
                    {
                      key: "largo",
                      node: (
                        <td className="px-3 py-2.5">
                          <FiltroLargoCelda
                            valor={b.largoFiltro}
                            onChange={(next) => setLargoFiltro(b.id, next)}
                          />
                        </td>
                      ),
                    },
                    {
                      key: "anexo",
                      node: (
                        <td className="px-3 py-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={seleccionAnexo.has(b.id)}
                            onChange={() => alternarSeleccionAnexo(b.id)}
                            aria-label={`Juntar el bloque ${b.etiqueta || "sin etiqueta"} en un Anexo 04 conjunto`}
                            title="Juntar este bloque con otros en un solo Anexo 04"
                            className="h-5 w-5 accent-[var(--accent)]"
                          />
                        </td>
                      ),
                    },
                  ];
                  return (
                    /* Reglas finas y un hover apenas perceptible: con
                       `border-t-2` cada fila se leía como una tarjeta suelta y
                       la tabla parecía tres tablas. */
                    <tr key={b.id} className="border-t border-[var(--rule-soft)] transition-colors hover:bg-[var(--surface-sunken)]/60">
                      {/* La franja de color es la MISMA que lleva la tarjeta de
                          este bloque en el desglose de abajo: aparear las dos
                          vistas dejó de exigir leer la etiqueta en las dos. */}
                      <td className="border-l-[5px] py-2.5 pl-2 pr-3" style={{ borderLeftColor: colorDeBloque(indiceBloque.get(b.id)) }}>
                        <input value={b.etiqueta} onChange={(e) => editar(b.id, "etiqueta", e.target.value)} placeholder={directa ? "Compra 12/08" : "GTF-0231"} aria-label="Etiqueta del bloque de rolliza" className="h-10 w-full min-w-[140px] rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]" />
                      </td>
                      {celdas.filter((c) => cols[c.key]).map((c) => <Fragment key={c.key}>{c.node}</Fragment>)}
                      <td className="px-3 py-2.5 text-right">
                        <button type="button" onClick={() => quitarBloque(b.id)} aria-label={`Quitar el bloque ${b.etiqueta || "sin etiqueta"}`} className="text-[var(--text-tertiary)] hover:text-[var(--data-error-600)]">
                          <Trash2 className="h-5 w-5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {/* El cierre de la tabla: cuánta rolliza entró y cuánto ampara en
                  total. Es la primera comparación que se hace y estaba sólo en
                  el rótulo de arriba. */}
              <tfoot>
                <tr className="border-t-2 border-[var(--accent)]/40 bg-primary/10 text-base font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                  {/* La etiqueta más las columnas de identidad que sigan
                      visibles (cargado como · permiso · especie): con el
                      `colSpan={4}` fijo de antes, esconder una de las tres
                      corría el total medio ancho de columna. */}
                  <th scope="row" colSpan={colSpanIdentidad} className="border-l-[5px] border-l-transparent py-3 pl-2 pr-3 text-left">
                    Total · {bloques.length} bloque{bloques.length === 1 ? "" : "s"}
                  </th>
                  {pieCeldas.filter((c) => cols[c.key]).map((c) => <Fragment key={c.key}>{c.node}</Fragment>)}
                  <td className="px-3 py-3" />
                </tr>
              </tfoot>
            </table>
            <datalist id="largos-disponibles">
              {largosDisponibles.map((l) => <option key={l} value={l} />)}
            </datalist>
          </div>
        )}
        {/* Antes era un renglón de texto suelto bajo la tabla. Ahora es un ⓘ:
            la regla se lee una vez y después sólo estorba. */}
        {bloques.length > 1 && (
          <AdminTooltip content="Los bloques se llenan en el orden en que están cargados: lo que no entra en el primero pasa al siguiente, y lo que no entra en ninguno queda en «Falta por distribuir». No es un prorrateo." className="max-w-[280px] text-sm font-normal leading-relaxed">
            <button type="button" className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-[var(--text-tertiary)] transition-colors hover:text-[var(--accent)]">
              <ArrowDown className="h-3.5 w-3.5" aria-hidden /> Se llenan en orden
              <Info className="h-3.5 w-3.5" aria-hidden />
            </button>
          </AdminTooltip>
        )}
        {/*
          Acceso directo al sobrante (Brandon, 2026-09-01: "que añada una fila
          antes del total... con las funciones de esa tabla — escoger, abrir
          el Anexo 04"): CLIC explícito, nunca automático — un intento con
          `useEffect` auto-agregando esta misma fila terminó, probado en esta
          sesión, pisando bloques REALES ya cargados (una carrera con la
          hidratación desde `localStorage`/`abrirDistribucion`, imposible de
          blindar del todo sin arriesgar el mismo dato que el módulo existe
          para proteger). `agregarBloqueSugerido` es el MISMO helper del botón
          «Agregar bloque de X m³» de más abajo — sólo que acá queda a la
          vista, junto a la tabla que se está mirando, sin bajar a buscarlo.
        */}
        {dist.especies.some((e) => e.rollizaFaltanteM3 > 0) && (
          <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border-2 border-dashed border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/8 px-3 py-2 print:hidden">
            <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]" aria-hidden />
            <span className="text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              Sobra aserrada sin respaldo — cubrila con:
            </span>
            {/* Dos formas de taparlo, y la elección no es cosmética: pedir
                TROZA (m³ (R), pasa por el % aprovechable) o declarar que esa
                madera YA vino aserrada (m³ (A) tal cual). Los dos botones
                cargan el número exacto de su propia unidad. */}
            {dist.especies.filter((e) => e.rollizaFaltanteM3 > 0).map((e) => (
              <span key={e.especie || "sin-especie"} className="inline-flex flex-wrap items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => agregarBloqueSugerido(e.especie, e.rollizaFaltanteM3)}
                  title={`Agrega una fila arriba con ${e.especie || "sin especie"} y ${fmtM3(e.rollizaFaltanteM3)} m³ de ROLLIZA ya cargados — la troza que haría falta al aprovechamiento vigente. Completá la etiqueta (GTF/lote) con la guía real cuando llegue.`}
                  className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--data-warning-500)] bg-[var(--surface-raised)] px-2.5 py-1 text-sm font-bold text-[var(--data-warning-700)] transition-colors hover:brightness-95 dark:text-[var(--data-warning-500)]"
                >
                  <TreePine className="h-3.5 w-3.5" aria-hidden /> {e.especie || "Sin especie"} · {fmtM3(e.rollizaFaltanteM3)} m³ (R)
                </button>
                <button
                  type="button"
                  onClick={() => agregarBloqueAserradaSugerido(e.especie, e.faltanteM3)}
                  title={`Agrega una fila arriba con ${e.especie || "sin especie"} y ${fmtM3(e.faltanteM3)} m³ de madera YA ASERRADA — sin troza de origen, para cuando esa madera se compró aserrada o viene de inventario.`}
                  className="inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-[var(--accent)] bg-[var(--surface-raised)] px-2.5 py-1 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:brightness-95 dark:text-[var(--accent)]"
                >
                  <Ruler className="h-3.5 w-3.5" aria-hidden /> ya aserrada · {fmtM3(e.faltanteM3)} m³ (A)
                </button>
              </span>
            ))}
          </div>
        )}
        {/* ── Juntar bloques marcados en un solo Anexo 04 ──────────────────── */}
        {seleccionAnexo.size > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border-2 border-[var(--accent)] bg-primary/5 px-3 py-2 print:hidden">
            <Combine className="h-4 w-4 shrink-0 text-[var(--accent)]" aria-hidden />
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {combinadoAnexo.cantidad} bloque{combinadoAnexo.cantidad === 1 ? "" : "s"} marcado{combinadoAnexo.cantidad === 1 ? "" : "s"}
              <span className="ml-1 font-normal text-[var(--text-tertiary)]">
                ({combinadoAnexo.etiqueta || "sin etiqueta"} · ampara {fmtM3(combinadoAnexo.amparaM3)} m³)
              </span>
            </span>
            {/* Lo YA distribuido de estos bloques — la misma cuenta que va al
                Anexo 04, para saber de un vistazo cuánto junta antes de abrirlo. */}
            <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-0.5 whitespace-nowrap font-mono text-xs font-bold tabular-nums text-[var(--text-secondary)]">
              <span>{fmtPiezas(combinadoAnexo.piezasCant)} <span className="font-sans font-normal text-[var(--text-tertiary)]">piezas</span></span>
              <span>{fmtPt(combinadoAnexo.pieTablar)} <span className="font-sans font-normal text-[var(--text-tertiary)]">PT</span></span>
              <span>{fmtM3(combinadoAnexo.m3Aserrado)} <span className="font-sans font-normal text-[var(--text-tertiary)]">m³ aserrados</span></span>
            </span>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={() => guardarSeleccionAnexo(new Set())}
                className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                <X className="h-3.5 w-3.5" aria-hidden /> Limpiar
              </button>
              <button
                type="button"
                disabled={combinadoAnexo.piezas.length === 0}
                title={combinadoAnexo.piezas.length === 0 ? "Los bloques marcados todavía no tienen piezas asignadas" : "Abrir un solo Anexo 04 con las piezas de todos los bloques marcados"}
                onClick={() => setAnexoDe({
                  piezas: combinadoAnexo.piezas,
                  especie: combinadoAnexo.especies.length === 1 ? combinadoAnexo.especies[0] : "",
                  etiqueta: combinadoAnexo.etiqueta,
                  procedencia: combinadoAnexo.procedencia,
                })}
                className="inline-flex h-9 items-center gap-1.5 rounded-xl border-2 border-[var(--accent)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:bg-primary/10 disabled:opacity-40 dark:text-[var(--accent)]"
              >
                <FileText className="h-4 w-4" aria-hidden /> Anexo 04 conjunto
              </button>
            </div>
          </div>
        )}
      </div>

      {errorBajar && (
        <p className="mb-3 rounded-lg border-2 border-[var(--data-error-500)] px-3 py-2 text-sm text-[var(--data-error-600)] dark:text-[var(--data-error-500)]">
          No se pudo generar el archivo: {errorBajar}
        </p>
      )}

      {/* ── Lo que no cruza ────────────────────────────────────────────────── */}
      {(dist.rollizaHuerfana.length > 0 || dist.aserradaHuerfana.length > 0) && (
        <ul className="mb-3 space-y-1">
          {dist.rollizaHuerfana.map((h) => (
            <li key={`r-${h.especie}`} className="flex items-start gap-2 text-sm text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span><b>{fmtM3(h.m3)} m³ de {h.especie}</b> entraron en troza y no hay aserrada de esa especie.</span>
            </li>
          ))}
          {dist.aserradaHuerfana.map((h) => (
            <li key={`a-${h.especie}`} className="flex items-start gap-2 text-sm text-[var(--data-warning-600)] dark:text-[var(--data-warning-500)]">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              <span><b>{fmtM3(h.m3)} m³ de {h.especie}</b> aserrados sin rolliza declarada: quedan enteros en el faltante.</span>
            </li>
          ))}
        </ul>
      )}

      {dist.especies.map((e) => (
        <BloqueEspecie
          key={e.especie}
          e={e}
          dim={dim}
          conCosto={conCosto}
          indiceBloque={indiceBloque}
          marcadas={marcadas}
          marcar={marcar}
          onAnexo={(b) => setAnexoDe({
            piezas: piezasDelBloque(b, e.especie),
            especie: e.especie,
            etiqueta: b.bloque.etiqueta || "Sin etiqueta",
            procedencia: esAserradaDirecta(b.bloque) ? { rolliza: 0, aserradaDirecta: 1 } : { rolliza: 1, aserradaDirecta: 0 },
          })}
          editarBloque={editar}
          valorTexto={valorTexto}
          onCambioDecimal={onCambioDecimal}
          onBlurDecimal={onBlurDecimal}
          onAgregarBloqueSugerido={agregarBloqueSugerido}
          onEditarLinea={editarLinea}
          valorTextoLinea={valorTextoLinea}
          onCambioDecimalLinea={onCambioDecimalLinea}
          onBlurDecimalLinea={onBlurDecimalLinea}
        />
      ))}

      {/* ── El diferenciador: lo repartido contra lo que falta ─────────────── */}
      {(t.aserradaM3 > 0 || t.faltanteM3 > 0) && (
        <div className="mb-4 space-y-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
            <Scale className="h-4 w-4 text-[var(--accent)]" aria-hidden /> Cuánto falta por distribuir
          </span>
          <DiferenciaDistribucion dist={dist} dim={dim} />
        </div>
      )}

      {/* ── El cierre general ──────────────────────────────────────────────── */}
      {(t.rollizaM3 > 0 || t.aserradaM3 > 0) && (
        <div className={`grid grid-cols-2 gap-2 ${t.aserradaDirectaM3 > 0 ? "sm:grid-cols-3 xl:grid-cols-5" : "sm:grid-cols-4"}`}>
          <KpiResumen label="Rolliza que entró" value={fmtM3(t.rollizaM3)} unidad="m³" hint={`ampara ${fmtM3(capacidadRollizaM3)} m³`} />
          {/* Aparece sólo si hay: un KPI en 0 permanente enseña a ignorar la fila. */}
          {t.aserradaDirectaM3 > 0 && (
            <KpiResumen
              label="Aserrada directa"
              value={fmtM3(t.aserradaDirectaM3)}
              unidad="m³"
              hint={`sin troza · ampara ${fmtM3(t.amparadaDirectaM3)} m³`}
            />
          )}
          <KpiResumen label="Aserrada amparada" value={fmtM3(t.amparadaM3)} unidad="m³" hint={`de ${fmtM3(t.aserradaM3)} m³ producidos`} />
          <KpiResumen
            label="Falta por distribuir"
            value={fmtM3(t.faltanteM3)}
            unidad="m³"
            hint={t.faltanteM3 > 0 ? `pide ${fmtM3(t.rollizaFaltanteM3)} m³ de troza` : "todo tiene respaldo"}
            tono={t.faltanteM3 > 0 ? TONO.warning : TONO.success}
          />
          <KpiResumen
            label="Rendimiento general"
            value={t.rendimientoPct == null ? "—" : fmtPct(t.rendimientoPct)}
            unidad={t.rendimientoPct == null ? undefined : "%"}
            /* El real y el aprovechable declarado son dos números distintos y la
               pantalla los mostraba sueltos: se lee «22 %, bajo para aserrío»
               justo debajo de un «50 %» tipeado a mano y parece un error de
               cuenta. No lo es — sobró troza sin aserrar — pero eso hay que
               decirlo acá, que es donde se mira. */
            hint={
              libreRollizaM3 > 0 && aprovechableEsperado != null
                ? `esperabas ${fmtPct(aprovechableEsperado)} % · sobran ${fmtM3(libreRollizaM3)} m³ sin aserrar`
                : t.aserradaDirectaM3 > 0
                  ? `${juicio.label} · sin contar la aserrada directa`
                  : juicio.label
            }
            tono={TONO[juicio.tono]}
          />
        </div>
      )}
      {conCosto && t.costoRolliza != null && (
        <p className="mt-2 text-sm text-[var(--text-tertiary)]">
          Costo de la rolliza cargada: <b className="text-[var(--text-secondary)]">S/ {fmtSoles(t.costoRolliza)}</b>
        </p>
      )}
      {/* El Anexo 04 del bloque: el mismo papel del cubicador, con las piezas
          que ESTE bloque ampara. Se emite por bloque porque cada uno responde a
          una guía distinta. */}
      {mostrarImportar && (
        <RepartoImportarBloquesModal
          bloquesActuales={bloques.length}
          onAgregar={agregarBloquesImportados}
          onCerrar={() => setMostrarImportar(false)}
        />
      )}
      {anexoDe && (
        <Anexo04Modal
          rows={anexoDe.piezas}
          especieGlobal={anexoDe.especie}
          procedencia={anexoDe.procedencia}
          onCerrar={() => setAnexoDe(null)}
        />
      )}
    </SeccionResumen>
  );
}
