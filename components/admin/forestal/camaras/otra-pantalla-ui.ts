/**
 * «Ver en otra pantalla» (Modo TV), lo puro del panel: textos de duración,
 * fechas y la dirección de la vista de cámaras para el celular.
 */

import type { TvDuracionHoras } from "@/lib/camaras/pantallas-tv";
import { formatRelativeTime } from "@/lib/junta/relative";

export const DURACION_TEXTO: Record<TvDuracionHoras, string> = {
  8: "Un turno (8 h)",
  24: "Un día",
  168: "Una semana",
};

export const RUTA_VISTA_CAMARAS = "/admin?tab=camaras&vista=camaras";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const dos = (n: number) => String(n).padStart(2, "0");

/** «jueves 10/09 · 18:30» en la hora del equipo (la del dueño, en Perú). */
export function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return `${DIAS[d.getDay()]} ${dos(d.getDate())}/${dos(d.getMonth() + 1)} · ${dos(d.getHours())}:${dos(d.getMinutes())}`;
}

/** «visto hace 3 min» / «todavía no se conectó». */
export function textoVisto(ultimaVez: string | null, ahora: number): string {
  if (!ultimaVez) return "todavía no se conectó";
  const r = formatRelativeTime(ultimaVez, ahora);
  return r ? `visto ${r}` : "visto recién";
}

/** «Todas» o los nombres (hasta 3 + «y N más»). */
export function textoCamaras(ids: readonly string[] | null, nombres: ReadonlyMap<string, string>): string {
  if (ids === null) return "Todas las cámaras";
  if (ids.length === 0) return "Ninguna cámara";
  const n = ids.map((id) => nombres.get(id) ?? "cámara quitada");
  return n.length <= 3 ? n.join(", ") : `${n.slice(0, 3).join(", ")} y ${n.length - 3} más`;
}
