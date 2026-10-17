/**
 * produccion-cifras-imposibles — cuando la corrida declara un número que la
 * madera no puede dar.
 *
 * ## Qué problema resuelve
 *
 * El tope del 56 % (ADR-358) mira el rendimiento: cuánto producto sale de la
 * materia prima que entró. Eso deja pasar en silencio el error más común de
 * tipeo —la coma corrida— porque declarar **de menos** nunca cruza un techo.
 *
 * Medido el 2026-09-15 contra el libro real de Blas (14 corridas de producción):
 *
 * | Corrida | Fecha | Piezas | m³ declarados | m³ por pieza | cm³ por pieza |
 * |---|---|---|---|---|---|
 * | #26 | 29/08 | 141 | 0.0010 | 0.0000071 | **7** |
 * | #24 | 28/08 | 141 | 0.0090 | 0.0000638 | **64** |
 * | #28 | 10/09 | 20 | 0.2417 | 0.0120850 | 12,085 |
 * | #23 | 21/08 | 50 | 1.3260 | 0.0265200 | 26,520 |
 * | #22 | 17/06 | 13 | 0.4340 | 0.0333846 | 33,385 |
 * | #21 | 12/06 | 68 | 3.0780 | 0.0452647 | 45,265 |
 * | #20 | 19/10 | 32 | 3.8140 | 0.1191875 | 119,188 |
 *
 * Las dos primeras son físicamente imposibles: 7 cm³ es un cubito de 1.9 cm de
 * lado, 141 de ésos caben en una mano. Y **ya están escritas en el libro que ve
 * SERFOR**: nada las señaló al cargarlas ni después.
 *
 * ## El criterio (y por qué NO es un número redondo elegido a ojo)
 *
 * **1. Con medidas, se recalcula.** Cuando el paquete trae espesor, ancho y
 * largo, el volumen no se juzga: se calcula (`espesor × ancho × largo × piezas`,
 * la misma cuenta de `volumenDimensionado`) y se compara contra el declarado.
 * Es la señal fuerte —sale de los propios datos del asiento, no de un umbral—.
 * La tolerancia es {@link TOLERANCIA_MEDIDA} = 10 %: los seis paquetes
 * dimensionados que hay en el libro de Blas (corrida #28) caen entre 0.993 y
 * 1.001 del recálculo, así que 10 % está siete veces por encima del ruido real
 * de redondeo y muy por debajo del error que importa (una coma corrida es 900 %).
 *
 * **2. Sin medidas, hace falta un rango de sanidad por pieza.** El piso NO se
 * inventa: se arma con las medidas mínimas que el propio libro reconoce como
 * madera aserrada (`UMBRAL_TIPO`, `cubicacion-tipo.ts`) — espesor 1", ancho 2"
 * — por el largo mínimo que se vende ({@link LARGO_MINIMO_M} = 0.30 m; más
 * corto es despunte, va a leña o a chip). Las tres a la vez dan
 * {@link PIEZA_MINIMA_M3} ≈ 0.00039 m³ = 387 cm³, que es una **cota inferior
 * absoluta**: ninguna pieza real toca los tres mínimos al mismo tiempo. Por eso
 * no puede dar falsos positivos —la pieza más chica medida en Blas (0.0094 m³,
 * paquete SL-5: 2.54 × 15.24 cm × 2.44 m) está 24 veces por encima— y aun así
 * atrapa las dos corridas malas por factores de 6× y 55×.
 *
 * El techo, {@link PIEZA_MAXIMA_M3} = 1 m³, atrapa la coma corrida para el otro
 * lado (1 pieza «de 73 m³»). Una pieza aserrada de más de un metro cúbico
 * pediría una troza de más de un metro de sección escuadrada: a esa altura ya no
 * es una pieza, es la troza entera. La mayor del libro de Blas mide 0.119 m³.
 *
 * ## Avisa, no impide
 *
 * El libro tiene que poder registrar lo que realmente pasó, incluso si es raro.
 * Estas funciones devuelven avisos con **la cuenta escrita** —«141 piezas en
 * 0.0010 m³ = 7 cm³ por pieza»— y nunca un motivo de bloqueo: no entran en
 * `motivosParaGuardar`, que es lo que apaga el botón.
 *
 * PURO y client-safe (sin prisma, sin fetch).
 */

import { UMBRAL_TIPO } from "./cubicacion-tipo";

// ── Los umbrales, derivados ─────────────────────────────────────────────────

/** Un centímetro por pulgada. La plaza mide en pulgadas, el libro guarda cm. */
const CM_POR_PULGADA = 2.54;

