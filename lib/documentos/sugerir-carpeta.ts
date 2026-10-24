/**
 * «Foto que se archiva sola» (Brandon 24-10): el papel que entró a la raíz (o a
 * una carpeta de paso) ya está leído → ¿a qué carpeta va? Hasta 3 candidatas,
 * cada una con su puntaje y el motivo que se lee en el ⓘ («dice "Santa Rosa de
 * Chivis"», «mismo RUC 20156698963», «se parece a 4 papeles de esa carpeta»).
 *
 * Nada de IA paga: coincidencias del texto ya leído contra el nombre de cada
 * carpeta, sus terceros ligados, el código que lleva en el nombre, el tipo de
 * papel y los papeles que ya guarda. Puro: el servidor arma el índice una vez
 * (`prepararCarpetas`) y lo reusa para cada papel; la UI sólo muestra.
 */

import { esEsencial } from "./esenciales";
import {
  VACIAS, casiIgual, codigoDeCarpeta, esCarpetaGenerica, estaSinOrdenar, idsDelTexto, mostrar, nucleoDelNombre, palabras,
  tipoDelPapel, tiposDeCarpeta, type CodigoDeCarpeta, type Palabra, type TipoId,
} from "./sugerir-carpeta-texto";

export { esCarpetaGenerica, estaSinOrdenar };
import { normaDe, palabrasDe, similitud, type Perfil } from "./sugerir-carpeta-perfil";

export interface CarpetaPorProponer {
  id: string;
  name: string;
  parentId: string | null;
  tags?: readonly string[] | null;
  /** Terceros ligados (pestaña Terceros) con su nombre y, si el rol lo ve, su RUC/DNI. */
  terceros?: readonly { nombre: string; detalle?: string | null }[];
}

export interface PapelLeido {
  id: string;
  name: string;
  /** El texto leído del papel (`ocrText`). */
  texto: string;
  folderId: string | null;
}

export interface PapelPorArchivar extends PapelLeido {
  /** `ocrMetadata.structured.docType` */
  tipoLeido?: string | null;
  /** La carpeta que propuso la IA al leerlo (`ocrMetadata.sugerencias.folderId`). */
  carpetaIA?: string | null;
}

export interface CarpetaCandidata {
  folderId: string;
  puntaje: number;
  motivos: string[];
  esencial: boolean;
}

interface Nucleo {
  tokens: string[];
  deTercero: boolean;
}

interface CarpetaLista {
  id: string;
  nombre: string;
  parentId: string | null;
  esencial: boolean;
  excluida: boolean;
  nucleos: Nucleo[];
  codigo: CodigoDeCarpeta | null;
  tipos: { claves: Set<string>; soloTipo: boolean } | null;
  ids: Map<string, TipoId>;
  perfiles: Perfil[];
}

export interface IndiceCarpetas {
  carpetas: Map<string, CarpetaLista>;
  df: Map<string, number>;
  nDocs: number;
}

/**
 * Puntos. Una sola palabra en el texto («permiso», «proveedor») o un tipo en
 * una carpeta de varios tipos no llegan al umbral solos: necesitan otra señal.
 */
const P = {
  frase: 10, palabraEnNombre: 7, sueltas: 5, parcial: 4, id: 8, codigo: 9, tipoSolo: 5, tipoVarios: 4.5, tipo: 3, ia: 6, esencial: 3,
};
const UMBRAL = 4.5;
const HERENCIA = 0.7;
/** Un papel «se parece» a otro desde esta similitud (calibrado con los papeles de Blas, 24-10). */
const PARECIDO = 0.3;
const PARECIDO_FUERTE = 0.45;
const PAPELES_POR_CARPETA = 30;

