/**
 * loth-mapa-sin-coordenadas — los árboles del censo que NO salen en el mapa.
 *
 * El mapa del Libro TH pinta el censo con `toCenso`, que descarta en silencio
 * al árbol sin Este/Norte (o con un par que no cae en ningún lado). Sin un
 * aviso, «el mapa tiene 65 árboles» y «el censo tiene 67» conviven sin que nadie
 * lo note (Blas: 2 de 67 sin UTM). Acá se cuenta EXACTAMENTE lo que `toCenso`
 * deja afuera —se calcula como su complemento, no con una regla paralela que
 * pueda desfasarse— y se revisa la coordenada que se escribe para sacarlo de la
 * lista con las MISMAS reglas del alta del censo (`errorCoordenadas`).
 *
 * Puro: sin React, sin DOM, sin fetch.
 */

import { ESTADO_ARBOL_LABEL } from "@/lib/forestal/loth-mapa-arboles";
import { errorCoordenadas, leerCoordenada } from "./loth-censo-arbol";
import { toCenso, type CensusTreeDTO } from "./loth-mapa-shared";

export type MotivoSinCoordenadas = "sin_coordenadas" | "incompleta" | "invalida";

export interface ArbolSinCoordenadas {
  id: string;
  code: string;
  species: string;
  /** Tal como viene del censo («en_pie», «talado»). */
  estado: string;
  /** «En pie», «Talado»: lo que se lee en pantalla. */
  estadoLabel: string;
  motivo: MotivoSinCoordenadas;
  /** Por qué no sale, en una línea («Falta el Norte», «Este 12 fuera del rango UTM…»). */
  detalle: string;
}

/** Zona que se propone cuando ningún árbol del censo trae la suya. */
export const ZONA_UTM_POR_DEFECTO = "18L";

const ORDEN_CODIGO = new Intl.Collator("es", { numeric: true, sensitivity: "base" });

/** Un número del DTO (Prisma Decimal llega como texto): vacío o ilegible = `null`. */
function numero(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function clasificar(t: CensusTreeDTO): Pick<ArbolSinCoordenadas, "motivo" | "detalle"> {
  const x = numero(t.utmX);
  const y = numero(t.utmY);
  if (x == null && y == null) return { motivo: "sin_coordenadas", detalle: "Sin Este ni Norte" };
  if (x == null || y == null) return { motivo: "incompleta", detalle: x == null ? "Falta el Este" : "Falta el Norte" };
  return { motivo: "invalida", detalle: errorCoordenadas(x, y) ?? "Este y Norte que no caen en el mapa" };
}

/**
 * Los árboles vivos del censo que `toCenso` no dibuja, ordenados por código.
 * Un árbol borrado (`deletedAt`) no cuenta: ya no es del censo.
 */
export function arbolesSinCoordenadas(trees: readonly CensusTreeDTO[]): ArbolSinCoordenadas[] {
  const vivos = trees.filter((t) => !t.deletedAt);
  const enElMapa = new Set(toCenso(vivos).map((c) => c.id));
  return vivos
    .filter((t) => !enElMapa.has(t.id))
    .sort((a, b) => ORDEN_CODIGO.compare(a.treeCode, b.treeCode))
    .map((t) => {
      const estado = t.estado ?? "en_pie";
      return {
        id: t.id,
        code: t.treeCode,
        species: t.speciesCommon,
        estado,
        estadoLabel: ESTADO_ARBOL_LABEL[estado] ?? estado,
        ...clasificar(t),
      };
    });
}

/** El titular de la franja: «2 árboles sin coordenadas: no salen en el mapa». */
export function tituloSinCoordenadas(n: number): string {
  return n === 1
    ? "1 árbol sin coordenadas: no sale en el mapa"
    : `${n.toLocaleString("es-PE")} árboles sin coordenadas: no salen en el mapa`;
}

/** La zona que más usa el censo («18S»), para no tipearla; si ninguno la trae, `18L`. */
export function zonaMasUsada(trees: readonly CensusTreeDTO[]): string {
  const cuenta = new Map<string, number>();
  for (const t of trees) {
    if (t.deletedAt) continue;
    const z = (t.utmZona ?? "").trim().toUpperCase();
    if (z) cuenta.set(z, (cuenta.get(z) ?? 0) + 1);
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? ZONA_UTM_POR_DEFECTO;
}

export interface BorradorCoordenadas {
  utmX: string;
  utmY: string;
  utmZona: string;
}

export interface CoordenadasRevisadas {
  este: number | null;
  norte: number | null;
  /** «18L», sin espacios y en mayúscula; `null` si la zona no es una zona UTM. */
  zona: string | null;
  /** Campos a marcar en rojo. */
  invalidos: Set<keyof BorradorCoordenadas>;
  errores: string[];
}

/**
 * Revisa lo tipeado en el editor de coordenadas. Acá Este y Norte son
 * OBLIGATORIOS (el editor existe para sacar al árbol de la lista); las reglas
 * de rango son las del alta del censo: Este de 6 cifras, Norte de 7 — que
 * además atrapa el error más común, Este y Norte cambiados de lugar.
 */
export function revisarCoordenadasArbol(b: BorradorCoordenadas): CoordenadasRevisadas {
  const errores: string[] = [];
  const invalidos = new Set<keyof BorradorCoordenadas>();
  const este = leerCoordenada(b.utmX);
  const norte = leerCoordenada(b.utmY);

  if (este == null) {
    invalidos.add("utmX");
    errores.push("Falta el Este.");
  }
  if (norte == null) {
    invalidos.add("utmY");
    errores.push("Falta el Norte.");
  }
  if (este != null && norte != null) {
    const mal = errorCoordenadas(este, norte);
    if (mal) {
      if (Number.isNaN(este) || este < 100_000 || este > 999_999) invalidos.add("utmX");
      if (Number.isNaN(norte) || norte <= 0 || norte > 10_000_000) invalidos.add("utmY");
      errores.push(mal);
    }
  } else if ((este != null && Number.isNaN(este)) || (norte != null && Number.isNaN(norte))) {
    const mal = errorCoordenadas(este, norte);
    if (mal) errores.push(mal);
    if (este != null && Number.isNaN(este)) invalidos.add("utmX");
    if (norte != null && Number.isNaN(norte)) invalidos.add("utmY");
  }

  const zonaTexto = b.utmZona.trim().toUpperCase().replace(/\s+/g, "");
  const m = zonaTexto.match(/^(\d{1,2})([A-Z])?$/);
  const numZona = m ? Number(m[1]) : NaN;
  const zona = m && numZona >= 1 && numZona <= 60 ? zonaTexto : null;
  if (!zona) {
    invalidos.add("utmZona");
    errores.push(zonaTexto ? `La zona «${b.utmZona.trim()}» no es una zona UTM (ej. 18L).` : "Falta la zona UTM (ej. 18L).");
  }

  return { este, norte, zona, invalidos, errores };
}
