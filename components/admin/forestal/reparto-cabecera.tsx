"use client";

/**
 * Los controles de la Distribución de rolliza (Brandon, 2026-10-20: «verificar
 * cada control; lo que no aporta, fuera o a un menú; más compacto como las
 * otras pestañas»).
 *
 * - `AccionesDistribucion`: la fila del título. Agrupar (cambia TODAS las
 *   pestañas y el papel), Revisar (el contador rojo es un estado, no se
 *   esconde) y un solo «Exportar» con PDF · Excel · CSV · opciones del papel.
 *   El botón «Cuadre» se fue: abría lo mismo que el chip «Cuadra» del título
 *   (`cuadreCifras.abrir()`), y su contador pasó al tooltip del chip.
 * - `MasDeLoQueEntro`: el «⋯» de la tabla «Lo que entró». Guardar, Guardadas,
 *   Especies y los dos de lotes eran seis botones sueltos en la fila; el
 *   contador de «Crear lotes» viaja en el badge del menú.
 */

import { useState, type ComponentProps } from "react";
import {
  AlertTriangle, Boxes, Download, FileSpreadsheet, FileText, FolderOpen, PackagePlus, Save, ShieldCheck, SlidersHorizontal, TreePine,
} from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { DIMENSIONES_RESUMEN, ETIQUETA_DIMENSION, type DimensionResumen } from "@/lib/forestal/cubicacion-resumen";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { button } from "@/components/ui-system/button-variants";
import { cn } from "@/lib/utils";
import RepartoLotesSugeridos, { pediblesDe } from "./reparto-lotes-sugeridos";
import RepartoPanelLotes from "./reparto-panel-lotes";

const BTN = button({ variant: "secondary", className: "rounded-xl" });

/** Los dos que traen su librería por import dinámico (jsPDF / exceljs) y tardan la primera vez. */
type Bajable = "pdf" | "excel";

