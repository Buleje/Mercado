/**
 * Acomodar trozas en su especie (ADR-435).
 *
 * Una GTF con varias especies se asienta en UNA FILA POR ESPECIE (`WoodEntry`,
 * cada una con su m³ y sus piezas declaradas), pero la lista de trozas llegó a
 * colgar entera de una sola de esas filas. Medido en Blas (25-09): en el
 * permiso 10-HUA-PUE/PER-FMP-2026-007, 29 de 46 trozas estaban en la fila de
 * otra especie (la troza 115-A, Cachimbo 2,808 m³, colgaba de «0000005 Copal»,
 * que declara 1,752 m³). Nació en la importación del inventario del SNIFFS
 * («Sheet1», 24-09 05:09): la guía ya existía y `idByGtf` devolvía UNA fila por
 * GTF, así que `agregarTrozas` le colgó las siete.
 *
 * Consecuencias medidas: el consumo por pieza agrupa por `woodEntryId` y el
 * tope I2 es por fila, así que la tanda se corta y el m³ cae en la especie
 * equivocada; la vinculación frena esas trozas («hay que acomodarlas en
 * Ingresos») y la ficha del permiso las reasigna sólo en LECTURA.
 *
 * Este módulo tiene el criterio de las DOS puertas:
 *  · `colocarAlCargar` — al crear o completar una guía, cada troza nueva va a la
 *    fila de su especie (si esa fila la aceptaría por sí sola).
 *  · `planearAcomodo` — para lo ya cargado: qué troza pasa de qué fila a cuál,
 *    qué no se mueve y por qué, y cómo queda el cuadre de cada fila.
 *
 * Reglas (las que no se rompen):
 *  1. Nunca se cruza de GTF. Nunca se pierde una troza: sin fila de su especie,
 *     se queda donde está y se dice.
 *  2. La especie se compara con `claveEspecie` (sin tildes, sin mayúsculas, sin
 *     el binomio entre paréntesis) — la misma que usa la ficha del permiso. Con
 *     DOS filas de la misma especie desempata el nombre científico; si tampoco
 *     alcanza, la troza se queda (no se elige a ojo).
 *  3. Una troza retrozada se mueve con su FAMILIA (la madre y todos sus
 *     pedazos), a la fila de la especie de la madre. Si cualquier miembro está
 *     consumido o despachado, o el corte cae en un mes cerrado, la familia
 *     entera se queda.
 *  4. No se mueve lo consumido ni lo despachado (por una corrida VIVA): su m³
 *     ya está anotado en `ForestCtpConsumo` de la fila donde estaba, y mover la
 *     pieza sin el m³ partiría las dos caras del mismo hecho.
 *  5. No se toca una fila de un mes cerrado, con costo congelado, anulada o
 *     rechazada (ni para sacar ni para poner).
 *  6. No cambia nada de lo DECLARADO: ni el m³ ni las piezas de cada fila.
 *
 * PURO y client-safe: la DB class (`AcomodarTrozasDB`) lee y escribe.
 */

import { claveEspecie } from "./loth-constants";
import { cuadreDeIngreso, type Cuadre } from "./cuadre-trozas";

/* ─────────── Comparar especies ─────────── */

