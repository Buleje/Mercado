"use client";

/**
 * Lo de Reprocesos que va al riel del libro (compactación 17-10): dónde se
 * declara uno —Volumen disponible › Productos— y actualizar. Va en todos los
 * estados, también sin reprocesos, que es justo cuando se busca dónde
 * declararlos.
 */

import { ArrowRight, RefreshCw } from "@buleje/design-system/icons";
import { AccionesDeLaVista, TextoDeAccion } from "@/components/admin/shared/libro-acciones-vista";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { cn } from "@/lib/utils";
import { BTN_ACCION_RIEL } from "./ctp-cabecera-vista";
import { BTN_ICONO_RIEL } from "./ctp-riel-piezas";

/** Donde se declara un reproceso: Volumen disponible › Productos. */
const HREF_DECLARAR = "/admin?tab=ctp-libro-operaciones&vista=disponibles&fuentes=productos";

export default function RielDeReprocesos({
  onIr,
  cargando,
  onRecargar,
}: {
  onIr?: (vista: string) => void;
  cargando: boolean;
  onRecargar: () => void;
}) {
  return (
    <AccionesDeLaVista>
      <button
        type="button"
        onClick={() => (onIr ? onIr("productos-disponibles") : irAEnlace(HREF_DECLARAR))}
        title="Un reproceso se declara desde Volumen disponible › Productos"
        className={BTN_ACCION_RIEL}
      >
        <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
        <TextoDeAccion>Declarar en Volumen disponible</TextoDeAccion>
      </button>
      <button
        type="button"
        onClick={onRecargar}
        disabled={cargando}
        aria-label="Actualizar los reprocesos"
        title="Actualizar"
        className={BTN_ICONO_RIEL}
      >
        <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} aria-hidden />
      </button>
    </AccionesDeLaVista>
  );
}
