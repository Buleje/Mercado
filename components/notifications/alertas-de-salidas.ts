/**
 * Campana «Ahora»: las salidas de Anexo 04 que faltan en el Libro (ADR-519).
 * Puro; el plazo viene ya calculado por `lib/forestal/salidas-por-registrar.ts`.
 * Id estable por anexo: la campana no repite lo mismo.
 */
import { textoDeSalida, type SalidaPorRegistrar } from "@/lib/forestal/salidas-por-registrar";
import type { AlertaAhora } from "./use-alertas-consolidadas";

const HREF_DESPACHO = "/admin?tab=ctp-libro-operaciones&vista=despacho";

export function alertasDeSalidas(r: { hoy?: string; salidas?: SalidaPorRegistrar[] } | null | undefined): AlertaAhora[] {
  if (!r?.hoy || !Array.isArray(r.salidas)) return [];
  const hoy = r.hoy;
  return r.salidas.map((s) => ({
    id: `salida-por-registrar:${s.anexoId}`,
    categoria: "campo" as const,
    severity: s.fueraDePlazo || s.venceEl === hoy ? ("critical" as const) : ("warning" as const),
    ...textoDeSalida(s, hoy),
    action: { label: "Registrar la salida", href: HREF_DESPACHO },
  }));
}
