/**
 * gtf-serie-region — la serie del talonario de la GTF sale del DEPARTAMENTO
 * donde está el título (Brandon 29-09-2026: «el N° de GTF correlativo por
 * región»).
 *
 * SERFOR (preguntas frecuentes de la GTF): «los dos primeros dígitos del
 * talonario corresponden al código de ubigeo departamental, y los siguientes
 * al correlativo». Lo que publica su consulta, medido en la base el 29-09:
 *
 *   019-001-0000003 · 019-001-0000004   C.N. Santa Rosa de Chivis, Pasco/Oxapampa
 *   019-001-0000013                      otro titular, la MISMA serie
 *   010-001-0000005 … 0000014            Santos Muñoz, Huánuco
 *
 *   019 - 001 - 0000065
 *   │     │     └ correlativo del talonario (7 dígitos, `GTF_DIGITOS_DEFAULT`)
 *   │     └ segundo tramo: el que ya usan los números de esa región; si no hay, 001
 *   └ ubigeo INEI del departamento, a 3 dígitos como lo imprime SERFOR
 *
 * La Ficha del CTP de Blas escribe `19-001`: es el mismo número (los tramos se
 * comparan por valor, `claveNumeroGtf`).
 *
 * PURO y client-safe: el modal y el servidor deciden con estas funciones.
 */

import {
  findDepartamentoByName,
  findDistritoByName,
  findProvinciaByName,
  listDepartamentos,
  listDistritos,
  listProvincias,
} from "@/lib/peru-ubigeo";

/** El segundo tramo cuando la región todavía no tiene ningún número usado. */
export const SERIE_TRAMO_DEFAULT = "001";

const txt = (v: string | null | undefined): string => (v ?? "").trim();
const norm = (s: string): string => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
/** Un tramo numérico por su valor, escrito a 3 dígitos: `19` → `019`, `0019` → `019`. */
const aTres = (t: string): string => String(Number(t)).padStart(3, "0");

/** El ubigeo de un lugar, con los nombres del padrón del INEI. */
export interface UbigeoPadron {
  departamento: string;
  provincia: string;
  distrito: string;
  /** Código INEI del departamento (`19`), o `null` si no se pudo saber. */
  codigo: string | null;
  /**
   * `null` = el departamento venía escrito. `provincia`/`distrito` = venía
   * escrito un lugar que el padrón ubica en UN solo departamento (el plan de
   * Blas dice «Constitucion» donde va la región: es un distrito de Oxapampa,
   * Pasco, y no hay otro con ese nombre en el Perú).
   */
  deducidoDe: "provincia" | "distrito" | null;
}

interface Lugar {
  dep: { code: string; nombre: string };
  prov: { code: string; nombre: string };
  dist?: { code: string; nombre: string };
}

/** Todas las provincias del padrón que se llaman así. */
function provinciasLlamadas(nombre: string): Lugar[] {
  const n = norm(nombre);
  if (!n) return [];
  return listDepartamentos().flatMap((dep) =>
    listProvincias(dep.code)
      .filter((p) => norm(p.nombre) === n)
      .map((p) => ({ dep, prov: { code: p.code, nombre: p.nombre } })),
  );
}

/** Todos los distritos del padrón que se llaman así (dentro de una provincia, si se sabe). */
function distritosLlamados(nombre: string, provincia?: string): Lugar[] {
  const n = norm(nombre);
  const np = provincia ? norm(provincia) : "";
  if (!n) return [];
  return listDepartamentos().flatMap((dep) =>
    listProvincias(dep.code)
      .filter((p) => !np || norm(p.nombre) === np)
      .flatMap((p) =>
        listDistritos(dep.code, p.code)
          .filter((d) => norm(d.nombre) === n)
          .map((d) => ({ dep, prov: { code: p.code, nombre: p.nombre }, dist: { code: d.code, nombre: d.nombre } })),
      ),
  );
}

