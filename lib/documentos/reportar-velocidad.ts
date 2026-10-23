/**
 * Cuánto tardó un tramo del drive, del lado de quien lo usa.
 *
 * Vive suelto y no dentro del hook de documentos porque lo llaman dos lugares
 * que no se conocen entre sí: el listado (desde el hook) y el visor (desde el
 * modal). Duplicar el envío haría que un día uno mida y el otro no.
 *
 * `keepalive` para que el reporte sobreviva si la persona se va de la pantalla
 * justo después (se junta y sale al ocultar o cerrar), y todo a prueba de fallas: medir no puede frenar ni romper
 * nada, una medición perdida no vale ni un error en pantalla.
 */
import { csrfHeaders } from "@/lib/csrf-client";

export type TramoDrive = "listado" | "miniaturas" | "visor" | "subida";

type Muestra = { tramo: TramoDrive; ms: number; docs: number };

/** El endpoint acepta hasta 10 por envío. */
const MAX_POR_ENVIO = 10;
/**
 * Se juntan y van en UN envío un rato después (22-10): abrir el Archivo sumaba
 * un POST propio en el momento justo en que la lista y sus miniaturas peleaban
 * por la red. Al ocultar la pestaña o irse, sale lo que haya (keepalive).
 */
const ESPERA_MS = 15_000;

let cola: Muestra[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let escuchando = false;

function enviar(muestras: Muestra[]): void {
  fetch("/api/admin/documents/velocidad", {
    method: "POST",
    credentials: "include",
    keepalive: true,
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    body: JSON.stringify({ muestras }),
  }).catch((err) => console.warn("[drive] no se pudo reportar la velocidad", err));
}

/** Manda lo juntado (de a 10). */
export function vaciarVelocidad(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  const todas = cola;
  cola = [];
  for (let i = 0; i < todas.length; i += MAX_POR_ENVIO) enviar(todas.slice(i, i + MAX_POR_ENVIO));
}

function alOcultar(): void {
  if (document.visibilityState === "hidden") vaciarVelocidad();
}

export function reportarVelocidad(tramo: TramoDrive, ms: number, docs = 0): void {
  if (!Number.isFinite(ms) || ms <= 0) return;
  cola.push({ tramo, ms: Math.round(ms), docs });
  if (typeof window === "undefined") return vaciarVelocidad();
  if (!escuchando) {
    escuchando = true;
    document.addEventListener("visibilitychange", alOcultar);
    window.addEventListener("pagehide", vaciarVelocidad);
  }
  if (cola.length >= MAX_POR_ENVIO) return vaciarVelocidad();
  if (!timer) timer = setTimeout(vaciarVelocidad, ESPERA_MS);
}
