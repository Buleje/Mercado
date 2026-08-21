/**
 * cubicacion-trozas-import — interpreta un Excel/CSV de trozas (Especie · D1 ·
 * D2 · Largo) y lo convierte en filas del patio. PURO y client-safe, hermano
 * de `cubicacion-import.ts` (aserrada): columnas en cualquier orden, lo que
 * no se puede leer se reporta con el número de fila, nunca se inventa. Cada
 * troza se RECUBICA acá por Smalian — no se confía en un volumen que venga en
 * el archivo (pudo quedar una fórmula sin arrastrar o editada a mano).
 */
import { aNumero, normalizarEspecie, sinAcentos, type Celda } from "./cubicacion-import";
import { cubicarTroza, DIAMETRO_MIN_CM, LARGO_MAX_M, type TrozaCubicada } from "./cubicacion-trozas";

export type { Celda } from "./cubicacion-import";

export interface TrozaImportada extends TrozaCubicada {
  /** Fila del archivo de la que salió (1-based, para el mensaje). */
  filaOrigen: number;
  /** true si la medida quedó fuera de lo común (se importa igual, resaltada). */
  sospechosa: boolean;
}

export interface ResultadoImportTrozas {
  trozas: TrozaImportada[];
  errores: { fila: number; motivo: string }[];
}

type Campo = "especie" | "d1" | "d2" | "largo";

const ALIAS: Record<Campo, string[]> = {
  especie: ["especie", "madera", "variedad"],
  d1: ["d1", "d1 (cm)", "d1cm", "diametro menor", "diametro 1", "dmenor", "o menor", "ø menor"],
  d2: ["d2", "d2 (cm)", "d2cm", "diametro mayor", "diametro 2", "dmayor", "o mayor", "ø mayor"],
  largo: ["largo", "largo (m)", "largom", "long", "longitud"],
};

/** ¿Esta fila es el encabezado? (nombra D1 y Largo, las dos columnas sin las que no hay troza) */
function esFilaEncabezado(fila: Celda[]): boolean {
  const textos = fila.map((c) => sinAcentos(String(c ?? "")));
  return (["d1", "largo"] as Campo[]).every((campo) => textos.some((t) => ALIAS[campo].includes(t)));
}

function mapearColumnas(header: Celda[]): Record<Campo, number | null> {
  const textos = header.map((c) => sinAcentos(String(c ?? "")));
  const cols = {} as Record<Campo, number | null>;
  for (const campo of Object.keys(ALIAS) as Campo[]) {
    const i = textos.findIndex((t) => ALIAS[campo].includes(t));
    cols[campo] = i === -1 ? null : i;
  }
  return cols;
}

let contador = 0;

/**
 * Interpreta la matriz de celdas. Busca el encabezado, mapea columnas y
 * convierte cada fila con datos en una troza cubicada por Smalian. Sin D2,
 * la troza se asume pareja (cilindro con D1) — mismo criterio de `cubicarTroza`.
 */
export function parsearFilasTrozas(matriz: Celda[][]): ResultadoImportTrozas {
  const errores: { fila: number; motivo: string }[] = [];
  const trozas: TrozaImportada[] = [];

  const filas = matriz.filter((f) => Array.isArray(f));
  const idxHeader = filas.findIndex(esFilaEncabezado);
  if (idxHeader === -1) {
    return {
      trozas: [],
      errores: [{ fila: 1, motivo: "No encontré las columnas D1 y Largo. Revisá que la primera fila tenga esos títulos." }],
    };
  }

  const columnas = mapearColumnas(filas[idxHeader]);
  const cel = (fila: Celda[], campo: Campo): Celda => {
    const i = columnas[campo];
    return i === null ? undefined : fila[i];
  };

  for (let r = idxHeader + 1; r < filas.length; r++) {
    const fila = filas[r];
    const filaNro = r + 1; // 1-based para el usuario
    if (fila.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;

    const d1 = aNumero(cel(fila, "d1"));
    const largo = aNumero(cel(fila, "largo"));
    if (d1 === null || largo === null) {
      errores.push({ fila: filaNro, motivo: "D1 o Largo no es un número válido." });
      continue;
    }
    if (!(d1 > 0 && largo > 0)) {
      errores.push({ fila: filaNro, motivo: "D1 y Largo tienen que ser mayores que cero." });
      continue;
    }

    const d2Raw = aNumero(cel(fila, "d2"));
    const d2 = d2Raw && d2Raw > 0 ? d2Raw : d1;
    const especie = normalizarEspecie(cel(fila, "especie"));

    trozas.push({
      id: `imp-t-${Date.now()}-${contador++}`,
      d1, d2, largo, especie,
      m3: cubicarTroza(d1, largo, d2),
      filaOrigen: filaNro,
      sospechosa: largo > LARGO_MAX_M || d1 < DIAMETRO_MIN_CM || d2 < DIAMETRO_MIN_CM,
    });
  }

  return { trozas, errores };
}

/** Encabezado + filas de ejemplo para la plantilla descargable. */
export const PLANTILLA_TROZAS: { headers: string[]; ejemplo: (string | number)[][] } = {
  headers: ["Especie", "D1 (cm)", "D2 (cm)", "Largo (m)"],
  ejemplo: [
    ["Tornillo", 40, 45, 3.5],
    ["Cedro", 55, 58, 4],
    ["Capirona", 22, 24, 2.8],
  ],
};