/**
 * El largo más corto que sigue siendo una pieza vendible, en metros.
 *
 * Debajo de 30 cm es despunte: no se vende, no se declara, va a leña o a chip.
 * La pieza más corta del libro de Blas mide 0.46 m (paquete SL-6, bloques 6×6
 * de paquetería corta).
 */
export const LARGO_MINIMO_M = 0.3;

/**
 * Cota inferior ABSOLUTA del volumen de una pieza de madera aserrada, en m³.
 *
 * Es el producto de los tres mínimos a la vez (1" × 2" × 0.30 m ≈ 387 cm³).
 * Ninguna pieza real los toca juntos, así que cruzar por debajo de esto no es
 * «una pieza chica»: es una cifra que no puede ser.
 */
export const PIEZA_MINIMA_M3 =
  ((UMBRAL_TIPO.cortaEspesorMin * CM_POR_PULGADA) / 100) *
  ((UMBRAL_TIPO.cortaAnchoMin * CM_POR_PULGADA) / 100) *
  LARGO_MINIMO_M;

/** Cota superior: arriba de 1 m³ por pieza ya no es una pieza, es la troza. */
export const PIEZA_MAXIMA_M3 = 1;

/**
 * Cuánto puede separarse el volumen declarado del que dan sus medidas.
 *
 * 10 %: los paquetes dimensionados reales caen dentro del 1 %, y el error que
 * se busca (coma corrida, volumen de una pieza puesto como el del paquete) pasa
 * del 100 %. En el medio no hay nada que se declare a propósito.
 */
export const TOLERANCIA_MEDIDA = 0.1;

/** Desde qué desvío el aviso pasa de ámbar a rojo: el doble o la mitad. */
const FACTOR_GRAVE = 2;

// ── Lo que entra y lo que sale ──────────────────────────────────────────────

/** Un paquete declarado, en lo que este chequeo necesita de él. */
export interface PaqueteDeclarado {
  codigo?: string | null;
  /** Piezas del paquete. */
  cantidad: number | string | null | undefined;
  volumenM3: number | string | null | undefined;
  espesorCm?: number | string | null;
  anchoCm?: number | string | null;
  largoM?: number | string | null;
}

/** Lo que una corrida declara. Los paquetes son opcionales: el libro no
 *  siempre los tiene a mano (la tabla de Producción trae sólo los totales). */
export interface CorridaDeclarada {
  /** Total producido de la corrida, en `unidad`. */
  volumenM3: number | string | null | undefined;
  /** Piezas totales declaradas. `0`/`null` = no se declararon piezas. */
  piezas: number | string | null | undefined;
  /** `m3` por defecto. En pie tablar u otra unidad esta cuenta no aplica. */
  unidad?: string | null;
  paquetes?: readonly PaqueteDeclarado[] | null;
}

export type MotivoCifra =
  /** El volumen declarado no es el que dan sus propias medidas. */
  | "medida-no-cuadra"
  /** Pieza por debajo de la cota física mínima. */
  | "pieza-imposible-chica"
  /** Pieza por encima de la cota física máxima. */
  | "pieza-imposible-grande";

export interface AvisoDeCifra {
  motivo: MotivoCifra;
  /** Código del paquete, o `null` si el aviso es de la corrida entera. */
  paquete: string | null;
  /** La cuenta, escrita. Nunca «valor sospechoso». */
  texto: string;
  /** Qué hacer con esto, en una línea. */
  sugerencia: string;
  /** m³ por pieza que salen de lo declarado. `null` cuando no aplica. */
  m3PorPieza: number | null;
  tono: "warning" | "error";
}

// ── Escritura de los números del aviso ──────────────────────────────────────

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

/**
 * m³ con los CUATRO decimales que guarda el libro.
 *
 * `fmtM3` escribe tres —la precisión con la que se declara ante SERFOR— y acá
 * el número chico ES el hallazgo: «0.0010 m³» con tres decimales sale «0.001» y
 * uno de 0.0009 saldría «0.000», que borra la prueba del aviso.
 *
 * Mismo `es-PE` que el resto del libro: en Perú el separador decimal es el
 * PUNTO y la coma agrupa los miles (`fmtM3`, `fmtPt`).
 */
