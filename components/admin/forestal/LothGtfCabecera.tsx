"use client";

/**
 * Lo que la vista GTF del Libro TH pone en el riel, junto a las pestañas del
 * libro (compactación 17-10, Brandon: «botones junto a las pestañas»):
 *  · el ⓘ de la vista (qué son estas guías y qué amparan);
 *  · «Opciones»: Importar guías, Despachar con guía, Columnas y, si se
 *    arrastró algún título, Restablecer el orden;
 *  · «Anotar guía», la acción principal.
 * Antes era una fila propia de 4 botones con texto (08-10). «Indicadores» se
 * muda solo al riel (`useKpisPlegables`). Fuera del libro, todo en su lugar.
 */

import { FileDown, Plus, Truck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { AccionesDeLaVista, ORDEN_ACCION, useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { CLASE_PRINCIPAL_PLEGABLE, CLASE_PRINCIPAL_RIEL, RotuloPrincipal } from "./ctp-riel-piezas";
import { useMenuColumnas, type ColumnasDeLaTabla } from "./menu-columnas";

export default function LothGtfCabecera({
  onImportarGuias,
  onAnotar,
  onDespachar,
  columnas,
}: {
  onImportarGuias?: () => void;
  onAnotar: () => void;
  onDespachar: () => void;
  /** Las columnas de la tabla de guías (sólo en «Guías»: las bajas tienen su propia lista). */
  columnas?: ColumnasDeLaTabla | null;
}) {
  const enLibro = useEnElLibro();
  const menuColumnas = useMenuColumnas(columnas, "Columnas de la tabla de guías");
  const acciones: MenuAccion[] = [
    /* ADR-461: las guías que ya salieron (SNIFFS, foto o recibidas en el
       aserradero) entran con sus trozas, su tala y su permiso. */
    ...(onImportarGuias
      ? [{
          id: "importar",
          label: "Importar guías",
          hint: "Ya despachadas, con sus trozas: por N° de registro SERFOR, foto o las que recibió el aserradero",
          icon: FileDown,
          onSelect: onImportarGuias,
        }]
      : []),
    {
      id: "despachar",
      label: "Despachar con guía",
      hint: "La guía completa con sus trozas: se asienta el despacho en el libro en el mismo paso",
      icon: Truck,
      onSelect: onDespachar,
    },
    ...menuColumnas.acciones,
  ];

  return (
    <>
      <AccionesDeLaVista orden={ORDEN_ACCION.info}>
        <InfoTip
          title="Guías de Transporte Forestal"
          what="Las guías del Libro TH. Son internas: la GTF oficial se emite en el SNIFFS de SERFOR."
          affects="Cada guía de trozas ampara las líneas de Despacho del libro y, al llegar, el ingreso al Libro CTP."
          example="Importa la guía que ya salió por SNIFFS, o despacha con guía desde acá."
        />
      </AccionesDeLaVista>
      <AccionesDeLaVista>
        <ActionMenu
          label="Opciones"
          size="md"
          soloIcono={enLibro}
          className={enLibro ? "w-12!" : ""}
          title="Importar guías, despachar con guía y columnas"
          actions={acciones}
        />
      </AccionesDeLaVista>
      {/* La guía anotada a mano: para las salidas que YA están en el libro y no
          tienen su guía (el aviso rojo de la vista). */}
      <AccionesDeLaVista orden={ORDEN_ACCION.principal}>
        <button
          type="button"
          onClick={onAnotar}
          title="Anotar una guía: para despachos que ya están en el libro y no tienen su guía"
          className={`${CLASE_PRINCIPAL_RIEL} ${CLASE_PRINCIPAL_PLEGABLE}`}
        >
          <Plus className="h-4 w-4 shrink-0" aria-hidden />
          <RotuloPrincipal corto="Anotar">Anotar guía</RotuloPrincipal>
        </button>
      </AccionesDeLaVista>
      {menuColumnas.ventana}
    </>
  );
}