/** Clave del nombre científico: sin tildes, sin mayúsculas, espacios simples. */
export function claveCientifico(v: string | null | undefined): string {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Lo mínimo de una fila de guía para saber de qué especie es. */
export interface FilaConEspecie {
  id: string;
  especie: string | null;
  cientifico?: string | null;
}

/** Lo mínimo de una troza para saber de qué especie es. */
export interface TrozaConEspecie {
  especieComun: string | null | undefined;
  especieCientifica?: string | null;
}

/** Por qué una troza no tiene una fila de destino única. */
export type SinDestino = "sin_especie" | "sin_fila" | "dos_filas";

export type DestinoDeEspecie<F> =
  | { fila: F; motivo: null; candidatas: F[] }
  | { fila: null; motivo: SinDestino; candidatas: F[] };

/**
 * La fila de la guía que es de la especie de la troza.
 *
 *  1. Por nombre común (`claveEspecie`).
 *  2. Si ninguna fila tiene ese nombre y la troza trae científico, por el
 *     científico (SERFOR a veces publica «Cumala blanca» en la troza y «Cumala»
 *     en el producto, con el mismo binomio).
 *  3. Dos o más filas con el mismo nombre → desempata el científico. Si no
 *     alcanza, `dos_filas`: no se elige a ojo.
 */
export function filaDeEspecie<F extends FilaConEspecie>(t: TrozaConEspecie, filas: readonly F[]): DestinoDeEspecie<F> {
  const k = claveEspecie(t.especieComun);
  const c = claveCientifico(t.especieCientifica);
  if (!k && !c) return { fila: null, motivo: "sin_especie", candidatas: [] };

  let candidatas = k ? filas.filter((f) => claveEspecie(f.especie) === k) : [];
  if (candidatas.length === 0 && c) candidatas = filas.filter((f) => claveCientifico(f.cientifico) === c);
  if (candidatas.length === 0) return { fila: null, motivo: "sin_fila", candidatas };
  if (candidatas.length === 1) return { fila: candidatas[0]!, motivo: null, candidatas };

  if (c) {
    const porCientifico = candidatas.filter((f) => claveCientifico(f.cientifico) === c);
    if (porCientifico.length === 1) return { fila: porCientifico[0]!, motivo: null, candidatas };
  }
  return { fila: null, motivo: "dos_filas", candidatas };
}

/* ─────────── Puerta 1: al cargar (crear o completar la lista) ─────────── */

/** Una fila de la MISMA guía que podría recibir las piezas nuevas. */
export interface FilaQueRecibe extends FilaConEspecie {
  /**
   * `false` = la fila no aceptaría piezas por sí sola (validada con su lista,
   * mes cerrado…). Es la MISMA regla que ya valía por fila: repartir por
   * especie no abre una puerta que antes estaba cerrada.
   */
  puedeRecibir: boolean;
}

/** Por qué una troza nueva quedó en otra fila que la de su especie. */
export type NotaDeColocacion = SinDestino | "fila_no_recibe";

export interface Colocacion<T> {
  troza: T;
  /** La fila donde se guarda. */
  filaId: string;
  /** `null` = fue a la fila de su especie (o la guía no tiene otra). */
  nota: NotaDeColocacion | null;
  /** La fila de su especie, cuando existe pero no la recibió. */
  filaDeSuEspecie: string | null;
}

/**
 * A qué fila de la guía va cada troza nueva.
 *
 * `porDefecto` es la fila por la que entró la carga (la que se crea, o la que
 * eligió la importación): ahí se queda lo que no tiene fila de su especie o
 * cuya fila no lo recibiría — exactamente lo que pasaba antes, pero ahora
 * dicho. Una troza sin especie no es una anomalía (guía de una sola especie
 * cargada a mano): va a `porDefecto` sin nota.
 */
export function colocarAlCargar<T extends TrozaConEspecie>(
  trozas: readonly T[],
  filas: readonly FilaQueRecibe[],
  porDefecto: string,
): Colocacion<T>[] {
  return trozas.map((troza) => {
    const d = filaDeEspecie(troza, filas);
    if (d.fila) {
      if (d.fila.id === porDefecto || d.fila.puedeRecibir) {
        return { troza, filaId: d.fila.id, nota: null, filaDeSuEspecie: d.fila.id };
      }
      return { troza, filaId: porDefecto, nota: "fila_no_recibe", filaDeSuEspecie: d.fila.id };
    }
    if (d.motivo === "sin_especie") return { troza, filaId: porDefecto, nota: null, filaDeSuEspecie: null };
    // Dos filas de su especie y una es la de la carga: ya está en una de las suyas.
    if (d.motivo === "dos_filas" && d.candidatas.some((f) => f.id === porDefecto)) {
      return { troza, filaId: porDefecto, nota: null, filaDeSuEspecie: porDefecto };
    }
    return { troza, filaId: porDefecto, nota: d.motivo, filaDeSuEspecie: null };
  });
}

/**
 * El resumen de una carga para decirlo en una línea: cuántas fueron a cada
 * especie y cuáles quedaron fuera de la suya. Sólo cuenta lo que cambió
 * respecto de «todo a la fila de la carga».
 */
export interface ResumenDeColocacion {
  /** Fila → cuántas trozas nuevas recibió, sólo las que NO son `porDefecto`. */
  aOtrasFilas: { filaId: string; trozas: number }[];
  /** Las que quedaron en `porDefecto` sin ser de su especie. */
  fueraDeSuFila: { codigo: string | null; especie: string | null; nota: NotaDeColocacion }[];
}

export function resumirColocacion<T extends TrozaConEspecie & { codificacion?: string | null }>(
  colocadas: readonly Colocacion<T>[],
  porDefecto: string,
): ResumenDeColocacion {
  const otras = new Map<string, number>();
  const fuera: ResumenDeColocacion["fueraDeSuFila"] = [];
  for (const c of colocadas) {
    if (c.filaId !== porDefecto) otras.set(c.filaId, (otras.get(c.filaId) ?? 0) + 1);
    if (c.nota) fuera.push({ codigo: c.troza.codificacion ?? null, especie: c.troza.especieComun ?? null, nota: c.nota });
  }
  return { aOtrasFilas: [...otras].map(([filaId, trozas]) => ({ filaId, trozas })), fueraDeSuFila: fuera };
}

/* ─────────── Puerta 2: acomodar lo que ya está cargado ─────────── */

/** Por qué una fila no puede dar ni recibir trozas. */
export type TrabaDeFila = "mes_cerrado" | "costo_congelado" | "anulada" | "rechazada";

export interface FilaAcomodar {
  id: string;
  /** La clave del documento (`claveDeGuia`): serie|número. */
  guia: string;
  gtf: string;
  libroNro: number | null;
  especie: string;
  cientifico: string | null;
  m3Declarado: number;
  piezasDeclaradas: number;
  traba: TrabaDeFila | null;
}

export interface TrozaAcomodar {
  id: string;
  woodEntryId: string;
  codigo: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  m3: number | null;
  /** `trozaOrigenId`: de qué troza se cortó. `null` = troza de la guía. */
  madreId: string | null;
  /** Entró a una corrida VIVA. */
  consumida: boolean;
  /** Salió en un despacho VIVO sin aserrar. */
  despachada: boolean;
  /** Es un pedazo y su corte cae en un mes cerrado. */
  corteEnMesCerrado: boolean;
  /**
   * El código del lote de aserrío ABIERTO en el que está (ADR-334), o `null`.
   * Consumir un lote anota los m³ por fila en una transacción y marca las
   * piezas en otra: mover una pieza entre las dos deja el m³ en la fila vieja y
   * la pieza en la nueva. Hasta que el lote se asierre o se deshaga, no se mueve.
   */
  loteAbierto: string | null;
}

export type MotivoQuieta =
  | "consumida"
  | "despachada"
  | "corte_en_mes_cerrado"
  | "en_lote"
  | `origen_${TrabaDeFila}`
  | `destino_${TrabaDeFila}`;

export interface RefFila {
  id: string;
  especie: string;
  libroNro: number | null;
}

export interface MovimientoDeTroza {
  trozaId: string;
  codigo: string | null;
  especie: string | null;
  m3: number | null;
  desde: RefFila;
  hacia: RefFila;
  /** Los pedazos del retrozado que viajan con ella (ids). */
  pedazos: string[];
}

export interface TrozaQuieta {
  trozaId: string;
  codigo: string | null;
  especie: string | null;
  m3: number | null;
  fila: RefFila;
  /** La fila de su especie, si la hay. */
  destino: RefFila | null;
  motivo: MotivoQuieta | SinDestino;
  /** Con `motivo: "en_lote"`: el código del lote abierto. */
  lote?: string | null;
}

export interface LadoDelCuadre {
  trozas: number;
  /** `null` = ninguna troza trae volumen («no sé», no 0). */
  m3: number | null;
  /** El mismo criterio que el chip de la tabla (`cuadreDeIngreso`). */
  cuadre: Cuadre["estado"];
  /** Trozas = piezas declaradas. */
  piezasCuadran: boolean;
}

export interface CuadreDeFila extends RefFila {
  piezasDeclaradas: number;
  m3Declarado: number;
  antes: LadoDelCuadre;
  despues: LadoDelCuadre;
}

export interface PlanDeGuia {
  guia: string;
  gtf: string;
  filas: CuadreDeFila[];
  mover: MovimientoDeTroza[];
  /** Trozas que están en otra fila y NO se mueven, con el porqué. */
  quietas: TrozaQuieta[];
  /** Trozas sin una fila de su especie: se quedan donde están. */
  sinFila: TrozaQuieta[];
  /** Trozas (familias) que ya estaban en su fila. */
  bienPuestas: number;
}

export interface TotalesDelAcomodo {
  guias: number;
  /** Guías con algo que mover. */
  guiasConCambios: number;
  trozas: number;
  mover: number;
  m3Mover: number;
  quietas: number;
  sinFila: number;
  bienPuestas: number;
  /** Filas cuyo conteo de trozas = piezas declaradas, antes y después. */
  filasQueCuadranAntes: number;
  filasQueCuadranDespues: number;
  filas: number;
}

export interface PlanAcomodo {
  guias: PlanDeGuia[];
  totales: TotalesDelAcomodo;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000 || 0;
const ref = (f: FilaAcomodar): RefFila => ({ id: f.id, especie: f.especie, libroNro: f.libroNro });
const texto = (a: string, b: string) => a.localeCompare(b, "es-PE", { numeric: true, sensitivity: "base" });

function lado(f: FilaAcomodar, madres: readonly TrozaAcomodar[]): LadoDelCuadre {
  const conVolumen = madres.filter((t) => t.m3 != null);
  const m3 = conVolumen.length === 0 ? null : r4(conVolumen.reduce((s, t) => s + (t.m3 ?? 0), 0));
  return {
    trozas: madres.length,
    m3,
    cuadre: cuadreDeIngreso(f.m3Declarado, m3, madres.length).estado,
    piezasCuadran: madres.length === f.piezasDeclaradas,
  };
}

/**
 * Qué movería «Acomodar» sobre las filas y trozas dadas. Sólo mira guías con
 * DOS o más filas vivas: una guía de una sola especie no tiene a dónde mover.
 */
export function planearAcomodo(filas: readonly FilaAcomodar[], trozas: readonly TrozaAcomodar[]): PlanAcomodo {
  const filaPorId = new Map(filas.map((f) => [f.id, f]));
  const filasPorGuia = new Map<string, FilaAcomodar[]>();
  for (const f of filas) filasPorGuia.set(f.guia, [...(filasPorGuia.get(f.guia) ?? []), f]);

  /* Familias: cada troza de la guía con sus pedazos (a cualquier profundidad). */
  const hijasDe = new Map<string, TrozaAcomodar[]>();
  const porId = new Map(trozas.map((t) => [t.id, t]));
  for (const t of trozas) {
    if (t.madreId && porId.has(t.madreId)) hijasDe.set(t.madreId, [...(hijasDe.get(t.madreId) ?? []), t]);
  }
  const familiaDe = (raiz: TrozaAcomodar): TrozaAcomodar[] => {
    const out: TrozaAcomodar[] = [];
    const pila = [raiz];
    const vistos = new Set<string>();
    while (pila.length > 0) {
      const t = pila.pop()!;
      if (vistos.has(t.id)) continue;
      vistos.add(t.id);
      out.push(t);
      pila.push(...(hijasDe.get(t.id) ?? []));
    }
    return out;
  };
  /* Raíz = troza sin madre, o cuya madre no vino en la lectura (no se deja huérfana). */
  const raices = trozas.filter((t) => !t.madreId || !porId.has(t.madreId));

  const guias: PlanDeGuia[] = [];
  for (const [guia, filasGuia] of filasPorGuia) {
    const vivas = filasGuia.filter((f) => f.traba !== "anulada" && f.traba !== "rechazada");
    if (vivas.length < 2) continue;
    const idsGuia = new Set(filasGuia.map((f) => f.id));
    const mover: MovimientoDeTroza[] = [];
    const quietas: TrozaQuieta[] = [];
    const sinFila: TrozaQuieta[] = [];
    let bienPuestas = 0;
    /** Fila final de cada madre (troza de la guía), para el cuadre de después. */
    const filaFinal = new Map<string, string>();

    for (const raiz of raices) {
      if (!idsGuia.has(raiz.woodEntryId)) continue;
      const fila = filaPorId.get(raiz.woodEntryId)!;
      filaFinal.set(raiz.id, fila.id);
      const base = { trozaId: raiz.id, codigo: raiz.codigo, especie: raiz.especieComun, m3: raiz.m3, fila: ref(fila) };

      const d = filaDeEspecie(raiz, vivas);
      /* La pieza de una fila anulada o rechazada no es madera del patio: sólo
         se menciona si su especie tiene una fila viva (y aun así no se mueve —
         sacarla la reviviría). */
      if ((fila.traba === "anulada" || fila.traba === "rechazada") && (!d.fila || d.fila.id === fila.id)) continue;
      if (!d.fila) {
        if (d.motivo === "dos_filas" && d.candidatas.some((c) => c.id === fila.id)) bienPuestas++;
        else sinFila.push({ ...base, destino: null, motivo: d.motivo });
        continue;
      }
      if (d.fila.id === fila.id) {
        bienPuestas++;
        continue;
      }

      const familia = familiaDe(raiz);
      const motivo: MotivoQuieta | null = familia.some((t) => t.consumida)
        ? "consumida"
        : familia.some((t) => t.despachada)
          ? "despachada"
          : fila.traba
            ? `origen_${fila.traba}`
            : d.fila.traba
              ? `destino_${d.fila.traba}`
              : familia.some((t) => t.corteEnMesCerrado)
                ? "corte_en_mes_cerrado"
                : familia.some((t) => t.loteAbierto)
                  ? "en_lote"
                  : null;
      if (motivo) {
        const lote = motivo === "en_lote" ? (familia.find((t) => t.loteAbierto)?.loteAbierto ?? null) : null;
        quietas.push({ ...base, destino: ref(d.fila), motivo, ...(lote ? { lote } : {}) });
        continue;
      }
      filaFinal.set(raiz.id, d.fila.id);
      mover.push({
        trozaId: raiz.id,
        codigo: raiz.codigo,
        especie: raiz.especieComun,
        m3: raiz.m3,
        desde: ref(fila),
        hacia: ref(d.fila),
        pedazos: familia.filter((t) => t.id !== raiz.id).map((t) => t.id),
      });
    }

    /* El cuadre cuenta TROZAS DE LA GUÍA (sin pedazos), igual que la tabla. */
    const madresGuia = trozas.filter((t) => !t.madreId && idsGuia.has(t.woodEntryId));
    const cuadres: CuadreDeFila[] = filasGuia
      .filter((f) => f.traba !== "anulada" && f.traba !== "rechazada")
      .map((f) => ({
        ...ref(f),
        piezasDeclaradas: f.piezasDeclaradas,
        m3Declarado: f.m3Declarado,
        antes: lado(f, madresGuia.filter((t) => t.woodEntryId === f.id)),
        despues: lado(f, madresGuia.filter((t) => (filaFinal.get(t.id) ?? t.woodEntryId) === f.id)),
      }))
      .sort((a, b) => (a.libroNro ?? 0) - (b.libroNro ?? 0) || texto(a.especie, b.especie));

    const primera = filasGuia[0]!;
    guias.push({ guia, gtf: primera.gtf, filas: cuadres, mover, quietas, sinFila, bienPuestas });
  }
  guias.sort((a, b) => texto(a.gtf, b.gtf));

  const filasTodas = guias.flatMap((g) => g.filas);
  const totales: TotalesDelAcomodo = {
    guias: guias.length,
    guiasConCambios: guias.filter((g) => g.mover.length > 0).length,
    trozas: guias.reduce((s, g) => s + g.mover.length + g.quietas.length + g.sinFila.length + g.bienPuestas, 0),
    mover: guias.reduce((s, g) => s + g.mover.length, 0),
    m3Mover: r4(guias.reduce((s, g) => s + g.mover.reduce((a, m) => a + (m.m3 ?? 0), 0), 0)),
    quietas: guias.reduce((s, g) => s + g.quietas.length, 0),
    sinFila: guias.reduce((s, g) => s + g.sinFila.length, 0),
    bienPuestas: guias.reduce((s, g) => s + g.bienPuestas, 0),
    filasQueCuadranAntes: filasTodas.filter((f) => f.antes.piezasCuadran).length,
    filasQueCuadranDespues: filasTodas.filter((f) => f.despues.piezasCuadran).length,
    filas: filasTodas.length,
  };
  return { guias, totales };
}

/**
 * Para la ficha de la guía: cuántas trozas cuelgan de cada fila y cuáles están
 * en la fila de otra especie que la guía SÍ tiene (las que «Acomodar» movería,
 * sin mirar consumos: eso lo decide el servidor en la vista previa).
 */
export function trozasPorFila(
  filas: readonly FilaConEspecie[],
  trozas: readonly { id: string; woodEntryId?: string | null; especieComun?: string | null; especieCientifica?: string | null }[],
): { cuantas: Map<string, number>; enOtraFila: Map<string, string> } {
  const cuantas = new Map<string, number>();
  const enOtraFila = new Map<string, string>();
  const porId = new Map(filas.map((f) => [f.id, f]));
  for (const t of trozas) {
    const propia = t.woodEntryId ? porId.get(t.woodEntryId) : undefined;
    if (!propia) continue;
    cuantas.set(propia.id, (cuantas.get(propia.id) ?? 0) + 1);
    if (filas.length < 2) continue;
    const d = filaDeEspecie({ especieComun: t.especieComun, especieCientifica: t.especieCientifica }, filas);
    if (d.fila && d.fila.id !== propia.id) enOtraFila.set(t.id, propia.especie ?? "");
  }
  return { cuantas, enOtraFila };
}

/* ─────────── De la fila cruda a la forma del plan ─────────── */

/**
 * Lo que la DB class lee de `WoodEntry`. Los números llegan como Decimal de
 * Prisma o string de `pg`: se convierten acá, en UN lugar, para que la
 * simulación sobre datos reales y el endpoint armen lo mismo.
 */
export interface RegistroFila {
  id: string;
  gtfNumber: string;
  gtfSeries: string | null;
  libroNro: number | null;
  speciesCommonName: string;
  speciesScientificName: string | null;
  volumeM3: unknown;
  pieces: number | null;
  status: string;
  entryDate: Date | string;
}

export interface RegistroTroza {
  id: string;
  woodEntryId: string;
  codificacion: string | null;
  codigoPlanta: string | null;
  especieComun: string | null;
  especieCientifica: string | null;
  volumenM3: unknown;
  trozaOrigenId: string | null;
  fechaRetrozo: Date | string | null;
  /** La corrida que se la comió sigue viva (`vivaLinea`). */
  consumidaViva: boolean;
  /** El despacho que se la llevó sigue vivo (`vivaLinea`). */
  despachadaViva: boolean;
  /** Código del lote de aserrío si está ABIERTO; `null` si no está en uno o ya se consumió/cerró. */
  loteAbierto?: string | null;
}

const aNumero = (v: unknown): number | null => {
  if (v == null) return null;
  const n = Number(typeof v === "object" ? String(v) : v);
  return Number.isFinite(n) ? n : null;
};
const aFecha = (v: Date | string | null): Date | null => (v == null ? null : v instanceof Date ? v : new Date(v));

/** La clave del documento: la misma que agrupa la tabla por guía (`claveDeGuia`). */
export const claveDeLaGuia = (gtfSeries: string | null | undefined, gtfNumber: string): string =>
  `${(gtfSeries ?? "").trim()}|${gtfNumber.trim()}`;

export function filaDesdeRegistro(
  r: RegistroFila,
  ctx: { mesCerrado: (d: Date) => boolean; congeladas: ReadonlySet<string> },
): FilaAcomodar {
  const fecha = aFecha(r.entryDate);
  const traba: TrabaDeFila | null =
    r.status === "anulado"
      ? "anulada"
      : r.status === "rechazado"
        ? "rechazada"
        : fecha && ctx.mesCerrado(fecha)
          ? "mes_cerrado"
          : ctx.congeladas.has(r.id)
            ? "costo_congelado"
            : null;
  return {
    id: r.id,
    guia: claveDeLaGuia(r.gtfSeries, r.gtfNumber),
    gtf: r.gtfNumber.trim(),
    libroNro: r.libroNro,
    especie: r.speciesCommonName,
    cientifico: r.speciesScientificName,
    m3Declarado: aNumero(r.volumeM3) ?? 0,
    piezasDeclaradas: r.pieces ?? 0,
    traba,
  };
}

export function trozaDesdeRegistro(r: RegistroTroza, mesCerrado: (d: Date) => boolean): TrozaAcomodar {
  const corte = aFecha(r.fechaRetrozo);
  return {
    id: r.id,
    woodEntryId: r.woodEntryId,
    codigo: r.codificacion || r.codigoPlanta || null,
    especieComun: r.especieComun,
    especieCientifica: r.especieCientifica,
    m3: aNumero(r.volumenM3),
    madreId: r.trozaOrigenId,
    consumida: r.consumidaViva,
    despachada: r.despachadaViva,
    corteEnMesCerrado: r.trozaOrigenId != null && corte != null && mesCerrado(corte),
    loteAbierto: r.loteAbierto ?? null,
  };
}

/* ─────────── Cómo se dice (idioma del aserradero, tuteo) ─────────── */

const nombreTraba: Record<TrabaDeFila, string> = {
  mes_cerrado: "está en un mes cerrado",
  costo_congelado: "tiene el costo congelado",
  anulada: "está anulada",
  rechazada: "está rechazada",
};

/** Por qué una troza no se movió, en una línea. */
export function porQueNoSeMueve(q: Pick<TrozaQuieta, "motivo" | "fila" | "destino" | "lote">): string {
  const m = q.motivo;
  /* La salida existe (27-09): desde el acta de ESE lote sí se acomoda. */
  if (m === "en_lote") return `está en el lote ${q.lote ?? "abierto"}: acomódala desde «Revisar y consumir» de ese lote`;
  if (m === "consumida") return "ya entró a una corrida: su m³ está descontado en la fila donde está";
  if (m === "despachada") return "ya salió despachada sin aserrar";
  if (m === "corte_en_mes_cerrado") return "se retrozó en un mes cerrado";
  if (m === "sin_especie") return "no dice de qué especie es";
  if (m === "sin_fila") return "la guía no tiene fila de su especie";
  if (m === "dos_filas") return "la guía tiene dos filas de su especie y el nombre científico no alcanza para elegir";
  if (m.startsWith("origen_")) return `la fila de ${q.fila.especie} ${nombreTraba[m.slice(7) as TrabaDeFila]}`;
  return `la fila de ${q.destino?.especie ?? "su especie"} ${nombreTraba[m.slice(8) as TrabaDeFila]}`;
}

/** «5 trozas», «1 troza». */
export const nTrozas = (n: number): string => `${n} ${n === 1 ? "troza" : "trozas"}`;

const porQueQuedo: Record<NotaDeColocacion, string> = {
  sin_especie: "no dicen de qué especie son",
  sin_fila: "la guía no tiene fila de su especie",
  dos_filas: "la guía tiene dos filas de su especie",
  fila_no_recibe: "la fila de su especie ya no recibe piezas (validada con su lista o de un mes cerrado)",
};

/**
 * El resultado de una carga en una línea, para el reporte del importador:
 * « · cada una en la fila de su especie (5 Cachimbo, 1 Copal)» y, si algo quedó
 * fuera de su fila, « · AVISO: 2 trozas de Lupuna quedaron en la fila de
 * Copal: la guía no tiene fila de su especie». El marcador « · AVISO: » es el
 * que el reporte del cliente busca para mostrarlo fila por fila.
 */
export function fraseDeColocacion(
  porFila: readonly { especie: string; agregadas: number }[],
  fuera: readonly { especie: string | null; nota: NotaDeColocacion }[],
  especieDeLaCarga: string,
): string {
  let frase = "";
  if (porFila.length > 1) {
    frase += ` · cada una en la fila de su especie (${porFila.map((f) => `${f.agregadas} ${f.especie}`).join(", ")})`;
  }
  const grupos = new Map<string, { especie: string; nota: NotaDeColocacion; n: number }>();
  for (const f of fuera) {
    const especie = f.especie?.trim() || "sin especie";
    const k = `${claveEspecie(especie)}|${f.nota}`;
    const g = grupos.get(k) ?? { especie, nota: f.nota, n: 0 };
    g.n += 1;
    grupos.set(k, g);
  }
  for (const g of grupos.values()) {
    frase += ` · AVISO: ${nTrozas(g.n)} de ${g.especie} ${g.n === 1 ? "quedó" : "quedaron"} en la fila de ${especieDeLaCarga}: ${porQueQuedo[g.nota]}`;
  }
  return frase;
}
