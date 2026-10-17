/**
 * Cuánto tardó un tramo del drive, del lado de quien lo usa.
 *
 * Vive suelto y no dentro del hook de documentos porque lo llaman dos lugares
 * que no se conocen entre sí: el listado (desde el hook) y el visor (desde el
 * modal). Duplicar el envío haría que un día uno mida y el otro no.
 *
 * `keepalive` para que el reporte sobreviva si la persona se va de la pantalla
 * justo después, y todo a prueba de fallas: medir no puede frenar ni romper
 * nada, una medición perdida no vale ni un error en pantalla.
 */
import { csrfHeaders } from "@/lib/csrf-client";

export type TramoDrive = "listado" | "miniaturas" | "visor" | "subida";

export function reportarVelocidad(tramo: TramoDrive, ms: number, docs = 0): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  fetch("/api/admin/documents/velocidad", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ muestras: [{ tramo, ms: Math.round(ms), docs }] }),
  }).catch((err) => console.warn("[drive] no se pudo reportar la velocidad", err));
}
