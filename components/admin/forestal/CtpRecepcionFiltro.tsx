"use client";

/**
 * Qué guías lista Ingresos: Por recepcionar · Recepcionadas · Todas.
 *
 * Va en la fila de los chips de la tabla, como menú (dos botones por una
 * opción que se cambia de vez en cuando). Desde la ola 2 del panel unificado
 * (2026-10-10) también elige «Recepcionadas»: el archivo que antes era la
 * pestaña «GTF ingresadas» — el operador que busca «esa guía que ya recibí»
 * no tiene por qué saber en cuál de las dos mitades quedó (ADR-339).
 */

import { Archive, FileText, PackageCheck } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { FiltroRecepcion } from "./ctp-vistas-fusionadas";

const ROTULO: Record<FiltroRecepcion, string> = {
  pendiente: "Por recepcionar",
  cerrada: "Recepcionadas",
  "": "Todas las del período",
};

const DETALLE: Record<FiltroRecepcion, string> = {
  pendiente:
    "Guías que llegaron y falta recibirlas. Al recepcionarlas pasan a «Recepcionadas» y sus piezas quedan disponibles para la sierra.",
  cerrada: "Las guías ya recepcionadas del período, con cuánta madera bajó y cuántas piezas quedan para la sierra.",
  "": "Incluye también las ya recepcionadas.",
};

export default function CtpRecepcionFiltro({
  valor,
  onElegir,
  conRecepcionadas,
}: {
  valor: FiltroRecepcion;
  onElegir: (f: FiltroRecepcion) => void;
  /** Ofrecer «Recepcionadas» (la otra mitad del libro). */
  conRecepcionadas: boolean;
}) {
  return (
    <>
      <ActionMenu
        label={ROTULO[valor]}
        title="Qué guías lista la tabla"
        variant={valor === "pendiente" ? "accent" : "outline"}
        /* 48 px como todo filtro del panel (Brandon 2026-10-09); en `xs` medía 32. */
        size="md"
        actions={[
          { id: "pendiente", label: ROTULO.pendiente, hint: "Guías que llegaron y falta recibirlas", icon: PackageCheck, activo: valor === "pendiente", onSelect: () => onElegir("pendiente") },
          ...(conRecepcionadas
            ? [{ id: "cerrada", label: ROTULO.cerrada, hint: "El archivo: las guías ya recibidas", icon: Archive, activo: valor === "cerrada", onSelect: () => onElegir("cerrada") }]
            : []),
          { id: "todas", label: ROTULO[""], hint: "Incluye también las ya recepcionadas", icon: FileText, activo: valor === "", onSelect: () => onElegir("") },
        ]}
      />
      {/* El detalle va en un ⓘ: explicaba en un renglón entero lo que el
          propio botón ya dice, y ese renglón se paga en TODAS las cargas. */}
      <InfoTip title={ROTULO[valor]} what={DETALLE[valor]} />
    </>
  );
}
