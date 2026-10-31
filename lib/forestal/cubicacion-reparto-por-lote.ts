/**
 * cubicacion-reparto-por-lote — la casilla Lote de la hoja de cubicación en la
 * Distribución de rolliza (Brandon 30-10, «Lote para la madera suelta»).
 *
 * Antes la producción de una especie se repartía entre todos sus bloques por
 * capacidad: si el lote 29 y el 30 eran de tornillo, sus tablas se mezclaban y
 * la línea de cada lote declaraba un volumen «a ojo». Con la casilla, la pieza
 * anotada con su lote va SÓLO al bloque de ese lote, y la línea de producción
 * del lote toma su volumen exacto.
 *
 * Cómo: dentro de cada especie se parte en una porción por lote anotado (sus
 * bloques + sus piezas) y el resto (los demás bloques + las piezas sin lote).
 * Cada porción se reparte con LA MISMA regla de siempre y después se unen en
 * una sola especie. Sin ninguna pieza anotada, no se parte nada: el resultado
 * es idéntico al de antes.
 *
 * La pieza con un lote que NO tiene bloque en su especie (lote cerrado, de
 * otra especie, o «29» con dos lotes 29) va a una porción SIN bloques: queda
 * en «Falta por distribuir» con su aviso (`lotesSinBloque`). Repartirla con el
 * resto la metía en silencio en el bloque de OTRO lote (revisión 30-10).
 * Excepción: si la especie no tiene ningún bloque de lote (sólo guías), la
 * casilla no se puede cumplir ni violar y todo se reparte como siempre.
 *
 * PURO. Sólo tipos del reparto: el reparto importa esto, no al revés.
 */

import type { PiezaCubicada } from "./cubicacion";
import type {
  AsignacionMedida,
  BloqueDistribuido,
  BloqueRolliza,
  EspecieDistribucion,
  FaltanteGrupo,
} from "./cubicacion-reparto";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r4 = (n: number) => Math.round(n * 10000) / 10000;
const EPS = 1e-6;

/**
 * El código de un lote, comparable: «Lote 029-2026», «29-2026» y «29 / 2026»
 * dan «29-2026». Sin texto, `null`.
 */
export function codigoDeLote(texto: string | null | undefined): string | null {
  const s = String(texto ?? "")
    .trim()
    .toLowerCase()
    .replace(/^lote\s*(n[°º.o]?\s*)?/, "");
  const partes = s
    .split(/[\s\-/_.]+/)
    .filter(Boolean)
    .map((seg) => (/^\d+$/.test(seg) ? String(Number(seg)) : seg));
  return partes.length > 0 ? partes.join("-") : null;
}

/**
 * El lote de un bloque, por su etiqueta: los bloques que nacen de un lote se
 * llaman «Lote 29-2026» (y «Lote 29-2026 · apartado» / «· margen»).
 */
export function codigoLoteDeBloque(b: Pick<BloqueRolliza, "etiqueta">): string | null {
  const m = /\blote\s+(?:n[°º.o]?\s*)?([0-9a-z][0-9a-z\-/]*)/i.exec(b.etiqueta ?? "");
  return m ? codigoDeLote(m[1]) : null;
}

/**
 * A qué lote del bloque va la pieza. Exacto primero; «29» a secas sólo si hay
 * UN lote que empieza con 29 entre los bloques de esa especie (con dos, no se
 * adivina: la pieza se reparte como siempre).
 */
function loteDeLaPieza(lote: string | undefined, codigos: ReadonlySet<string>): string | null {
  const c = codigoDeLote(lote);
  if (!c) return null;
  if (codigos.has(c)) return c;
  if (c.includes("-")) return null;
  const candidatos = [...codigos].filter((k) => k.split("-")[0] === c);
  return candidatos.length === 1 ? candidatos[0]! : null;
}

export interface PorcionDeEspecie {
  /** El lote de la porción; `null` = el resto (lo que se reparte como siempre). */
  lote: string | null;
  bloques: BloqueRolliza[];
  piezas: PiezaCubicada[];
  /** El lote anotado no tiene bloque en esta especie: sus piezas quedan como faltante. */
  sinBloque?: true;
}

/** Lote anotado en piezas que no tiene bloque en su especie: se avisa en la Distribución. */
export interface LoteSinBloque {
  /** Como lo escribió la hoja, ya limpio («77-2026», «29»). */
  lote: string;
  piezas: number;
  m3: number;
}

/**
 * Parte los bloques y las piezas de UNA especie por lote anotado. Sin piezas
 * anotadas (o sin bloque que las reciba) devuelve una sola porción con todo.
 */
