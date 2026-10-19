/**
 * Lo que se lleva al cubicador, separado por PERMISO (Brandon, 2026-10-19):
 * «en lo que dice "Lo que se va al cubicador" quiero que sólo separe según el
 * permiso (no irá todo unificado) … y al llevarlo al bloque cubicador se
 * pondrá así separado por permiso».
 *
 * Antes las trozas del patio se juntaban por especie: 65 trozas de Tornillo de
 * tres permisos viajaban como UN bloque de 96.957 m³, y en la hoja que se firma
 * no había forma de decir cuánto amparaba cada título. Ahora cada permiso es su
 * propia parte, y cada parte su propio bloque. La suma no cambia: se parte, no
 * se recalcula.
 *
 * Tres casos, y ninguno se inventa:
 *  · un permiso → su código;
 *  · ninguno → «Sin permiso» (la troza o el lote no lo dicen);
 *  · varios dentro de lo mismo (un lote que juntó madera de dos títulos) →
 *    «Permisos mezclados», su propio grupo. Partir un lote mezclado exigiría
 *    saber de qué permiso salió cada tabla, y eso el libro no lo dice.
 *
 * PURO: sin React ni red.
 */

import { m3OficialDeFila } from "@/lib/forestal/gtf-redondeo";

export const SIN_PERMISO = "Sin permiso";
export const PERMISOS_MEZCLADOS = "Permisos mezclados";

const txt = (v: unknown) => String(v ?? "").trim();
const r4 = (v: number) => Math.round(v * 10000) / 10000;
const sinTildes = (v: string) =>
  v.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** De qué permiso es algo: el código, o por qué no hay uno solo. */
export interface PermisoDeParte {
  /** El código del título habilitante; `null` = sin permiso o mezclado. */
  permiso: string | null;
  /** Junta madera de más de un permiso: no se elige uno. */
  mezclado: boolean;
}

/** Una porción de una línea del modal: lo que va a ser UN bloque. */
export interface ParteDePermiso extends PermisoDeParte {
  m3: number;
  piezas: number;
  /** Las trozas de esta parte (sólo en las fuentes de trozas sueltas). */
  trozaIds?: string[];
}

/** El permiso de algo que puede traer varios: uno, ninguno o mezclado. */
export function permisoDeVarios(valores: readonly (string | null | undefined)[]): PermisoDeParte {
  const unicos = [...new Set(valores.map(txt).filter(Boolean))];
  if (unicos.length === 1) return { permiso: unicos[0]!, mezclado: false };
  return { permiso: null, mezclado: unicos.length > 1 };
}

/** Cómo se lee el permiso en una tabla: el código entero o el motivo. */
export function etiquetaDePermiso(p: PermisoDeParte): string {
  if (p.permiso) return p.permiso;
  return p.mezclado ? PERMISOS_MEZCLADOS : SIN_PERMISO;
}

/**
 * El código en corto, para una celda o un chip: la cola «TIPO-AÑO-N°» que es
 * como se nombra el permiso en la planta.
 * `19-SEC/REG-PLT-2021-017` → `PLT-2021-017` · `10-HUA-PUE/PER-FMP-2026-007` →
 * `FMP-2026-007`. Un código con otra forma se deja entero (recortado a 18): un
 * corte inventado confundiría dos permisos.
 */
export function codigoCortoDePermiso(codigo: string | null | undefined): string {
  const c = txt(codigo);
  if (!c) return "";
  const cola = /([A-Za-z]+-\d{4}-\d+)\s*$/.exec(c)?.[1];
  if (cola) return cola;
  return c.length > 18 ? `${c.slice(0, 17)}…` : c;
}

/** La etiqueta corta: el código corto, o «Sin permiso» / «Permisos mezclados». */
export function etiquetaCortaDePermiso(p: PermisoDeParte): string {
  return p.permiso ? codigoCortoDePermiso(p.permiso) : etiquetaDePermiso(p);
}

/** Clave estable del grupo de permiso (para `key` y para agrupar). */
export const claveDePermiso = (p: PermisoDeParte) =>
  p.permiso ? `p:${p.permiso.toUpperCase()}` : p.mezclado ? "mezclado" : "sin-permiso";

/** Orden de lectura: por código; «Sin permiso» y «mezclados» al final. */
function ordenPermiso(a: PermisoDeParte, b: PermisoDeParte): number {
  const rango = (p: PermisoDeParte) => (p.permiso ? 0 : p.mezclado ? 1 : 2);
  return rango(a) - rango(b) || txt(a.permiso).localeCompare(txt(b.permiso), "es");
}

/**
 * Las trozas de una línea, partidas por SU permiso: una parte por permiso,
 * con sus piezas, su m³ (Σ exacta a 4 decimales) y sus ids.
 */
export function partirPorPermiso(
  trozas: readonly { id: string; permiso?: string | null; volumenM3?: number | string | null }[],
): ParteDePermiso[] {
  const grupos = new Map<string, ParteDePermiso & { trozaIds: string[] }>();
  for (const t of trozas) {
    const p = permisoDeVarios([t.permiso]);
    const k = claveDePermiso(p);
    const g = grupos.get(k) ?? { ...p, m3: 0, piezas: 0, trozaIds: [] };
    g.m3 = r4(g.m3 + (Number(t.volumenM3 ?? 0) || 0));
    g.piezas += 1;
    g.trozaIds.push(t.id);
    grupos.set(k, g);
  }
  return [...grupos.values()].sort(ordenPermiso);
}

/** Lo que el resumen necesita de cada parte. */
export interface ItemPorPermiso extends PermisoDeParte {
  especie: string;
  tipo: "rolliza" | "aserrada";
  m3: number;
  piezas: number;
}

/** Una fila de «Lo que se va al cubicador»: permiso × especie × tipo. */
export interface FilaPorPermiso extends PermisoDeParte {
  clave: string;
  /** Vacía = «Sin especie». */
  especie: string;
  tipo: "rolliza" | "aserrada";
  piezas: number;
  /** Σ exacta de sus partes, redondeada UNA vez a 3 decimales (regla GTF). */
  m3: number;
}

/**
 * Agrupa por permiso × especie × tipo. Cada fila = Σ exacta de sus partes
 * redondeada una vez (regla GTF 2026-10-03, `gtf-redondeo.ts`); quien suma el
 * total suma las filas ya redondeadas. Ordenadas por permiso (así se leen
 * juntas las filas de un mismo título) y, dentro, de mayor a menor m³.
 */
export function agruparPorPermiso(items: readonly ItemPorPermiso[]): FilaPorPermiso[] {
  const grupos = new Map<string, Omit<FilaPorPermiso, "m3"> & { m3: number[] }>();
  for (const it of items) {
    const especie = txt(it.especie);
    const p: PermisoDeParte = { permiso: it.permiso ? txt(it.permiso) : null, mezclado: it.mezclado };
    const clave = `${claveDePermiso(p)}|${sinTildes(especie)}|${it.tipo}`;
    const g = grupos.get(clave) ?? { clave, ...p, especie, tipo: it.tipo, piezas: 0, m3: [] };
    g.m3.push(it.m3);
    g.piezas += it.piezas > 0 ? it.piezas : 0;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, m3: m3OficialDeFila(g.m3) }))
    .sort((a, b) => ordenPermiso(a, b) || b.m3 - a.m3);
}
