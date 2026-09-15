/**
 * Guardar la escuadría de un paquete — la ÚNICA definición del contrato.
 *
 * Dos pantallas la abren («Productos disponibles» y la ficha del paquete) y dos
 * copias del mismo `action` divergen en cuanto una de las dos suma un campo. El
 * cálculo puro vive aparte, en `escuadria-del-paquete.ts`; acá sólo el viaje.
 *
 * El viaje (la rama vive en `app/api/admin/forestal/ctp/route.ts` y escribe por
 * `ForestCtpDB.corregirMedidasDePaquete`):
 *
 * ```
 * PATCH /api/admin/forestal/ctp
 * { id: <ctpEntryId>, action: "corregir_medidas_paquete", paqueteId,
 *   espesorCm: number>0, anchoCm: number>0, largoM: number>0, cantidad?: int>0 }
 * ```
 *
 * El servidor NO toca `volumenM3` del paquete ni `quantity` de la corrida: la
 * escuadría se carga para poder COTEJAR el volumen declarado, no para
 * reemplazarlo — si no cuadran, eso es justo lo que hay que ver. `cantidad`
 * sólo se completa cuando el paquete venía en cero, y el paquete se busca por
 * tenant Y por corrida: uno de otra corrida no se toca ni se dice que sí.
 */

import { csrfHeaders } from "@/lib/csrf-client";
import { leerJson } from "@/lib/errores/sin-dato";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";

/** Lo que viaja al libro cuando se guarda la escuadría de un paquete. */
export interface EscuadriaAGuardar {
  paqueteId: string;
  ctpEntryId: string;
  espesorCm: number;
  anchoCm: number;
  largoM: number;
  /** Sólo si el paquete no declaraba piezas y acá se completaron. */
  cantidad?: number;
}

export async function guardarEscuadriaDePaquete(medidas: EscuadriaAGuardar): Promise<void> {
  const r = await fetch("/api/admin/forestal/ctp", {
    method: "PATCH",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({
      id: medidas.ctpEntryId,
      action: "corregir_medidas_paquete",
      paqueteId: medidas.paqueteId,
      espesorCm: medidas.espesorCm,
      anchoCm: medidas.anchoCm,
      largoM: medidas.largoM,
      ...(medidas.cantidad != null ? { cantidad: medidas.cantidad } : {}),
    }),
  });
  if (!r.ok) {
    const data = (await leerJson(r)) as { message?: string; error?: string } | null;
    throw new Error(data?.message ?? data?.error ?? `El servidor respondió ${r.status}`);
  }
  invalidarCtp("/forestal/ctp");
}