/** Arma el índice una vez por negocio y rol: las carpetas que se pueden proponer y sus papeles. */
export function prepararCarpetas(
  carpetas: readonly CarpetaPorProponer[],
  papeles: readonly PapelLeido[] = [],
  opciones: { idsIgnorados?: readonly string[] } = {},
): IndiceCarpetas {
  const porId = new Map(carpetas.map((c) => [c.id, c]));
  const raizDe = (id: string) => {
    let c = porId.get(id);
    for (let n = 0; c?.parentId && porId.has(c.parentId) && n < 50; n++) c = porId.get(c.parentId);
    return c?.id ?? id;
  };
  const enCamaras = (c: CarpetaPorProponer) => {
    for (let x: CarpetaPorProponer | undefined = c, n = 0; x && n < 50; x = x.parentId ? porId.get(x.parentId) : undefined, n++) {
      if (palabras(x.name).map((p) => p.n).join(" ") === "camaras") return true;
    }
    return false;
  };

  // Los papeles de cada carpeta: perfil de palabras + RUC/DNI que nombran.
  const df = new Map<string, number>();
  const porCarpeta = new Map<string, PapelLeido[]>();
  for (const d of papeles) {
    if (!d.folderId || !porId.has(d.folderId) || !d.texto.trim()) continue;
    const lista = porCarpeta.get(d.folderId) ?? [];
    if (lista.length < PAPELES_POR_CARPETA) lista.push(d);
    porCarpeta.set(d.folderId, lista);
  }
  const pesosPorPapel = new Map<string, Set<string>>();
  for (const lista of porCarpeta.values()) {
    for (const d of lista) {
      const s = palabrasDe(`${d.name}\n${d.texto}`);
      pesosPorPapel.set(d.id, s);
      for (const t of s) df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  const nDocs = pesosPorPapel.size;

  // Un RUC que sale en papeles de 3+ familias de carpetas es el del propio negocio.
  const raicesPorId = new Map<string, Set<string>>();
  const idsPorCarpeta = new Map<string, Map<string, TipoId>>();
  for (const [folderId, lista] of porCarpeta) {
    const ids = new Map<string, TipoId>();
    for (const d of lista) for (const [n, t] of idsDelTexto(d.texto)) ids.set(n, t);
    idsPorCarpeta.set(folderId, ids);
    for (const n of ids.keys()) raicesPorId.set(n, (raicesPorId.get(n) ?? new Set()).add(raizDe(folderId)));
  }
  const ignorados = new Set(opciones.idsIgnorados ?? []);
  for (const [n, raices] of raicesPorId) if (raices.size >= 3) ignorados.add(n);

  const listas = new Map<string, CarpetaLista>();
  for (const c of carpetas) {
    const ids = new Map<string, TipoId>();
    for (const [n, t] of idsPorCarpeta.get(c.id) ?? []) if (!ignorados.has(n)) ids.set(n, t);
    const nucleos: Nucleo[] = [{ tokens: nucleoDelNombre(c.name), deTercero: false }];
    for (const t of c.terceros ?? []) {
      nucleos.push({ tokens: nucleoDelNombre(t.nombre), deTercero: true });
      for (const n of t.detalle?.match(/\d{8,11}/g) ?? []) {
        if (!ignorados.has(n) && (n.length === 8 || n.length === 11)) ids.set(n, n.length === 11 ? "RUC" : "DNI");
      }
    }
    listas.set(c.id, {
      id: c.id,
      nombre: c.name,
      parentId: c.parentId,
      esencial: esEsencial(c),
      excluida: esCarpetaGenerica(c.name) || enCamaras(c),
      nucleos: nucleos.filter((n) => n.tokens.length > 0),
      codigo: codigoDeCarpeta(c.name),
      tipos: tiposDeCarpeta(c.name),
      ids,
      perfiles: (porCarpeta.get(c.id) ?? []).map((d) => {
        const ps = pesosPorPapel.get(d.id) ?? new Set<string>();
        return { id: d.id, name: d.name, palabras: ps, norma: normaDe(ps, df, nDocs) };
      }),
    });
  }
  return { carpetas: listas, df, nDocs };
}

/** Un motivo y lo que suma. `general` = sólo el tipo de papel: no se hereda a las subcarpetas. */
interface Motivo {
  peso: number;
  texto: string;
  general?: boolean;
}
const suma = (ms: readonly Motivo[]) => ms.reduce((t, m) => t + m.peso, 0);

/** Las posiciones (en el texto sin palabras vacías) donde aparece cada palabra plegada. */
function buscador(flujo: Palabra[]) {
  const exactas = new Map<string, number[]>();
  flujo.forEach((p, i) => exactas.set(p.f, [...(exactas.get(p.f) ?? []), i]));
  const largas = [...exactas.keys()].filter((k) => k.length >= 6);
  const cache = new Map<string, Set<number>>();
  return (t: string): Set<number> => {
    const ya = cache.get(t);
    if (ya) return ya;
    const pos = new Set(exactas.get(t) ?? []);
    if (t.length >= 7) for (const k of largas) if (k !== t && casiIgual(k, t)) for (const i of exactas.get(k) ?? []) pos.add(i);
    cache.set(t, pos);
    return pos;
  };
}

interface Lectura {
  flujo: Palabra[];
  original: string;
  /** Hasta dónde llega el nombre del archivo en `original`. */
  finNombre: number;
  buscar: (t: string) => Set<number>;
  /** En cuántos papeles del negocio sale la palabra (la más rara distingue más). */
  df: ReadonlyMap<string, number>;
  nDocs: number;
}

function motivoDeNombre(n: Nucleo, { flujo, original, finNombre, buscar, df, nDocs }: Lectura): Motivo | null {
  const C = n.tokens;
  const pos = C.map(buscar);
  let mejor = { largo: 0, desde: -1, j: 0 };
  C.forEach((_, j) => {
    for (const p of pos[j]) {
      let k = 1;
      while (j + k < C.length && pos[j + k].has(p + k)) k++;
      if (k > mejor.largo) mejor = { largo: k, desde: p, j };
    }
  });
  const tramo = (desde: number, largo: number) => mostrar(original.slice(flujo[desde].ini, flujo[desde + largo - 1].fin));
  const dice = (t: string) => (n.deTercero ? `nombra a «${t}», ligado a la carpeta` : `dice «${t}»`);
  if (mejor.largo === C.length && C.length >= 2) return { peso: P.frase, texto: dice(tramo(mejor.desde, mejor.largo)) };
  if (mejor.largo === 1 && C.length === 1 && C[0].length >= 5) {
    // Una palabra sola: fuerte si la puso quien nombró el archivo, débil si sólo sale en el texto.
    // «Permiso» en «Resolución de permiso» no basta para «Sin permiso»: si la palabra sale en
    // muchos papeles del negocio, tampoco distingue.
    const enNombre = [...pos[0]].find((p) => flujo[p].ini < finNombre);
    const comun = (df.get(C[0]) ?? 0) > Math.max(2, nDocs * 0.08);
    return { peso: enNombre !== undefined && !comun ? P.palabraEnNombre : P.parcial, texto: dice(tramo(enNombre ?? mejor.desde, 1)) };
  }
  // La que más distingue: larga (≥5 letras: «san», «luis» no) y la que menos papeles nombran.
  const rareza = (t: string) => (t.length < 5 ? 1e6 : 0) + (df.get(t) ?? 0) * 100 - t.length;
  const larga = C.reduce((m, t, i) => (rareza(t) < rareza(C[m]) ? i : m), 0);
  if (C.length >= 3 && mejor.largo >= 2 && mejor.j <= larga && larga < mejor.j + mejor.largo) {
    return { peso: P.parcial, texto: dice(tramo(mejor.desde, mejor.largo)) };
  }
  // La palabra más rara del nombre, sola («DNI JEFE SHINSHIGUANI» → «San Luis de Chinchiguani»).
  if (C.length >= 2 && C[larga].length >= 7 && pos[larga].size > 0 && !pos.every((s) => s.size > 0)) {
    return { peso: P.parcial, texto: dice(tramo([...pos[larga]][0], 1)) };
  }
  if (C.length >= 2 && C.every((t) => t.length >= 5) && pos.every((s) => s.size > 0)) {
    const sueltas = C.map((_, j) => tramo([...pos[j]][0], 1));
    return { peso: P.sueltas, texto: `menciona ${sueltas.slice(0, -1).join(", ")} y ${sueltas.at(-1)}` };
  }
  return null;
}

/** Hasta `max` carpetas candidatas para el papel, la mejor primero. Nunca la carpeta donde ya está. */
export function sugerirCarpeta(papel: PapelPorArchivar, indice: IndiceCarpetas, max = 3): CarpetaCandidata[] {
  const original = `${papel.name}\n${papel.texto}`;
  const flujo = palabras(original).filter((p) => !VACIAS.has(p.n));
  const lectura: Lectura = { flujo, original, finNombre: papel.name.length, buscar: buscador(flujo), df: indice.df, nDocs: indice.nDocs };
  const idsPapel = idsDelTexto(papel.texto);
  const tipo = tipoDelPapel(papel.name, papel.texto, papel.tipoLeido);
  const ps = palabrasDe(original);
  const perfil = { palabras: ps, norma: normaDe(ps, indice.df, indice.nDocs) };

  const propias = new Map<string, Motivo[]>();
  for (const c of indice.carpetas.values()) {
    if (c.excluida || c.id === papel.folderId) continue;
    const ms: Motivo[] = [];

    const nombre = c.nucleos.map((n) => motivoDeNombre(n, lectura)).filter((x): x is Motivo => !!x).sort((x, y) => y.peso - x.peso)[0];
    if (nombre) ms.push(nombre);

    const id = [...c.ids].find(([n]) => idsPapel.has(n));
    if (id) ms.push({ peso: P.id, texto: `mismo ${id[1]} ${id[0]}` });

    const cod = c.codigo ? papel.texto.match(c.codigo.re) ?? papel.name.match(c.codigo.re) : null;
    if (cod) ms.push({ peso: P.codigo, texto: `dice «${cod[0].trim()}»` });

    // «GTF 019-0000002» es de UNA guía: si el código no coincide, no es su carpeta aunque sea guía.
    if (tipo && c.tipos?.claves.has(tipo.clave) && (!c.codigo || cod)) {
      const peso = !c.tipos.soloTipo ? P.tipo : c.tipos.claves.size === 1 ? P.tipoSolo : P.tipoVarios;
      ms.push({ peso, texto: `es ${tipo.etiqueta}`, general: true });
    }

    const parecidos = c.perfiles
      .filter((d) => d.id !== papel.id)
      .map((d) => ({ d, sim: similitud(perfil, d, indice.df, indice.nDocs) }))
      .filter((x) => x.sim >= PARECIDO)
      .sort((x, y) => y.sim - x.sim);
    if (parecidos.length) {
      ms.push({
        peso: 2 * Math.min(parecidos.length, 4) + (parecidos[0].sim >= PARECIDO_FUERTE ? 2 : 0),
        texto: parecidos.length === 1 ? `se parece a «${parecidos[0].d.name}»` : `se parece a ${parecidos.length} papeles de esa carpeta`,
      });
    }

    if (papel.carpetaIA === c.id) ms.push({ peso: P.ia, texto: "la IA lo leyó y lo pondría ahí" });
    if (ms.length) propias.set(c.id, ms);
  }

  // Una subcarpeta con señal PROPIA hereda parte de lo que su madre ganó por
  // nombre, RUC o código (no por tipo: «Guías › Sin permiso» no es guía por
  // ser hija): «Chivis › Títulos» le gana a «Títulos» suelta y a «Chivis» sola.
  // Lo que dice igual que la madre (el RUC de la comunidad) no cuenta dos veces.
  const candidatas: CarpetaCandidata[] = [];
  for (const [id, todos] of propias) {
    let herencia: { puntos: number; nombre: string; textos: Set<string> } | null = null;
    for (let x = indice.carpetas.get(id), n = 0; x?.parentId && n < 50; n++) {
      x = indice.carpetas.get(x.parentId);
      const madre = x ? propias.get(x.id) : undefined;
      const puntos = madre ? suma(madre.filter((m) => !m.general)) : 0;
      if (x && madre && puntos > 0 && (!herencia || puntos > herencia.puntos)) {
        herencia = { puntos, nombre: x.nombre, textos: new Set(madre.map((m) => m.texto)) };
      }
    }
    const motivos = herencia ? todos.filter((m) => !herencia.textos.has(m.texto)) : [...todos];
    const propio = suma(motivos);
    const base = propio + (herencia ? HERENCIA * herencia.puntos : 0);
    const c = indice.carpetas.get(id);
    if (propio <= 0 || base < UMBRAL || !c) continue;
    if (herencia) motivos.push({ peso: HERENCIA * herencia.puntos, texto: `está dentro de «${mostrar(herencia.nombre)}»` });
    candidatas.push({
      folderId: id,
      puntaje: Math.round((base + (c.esencial ? P.esencial : 0)) * 10) / 10,
      motivos: [...new Set(motivos.sort((x, y) => y.peso - x.peso).map((m) => m.texto))].slice(0, 3),
      esencial: c.esencial,
    });
  }
  return candidatas
    .sort((x, y) => y.puntaje - x.puntaje || Number(y.esencial) - Number(x.esencial) || x.folderId.localeCompare(y.folderId))
    .slice(0, max);
}
