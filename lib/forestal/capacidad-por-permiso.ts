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
 *  · varios dentro de lo mismo (un lote o una corrida que juntó madera de dos
 *    títulos) → una parte por permiso con lo que APORTÓ cada uno
 *    (`repartirPorAporte`, Brandon 2026-10-19 «lote con dos permisos»). Lo que
 *    no se puede atribuir va a «Sin permiso» marcado `sinAtribuir`: nunca se
 *    le carga a un permiso que no lo amparó (regla forestal-serfor: siempre ≤).
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
  /**
   * Lo que quedó «Sin permiso» al partir algo de varios títulos: el libro no
   * dice de qué permiso es esa porción (piezas sin permiso, consumos sin guía
   * o volumen que las piezas no explican). Se dice en la tabla con su ⓘ.
   */
  sinAtribuir?: boolean;
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

/** Lo que un permiso aportó a algo que junta varios: m³ y, si se saben, piezas. */
export interface AporteDePermiso {
  permiso?: string | null;
  m3: number;
  piezas?: number;
}

/** Diezmilésimas de m³: la precisión del libro (`Decimal(12,4)`). */
const UNIDAD = 10_000;

/**
 * Parte `total` por permiso en proporción a lo que APORTÓ cada uno (Brandon,
 * 2026-10-19: un lote de Tornillo con 2 m³ del 017 y 1 m³ del 167 son dos
 * bloques, 2 y 1). Se parte, no se recalcula: Σ partes = `total` exacto en
 * diezmilésimas (resto mayor).
 *
 * `base` = el volumen del que salieron los aportes (lo consumido del lote, lo
 * apartado). Si los aportes CON permiso no lo explican entero —piezas sin
 * permiso, consumos sin guía, piezas que ya no cuelgan del lote— esa porción
 * va a «Sin permiso» con `sinAtribuir`: siempre ≤, nunca se adivina el dueño.
 * Sin ningún aporte con permiso, todo es `sinAtribuir`. Un solo permiso que lo
 * explica todo = una sola parte, la misma de siempre.
 */
export function repartirPorAporte(
  total: number,
  aportes: readonly AporteDePermiso[],
  base?: number,
): ParteDePermiso[] {
  const totalU = Math.round(Math.max(0, Number(total) || 0) * UNIDAD);
  if (totalU === 0) return [];
  const grupos = new Map<string, { permiso: string; m3: number; piezas: number }>();
  let conPermiso = 0;
  let todo = 0;
  let piezasSin = 0;
  for (const a of aportes) {
    const m3 = Math.max(0, Number(a.m3) || 0);
    const piezas = Math.max(0, Math.trunc(Number(a.piezas) || 0));
    todo += m3;
    const permiso = txt(a.permiso);
    if (!permiso) {
      piezasSin += piezas;
      continue;
    }
    const k = permiso.toUpperCase();
    const g = grupos.get(k) ?? { permiso, m3: 0, piezas: 0 };
    g.m3 += m3;
    g.piezas += piezas;
    grupos.set(k, g);
    conPermiso += m3;
  }
  const sinAtribuir = (m3: number): ParteDePermiso => ({
    permiso: null,
    mezclado: false,
    sinAtribuir: true,
    m3,
    piezas: piezasSin,
  });
  const divisor = Math.max(Number(base) || 0, todo);
  if (!(divisor > 0) || !(conPermiso > 0)) return [sinAtribuir(totalU / UNIDAD)];

  /* Resto mayor: cada cuota en diezmilésimas enteras y lo que sobra del
     redondeo, a las de mayor fracción. El `1e-9` absorbe 1999,9999999 → 2000. */
  const cuotas = [
    ...[...grupos.values()].map((g) => ({ g, peso: g.m3 })),
    { g: null, peso: Math.max(0, divisor - conPermiso) },
  ].map((c) => {
    const exacto = (totalU * c.peso) / divisor;
    const piso = Math.floor(exacto + 1e-9);
    return { ...c, u: piso, fraccion: exacto - piso };
  });
  let resto = totalU - cuotas.reduce((a, c) => a + c.u, 0);
  for (const c of [...cuotas].sort((a, b) => b.fraccion - a.fraccion || b.peso - a.peso)) {
    if (resto <= 0) break;
    if (!(c.peso > 0)) continue;
    c.u += 1;
    resto -= 1;
  }
  const partes: ParteDePermiso[] = [];
  for (const c of cuotas) {
    if (c.u <= 0) continue;
    partes.push(
      c.g
        ? { permiso: c.g.permiso, mezclado: false, m3: c.u / UNIDAD, piezas: c.g.piezas }
        : sinAtribuir(c.u / UNIDAD),
    );
  }
  return partes.sort(ordenPermiso);
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
    /* La fila «Sin permiso» dice si parte de ella salió de partir algo de
       varios títulos: es lo que su ⓘ explica. */
    if (it.sinAtribuir) g.sinAtribuir = true;
    g.m3.push(it.m3);
    g.piezas += it.piezas > 0 ? it.piezas : 0;
    grupos.set(clave, g);
  }
  return [...grupos.values()]
    .map((g) => ({ ...g, m3: m3OficialDeFila(g.m3) }))
    .sort((a, b) => ordenPermiso(a, b) || b.m3 - a.m3);
}