const m3_4 = (v: number): string =>
  v.toLocaleString("es-PE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

const nPiezas = (v: number): string => `${v.toLocaleString("es-PE")} pieza${v === 1 ? "" : "s"}`;

/**
 * El volumen de una pieza en la unidad que se puede imaginar: centímetros
 * cúbicos cuando es una migaja, m³ cuando es un bloque.
 */
export function fmtVolumenDePieza(m3: number): string {
  if (m3 < 0.001) return `${Math.round(m3 * 1_000_000).toLocaleString("es-PE")} cm³`;
  return `${m3_4(m3)} m³`;
}

/**
 * Con qué cubo se compara. Un «7 cm³» no dice nada; «un cubo de 1.9 cm de lado»
 * se ve en la mano, y es lo que convierte el aviso en algo que se entiende sin
 * hacer la cuenta.
 */
function ladoDelCubo(m3: number): string {
  const cm = Math.cbrt(m3 * 1_000_000);
  return `${cm.toLocaleString("es-PE", { maximumFractionDigits: 1 })} cm`;
}

/** «10 veces más» / «la mitad» — cómo se lee un desvío sin porcentajes raros. */
function veces(declarado: number, calculado: number): string {
  if (calculado <= 0) return "";
  const f = declarado / calculado;
  if (f >= 1) return `${f.toLocaleString("es-PE", { maximumFractionDigits: 1 })} veces más`;
  return `${(1 / f).toLocaleString("es-PE", { maximumFractionDigits: 1 })} veces menos`;
}

// ── El chequeo ──────────────────────────────────────────────────────────────

/** El volumen que dan las medidas de un paquete, o `null` si le falta alguna. */
function volumenDeLasMedidas(p: PaqueteDeclarado, piezas: number): number | null {
  const e = num(p.espesorCm);
  const a = num(p.anchoCm);
  const l = num(p.largoM);
  if (!(e > 0) || !(a > 0) || !(l > 0) || !(piezas > 0)) return null;
  return (e / 100) * (a / 100) * l * piezas;
}

/** El rango de sanidad por pieza, sobre un volumen y un conteo cualesquiera. */
function avisosDelRango(
  volumen: number,
  piezas: number,
  paquete: string | null,
  sujeto: string,
): AvisoDeCifra[] {
  if (!(volumen > 0) || !(piezas > 0)) return [];
  const unitario = volumen / piezas;
  const cuenta = `${sujeto} declara ${nPiezas(piezas)} en ${m3_4(volumen)} m³ = ${fmtVolumenDePieza(unitario)} por pieza`;

  if (unitario < PIEZA_MINIMA_M3) {
    return [
      {
        motivo: "pieza-imposible-chica",
        paquete,
        texto: `${cuenta} (un cubo de ${ladoDelCubo(unitario)} de lado).`,
        sugerencia:
          `La pieza más chica que el libro reconoce como madera aserrada mide 1" × 2" × 0.30 m = ` +
          `${fmtVolumenDePieza(PIEZA_MINIMA_M3)}. Revisa si se corrió la coma del volumen o si las piezas son de otra corrida.`,
        m3PorPieza: unitario,
        tono: "error",
      },
    ];
  }
  if (unitario > PIEZA_MAXIMA_M3) {
    return [
      {
        motivo: "pieza-imposible-grande",
        paquete,
        texto: `${cuenta}.`,
        sugerencia:
          `Una pieza aserrada de más de ${PIEZA_MAXIMA_M3} m³ pediría una troza de más de un metro de sección: ` +
          `a esa altura ya no es una pieza. Revisa el volumen o el conteo de piezas.`,
        m3PorPieza: unitario,
        tono: "error",
      },
    ];
  }
  return [];
}

/**
 * Los avisos de una corrida: qué cifra no puede ser y por qué.
 *
 * Con paquetes que declaran piezas se mira paquete por paquete (es donde viven
 * las medidas y donde se corrige el dato). Sin ellos —o con todos en cero
 * piezas, que es como entraron las cinco corridas de apertura de Blas— se mira
 * el total de la corrida. Nunca las dos cosas: el mismo número avisado dos
 * veces enseña a ignorar el aviso.
 *
 * Devuelve `[]` cuando no hay nada que decir, y también cuando **no se puede**
 * decir nada: sin piezas declaradas no hay cuenta por pieza que hacer, y
 * inventar una sería peor que callarse.
 */
export function avisosDeCifra(corrida: CorridaDeclarada): AvisoDeCifra[] {
  /* En pie tablar o kilos, dividir por piezas no da el volumen de una pieza:
     mezclar unidades es exactamente el error que este chequeo persigue. */
  if ((corrida.unidad ?? "m3") !== "m3") return [];

  const paquetes = (corrida.paquetes ?? []).filter(
    (p) => num(p.cantidad) > 0 && num(p.volumenM3) > 0,
  );
  if (paquetes.length > 0) {
    const avisos: AvisoDeCifra[] = [];
    for (const p of paquetes) {
      const piezas = num(p.cantidad);
      const volumen = num(p.volumenM3);
      const codigo = p.codigo?.trim() || null;
      const sujeto = codigo ? `El paquete ${codigo}` : "El paquete";

      const calculado = volumenDeLasMedidas(p, piezas);
      if (calculado != null && calculado > 0) {
        const desvio = Math.abs(volumen - calculado) / calculado;
        if (desvio > TOLERANCIA_MEDIDA) {
          const f = volumen / calculado;
          avisos.push({
            motivo: "medida-no-cuadra",
            paquete: codigo,
            texto:
              `${sujeto} mide ${num(p.espesorCm)} × ${num(p.anchoCm)} cm × ${num(p.largoM)} m: ` +
              `${nPiezas(piezas)} ${piezas === 1 ? "da" : "dan"} ${m3_4(calculado)} m³, y declara ${m3_4(volumen)} m³ ` +
              `(${veces(volumen, calculado)}).`,
            sugerencia:
              "El volumen sale de las medidas: corrige el volumen, o la medida si la que está mal es ella.",
            m3PorPieza: volumen / piezas,
            tono: f >= FACTOR_GRAVE || f <= 1 / FACTOR_GRAVE ? "error" : "warning",
          });
          /* Ya se dijo lo que pasa con este paquete. Agregar además «la pieza es
             imposible» sería el mismo hallazgo con otro nombre. */
          continue;
        }
      }
      avisos.push(...avisosDelRango(volumen, piezas, codigo, sujeto));
    }
    return avisos;
  }

  return avisosDelRango(num(corrida.volumenM3), num(corrida.piezas), null, "La corrida");
}

// ── El barrido de lo que ya está cargado ────────────────────────────────────

/** Una corrida ya registrada, en lo que este barrido necesita de ella. */
export interface CorridaParaCifras {
  id: string;
  lineNo: number;
  entryDate?: string | Date | null;
  productType?: string | null;
  speciesCommon?: string | null;
  materiaPrimaRef?: string | null;
  quantity?: number | string | null;
  pieces?: number | null;
  unit?: string | null;
  /** Una corrida anulada no declara nada: su madera volvió al patio. */
  status?: string | null;
}

export interface CorridaConCifraImposible {
  id: string;
  lineNo: number;
  entryDate: string | null;
  producto: string;
  especie: string | null;
  lote: string | null;
  piezas: number;
  volumenM3: number;
  m3PorPieza: number;
  avisos: AvisoDeCifra[];
}

/**
 * Las corridas ya cargadas cuyas cifras no pueden ser.
 *
 * Mismo espejo que `corridasSobreTope`: un chequeo nuevo sólo frena lo que se
 * registre de ahora en más, y lo que ya está escrito en el libro que se presenta
 * queda invisible justo cuando la regla pasa a existir.
 *
 * La tabla de Producción trae los totales de la corrida, no sus paquetes, así
 * que acá el chequeo es el del rango por pieza. Las anuladas quedan afuera: su
 * madera volvió al patio y corregirlas no cambia nada del libro.
 */
export function corridasConCifraImposible(
  corridas: readonly CorridaParaCifras[],
): CorridaConCifraImposible[] {
  return (
    corridas
      .map((c) => {
        if (c.status != null && c.status !== "registrado") return null;
        const volumen = num(c.quantity);
        const piezas = num(c.pieces);
        const avisos = avisosDeCifra({ volumenM3: volumen, piezas, unidad: c.unit });
        if (avisos.length === 0) return null;
        const fecha = c.entryDate == null ? null : new Date(c.entryDate);
        return {
          id: c.id,
          lineNo: c.lineNo,
          entryDate: fecha && !Number.isNaN(fecha.getTime()) ? fecha.toISOString() : null,
          producto: [c.productType, c.speciesCommon].filter(Boolean).join(" · ") || "—",
          especie: c.speciesCommon?.trim() || null,
          lote: c.materiaPrimaRef?.trim() || null,
          piezas,
          volumenM3: volumen,
          m3PorPieza: volumen / piezas,
          avisos,
        } satisfies CorridaConCifraImposible;
      })
      .filter((c): c is CorridaConCifraImposible => c !== null)
      /* La más nueva primero: es la que todavía se puede corregir sin reabrir un
       período ya presentado. */
      .sort((a, b) => b.lineNo - a.lineNo)
  );
}
