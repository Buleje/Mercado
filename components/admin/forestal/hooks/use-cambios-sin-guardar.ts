"use client";

/**
 * ¿El lote en pantalla tiene algo que no está en la cubicación guardada?
 *
 * Antes se preguntaba sólo «¿está guardada?»: abrir otra guardada encima de
 * una que se había modificado la reemplazaba sin avisar (Brandon 23-10: «si el
 * lote abierto tiene cambios sin guardar, avisá antes de reemplazarlo»).
 *
 * La firma no depende del orden de la tabla: cambiar «Más nuevas primero» o
 * «Por especie» no es un cambio que haya que guardar.
 */
import { useCallback, useMemo, useState } from "react";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";

type PiezaFirmable = Pick<PiezaCubicada, "id" | "cantidad" | "espesor" | "ancho" | "largo" | "uEspesor" | "uAncho" | "uLargo" | "especie" | "dueno">;

export function firmaDeFilas(filas: readonly PiezaFirmable[]): string {
  return filas
    .map((r) => [r.id, r.cantidad, r.espesor, r.uEspesor, r.ancho, r.uAncho, r.largo, r.uLargo, r.especie ?? "", r.dueno ?? ""].join(":"))
    .sort()
    .join("|");
}

export function useCambiosSinGuardar(rows: readonly PiezaFirmable[], guardada: boolean): {
  /** Hay piezas y no coinciden con lo guardado (o nunca se guardó). */
  hayCambios: boolean;
  /** Lo que se acaba de guardar o abrir: desde acá se cuentan los cambios. */
  marcarGuardado: (filas: readonly PiezaFirmable[]) => void;
} {
  const firma = useMemo(() => firmaDeFilas(rows), [rows]);
  const [firmaGuardada, setFirmaGuardada] = useState<string | null>(null);
  const marcarGuardado = useCallback((filas: readonly PiezaFirmable[]) => setFirmaGuardada(firmaDeFilas(filas)), []);
  return { hayCambios: rows.length > 0 && (!guardada || firma !== firmaGuardada), marcarGuardado };
}
