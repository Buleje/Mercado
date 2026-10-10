/**
 * ctp-radar-titulos — el eslabón que va ANTES de la guía.
 *
 * La cadena del radar empezaba en la GTF de ingreso, pero la GTF no es el
 * origen: es el papel que acompaña a la madera desde el monte. El origen legal
 * es el **título habilitante** (concesión, permiso, comunidad, plantación) bajo
 * el cual esa madera se aprovechó. Esa es la pregunta que hace una fiscalización
 * OSINFOR y la que exige el reglamento EUDR de la Unión Europea: «¿de qué predio
 * salió este tablón?».
 *
 * El dato ya viajaba en el grafo (`originCode` + `originType` del ingreso) y
 * nadie lo dibujaba. Acá se agrupa por título y se mide la **cobertura**: cuánto
 * del volumen que entró declara su título y cuánto no. Un ingreso sin título no
 * es un error del sistema —el libro lo admite— pero es un hueco de origen que
 * hay que poder ver.
 *
 * PURO y client-safe (sin Prisma, sin fetch, sin Date.now).
 */

/** Lo que necesita esta lib de un ingreso. Deliberadamente mínimo. */
export interface IngresoConOrigen {
  id: string;
  volumeM3: number;
  originCode?: string | null;
  originType?: string | null;
}

export const PREFIJO_TITULO = "th:";

/** Id del nodo que junta a los ingresos que no declaran título. */
export const ID_SIN_TITULO = `${PREFIJO_TITULO}__sin__`;

export function esTitulo(id: string): boolean {
  return id.startsWith(PREFIJO_TITULO);
}

/**
 * Nombre legible del tipo de título. Las claves son el enum `WoodOriginType`
 * del schema; cualquier otra cosa cae en `null` y el nodo se etiqueta sólo con
 * su código (mejor un dato de menos que uno inventado).
 */
const TIPOS: Record<string, string> = {
  concesion: "Concesión forestal",
  predio_privado: "Predio privado",
  comunidad_nativa: "Comunidad nativa",
  reforestacion: "Plantación / reforestación",
  retroaserradero: "Otro aserradero",
  otro: "Otro origen",
};

export function nombreTipoOrigen(tipo: string | null | undefined): string | null {
  return tipo ? TIPOS[tipo] ?? null : null;
}

export interface NodoTitulo {
  /** `th:<código>`, o `th:__sin__` para los que no declaran ninguno. */
  id: string;
  /** `null` en el nodo de los que no declaran título. */
  codigo: string | null;
  tipo: string | null;
  /** Lo que se escribe en el bloque. */
  etiqueta: string;
  /** Ingresos que cuelgan de este título. */
  ingresos: string[];
  volumeM3: number;
  /** Alguno de sus ingresos es de especie CITES. */
  cites: boolean;
}

export interface GrafoTitulos {
  titulos: NodoTitulo[];
  /** título → ingreso, con el volumen de ese ingreso. */
  aristas: { from: string; to: string; valor: number }[];
  conTituloM3: number;
  sinTituloM3: number;
  /** % del volumen que declara su título. `null` si no entró nada. */
  cobertura: number | null;
  /** Cuántos ingresos no declaran título (lo que hay que completar). */
  ingresosSinTitulo: number;
  /** `false` cuando NINGÚN ingreso declara título: la columna no aporta nada. */
  hayDatos: boolean;
}

const r4 = (n: number) => Number(n.toFixed(4));

/**
 * Agrupa los ingresos por su título habilitante.
 *
 * Los títulos salen ordenados por volumen descendente —lo que más pesa,
 * arriba— y el nodo de «sin título» va SIEMPRE último, aunque sea el más
 * grande: es el pendiente, no un origen.
 */
export function analizarTitulos(ingresos: readonly (IngresoConOrigen & { cites?: boolean })[]): GrafoTitulos {
  const mapa = new Map<string, NodoTitulo>();
  const aristas: GrafoTitulos["aristas"] = [];
  let conTituloM3 = 0;
  let sinTituloM3 = 0;
  let ingresosSinTitulo = 0;

  for (const w of ingresos) {
    const codigo = (w.originCode ?? "").trim() || null;
    const id = codigo ? `${PREFIJO_TITULO}${codigo}` : ID_SIN_TITULO;
    const vol = Number.isFinite(w.volumeM3) ? Number(w.volumeM3) : 0;

    let n = mapa.get(id);
    if (!n) {
      const tipo = codigo ? nombreTipoOrigen(w.originType) : null;
      n = {
        id, codigo, tipo,
        etiqueta: codigo ?? "Sin título declarado",
        ingresos: [], volumeM3: 0, cites: false,
      };
      mapa.set(id, n);
    }
    // El tipo se toma del primer ingreso que lo traiga: dos guías del mismo
    // título pueden tener el campo cargado en una sola.
    if (!n.tipo && codigo) n.tipo = nombreTipoOrigen(w.originType);
    n.ingresos.push(w.id);
    n.volumeM3 = r4(n.volumeM3 + vol);
    if (w.cites === true) n.cites = true;

    aristas.push({ from: id, to: w.id, valor: r4(vol) });
    if (codigo) conTituloM3 = r4(conTituloM3 + vol);
    else { sinTituloM3 = r4(sinTituloM3 + vol); ingresosSinTitulo += 1; }
  }

  const total = r4(conTituloM3 + sinTituloM3);
  const titulos = [...mapa.values()].sort((a, b) => {
    // El pendiente va último aunque pese más que todos los títulos juntos.
    if (a.codigo === null) return 1;
    if (b.codigo === null) return -1;
    return b.volumeM3 - a.volumeM3 || a.etiqueta.localeCompare(b.etiqueta);
  });

  return {
    titulos, aristas, conTituloM3, sinTituloM3, ingresosSinTitulo,
    cobertura: total > 0 ? Math.min(100, Math.round((conTituloM3 / total) * 100)) : null,
    hayDatos: titulos.some((t) => t.codigo !== null),
  };
}
