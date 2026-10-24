"use client";

/**
 * Las dos barras del Directorio (compactación del libro, 17-10):
 *  · `RielDirectorio`: lo que va a la esquina, junto a las pestañas del libro
 *    — el ⓘ con el conteo, «Planilla» (ícono) y «Agregar …» (la principal);
 *  · `BuscarDirectorio`: el buscador y «Sólo incompletos», pegados a la lista
 *    que filtran.
 */

import { Download, FileSpreadsheet, Plus, Search, Upload } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { AccionesDeLaVista, ORDEN_ACCION, TextoDeAccion, useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { I, VistaHeader } from "./ctp-shared";
import { CLASE_PRINCIPAL_RIEL } from "./ctp-riel-piezas";

export function RielDirectorio({
  meta,
  conPlanilla,
  visibles,
  agregar,
  onBajar,
  onTraer,
  onAgregar,
}: {
  meta: string;
  /** La planilla es de partes: no hay en Vehículos. */
  conPlanilla: boolean;
  /** Cuántas fichas bajaría «Bajar lo que estoy viendo». */
  visibles: number;
  /** «Agregar destinatario», «Agregar vehículo»… */
  agregar: string;
  onBajar: () => void;
  onTraer: () => void;
  onAgregar: () => void;
}) {
  const enLibro = useEnElLibro();
  return (
    <>
      <VistaHeader
        titulo="Directorio"
        meta={meta}
        hint="Proveedores, clientes, destinatarios, transportistas, conductores y placas. Se completan solos en la guía."
      >
        {/* La planilla entra y sale por las MISMAS columnas: lo exportado se
            corrige en Excel y vuelve sin traducir nada. Van en el menú porque
            no son de uso diario — el de uso diario es agregar. */}
        {conPlanilla && (
          <ActionMenu
            label="Planilla"
            icon={FileSpreadsheet}
            size="md"
            soloIcono={enLibro}
            className={enLibro ? "w-12!" : ""}
            title="Planilla: bajar lo que ves o traer de un Excel"
            actions={[
              {
                id: "exportar",
                label: "Bajar lo que estoy viendo",
                hint: `${visibles} ${visibles === 1 ? "ficha" : "fichas"} a Excel, con el filtro puesto`,
                icon: Download,
                disabled: visibles === 0,
                onSelect: onBajar,
              },
              {
                id: "importar",
                label: "Traer de una planilla",
                hint: "Un .xlsx o .csv; se ve qué entra antes de guardar",
                icon: Upload,
                onSelect: onTraer,
              },
            ]}
          />
        )}
      </VistaHeader>
      <AccionesDeLaVista orden={ORDEN_ACCION.principal}>
        <button type="button" className={CLASE_PRINCIPAL_RIEL} title={agregar} onClick={onAgregar}>
          <Plus className="h-4 w-4" aria-hidden />
          <TextoDeAccion corto="Agregar">{agregar}</TextoDeAccion>
        </button>
      </AccionesDeLaVista>
    </>
  );
}

export function BuscarDirectorio({
  esVehiculos,
  q,
  onQ,
  incompletos,
  soloIncompletos,
  onSoloIncompletos,
}: {
  esVehiculos: boolean;
  q: string;
  onQ: (q: string) => void;
  /** `null` = la pestaña no es de un rol (Vehículos): sin el filtro. */
  incompletos: number | null;
  soloIncompletos: boolean;
  onSoloIncompletos: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[200px] flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
        <input
          type="search"
          className={`${I} pl-9`}
          aria-label={esVehiculos ? "Buscar vehículo" : "Buscar en el directorio"}
          placeholder={esVehiculos ? "Buscar por placa, marca o dueño…" : "Buscar por nombre o documento…"}
          value={q}
          onChange={(e) => onQ(e.target.value)}
        />
      </div>
      {/* Con los campos nuevos (DNI del representante, zona, ubigeo) la
          libreta vieja quedó con huecos — este toggle es la forma de
          recorrerlos uno por uno en vez de buscarlos a ojo en la lista.
          Sigue visible aunque ESTA pestaña ya no tenga incompletos
          (soloIncompletos): si no, prenderlo en una pestaña y pasar a
          otra completa lo dejaba activado sin control para apagarlo. */}
      {incompletos != null && (incompletos > 0 || soloIncompletos) && (
        <button
          type="button"
          aria-pressed={soloIncompletos}
          onClick={onSoloIncompletos}
          className={`inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border-2 px-3 text-sm font-semibold transition-colors ${
            soloIncompletos
              ? "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/12 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
          }`}
        >
          Sólo incompletos
          <span className="rounded bg-[var(--surface-sunken)] px-1.5 font-mono text-xs tabular-nums">{incompletos}</span>
        </button>
      )}
    </div>
  );
}
