/**
 * anexo04-vista.ts — lo que la vista previa del ANEXO N° 04 hace con las
 * piezas ANTES de armar las hojas (Brandon, 2026-10-03):
 *
 *  1. **Filtrar** por tipo y/o especie: «puro comercial» o «puro larga angosta
 *     de pashaco». Con filtro, el anexo entero (hojas, PDF, Excel, registro,
 *     comparación) lleva sólo eso: es un papel aparte, no una vista.
 *  2. **Formato de la cantidad**: tal como se cargó, sumada (medidas iguales en
 *     una línea con su contador: 3 × 3×3×12) o una por pieza (cada unidad su
 *     línea: 1 × 3×3×12, tres veces).
 *
 * Los tres formatos conservan Σ piezas, Σ PT y Σ m³ EXACTOS: el formato cambia
 * los renglones, nunca lo que se declara. Por eso «Sumada» no reusa
 * `agruparPiezasIguales` tal cual: esa recalcula el PT/m³ del grupo con la
 * fórmula del cubicador (redondea el PT de la fila a 2 decimales y deriva el
 * m³ de ahí), y tres filas de 1 × 3×3×12 (0,0212 m³ c/u = 0,0636) sumadas así
 * darían 0,0637: el (3) VOLUMEN TOTAL se movería al cambiar de formato.
 *
 * PURO: sin React. Lo consume `hooks/use-anexo04-vista.ts`.
 */
import type { PiezaCubicada } from "./cubicacion";
import { especieDelAnexo } from "./anexo04-serfor";
import { ordenTipo, tipoDePieza, type TipoComercial } from "./cubicacion-tipo";

// ─── Filtro por tipo y especie ──────────────────────────────────────────────

export interface FiltroAnexo {
  /** Tipos que entran. Vacío = todos. */
  tipos: readonly TipoComercial[];
  /** Especies que entran, en MAYÚSCULA como el bloque impreso. Vacío = todas. */
  especies: readonly string[];
}

export const FILTRO_ANEXO_VACIO: FiltroAnexo = { tipos: [], especies: [] };

export const hayFiltroAnexo = (f: FiltroAnexo): boolean => f.tipos.length > 0 || f.especies.length > 0;

/** ¿La pieza entra al anexo con este filtro? Tipo Y especie (cada uno, cualquiera de los elegidos). */
export function pasaFiltroAnexo(r: PiezaCubicada, f: FiltroAnexo, especieGlobal?: string): boolean {
  if (f.tipos.length > 0 && !f.tipos.includes(tipoDePieza(r))) return false;
  if (f.especies.length > 0 && !f.especies.includes(especieDelAnexo(r, especieGlobal))) return false;
  return true;
}

export function filtrarFilasAnexo(rows: readonly PiezaCubicada[], f: FiltroAnexo, especieGlobal?: string): PiezaCubicada[] {
  if (!hayFiltroAnexo(f)) return [...rows];
  return rows.filter((r) => pasaFiltroAnexo(r, f, especieGlobal));
}

export interface OpcionFiltro<T extends string> {
  valor: T;
  /** Piezas (Σ cantidad) que quedarían con esta opción y el OTRO filtro tal como está. */
  piezas: number;
  elegida: boolean;
}

export interface OpcionesFiltroAnexo {
  tipos: OpcionFiltro<TipoComercial>[];
  especies: OpcionFiltro<string>[];
}

/**
 * Las opciones de cada filtro con su contador de piezas. Los contadores son
 * cruzados: el de cada tipo cuenta dentro de las especies elegidas y el de
 * cada especie dentro de los tipos elegidos — con «Pashaco» elegido, el chip
 * «Larga angosta» dice cuántas larga angosta de pashaco hay. Una opción
 * elegida que ya no tiene piezas (otro dueño) sigue apareciendo, con 0, para
 * poder quitarla. Tipos en el orden canónico; especies como aparecen en el
 * lote (el mismo orden de los bloques).
 */
export function opcionesFiltroAnexo(rows: readonly PiezaCubicada[], f: FiltroAnexo, especieGlobal?: string): OpcionesFiltroAnexo {
  const porTipo = new Map<TipoComercial, number>();
  const porEspecie = new Map<string, number>();
  for (const r of rows) {
    const tipo = tipoDePieza(r);
    const especie = especieDelAnexo(r, especieGlobal);
    const n = r.cantidad;
    if (!porEspecie.has(especie)) porEspecie.set(especie, 0);
    if (!porTipo.has(tipo)) porTipo.set(tipo, 0);
    if (f.especies.length === 0 || f.especies.includes(especie)) porTipo.set(tipo, porTipo.get(tipo)! + n);
    if (f.tipos.length === 0 || f.tipos.includes(tipo)) porEspecie.set(especie, porEspecie.get(especie)! + n);
  }
  for (const t of f.tipos) if (!porTipo.has(t)) porTipo.set(t, 0);
  for (const e of f.especies) if (!porEspecie.has(e)) porEspecie.set(e, 0);
  return {
    tipos: [...porTipo.entries()]
      .sort((a, b) => ordenTipo(a[0]) - ordenTipo(b[0]))
      .map(([valor, piezas]) => ({ valor, piezas, elegida: f.tipos.includes(valor) })),
    especies: [...porEspecie.entries()].map(([valor, piezas]) => ({ valor, piezas, elegida: f.especies.includes(valor) })),
  };
}

/** «Tornillo», «Palo Rosa»: la especie del bloque (MAYÚSCULA) escrita para leer. */
export const especieLegible = (e: string): string =>
  e.toLowerCase().replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());

