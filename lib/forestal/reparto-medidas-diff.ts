/**
 * Antes / después de repartir respetando las medidas de troza (ADR-505).
 *
 * «Antes» = el mismo reparto con `ignorarMedidas` en todos los bloques (como
 * se repartía hasta el 20-10); «después» = con la regla. Dice, por permiso,
 * cuánto ampara cada uno en m³, PT y piezas, cuántas piezas cambiaron de
 * bloque, y qué ya escrito queda tocado: líneas tildadas como distribuidas y
 * jornadas que ya están en el Libro. Puro: sin React, sin red.
 */

import type { BloqueDistribuido, Distribucion } from "./cubicacion-reparto";
import { cuadrarMedidasDelReparto, type FuentesDeTrozas } from "./cuadre-medidas-rolliza";
import { jornadasDe, lineasDelReparto } from "./reparto-por-distribuir";

export interface CifrasPermiso {
  m3: number;
  pt: number;
  piezas: number;
}

export interface PermisoAntesDespues {
  /** Recortado; «Sin permiso» si el bloque no lo declaró. */
  permiso: string;
  antes: CifrasPermiso;
  despues: CifrasPermiso;
}

export interface JornadaTocada {
  bloqueId: string;
  etiqueta: string;
  dia: number;
}

export interface DiffRepartoMedidas {
  avisosAntes: number;
  avisosDespues: number;
  /** Piezas que están en otro lugar (otro bloque o «Falta por distribuir»). */
  piezasMovidas: number;
  permisos: PermisoAntesDespues[];
  /** Claves de casilla tildadas cuya línea cambió de contenido o desapareció. */
  marcadasQueCambian: string[];
  /** Jornadas ya escritas en el Libro cuyo contenido cambia. */
  jornadasLibroQueCambian: JornadaTocada[];
}

const SIN_PERMISO = "Sin permiso";
const FALTANTE = "\u0000faltante";

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const r2 = (n: number) => Math.round(n * 100) / 100;

const permisoDe = (b: BloqueDistribuido) => (b.bloque.permiso ?? "").trim() || SIN_PERMISO;

/** Piezas por lugar (bloque o faltante) × medida. */
function lugares(d: Distribucion): Map<string, number> {
  const out = new Map<string, number>();
  const sumar = (lugar: string, medida: string, n: number) => {
    if (!(n > 0)) return;
    const k = `${lugar}\u0001${medida}`;
    out.set(k, (out.get(k) ?? 0) + n);
  };
  for (const e of d.especies) {
    for (const b of e.bloques) for (const g of b.asignado) for (const m of g.medidas) sumar(b.bloque.id, `${e.especie}|${m.clave}`, m.piezas);
    for (const f of e.faltante) for (const m of f.medidas) sumar(FALTANTE, `${e.especie}|${m.clave}`, m.piezas);
  }
  return out;
}

function porPermiso(d: Distribucion): Map<string, CifrasPermiso> {
  const out = new Map<string, CifrasPermiso>();
  for (const e of d.especies) {
    for (const b of e.bloques) {
      const k = permisoDe(b);
      const c = out.get(k) ?? { m3: 0, pt: 0, piezas: 0 };
      for (const g of b.asignado) {
        c.m3 += g.m3;
        c.pt += g.pieTablar;
        c.piezas += g.piezas;
      }
      out.set(k, c);
    }
  }
  return out;
}

/** Huella de lo que dice una línea o una jornada: sus medidas con sus piezas. */
const huella = (grupos: readonly { clave: string; m3: number; medidas: readonly { clave: string; piezas: number }[] }[]) =>
  grupos
    .flatMap((g) => g.medidas.filter((m) => m.piezas > 0).map((m) => `${g.clave}/${m.clave}:${m.piezas}`))
    .sort()
    .join(",");

function huellasDeLinea(d: Distribucion): Map<string, string> {
  return new Map(lineasDelReparto(d).map((l) => [l.clave, huella([l.grupo])]));
}

function huellasDeJornada(d: Distribucion): Map<string, string> {
  const out = new Map<string, string>();
  for (const e of d.especies) for (const b of e.bloques) for (const j of jornadasDe(b)) out.set(`${b.bloque.id}|${j.dia}`, huella(j.grupos));
  return out;
}

export function compararRepartoPorMedidas(
  antes: Distribucion,
  despues: Distribucion,
  fuentes: FuentesDeTrozas,
  marcadas: ReadonlySet<string> = new Set(),
): DiffRepartoMedidas {
  const la = lugares(antes);
  const ld = lugares(despues);
  let piezasMovidas = 0;
  for (const [k, n] of ld) piezasMovidas += Math.max(0, n - (la.get(k) ?? 0));

  const pa = porPermiso(antes);
  const pd = porPermiso(despues);
  const orden = [...new Set([...pd.keys(), ...pa.keys()])];
  const cero: CifrasPermiso = { m3: 0, pt: 0, piezas: 0 };
  const redondear = (c: CifrasPermiso): CifrasPermiso => ({ m3: r3(c.m3), pt: r2(c.pt), piezas: c.piezas });
  const permisos = orden.map((permiso) => ({ permiso, antes: redondear(pa.get(permiso) ?? cero), despues: redondear(pd.get(permiso) ?? cero) }));

  const ha = huellasDeLinea(antes);
  const hd = huellasDeLinea(despues);
  const marcadasQueCambian = [...marcadas].filter((k) => ha.has(k) && ha.get(k) !== hd.get(k));

  const ja = huellasDeJornada(antes);
  const jd = huellasDeJornada(despues);
  const jornadasLibroQueCambian: JornadaTocada[] = [];
  for (const e of despues.especies) {
    for (const b of e.bloques) {
      for (const j of b.bloque.jornadasLibro ?? []) {
        const k = `${b.bloque.id}|${j.dia}`;
        if (ja.get(k) !== jd.get(k)) jornadasLibroQueCambian.push({ bloqueId: b.bloque.id, etiqueta: b.bloque.etiqueta.trim() || "Sin etiqueta", dia: j.dia });
      }
    }
  }

  return {
    avisosAntes: cuadrarMedidasDelReparto(antes, fuentes).avisos,
    avisosDespues: cuadrarMedidasDelReparto(despues, fuentes).avisos,
    piezasMovidas,
    permisos,
    marcadasQueCambian,
    jornadasLibroQueCambian,
  };
}
