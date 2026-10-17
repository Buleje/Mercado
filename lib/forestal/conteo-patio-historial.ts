/**
 * conteo-patio-historial.ts — cómo se nombran las actas del conteo del patio en
 * el libro (Brandon 2026-09-26): «Último conteo: sábado 26/09 · faltaron 3».
 *
 * Y la FIRMA de un conteo terminado: con ella la tablet sabe si el acta de ese
 * conteo ya subió (o quedó en la cola) o hay que mandarla. Un conteo que se
 * reabre («Seguir contando») y se termina otra vez cambia de firma: se vuelve
 * a mandar y el servidor ACTUALIZA la misma acta (llave `iniciadoEn`).
 *
 * PURO y client-safe.
 */

import { formatDateNumeric, formatWeekday } from "@/lib/format";
import type { ConteoPatio } from "./conteo-patio";
import type { FaltanteConteo } from "./conteo-patio-guardado";

/** «sábado 26/09» — el día del conteo (AAAA-MM-DD, fecha sin hora). */
export function diaDelConteo(fecha: string): string {
  const numerica = formatDateNumeric(fecha, { soloFecha: true });
  const dia = formatWeekday(fecha, { soloFecha: true, largo: true });
  if (numerica === "—" || dia === "—") return fecha;
  return `${dia} ${numerica.slice(0, 5)}`;
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? uno : varios);

/** El día anterior a `hoy` (AAAA-MM-DD), por día UTC. */
function diaAnterior(hoy: string): string {
  const t = Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(t) ? new Date(t - 86_400_000).toISOString().slice(0, 10) : "";
}

/** «hoy», «ayer» o «sábado 26/09»: `hoy` es el día de Lima (`limaDateKey()`). */
export function cuandoDelConteo(fecha: string, hoy: string): string {
  if (fecha === hoy) return "hoy";
  if (fecha === diaAnterior(hoy)) return "ayer";
  return diaDelConteo(fecha);
}

/**
 * La línea de la pestaña Trozas (Brandon 05-10): «Último conteo: hoy, 12 de 13».
 * Si sobró algo, se suma («· sobraron 2»): lo que falta ya lo dice el «de».
 */
export function lineaDelUltimoConteo(
  r: { fecha: string; contadas: number; esperadas: number; sobrantes: number; sorpresas: number },
  hoy: string,
): string {
  const sobran = r.sobrantes + r.sorpresas;
  const cola = sobran > 0 ? ` · ${plural(sobran, "sobró", "sobraron")} ${sobran}` : "";
  return `Último conteo: ${cuandoDelConteo(r.fecha, hoy)}, ${r.contadas} de ${r.esperadas}${cola}`;
}

/**
 * Lo que dejó el conteo, en una frase corta: «faltaron 3 · sobró 1». Si no
 * faltó nada, se dice (es la buena noticia que se busca).
 */
export function fraseDelConteo(r: { faltan: number; sobrantes: number; sorpresas: number }): string {
  const partes: string[] = [];
  if (r.faltan > 0) partes.push(`${plural(r.faltan, "faltó", "faltaron")} ${r.faltan}`);
  else partes.push(r.sobrantes + r.sorpresas > 0 ? "no faltó ninguna" : "estaba todo");
  if (r.sobrantes > 0) partes.push(`${plural(r.sobrantes, "sobró", "sobraron")} ${r.sobrantes}`);
  if (r.sorpresas > 0) {
    partes.push(`${r.sorpresas} ${plural(r.sorpresas, "código desconocido", "códigos desconocidos")}`);
  }
  return partes.join(" · ");
}

/** Identifica ESTA versión terminada del conteo: `null` si todavía no terminó. */
export function firmaDelConteo(
  c: Pick<ConteoPatio, "iniciadoEn" | "terminadoEn" | "lecturas">,
): string | null {
  if (!c.terminadoEn) return null;
  return `${c.iniciadoEn}|${c.terminadoEn}|${c.lecturas.length}`;
}

export interface GrupoFaltantes {
  especie: string;
  piezas: FaltanteConteo[];
  m3: number;
}

/**
 * Lo que faltó, por especie (como se sale a buscarlo al patio): las especies
 * con más piezas primero; dentro, por código. Sin especie va al final.
 */
export function agruparFaltantes(faltantes: readonly FaltanteConteo[]): GrupoFaltantes[] {
  const SIN = "Sin especie";
  const grupos = new Map<string, GrupoFaltantes>();
  for (const f of faltantes) {
    const especie = f.especieComun?.trim() || SIN;
    const g = grupos.get(especie) ?? { especie, piezas: [], m3: 0 };
    g.piezas.push(f);
    g.m3 += f.volumenM3 ?? 0;
    grupos.set(especie, g);
  }
  return [...grupos.values()]
    .map((g) => ({
      ...g,
      m3: Math.round(g.m3 * 10_000) / 10_000,
      piezas: [...g.piezas].sort((a, b) => a.codigo.localeCompare(b.codigo, "es", { numeric: true })),
    }))
    .sort((a, b) =>
      a.especie === SIN ? 1 : b.especie === SIN ? -1 : b.piezas.length - a.piezas.length || a.especie.localeCompare(b.especie, "es"),
    );
}