/**
 * Lo que lleva el anexo filtrado, para decirlo en una línea:
 * «Comercial · Tornillo», «Comercial, Larga angosta · Pashaco».
 */
export function rotuloFiltroAnexo(f: FiltroAnexo): string {
  const tipos = [...f.tipos].sort((a, b) => ordenTipo(a) - ordenTipo(b)).join(", ");
  const especies = f.especies.map(especieLegible).join(", ");
  return [tipos, especies].filter(Boolean).join(" · ");
}

// ─── Formato de la cantidad ─────────────────────────────────────────────────

export type FormatoCantidad = "cargada" | "sumada" | "unidad";

export const FORMATOS_CANTIDAD: readonly { id: FormatoCantidad; label: string; ejemplo: string }[] = [
  { id: "cargada", label: "Como se cargó", ejemplo: "cada fila del lote, tal cual" },
  { id: "sumada", label: "Sumada", ejemplo: "3 × 3×3×12 en una línea" },
  { id: "unidad", label: "Una por pieza", ejemplo: "1 × 3×3×12, tres líneas" },
] as const;

/** Id que no choca con ninguno ya usado (un lote podría traer «a~1» de antes). */
function idLibre(base: string, usados: Set<string>): string {
  let id = base;
  for (let k = 2; usados.has(id); k++) id = `${base}.${k}`;
  usados.add(id);
  return id;
}

/** Reparte `total` (en pasos de 1/`escala`) en `n` partes que suman EXACTO. */
function repartir(total: number, n: number, escala: number): number[] {
  const enteros = Math.round(total * escala);
  const base = Math.floor(enteros / n);
  const resto = enteros - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < resto ? 1 : 0)) / escala);
}

/**
 * Las piezas en el formato elegido. Lo que NO cambia en ninguno: especie,
 * tipo, medidas y unidades de cada pieza, ni los totales (Σ piezas, PT, m³).
 *
 *  · `cargada`: las mismas filas, mismos ids (es lo único editable en la hoja).
 *  · `sumada`: junta las que imprimen igual en el MISMO bloque —especie del
 *    anexo, tipo, medida con su unidad— y del mismo dueño (cada dueño se lleva
 *    su papel). Suma cantidad, PT y m³ de las que junta (no los recalcula, ver
 *    arriba). Orden de primera aparición; id `s-<id de la primera>`.
 *  · `unidad`: cada pieza su línea con cantidad 1. El PT (centésimas) y el m³
 *    (diezmilésimas) de la fila se reparten entre sus unidades de modo que
 *    sumen EXACTO lo de la fila. Ids `<id>~1…~n`, estables y únicas. Una
 *    cantidad no entera (no debería existir) queda como estaba.
 */
export function formatoCantidad(rows: readonly PiezaCubicada[], formato: FormatoCantidad, especieGlobal?: string): PiezaCubicada[] {
  if (formato === "cargada") return [...rows];
  const usados = new Set(rows.map((r) => r.id));

  if (formato === "unidad") {
    const out: PiezaCubicada[] = [];
    for (const r of rows) {
      const n = r.cantidad;
      if (!Number.isInteger(n) || n <= 1) { out.push(r); continue; }
      const pts = repartir(r.pieTablar, n, 100);
      const m3s = repartir(r.m3, n, 10_000);
      for (let k = 0; k < n; k++) {
        const u: PiezaCubicada = { ...r, id: idLibre(`${r.id}~${k + 1}`, usados), cantidad: 1, pieTablar: pts[k], m3: m3s[k] };
        /* La marca de Variado se reparte: las primeras unidades son las del Variado. */
        if (r.variadoPiezas) u.variadoPiezas = k < r.variadoPiezas ? 1 : 0;
        out.push(u);
      }
    }
    return out;
  }

  const grupos = new Map<string, PiezaCubicada[]>();
  for (const [i, r] of rows.entries()) {
    /* Una cantidad rara (0, decimal) no se junta con nada: sumarla movería el
       PT, porque la hoja cuenta la de 0 como 1. */
    const rara = !Number.isInteger(r.cantidad) || r.cantidad < 1;
    const clave = rara ? `rara:${i}` : JSON.stringify([
      especieDelAnexo(r, especieGlobal), tipoDePieza(r), r.espesor, r.ancho, r.largo,
      r.uEspesor, r.uAncho, r.uLargo, r.dueno?.trim() ?? "",
    ]);
    const g = grupos.get(clave);
    if (g) g.push(r);
    else grupos.set(clave, [r]);
  }
  return [...grupos.values()].map((g) => {
    if (g.length === 1) return g[0];
    const [primera] = g;
    const fila: PiezaCubicada = {
      ...primera,
      id: idLibre(`s-${primera.id}`, usados),
      cantidad: g.reduce((a, r) => a + r.cantidad, 0),
      pieTablar: Math.round(g.reduce((a, r) => a + r.pieTablar, 0) * 100) / 100,
      m3: Math.round(g.reduce((a, r) => a + r.m3, 0) * 10_000) / 10_000,
    };
    /* La nota y el código internos sólo si eran de todas: si no, la línea
       sumada diría de las tres lo que era de una. */
    const variado = g.reduce((a, r) => a + (r.variadoPiezas ?? 0), 0);
    if (variado > 0) fila.variadoPiezas = variado;
    else delete fila.variadoPiezas;
    if (!g.every((r) => r.codigo === primera.codigo)) delete fila.codigo;
    if (!g.every((r) => r.observacion === primera.observacion)) delete fila.observacion;
    return fila;
  });
}