export function partirPorLote(
  bloques: readonly BloqueRolliza[],
  piezas: readonly PiezaCubicada[],
): PorcionDeEspecie[] {
  const codigoDe = new Map<BloqueRolliza, string | null>(bloques.map((b) => [b, codigoLoteDeBloque(b)]));
  const codigos = new Set([...codigoDe.values()].filter((c): c is string => Boolean(c)));
  const todo: PorcionDeEspecie[] = [{ lote: null, bloques: [...bloques], piezas: [...piezas] }];
  if (codigos.size === 0 || !piezas.some((p) => p.lote)) return todo;

  const porLote = new Map<string, PiezaCubicada[]>();
  const sinBloque = new Map<string, PiezaCubicada[]>();
  const sueltas: PiezaCubicada[] = [];
  const meter = (m: Map<string, PiezaCubicada[]>, k: string, p: PiezaCubicada) =>
    (m.get(k) ?? m.set(k, []).get(k)!).push(p);
  for (const p of piezas) {
    const escrito = codigoDeLote(p.lote);
    const k = loteDeLaPieza(p.lote, codigos);
    if (k) meter(porLote, k, p);
    else if (escrito) meter(sinBloque, escrito, p);
    else sueltas.push(p);
  }
  if (porLote.size === 0 && sinBloque.size === 0) return todo;

  const porciones: PorcionDeEspecie[] = [...porLote.entries()].map(([lote, ps]) => ({
    lote,
    bloques: bloques.filter((b) => codigoDe.get(b) === lote),
    piezas: ps,
  }));
  for (const [lote, ps] of sinBloque) porciones.push({ lote, bloques: [], piezas: ps, sinBloque: true });
  porciones.push({
    lote: null,
    bloques: bloques.filter((b) => !porLote.has(codigoDe.get(b) ?? "")),
    piezas: sueltas,
  });
  return porciones;
}

/** Las porciones sin bloque, para el aviso «N piezas con lote que no está en esta especie». */
export function lotesSinBloqueDe(porciones: readonly PorcionDeEspecie[]): LoteSinBloque[] {
  return porciones
    .filter((p) => p.sinBloque && p.piezas.length > 0)
    .map((p) => ({
      lote: p.lote ?? "",
      piezas: p.piezas.reduce((a, x) => a + (x.cantidad > 0 ? x.cantidad : 1), 0),
      m3: r4(p.piezas.reduce((a, x) => a + (Number(x.m3) || 0), 0)),
    }));
}

/** «3 piezas con lote que no está en esta especie (77-2026): …», o `null` sin nada que avisar. */
export function avisoLotesSinBloque(lotes: readonly LoteSinBloque[]): string | null {
  if (lotes.length === 0) return null;
  const n = lotes.reduce((a, l) => a + l.piezas, 0);
  return (
    `${n} ${n === 1 ? "pieza" : "piezas"} con lote que no está en esta especie (${lotes.map((l) => l.lote).join(", ")}): ` +
    "no se reparten a otro lote. Revisa el lote anotado o carga el bloque de ese lote."
  );
}

/** Agrupado por permiso SÓLO para mostrar, en el orden en que se cargaron los bloques. */
export function porPermisoDe(distribuidos: readonly BloqueDistribuido[]): EspecieDistribucion["porPermiso"] {
  const permisos = new Map<string | null, BloqueDistribuido[]>();
  for (const d of distribuidos) {
    const k = (d.bloque.permiso ?? "").trim() || null;
    const arr = permisos.get(k);
    if (arr) arr.push(d);
    else permisos.set(k, [d]);
  }
  return [...permisos.entries()].map(([permiso, ds]) => ({
    permiso,
    bloques: ds,
    rollizaM3: r4(ds.reduce((a, d) => a + (Number(d.bloque.m3) || 0), 0)),
    capacidadM3: r4(ds.reduce((a, d) => a + d.capacidadM3, 0)),
    amparadaM3: r4(ds.reduce((a, d) => a + d.usadoM3, 0)),
    amparadaPt: r2(ds.reduce((a, d) => a + d.asignado.reduce((s, g) => s + g.pieTablar, 0), 0)),
  }));
}

/** El mismo grupo (o medida) que faltó en dos porciones es UNA fila: se suma. */
function unirMedidas(a: readonly AsignacionMedida[], b: readonly AsignacionMedida[]): AsignacionMedida[] {
  const out = new Map<string, AsignacionMedida>(a.map((m) => [m.clave, { ...m }]));
  for (const m of b) {
    const acc = out.get(m.clave);
    if (!acc) out.set(m.clave, { ...m });
    else {
      acc.piezas += m.piezas;
      acc.m3 = r4(acc.m3 + m.m3);
      acc.pieTablar = r2(acc.pieTablar + m.pieTablar);
      if (m.sinComprobar) acc.sinComprobar = true;
    }
  }
  return [...out.values()];
}