/** El único departamento que tienen todos los candidatos, o ninguno. */
function unico(lugares: readonly Lugar[]): Lugar | null {
  if (lugares.length === 0) return null;
  const deps = new Set(lugares.map((l) => l.dep.code));
  const provs = new Set(lugares.map((l) => `${l.dep.code}/${l.prov.code}`));
  return deps.size === 1 && provs.size === 1 ? lugares[0] : null;
}

/**
 * El ubigeo escrito en el plan, pasado por el padrón del INEI.
 *
 * Lo que el padrón reconoce se devuelve con su nombre oficial («PASCO» →
 * «Pasco»); lo que no, tal como vino — nunca se borra un dato declarado. Si en
 * el lugar del departamento hay una provincia o un distrito que existe en UN
 * solo departamento, el departamento se deduce: no es adivinar, es leer el
 * padrón. Con dos candidatos no se elige ninguno.
 */
export function ubigeoDelPadron(u: {
  departamento?: string | null;
  provincia?: string | null;
  distrito?: string | null;
}): UbigeoPadron {
  const d = txt(u.departamento);
  const p = txt(u.provincia);
  const di = txt(u.distrito);

  const dep = d ? findDepartamentoByName(d) : null;
  if (dep) {
    let prov = p ? findProvinciaByName(dep.code, p) : null;
    let dist = prov && di ? findDistritoByName(dep.code, prov.code, di) : null;
    // Sin provincia pero con distrito: la provincia la dice el padrón si es una sola.
    if (!prov && !p && di) {
      const l = unico(distritosLlamados(di).filter((x) => x.dep.code === dep.code));
      if (l) {
        prov = { code: l.prov.code, departamento: dep.code, nombre: l.prov.nombre };
        dist = l.dist ? { code: l.dist.code, departamento: dep.code, provincia: l.prov.code, nombre: l.dist.nombre } : null;
      }
    }
    return {
      departamento: dep.nombre,
      provincia: prov?.nombre ?? p,
      distrito: dist?.nombre ?? di,
      codigo: dep.code,
      deducidoDe: null,
    };
  }

  /* El «departamento» no es un departamento: ¿hay una provincia o un distrito
     que el padrón ubica en un solo lugar? En este orden: lo escrito donde va
     el departamento (como provincia y como distrito), después la provincia y
     el distrito. La provincia antes que el distrito: «Oxapampa» es las dos
     cosas, y quien la escribe como región habla de la provincia.

     Pero sólo si TODOS los lugares con ese nombre —provincias y distritos—
     caen en un mismo departamento: «Huancabamba» es provincia de Piura y
     distrito de Oxapampa (Pasco), y elegir la provincia daba la serie 020 y
     la partida en Piura a un plan de Pasco (23 nombres así en el padrón). La
     provincia escrita en el plan desempata («Huancabamba» + «Oxapampa»). */
  const np = norm(p);
  const segunProvincia = (ls: Lugar[]): Lugar[] => {
    const f = np ? ls.filter((l) => norm(l.prov.nombre) === np) : [];
    return f.length ? f : ls;
  };
  const deD = d ? segunProvincia([...provinciasLlamadas(d), ...distritosLlamados(d)]) : [];
  const deUnDepartamento = new Set(deD.map((l) => l.dep.code)).size === 1;
  const candidatos: Array<[() => Lugar | null, UbigeoPadron["deducidoDe"]]> = [
    [() => (deUnDepartamento ? unico(deD.filter((l) => !l.dist)) : null), "provincia"],
    [() => (deUnDepartamento ? unico(deD.filter((l) => l.dist)) : null), "distrito"],
    [() => (p ? unico(provinciasLlamadas(p)) : null), "provincia"],
    [() => (di ? unico(distritosLlamados(di, p || undefined)) : null), "distrito"],
  ];
  for (const [buscar, por] of candidatos) {
    const l = buscar();
    if (!l) continue;
    const distrito = l.dist ?? (di ? findDistritoByName(l.dep.code, l.prov.code, di) : null);
    return {
      departamento: l.dep.nombre,
      provincia: l.prov.nombre,
      distrito: distrito?.nombre ?? di,
      codigo: l.dep.code,
      deducidoDe: por,
    };
  }
  return { departamento: d, provincia: p, distrito: di, codigo: null, deducidoDe: null };
}