export function AccionesDistribucion({ dim, onDim, vacio, bajando, onBajar, onCsv, papel, revision }: {
  dim: DimensionResumen;
  onDim: (d: DimensionResumen) => void;
  /** Sin bloques no hay nada que exportar ni revisar. */
  vacio: boolean;
  bajando: Bajable | null;
  onBajar: (que: Bajable) => void;
  onCsv: () => void;
  /** Firma y especies del papel: su panel se abre debajo del balance. */
  papel: { abierto: boolean; onAlternar: () => void; firma: string; especies: number };
  revision: { abierta: boolean; onAlternar: () => void; total: number; errores: number; avisos: number };
}) {
  const papelPuesto = papel.firma.trim() !== "" || papel.especies > 0;
  const detallePapel = [
    papel.firma.trim() ? `Firma: ${papel.firma.trim()}` : "",
    papel.especies > 0 ? `sólo ${papel.especies} especie${papel.especies === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" · ");
  /* Tres salidas para tres usos: el PDF se firma y se archiva, el Excel se
     cruza contra la planilla del contador, el CSV es el pegado rápido. Los
     tres bajan hasta la MEDIDA y respetan las opciones del papel. */
  const exportar: MenuAccion[] = [
    { id: "pdf", label: "PDF", hint: "Para firmar y archivar", icon: FileText, busy: bajando === "pdf", disabled: bajando !== null, onSelect: () => onBajar("pdf") },
    { id: "excel", label: "Excel", hint: "Para cruzar con la planilla del contador", icon: FileSpreadsheet, busy: bajando === "excel", disabled: bajando !== null, onSelect: () => onBajar("excel") },
    { id: "csv", label: "CSV", hint: "El pegado rápido", icon: Download, onSelect: onCsv },
    {
      id: "papel",
      label: papel.abierto ? "Cerrar las opciones del papel" : "Opciones del papel…",
      hint: detallePapel || "Firma del responsable y qué especies incluir",
      icon: SlidersHorizontal,
      activo: papelPuesto,
      seccion: "El papel",
      onSelect: papel.onAlternar,
    },
  ];
  const tonoRevision = revision.errores > 0
    ? "border-[var(--data-error-500)] text-[var(--data-error-600)] dark:text-[var(--data-error-500)]"
    : revision.avisos > 0
      ? "border-[var(--data-warning-500)] text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
      : "border-[var(--data-success-500)] text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
  return (
    <>
      {/* Con el label visible al lado, no hay que abrir el desplegable para saber qué controla. */}
      <label className="flex items-center gap-1.5">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)] max-sm:sr-only">Agrupar</span>
        <select
          value={dim}
          onChange={(e) => onDim(e.target.value as DimensionResumen)}
          aria-label="Cómo agrupar la aserrada"
          title="Cambia cómo se agrupa la aserrada en todas las pestañas y en el papel"
          className="h-12 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm max-sm:max-w-[10rem] font-bold text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
        >
          {DIMENSIONES_RESUMEN.filter((d) => d !== "especie").map((d) => (
            <option key={d} value={d}>{ETIQUETA_DIMENSION[d]}</option>
          ))}
        </select>
      </label>
      {/* El repaso antes de registrar: el contador va en el botón porque un panel plegado sin número no se abre nunca. */}
      <button
        type="button"
        onClick={revision.onAlternar}
        disabled={vacio}
        aria-expanded={revision.abierta}
        title={revision.total === 0 ? "Todo cuadra: no hay nada que revisar" : `${revision.errores} sin resolver · ${revision.avisos} para mirar`}
        className={cn(BTN, tonoRevision)}
      >
        {revision.total === 0 ? <ShieldCheck className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
        {/* A 400 px sólo ícono + número: así el selector, Revisar y Exportar entran en una fila (ley 6). */}
        <span className="max-sm:sr-only">Revisar</span>
        {revision.total > 0 && (
          <span className="rounded-full bg-current/15 px-1.5 font-mono text-xs tabular-nums">{revision.total}</span>
        )}
      </button>
      <ActionMenu
        label="Exportar"
        icon={Download}
        actions={exportar}
        disabled={vacio}
        compactoEnMovil
        /* Con firma o especies puestas el papel sale distinto: el botón lo avisa sin abrirlo. */
        variant={papelPuesto ? "accent" : "outline"}
        title={papelPuesto ? `Exportar con ${detallePapel}` : "PDF, Excel o CSV de la distribución"}
      />
    </>
  );
}

type PropsLotesSugeridos = Omit<ComponentProps<typeof RepartoLotesSugeridos>, "onCerrar" | "bloques">;
type PropsPanelLotes = Omit<ComponentProps<typeof RepartoPanelLotes>, "onCerrar" | "bloques">;

export function MasDeLoQueEntro({ bloques, guardada, onGuardar, onGuardadas, onEspecies, lotesSugeridos, panelLotes }: {
  bloques: BloqueRolliza[];
  /** El nombre de la distribución guardada que se está editando, si hay una. */
  guardada: string | null;
  onGuardar: () => void;
  onGuardadas: () => void;
  onEspecies: () => void;
  lotesSugeridos: PropsLotesSugeridos;
  panelLotes: PropsPanelLotes;
}) {
  const [modal, setModal] = useState<"crear" | "lotes" | null>(null);
  const vacio = bloques.length === 0;
  const pedibles = pediblesDe(bloques);
  const acciones: MenuAccion[] = [
    {
      id: "guardar",
      label: guardada ? `Actualizar «${guardada}»` : "Guardar con un nombre…",
      hint: vacio ? "Carga al menos un bloque para guardar" : "Queda en el servidor: se abre desde otro equipo",
      icon: Save,
      disabled: vacio,
      seccion: "Distribución",
      onSelect: onGuardar,
    },
    { id: "guardadas", label: "Guardadas…", hint: "Ver y abrir las distribuciones guardadas", icon: FolderOpen, seccion: "Distribución", onSelect: onGuardadas },
    {
      id: "crear-lotes",
      label: "Crear lotes sugeridos…",
      hint: pedibles > 0 ? `Un lote por cada bloque traído del Libro (${pedibles} sin lote)` : "Ningún bloque traído del Libro está sin lote",
      icon: PackagePlus,
      disabled: vacio,
      meta: pedibles > 0 ? String(pedibles) : undefined,
      seccion: "Lotes",
      onSelect: () => setModal("crear"),
    },
    {
      id: "lotes",
      label: "Lotes del patio y del Libro…",
      hint: "Crear lotes del patio, usar uno del Libro o elegir las trozas de un bloque",
      icon: Boxes,
      seccion: "Lotes",
      onSelect: () => setModal("lotes"),
    },
    { id: "especies", label: "Especies…", hint: "Especies del aserradero: crear, renombrar, quitar", icon: TreePine, seccion: "Catálogo", onSelect: onEspecies },
  ];
  return (
    <>
      <ActionMenu
        label="Más"
        actions={acciones}
        size="xs"
        badge={pedibles}
        title={pedibles > 0 ? `Guardar, lotes y especies · ${pedibles} bloque${pedibles === 1 ? "" : "s"} sin lote` : "Guardar, lotes y especies"}
      />
      {modal === "crear" && <RepartoLotesSugeridos {...lotesSugeridos} bloques={bloques} onCerrar={() => setModal(null)} />}
      {modal === "lotes" && <RepartoPanelLotes {...panelLotes} bloques={bloques} onCerrar={() => setModal(null)} />}
    </>
  );
}