function unirFaltantes(partes: readonly FaltanteGrupo[][]): FaltanteGrupo[] {
  const out = new Map<string, FaltanteGrupo>();
  for (const f of partes.flat()) {
    const acc = out.get(f.clave);
    if (!acc) {
      out.set(f.clave, { ...f, medidas: [...f.medidas], ...(f.sinTroza ? { sinTroza: [...f.sinTroza] } : {}) });
      continue;
    }
    acc.piezas += f.piezas;
    acc.m3 = r4(acc.m3 + f.m3);
    acc.pieTablar = r2(acc.pieTablar + f.pieTablar);
    acc.rollizaNecesariaM3 = r4(acc.rollizaNecesariaM3 + f.rollizaNecesariaM3);
    acc.medidas = unirMedidas(acc.medidas, f.medidas);
    if (f.sinTroza) acc.sinTroza = [...(acc.sinTroza ?? []), ...f.sinTroza];
  }
  return [...out.values()];
}

/**
 * Une las porciones de una especie en una sola, con los bloques en el orden en
 * que se cargaron. Las cifras son sumas; estado y rendimiento se recalculan
 * con las MISMAS fórmulas del reparto sobre el total.
 */
export function unirPorciones(
  label: string,
  partes: readonly EspecieDistribucion[],
  ordenBloques: readonly BloqueRolliza[],
): EspecieDistribucion {
  const [unica] = partes;
  if (partes.length === 1 && unica) return unica;
  const orden = new Map(ordenBloques.map((b, i) => [b, i]));
  const bloques = partes
    .flatMap((p) => p.bloques)
    .sort((a, b) => (orden.get(a.bloque) ?? 0) - (orden.get(b.bloque) ?? 0));
  const sum = (f: (e: EspecieDistribucion) => number) => r4(partes.reduce((a, e) => a + f(e), 0));
  const rollizaM3 = sum((e) => e.rollizaM3);
  const aserradaDirectaM3 = sum((e) => e.aserradaDirectaM3);
  const amparadaDirectaM3 = sum((e) => e.amparadaDirectaM3);
  const aserradaM3 = sum((e) => e.aserradaM3);
  const respaldoM3 = r4(rollizaM3 + aserradaDirectaM3);
  const faltante = unirFaltantes(partes.map((p) => p.faltante));
  const rendimientoPct = rollizaM3 > EPS ? r2(((aserradaM3 - amparadaDirectaM3) / rollizaM3) * 100) : null;
  const conMedidas = partes.filter((p) => p.medidas);

  return {
    especie: label,
    estado: respaldoM3 <= EPS ? "sin-rolliza" : aserradaM3 <= EPS ? "sin-aserrada" : "ok",
    bloques,
    faltante,
    rollizaM3,
    aserradaDirectaM3,
    amparadaDirectaM3,
    capacidadM3: sum((e) => e.capacidadM3),
    aserradaM3,
    aserradaPt: r2(partes.reduce((a, e) => a + e.aserradaPt, 0)),
    amparadaM3: sum((e) => e.amparadaM3),
    amparadaPt: r2(partes.reduce((a, e) => a + e.amparadaPt, 0)),
    faltanteM3: r4(faltante.reduce((a, f) => a + f.m3, 0)),
    libreM3: sum((e) => e.libreM3),
    rollizaFaltanteM3: r4(faltante.reduce((a, f) => a + f.rollizaNecesariaM3, 0)),
    rendimientoPct,
    imposible: rendimientoPct != null && rendimientoPct > 100,
    costoRolliza: partes.some((p) => p.costoRolliza == null) ? null : r2(partes.reduce((a, e) => a + (e.costoRolliza ?? 0), 0)),
    ...(conMedidas.length > 0
      ? {
          medidas: {
            aplicado: true,
            exigentes: conMedidas.reduce((a, p) => a + (p.medidas?.exigentes ?? 0), 0),
            sinTrozaPiezas: conMedidas.reduce((a, p) => a + (p.medidas?.sinTrozaPiezas ?? 0), 0),
            sinComprobarPiezas: conMedidas.reduce((a, p) => a + (p.medidas?.sinComprobarPiezas ?? 0), 0),
          },
        }
      : {}),
    porPermiso: porPermisoDe(bloques),
  };
}