/**
 * El código de región del talonario: el ubigeo INEI del departamento a 3
 * dígitos, como lo imprime SERFOR (`Pasco` → `019`). `null` si el nombre no es
 * un departamento: sin región no hay serie, y una serie inventada corre el
 * talonario de otro.
 */
export function codigoRegionGtf(departamento: string | null | undefined): string | null {
  const d = txt(departamento);
  const dep = d ? findDepartamentoByName(d) : null;
  return dep ? aTres(dep.code) : null;
}

/** El nombre del departamento de un código de región (`010` → `Huanuco`). */
export function departamentoDeCodigo(codigo: string | null | undefined): string | null {
  const c = txt(codigo);
  if (!/^\d{1,3}$/.test(c)) return null;
  return listDepartamentos().find((d) => Number(d.code) === Number(c))?.nombre ?? null;
}

/**
 * La región de un N° con la forma de SERFOR (tres tramos numéricos:
 * `019-001-0000065` o `19-001-65`) → `019`. Un número de otra forma
 * (`001-0000127`, `TEST-9001`) no dice región: `null`, y no se le pregunta nada.
 */
export function regionDeNumero(numero: string | null | undefined): string | null {
  const tramos = txt(numero).split(/\s*-\s*/);
  if (tramos.length !== 3 || !tramos.every((t) => /^\d+$/.test(t))) return null;
  const [region] = tramos;
  if (region.replace(/^0+(?=\d)/, "").length > 2) return null;
  return aTres(region);
}

/**
 * La serie de un N° si es de esa región, como la escribe SERFOR: `019-001`
 * para `019-001-0000013`, y `019` para `019-0000001` (hay titulares cuyo
 * talonario no lleva el tramo del medio: C.N. San Luis de Chinchihuani, en la
 * base de Blas). `null` si el N° no es de esa región o no tiene esa forma.
 */
export function serieDelNumero(numero: string | null | undefined, codigo: string): string | null {
  const tramos = txt(numero).split(/\s*-\s*/);
  if (!tramos.every((t) => /^\d+$/.test(t))) return null;
  const [region] = tramos;
  if (region.replace(/^0+(?=\d)/, "").length > 2 || aTres(region) !== codigo) return null;
  if (tramos.length === 3) return `${codigo}-${aTres(tramos[1])}`;
  return tramos.length === 2 ? codigo : null;
}

/**
 * La serie de una región (`019` → `019-001`). El segundo tramo sale del
 * sistema: el más usado entre los números de ESA región (el más nuevo si
 * empatan: `usadas` viene del más nuevo al más viejo). Sin ninguno, `001`.
 */
export function serieDeCodigo(codigo: string, usadas: readonly string[]): string {
  const cuenta = new Map<string, number>();
  for (const n of usadas) {
    if (regionDeNumero(n) !== codigo) continue;
    const segundo = aTres(txt(n).split(/\s*-\s*/)[1]);
    cuenta.set(segundo, (cuenta.get(segundo) ?? 0) + 1);
  }
  let mejor: string | null = null;
  for (const [tramo, veces] of cuenta) if (mejor == null || veces > (cuenta.get(mejor) ?? 0)) mejor = tramo;
  return `${codigo}-${mejor ?? SERIE_TRAMO_DEFAULT}`;
}

/** La serie del talonario para un departamento (`Pasco` → `019-001`), o `null` si no es un departamento. */
export function serieDeRegion(departamento: string | null | undefined, usadas: readonly string[]): string | null {
  const codigo = codigoRegionGtf(departamento);
  return codigo ? serieDeCodigo(codigo, usadas) : null;
}
