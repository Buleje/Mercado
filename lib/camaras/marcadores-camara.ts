/**
 * Marca o desmarca la cámara que lee los marcadores de troza (ADR-480). PURO,
 * gemelo de `configurarVigilaPila` (`cruces.ts`): va bajo el mismo candado de
 * la lista de cámaras (`mutarCamaras`).
 */
import type { Camara, ResultadoCamaras } from "./camaras";

export function configurarLeeMarcadores(camaras: readonly Camara[], id: string, activa: boolean): ResultadoCamaras {
  const camara = camaras.find((c) => c.id === id);
  if (!camara) return { ok: false, motivo: "Esa cámara no está en la lista." };
  return {
    ok: true,
    camaras: camaras.map((c) => (c.id === id ? { ...c, leeMarcadores: activa } : c)),
    mensaje: activa
      ? `«${camara.nombre}» lee los marcadores de las trozas: «Contar ahora» la ofrece primero.`
      : `«${camara.nombre}» ya no lee marcadores.`,
  };
}
