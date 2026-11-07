/**
 * cuadre-del-papel — el cuadre de la distribución dicho en una línea, para
 * frenar un papel que sale con cifras que no cierran (Brandon, 2026-10-03:
 * «hoy se puede emitir aunque diga "Difiere 0,242 m³"; con esto avisa y pide
 * confirmar»).
 *
 * El cuadre completo vive en `reparto-cuadre.ts` (siete controles, cada uno
 * con sus filas). Acá se resume en lo que necesita quien está por emitir:
 * cuánto no cuadra, dónde y qué hacer — y si eso tiene que frenarlo. Sólo
 * «difiere» frena: el redondeo de las filas no es un error de nadie.
 *
 * PURO: lo consumen el Anexo 04 (prop `cuadre`) y «Guardar la distribución».
 */
import type { CuadreReparto, EstadoCuadre, IdControl, Trio } from "./reparto-cuadre";

export interface CuadreDelPapel {
  estado: EstadoCuadre;
  /** «No cuadra por 0.242 m³ · Cada bloque cabe en su capacidad». */
  frase: string;
  /** Dónde y cómo cuadrarlo, una línea por diferencia (las más grandes primero). */
  lineas?: string[];
  /** El control que abre «Revisar el cuadre». */
  control?: IdControl;
}

/** Cuántas líneas cita el aviso: más que esto ya es el modal del cuadre. */
const MAX_LINEAS = 4;

const nf = (v: number, dec: number) =>
  v.toLocaleString("es-PE", { minimumFractionDigits: dec, maximumFractionDigits: dec });

/** Diferencia con signo y en la resolución que se muestra; lo que redondea a 0 es «0». */
export function conSigno(v: number, dec: number): string {
  const r = Math.round(v * 10 ** dec) / 10 ** dec;
  if (r === 0) return "0";
  return r > 0 ? `+${nf(r, dec)}` : `−${nf(Math.abs(r), dec)}`;
}

/**
 * La diferencia que se cita en una línea, en la unidad que más dice: piezas
 * si se perdió alguna, m³ si no, y PT si sólo el pie tablar se movió.
 */
export function difCorta(d: Trio): string {
  if (d.piezas !== 0) return `${conSigno(d.piezas, 0)} pzas`;
  if (Math.abs(d.m3) >= 0.0005) return `${nf(Math.abs(d.m3), 3)} m³`;
  if (Math.abs(d.pt) >= 0.005) return `${nf(Math.abs(d.pt), 2)} PT`;
  return "";
}

/** Para elegir la diferencia más grande: una pieza pesa más que cualquier m³. */
const peso = (t: Trio) => Math.abs(t.piezas) * 1e3 + Math.abs(t.m3) + Math.abs(t.pt) / 424;

/**
 * El cuadre en una línea. `null` sin controles (una distribución sin bloques
 * no tiene nada que cuadrar ni que frenar).
 */
export function cuadreDelPapel(c: CuadreReparto | null | undefined): CuadreDelPapel | null {
  if (!c || c.controles.length === 0) return null;
  if (c.estado === "exacto") return { estado: "exacto", frase: `Cuadra en los ${c.controles.length} controles.` };
  if (c.estado === "redondeo") return { estado: "redondeo", frase: "Cuadra con redondeo de las filas: no frena." };

  const malos = c.controles.filter((x) => x.estado === "difiere");
  const peor = malos.reduce((a, x) => (peso(x.peor) > peso(a.peor) ? x : a), malos[0]);
  const dif = difCorta(peor.peor).replace(/^[+−]/, "");
  /* Las líneas con nombre («GTF b1», «Tornillo · 2×4×10») primero: dicen
     DÓNDE. Las de un control sin filas (el total del lote) van después. */
  const conNombre: { rotulo: string; texto: string; peso: number }[] = [];
  const sinNombre: string[] = [];
  for (const ctl of malos) {
    const filas = ctl.filas.filter((f) => f.estado === "difiere");
    if (filas.length === 0) sinNombre.push(`${ctl.titulo}: ${ctl.comoCuadrar}`);
    for (const f of filas) {
      const cuanto = difCorta(f.diferencia);
      conNombre.push({ rotulo: f.rotulo, peso: peso(f.diferencia), texto: `${f.rotulo}${cuanto ? ` (${cuanto})` : ""}: ${f.comoCuadrar ?? ctl.comoCuadrar}` });
    }
  }
  conNombre.sort((a, b) => b.peso - a.peso);
  const lineas = [...new Set([...conNombre.map((x) => x.texto), ...sinNombre])];
  const sobran = lineas.length - MAX_LINEAS;
  /* La frase nombra dónde mirar (la fila que más difiere); si ningún control
     tiene filas, el control. «4 controles lo marcan»: la misma diferencia se
     ve en varias vistas, no son cuatro problemas. */
  const donde = conNombre[0]?.rotulo ?? peor.titulo;
  return {
    estado: "difiere",
    frase: `No cuadra${dif ? ` por ${dif}` : ""} · ${donde}${malos.length > 1 ? ` (${malos.length} controles lo marcan)` : ""}`,
    lineas: sobran > 0 ? [...lineas.slice(0, MAX_LINEAS), `y ${sobran} diferencia${sobran === 1 ? "" : "s"} más en el cuadre`] : lineas,
    control: peor.id,
  };
}

/** ¿Hay que pedir confirmación antes de sacar el papel? Sólo con «difiere». */
export const cuadreFrena = (c: Pick<CuadreDelPapel, "estado"> | null | undefined): boolean => c?.estado === "difiere";
