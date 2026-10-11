/**
 * «Visitante A, B…» del día y el conteo de personas distintas (ADR-479,
 * contrato K3 (c), 2026-10-08). Puro, determinista y client-safe.
 *
 * Entrada: las fotos del detector de UN día con sus cajas (la firma de la
 * ropa y el chaleco los calculó el servidor al guardar: `apariencia.ts`).
 * Salida: grupos de cajas que probablemente son la misma persona.
 *
 * Reglas:
 *   - Orden por hora (y por id de foto y número de caja): el mismo día da
 *     siempre las mismas letras, venga como venga la lista.
 *   - Una caja metida dentro de otra MÁS GRANDE de la misma foto (≥ 60 % de
 *     su área) es la misma persona detectada dos veces: cuenta una sola vez.
 *     Fuera de eso, dos cajas de la misma foto nunca son la misma persona.
 *   - Seguimiento: la misma cámara, ≤ 5 min después, la caja casi en el mismo
 *     lugar y de tamaño parecido = la misma persona, aunque la ropa se lea algo
 *     distinta (umbral 0,5). Así se juntan también las cajas sin firma que
 *     siguen a alguien ya agrupado.
 *   - Si no, cada caja se une al grupo más parecido si la distancia de la ropa
 *     es ≤ umbral, en promedio contra las ÚLTIMAS fotos del grupo (la luz
 *     cambia en el día).
 *   - Con chaleco → «Personal 1, 2…»; sin chaleco → «Visitante A, B…». Nunca
 *     se cruzan por la ropa. Un marcador leído en el chaleco (fase 5) manda
 *     sobre la ropa, pero sólo si es un chaleco REGISTRADO
 *     (`chalecosRegistrados`; hoy ninguno): el número lo manda el cliente.
 *   - Sin firma (caja chica, < 40 px) y sin nadie a quien seguir → «sin
 *     agrupar»: se cuenta aparte, y la misma figura quieta en fotos seguidas
 *     cuenta una vez.
 *   - Correcciones a mano («es el mismo que…», `uniones`): se aplican al
 *     final, por la clave de cada grupo. Se guardan por día en el servidor
 *     (`ruta personas/uniones`); el agrupado en sí no se guarda: se arma cada
 *     vez que se lee. Las cifras van con «aprox.».
 *
 * Calibrado con las fotos reales de Blas del 08 al 10-10 (ver ADR-479 y el
 * test `camaras-visitantes-duplicados`): el 10-10 a las 07:57, 3 personas en
 * dos fotos salían como 8 visitantes (3 por cajas repetidas, 2 por la etiqueta
 * «NN %» de la caja repetida dibujada encima de la ropa).
 */

import {
  SIN_CHALECOS_REGISTRADOS,
  UMBRAL_MISMA_ROPA,
  distanciaFirmas,
  marcadorDeChaleco,
  type CajaGuardada,
} from "./apariencia";

export interface FotoConCajas {
  docId: string;
  /** Instante ISO. */
  at: string;
  camaraId: string | null;
  camaraNombre: string;
  /** `null` = foto de antes del 08-10 (no guardaba dónde estaba cada persona). */
  cajas: readonly CajaGuardada[] | null;
}

export interface FotoDeGrupo {
  docId: string;
  at: string;
  camaraId: string | null;
  camaraNombre: string;
  /** Índice de la caja dentro de la foto. */
  caja: number;
}

