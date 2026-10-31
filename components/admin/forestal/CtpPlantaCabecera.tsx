"use client";

/**
 * La cabecera de Planta: el ⓘ, la capa del mapa, el «⋯» (imprimir, recargar)
 * y «Nuevo despacho». Dentro del Libro CTP va al riel, junto a las pestañas
 * (Brandon 17-10: «los botones… al lado de las pestañas en la esquina»).
 */

import { Map as MapIcon, MoreHorizontal, Printer, RefreshCw, Satellite, Truck } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { TextoDeAccion } from "@/components/admin/shared/libro-acciones-vista";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import type { PlanoPlanta } from "@/lib/forestal/planta-zona-types";
import { CabeceraDeVista } from "./ctp-cabecera-vista";
import { CLASE_PRINCIPAL_RIEL } from "./ctp-riel-piezas";

export default function CtpPlantaCabecera({
  plano,
  onPlano,
  verCroquis,
  imprimiendo,
  onImprimir,
  cargando,
  onRecargar,
  onDespachar,
}: {
  plano: PlanoPlanta;
  onPlano: (v: PlanoPlanta) => void;
  verCroquis: boolean;
  /** La hoja del croquis se está armando. */
  imprimiendo: boolean;
  onImprimir: () => void;
  cargando: boolean;
  onRecargar: () => void;
  /** Sin madera aserrada en la planta no hay despacho que ofrecer. */
  onDespachar: (() => void) | null;
}) {
  return (
    <CabeceraDeVista
      titulo="Planta"
      info={
        <InfoTip
          title="Mapa de tu aserradero"
          what="El croquis o el satélite muestran dónde está la madera; el Libro, cuánta se mueve."
          affects="Toca una zona para ver qué tiene, ubicar lo que falta o despachar desde ahí."
        />
      }
    >
      {/* Con el riel angosto (1280 con el menú abierto) quedan sólo los dos
          íconos: con el nombre, la capa ocupaba 190 px y tapaba la vista
          activa del riel («Plan…»). El nombre sigue para el lector. */}
      <SegmentedControl<PlanoPlanta>
        size="sm"
        label="Capa del mapa: croquis o satélite"
        className="@max-[80rem]/riel:[&_[role=radio]>span:not([aria-hidden])]:sr-only"
        value={plano}
        onChange={onPlano}
        options={[
          { value: "croquis", label: "Croquis", icon: <MapIcon className="h-4 w-4" /> },
          { value: "satelite", label: "Satélite", icon: <Satellite className="h-4 w-4" /> },
        ]}
      />
      {/* Imprimir y recargar no son de cada rato: al «⋯» (ADR-489, muchos botones → un botón con opciones). */}
      <ActionMenu
        label="Más opciones de la planta"
        soloIcono
        icon={MoreHorizontal}
        actions={[
          {
            id: "imprimir",
            label: verCroquis ? "Imprimir croquis" : "Imprimir plano",
            // Con el croquis a la vista se imprime el CROQUIS (hoja A4 apaisada con
            // vista previa); con el satélite, el plano satelital de siempre.
            hint: verCroquis
              ? "Zonas con lo que tienen, pilas, máquinas y rutas en una hoja A4 apaisada"
              : "Satélite + zonas + inventario, para la visita de la ARFFS",
            icon: Printer,
            busy: imprimiendo,
            disabled: imprimiendo,
            onSelect: onImprimir,
          },
          { id: "recargar", label: "Recargar", hint: "Vuelve a leer zonas e inventario", icon: RefreshCw, busy: cargando, disabled: cargando, onSelect: onRecargar },
        ]}
      />
      {/* El acto que se hace todos los días va siempre visible, al final del
          riel (la acción principal). Antes sólo aparecía dentro de una cancha
          de reserva: si nunca habías dibujado una, no existía en ninguna parte. */}
      {onDespachar && (
        <button
          type="button"
          onClick={onDespachar}
          title="Elige qué paquetes suben al camión y registra su guía sin salir de acá"
          className={CLASE_PRINCIPAL_RIEL}
        >
          <Truck className="h-4 w-4 shrink-0" aria-hidden />
          <TextoDeAccion corto="Despachar">Nuevo despacho</TextoDeAccion>
        </button>
      )}
    </CabeceraDeVista>
  );
}