export interface RecuadroPortada {
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** Una de las mejores fotos del visitante (la caja, para recortarla). */
export interface FotoDestacada {
  docId: string;
  at: string;
  camaraNombre: string;
  caja: RecuadroPortada;
}

/** Un rato seguido a la vista: un hueco de más de 20 min abre otro. */
export interface TramoVisita {
  desde: string;
  hasta: string;
  camaras: string[];
  fotos: number;
}

export interface GrupoPersonas {
  /**
   * Identifica al grupo dentro del día: la primera foto y caja donde aparece
   * («<docId>#<caja>»). Las fotos que llegan después no la cambian; la letra
   * sí puede correrse (si se borra una foto de antes), por eso la UI elige por
   * esto y no por la etiqueta.
   */
  clave: string;
  /** «Visitante A», «Personal 1», «Personal · marcador 203». */
  etiqueta: string;
  tipo: "visitante" | "personal";
  /** Por el marcador del chaleco (fase 5); `null` mientras no se lea. */
  colaboradorId: string | null;
  marcador: number | null;
  /** Una por foto (la caja repetida de la misma foto no suma). */
  fotos: FotoDeGrupo[];
  desde: string;
  hasta: string;
  /** Nombres de las cámaras donde se lo vio, en orden de aparición. */
  camaras: string[];
  /** La foto donde se lo ve más grande: la «portada» de la carpeta del visitante. */
  portada: { docId: string; caja: RecuadroPortada };
  /** Las 3-4 fotos donde mejor se lo ve, separadas en el tiempo, en orden de hora. */
  mejores: FotoDestacada[];
  /** Cuándo estuvo: un tramo por cada rato seguido a la vista. */
  tramos: TramoVisita[];
  /** Minutos a la vista: la suma de los tramos (una sola foto = 0). */
  minutos: number;
  /** Otros grupos del mismo tipo con ropa parecida (los más cercanos primero): candidatos a «es el mismo». */
  parecidos: Array<{ clave: string; etiqueta: string; distancia: number }>;
  /** Claves de los grupos que se le sumaron a mano («es el mismo que…»). */
  unidos: string[];
}

export interface PersonasPorHoraUnicas {
  hora: number;
  /** Grupos distintos vistos en esa hora. */
  personas: number;
  conChaleco: number;
  /** Figuras sin firma en esa hora (lejos de la cámara). */
  sinAgrupar: number;
}

export interface ResumenPersonasDia {
  dia: string;
  /** Grupos distintos (visitantes + personal). */
  personas: number;
  conChaleco: number;
  visitantes: number;
  grupos: GrupoPersonas[];
  /** Figuras sin firma (persona muy chica en el cuadro) que no siguen a nadie: no se adivinan. */
  sinAgrupar: number;
  /** Cajas repetidas dentro de la misma foto (la misma persona detectada dos veces): no suman. */
  repetidasEnFoto: number;
  /** Fotos guardadas sin cajas (de antes del 08-10): no entran en el conteo. */
  fotosSinCajas: number;
  /** Fotos del día que sí entraron. */
  fotosConCajas: number;
  porHora: PersonasPorHoraUnicas[];
  /** El conteo es una estimación por la ropa: siempre «aprox.». */
  aprox: true;
}

/** «Es el mismo que…»: el grupo `b` se suma al grupo `a` (claves del día). */
export interface UnionVisitantes {
  a: string;
  b: string;
}

/**
 * Una caja nueva se compara con el PROMEDIO de distancias a las últimas 5 del
 * grupo. Con las fotos de Blas del 08-10 (26 cajas con firma, etiquetadas a
 * ojo): promedio de 5 a 0,30 → 11 grupos para 11 personas/objetos reales,
 * precisión 0,86 y cobertura 0,70 de los pares; el mínimo de 3 juntaba a dos
 * personas distintas (precisión 0,52).
 */
const ULTIMAS_DEL_GRUPO = 5;
/**
 * Caja chica metida en una más grande de la misma foto. Con Blas 08-10 a 10-10:
 * los 10 pares con ≥ 0,6 eran la misma persona (cuerpo entero + medio cuerpo);
 * el par de personas distintas más metido llegaba a 0,42.
 */
export const CONTENIDA_MISMA_PERSONA = 0.6;
/**
 * Seguimiento en la misma cámara: hasta esto desde la última foto del grupo en
 * ella. El detector saca «sigue ahí» cada minuto, pero con la pestaña tapada o
 * el video trabado el hueco llega a 3-5 min (Blas 09-10: el mismo hombre parado
 * en la máquina del patio salió como 4 visitantes entre 14:07 y 14:11).
 */
export const SEGUIMIENTO_MS = 5 * 60_000;
/**
 * …con la caja casi en el mismo lugar: el centro a ≤ esto × el alto de la
 * persona (medido en la foto 16:9) y un tamaño parecido (≤ 1,5 veces: con 1,8
 * se juntaba al hombre parado con el que pasó al lado cargando madera).
 */
export const CERCA_SEGUIMIENTO = 0.5;
const PROPORCION_TAMANO = 1.5;
const ASPECTO_FOTO = 16 / 9;
/**
 * …y la ropa de ESA foto a esta distancia o menos (más suelto que
 * `UMBRAL_MISMA_ROPA`: lugar y hora ya dicen mucho). Blas 10-10: los pares
 * reales seguidos daban 0,23-0,44; el que pasó al lado, 0,48. Con 0,5, una
 * camisa roja y una azul con el mismo jean (0,5 justo) se juntaban.
 */
export const UMBRAL_SEGUIMIENTO = 0.45;
/** Un hueco de más que esto entre dos fotos del mismo visitante abre otro tramo. */
export const HUECO_TRAMO_MS = 20 * 60_000;
/** Cuántas fotos destacadas por visitante. */
const MEJORES = 4;
/** Candidatos a «es el mismo»: por debajo de esta distancia de ropa (0,5 = el torso no se parece en nada). */
const DISTANCIA_PARECIDO = 0.5;

const fmtHoraLima = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Lima", hourCycle: "h23", hour: "2-digit" });
const horaLima = (ms: number) => Number(fmtHoraLima.format(new Date(ms)));

/** A, B … Z, AA, AB … */
export function letraDeVisitante(n: number): string {
  let s = "";
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
}

const area = (c: RecuadroPortada) => c.ancho * c.alto;
function interseccion(a: RecuadroPortada, b: RecuadroPortada): number {
  const ancho = Math.min(a.x + a.ancho, b.x + b.ancho) - Math.max(a.x, b.x);
  const alto = Math.min(a.y + a.alto, b.y + b.alto) - Math.max(a.y, b.y);
  return ancho > 0 && alto > 0 ? ancho * alto : 0;
}
/** Qué parte de la caja más chica cae dentro de la otra (0-1). */
export function contencion(a: RecuadroPortada, b: RecuadroPortada): number {
  const menor = Math.min(area(a), area(b));
  return menor > 0 ? interseccion(a, b) / menor : 0;
}
/**
 * Qué tan lejos quedó una caja de la otra, en «altos de persona» (0 = mismo
 * centro); `Infinity` si el tamaño es muy distinto (una lejos y otra cerca).
 */
export function separacionCajas(a: RecuadroPortada, b: RecuadroPortada): number {
  const alto = Math.max(a.alto, b.alto);
  if (alto <= 0 || alto > PROPORCION_TAMANO * Math.min(a.alto, b.alto)) return Infinity;
  const dx = (a.x + a.ancho / 2 - (b.x + b.ancho / 2)) * ASPECTO_FOTO;
  const dy = a.y + a.alto / 2 - (b.y + b.alto / 2);
  return Math.hypot(dx, dy) / alto;
}

interface Aparicion {
  docId: string;
  ms: number;
  at: string;
  camaraId: string | null;
  camaraNombre: string;
  caja: number;
  /** La propia y las de las cajas repetidas de la misma foto (la etiqueta de una cae sobre la ropa de la otra). */
  firmas: string[];
  chaleco: boolean;
  marcador: number | null;
  recuadro: RecuadroPortada;
  confianza: number;
}

interface GrupoEnArmado {
  tipo: "visitante" | "personal";
  marcador: number | null;
  miembros: Aparicion[];
  docs: Set<string>;
  unidos: string[];
}

const mismaCamara = (a: Aparicion, b: Aparicion) =>
  a.camaraId !== null && b.camaraId !== null ? a.camaraId === b.camaraId : a.camaraNombre === b.camaraNombre;

/** Lo más parecido entre las firmas de dos apariciones (0-1). */
function distanciaApariciones(a: Aparicion, b: Aparicion): number {
  let d = 1;
  for (const x of a.firmas) for (const y of b.firmas) d = Math.min(d, distanciaFirmas(x, y));
  return d;
}

/** Promedio contra las últimas apariciones CON firma del grupo; `Infinity` si no tiene ninguna. */
function distanciaAGrupo(g: GrupoEnArmado, a: Aparicion): number {
  const conFirma = g.miembros.filter((m) => m.firmas.length > 0).slice(-ULTIMAS_DEL_GRUPO);
  if (conFirma.length === 0 || a.firmas.length === 0) return Infinity;
  return conFirma.reduce((s, m) => s + distanciaApariciones(m, a), 0) / conFirma.length;
}

/**
 * La foto de `miembros` más cerca de `a` en la misma cámara dentro de la
 * ventana (no sólo la última: un grupo puede tener a alguien parado en un
 * lugar y fotos en otro). `null` si ninguna queda cerca.
 */
function seguimiento(miembros: readonly Aparicion[], a: Aparicion): { m: Aparicion; separacion: number } | null {
  let mejor: { m: Aparicion; separacion: number } | null = null;
  for (let i = miembros.length - 1; i >= 0; i--) {
    const m = miembros[i];
    if (a.ms - m.ms > SEGUIMIENTO_MS) break;
    if (m.docId === a.docId || !mismaCamara(m, a)) continue;
    const separacion = separacionCajas(m.recuadro, a.recuadro);
    if (separacion <= CERCA_SEGUIMIENTO && (!mejor || separacion < mejor.separacion)) mejor = { m, separacion };
  }
  return mejor;
}

/** Las cajas de una foto, sin las repetidas (una caja metida en otra más grande es la misma persona). */
function aparicionesDeFoto(f: FotoConCajas, ms: number, cajas: readonly CajaGuardada[], chalecos: ReadonlySet<number>) {
  const orden = cajas.map((c, i) => ({ c, i })).sort((p, q) => area(q.c) - area(p.c) || p.i - q.i);
  const quedan: Aparicion[] = [];
  let repetidas = 0;
  for (const { c, i } of orden) {
    const recuadro = { x: c.x, y: c.y, ancho: c.ancho, alto: c.alto };
    const marcador = marcadorDeChaleco(c.marcador, chalecos);
    const madre = quedan.find((q) => contencion(q.recuadro, recuadro) >= CONTENIDA_MISMA_PERSONA);
    if (madre) {
      repetidas++;
      if (c.firma) madre.firmas.push(c.firma);
      madre.chaleco ||= c.chaleco === true;
      madre.marcador ??= marcador;
      continue;
    }
    quedan.push({
      docId: f.docId,
      ms,
      at: new Date(ms).toISOString(),
      camaraId: f.camaraId,
      camaraNombre: f.camaraNombre,
      caja: i,
      firmas: c.firma ? [c.firma] : [],
      chaleco: c.chaleco === true,
      marcador,
      recuadro,
      confianza: c.confianza,
    });
  }
  return { quedan, repetidas };
}

export function agruparPersonasDelDia(
  dia: string,
  fotos: readonly FotoConCajas[],
  umbral: number = UMBRAL_MISMA_ROPA,
  chalecosRegistrados: ReadonlySet<number> = SIN_CHALECOS_REGISTRADOS,
  uniones: readonly UnionVisitantes[] = [],
): ResumenPersonasDia {
  let fotosSinCajas = 0;
  let fotosConCajas = 0;
  let repetidasEnFoto = 0;
  const apariciones: Aparicion[] = [];
  for (const f of fotos) {
    const ms = Date.parse(f.at);
    if (!f.cajas || !Number.isFinite(ms)) {
      fotosSinCajas++;
      continue;
    }
    fotosConCajas++;
    const { quedan, repetidas } = aparicionesDeFoto(f, ms, f.cajas, chalecosRegistrados);
    repetidasEnFoto += repetidas;
    apariciones.push(...quedan);
  }
  apariciones.sort((a, b) => a.ms - b.ms || a.docId.localeCompare(b.docId) || a.caja - b.caja);

  const grupos: GrupoEnArmado[] = [];
  /** Figuras sin firma: cada lista es la misma figura en fotos seguidas. */
  const sueltas: Aparicion[][] = [];
  for (const a of apariciones) {
    if (a.marcador !== null) {
      const g = grupos.find((x) => x.marcador === a.marcador);
      if (g) sumar(g, a);
      else grupos.push(nuevo("personal", a.marcador, [a]));
      continue;
    }
    const tipo = a.chaleco ? "personal" : "visitante";
    // 1) Seguimiento en la misma cámara. Sin firma no hay tipo: sigue a cualquiera.
    let seguido: { g: GrupoEnArmado; m: Aparicion; separacion: number } | null = null;
    for (const g of grupos) {
      if (g.marcador !== null || g.docs.has(a.docId) || (a.firmas.length > 0 && g.tipo !== tipo)) continue;
      const v = seguimiento(g.miembros, a);
      // Con firma, la ropa de ESA foto no puede ser muy distinta (el grupo entero puede estar mezclado).
      if (v && (a.firmas.length === 0 || v.m.firmas.length === 0 || distanciaApariciones(v.m, a) <= UMBRAL_SEGUIMIENTO)) {
        if (!seguido || v.separacion < seguido.separacion) seguido = { g, ...v };
      }
    }
    if (seguido) {
      sumar(seguido.g, a);
      continue;
    }
    if (a.firmas.length === 0) {
      const tira = sueltas.find((s) => seguimiento(s, a) !== null);
      if (tira) tira.push(a);
      else sueltas.push([a]);
      continue;
    }
    // 2) Por la ropa, contra todo el día.
    let mejor: GrupoEnArmado | null = null;
    let mejorD = Infinity;
    for (const g of grupos) {
      if (g.tipo !== tipo || g.marcador !== null || g.docs.has(a.docId)) continue;
      const d = distanciaAGrupo(g, a);
      if (d < mejorD) {
        mejorD = d;
        mejor = g;
      }
    }
    if (mejor && mejorD <= umbral) {
      sumar(mejor, a);
      continue;
    }
    // 3) Alguien nuevo: si venía de lejos (figura sin firma en el mismo lugar), su llegada es esa.
    const i = sueltas.findIndex((s) => seguimiento(s, a) !== null);
    const previas = i >= 0 ? sueltas.splice(i, 1)[0] : [];
    grupos.push(nuevo(tipo, null, [...previas, a]));
  }

  const finales = aplicarUniones(grupos, uniones);
  return armarResumen(dia, finales, sueltas, { repetidasEnFoto, fotosSinCajas, fotosConCajas });
}

function nuevo(tipo: GrupoEnArmado["tipo"], marcador: number | null, miembros: Aparicion[]): GrupoEnArmado {
  return { tipo, marcador, miembros, docs: new Set(miembros.map((m) => m.docId)), unidos: [] };
}

function sumar(g: GrupoEnArmado, a: Aparicion): void {
  g.miembros.push(a);
  g.docs.add(a.docId);
}

const claveDe = (g: GrupoEnArmado) => `${g.miembros[0].docId}#${g.miembros[0].caja}`;
const ordenAparicion = (a: Aparicion, b: Aparicion) => a.ms - b.ms || a.docId.localeCompare(b.docId) || a.caja - b.caja;

/**
 * «Es el mismo que…»: junta grupos por su clave. Una unión con una clave que
 * ya no existe (se borró la foto) se ignora. Si dos cajas de la MISMA foto
 * quedan juntas (lo decidió alguien a mano), queda la más grande.
 */
function aplicarUniones(grupos: GrupoEnArmado[], uniones: readonly UnionVisitantes[]): GrupoEnArmado[] {
  if (uniones.length === 0) return grupos;
  const porClave = new Map(grupos.map((g, i) => [claveDe(g), i]));
  const padre = grupos.map((_, i) => i);
  const raiz = (i: number): number => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
  for (const u of uniones) {
    const a = porClave.get(u.a);
    const b = porClave.get(u.b);
    if (a === undefined || b === undefined) continue;
    const [ra, rb] = [raiz(a), raiz(b)];
    if (ra === rb) continue;
    // Queda el que apareció primero: las letras siguen el orden de llegada.
    padre[Math.max(ra, rb)] = Math.min(ra, rb);
  }
  const salida: GrupoEnArmado[] = [];
  const dePadre = new Map<number, { g: GrupoEnArmado; claves: string[] }>();
  grupos.forEach((g, i) => {
    const r = raiz(i);
    const base = dePadre.get(r);
    if (!base) {
      const copia = { ...g, miembros: [...g.miembros], docs: new Set(g.docs), unidos: [] };
      dePadre.set(r, { g: copia, claves: [claveDe(g)] });
      salida.push(copia);
      return;
    }
    base.claves.push(claveDe(g));
    if (g.tipo === "personal") base.g.tipo = "personal";
    for (const m of g.miembros) {
      const otra = base.g.miembros.findIndex((x) => x.docId === m.docId);
      if (otra < 0) base.g.miembros.push(m);
      else if (area(m.recuadro) > area(base.g.miembros[otra].recuadro)) base.g.miembros[otra] = m;
      base.g.docs.add(m.docId);
    }
  });
  // La clave queda la de la primera aparición (siempre la de uno de los grupos unidos); `unidos`, las demás.
  for (const { g, claves } of dePadre.values()) {
    g.miembros.sort(ordenAparicion);
    g.unidos = claves.filter((c) => c !== claveDe(g));
  }
  return salida;
}

function tramosDe(miembros: readonly Aparicion[]): TramoVisita[] {
  const ordenados = [...miembros].sort(ordenAparicion);
  const tramos: Array<{ desde: number; hasta: number; camaras: string[]; fotos: number }> = [];
  for (const m of ordenados) {
    const t = tramos[tramos.length - 1];
    if (t && m.ms - t.hasta <= HUECO_TRAMO_MS) {
      t.hasta = m.ms;
      t.fotos++;
      if (!t.camaras.includes(m.camaraNombre)) t.camaras.push(m.camaraNombre);
    } else tramos.push({ desde: m.ms, hasta: m.ms, camaras: [m.camaraNombre], fotos: 1 });
  }
  return tramos.map((t) => ({ desde: new Date(t.desde).toISOString(), hasta: new Date(t.hasta).toISOString(), camaras: t.camaras, fotos: t.fotos }));
}

/** Las mejores fotos: más grande y más segura primero, sin dos a menos de 2 min si hay de dónde elegir. */
function mejoresDe(miembros: readonly Aparicion[]): FotoDestacada[] {
  const puntaje = (m: Aparicion) => area(m.recuadro) * (0.5 + m.confianza) * (m.firmas.length > 0 ? 1 : 0.5);
  const orden = [...miembros].sort((a, b) => puntaje(b) - puntaje(a) || ordenAparicion(a, b));
  const elegidas: Aparicion[] = [];
  for (const m of orden) {
    if (elegidas.length >= MEJORES) break;
    if (elegidas.some((e) => Math.abs(e.ms - m.ms) < 120_000)) continue;
    elegidas.push(m);
  }
  for (const m of orden) {
    if (elegidas.length >= Math.min(MEJORES, miembros.length)) break;
    if (!elegidas.includes(m)) elegidas.push(m);
  }
  return elegidas
    .sort(ordenAparicion)
    .map((m) => ({ docId: m.docId, at: m.at, camaraNombre: m.camaraNombre, caja: m.recuadro }));
}

function armarResumen(
  dia: string,
  grupos: GrupoEnArmado[],
  sueltas: Aparicion[][],
  cuentas: { repetidasEnFoto: number; fotosSinCajas: number; fotosConCajas: number },
): ResumenPersonasDia {
  // Las letras siguen el orden de llegada (absorber una figura lejana puede adelantar a alguien).
  const ordenados = [...grupos].sort((a, b) => ordenAparicion(a.miembros[0], b.miembros[0]));
  let nVisitante = 0;
  let nPersonal = 0;
  const salida: GrupoPersonas[] = ordenados.map((g) => {
    const etiqueta =
      g.marcador !== null
        ? `Personal · marcador ${g.marcador}`
        : g.tipo === "personal"
          ? `Personal ${++nPersonal}`
          : `Visitante ${letraDeVisitante(nVisitante++)}`;
    const portada = g.miembros.reduce((m, x) => (area(x.recuadro) > area(m.recuadro) ? x : m));
    const camaras: string[] = [];
    for (const m of g.miembros) if (!camaras.includes(m.camaraNombre)) camaras.push(m.camaraNombre);
    const tramos = tramosDe(g.miembros);
    return {
      clave: claveDe(g),
      etiqueta,
      tipo: g.tipo,
      colaboradorId: null,
      marcador: g.marcador,
      fotos: g.miembros.map((m) => ({ docId: m.docId, at: m.at, camaraId: m.camaraId, camaraNombre: m.camaraNombre, caja: m.caja })),
      desde: g.miembros[0].at,
      hasta: g.miembros.reduce((h, m) => (m.at > h ? m.at : h), g.miembros[0].at),
      camaras,
      portada: { docId: portada.docId, caja: portada.recuadro },
      mejores: mejoresDe(g.miembros),
      tramos,
      minutos: Math.round(tramos.reduce((s, t) => s + (Date.parse(t.hasta) - Date.parse(t.desde)), 0) / 60_000),
      parecidos: [],
      unidos: g.unidos,
    };
  });
  // Candidatos a «es el mismo»: del mismo tipo, por la ropa (lo más parecido entre sus fotos).
  ordenados.forEach((g, i) => {
    if (g.marcador !== null) return;
    const lista: GrupoPersonas["parecidos"] = [];
    ordenados.forEach((h, j) => {
      if (i === j || h.marcador !== null || h.tipo !== g.tipo) return;
      let d = 1;
      for (const a of g.miembros) for (const b of h.miembros) if (a.firmas.length && b.firmas.length) d = Math.min(d, distanciaApariciones(a, b));
      if (d < DISTANCIA_PARECIDO) lista.push({ clave: salida[j].clave, etiqueta: salida[j].etiqueta, distancia: Math.round(d * 100) / 100 });
    });
    salida[i].parecidos = lista.sort((a, b) => a.distancia - b.distancia || a.clave.localeCompare(b.clave)).slice(0, 3);
  });

  const horas = new Map<number, { grupos: Set<number>; chaleco: Set<number>; sinAgrupar: Set<number> }>();
  const hora = (h: number) => {
    const fila = horas.get(h) ?? { grupos: new Set<number>(), chaleco: new Set<number>(), sinAgrupar: new Set<number>() };
    horas.set(h, fila);
    return fila;
  };
  ordenados.forEach((g, i) => {
    for (const m of g.miembros) {
      const fila = hora(horaLima(m.ms));
      fila.grupos.add(i);
      if (g.tipo === "personal") fila.chaleco.add(i);
    }
  });
  sueltas.forEach((s, i) => {
    for (const m of s) hora(horaLima(m.ms)).sinAgrupar.add(i);
  });

  const conChaleco = salida.filter((g) => g.tipo === "personal").length;
  return {
    dia,
    personas: salida.length,
    conChaleco,
    visitantes: salida.length - conChaleco,
    grupos: salida,
    sinAgrupar: sueltas.length,
    repetidasEnFoto: cuentas.repetidasEnFoto,
    fotosSinCajas: cuentas.fotosSinCajas,
    fotosConCajas: cuentas.fotosConCajas,
    porHora: [...horas.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([h, f]) => ({ hora: h, personas: f.grupos.size, conChaleco: f.chaleco.size, sinAgrupar: f.sinAgrupar.size })),
    aprox: true,
  };
}

/** Lo que contesta `GET /api/admin/camaras/personas/resumen`. */
export type RespuestaResumenPersonas = ResumenPersonasDia & { ok: true; truncado?: boolean };

/**
 * La respuesta tal como llegó del servidor, con lo que falte completado: una
 * respuesta de antes del 10-10 (cacheada, un servidor sin actualizar, un
 * parche de QA) no trae `minutos`, `tramos`, `mejores`… y la tarjeta mostraba
 * «NaN h». Se deriva de lo que sí trae (desde/hasta, portada); nunca inventa.
 */
export function completarResumen(r: RespuestaResumenPersonas): RespuestaResumenPersonas {
  const lista = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
  return {
    ...r,
    repetidasEnFoto: Number.isFinite(r.repetidasEnFoto) ? r.repetidasEnFoto : 0,
    porHora: lista(r.porHora),
    grupos: lista<GrupoPersonas>(r.grupos).map((g) => {
      const fotos = lista<FotoDeGrupo>(g.fotos);
      const camaras = lista<string>(g.camaras);
      const span = Math.max(0, Math.round((Date.parse(g.hasta) - Date.parse(g.desde)) / 60_000));
      return {
        ...g,
        fotos,
        camaras,
        minutos: Number.isFinite(g.minutos) ? g.minutos : Number.isFinite(span) ? span : 0,
        tramos: Array.isArray(g.tramos) ? g.tramos : [{ desde: g.desde, hasta: g.hasta, camaras, fotos: fotos.length }],
        mejores: Array.isArray(g.mejores)
          ? g.mejores
          : [{ docId: g.portada.docId, at: g.desde, camaraNombre: camaras[0] ?? "", caja: g.portada.caja }],
        parecidos: lista(g.parecidos),
        unidos: lista(g.unidos),
      };
    }),
  };
}
