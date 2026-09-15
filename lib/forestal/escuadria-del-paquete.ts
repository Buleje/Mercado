/**
 * escuadria-del-paquete — las medidas de un paquete: cómo se tipean en la plaza
 * y cómo tienen que cuadrar contra el volumen que el libro ya declaró.
 *
 * ## Por qué existe
 *
 * Medido el 2026-09-15 contra el libro real de Blas: de **33 paquetes, 27 no
 * tienen escuadría** (`espesorCm`/`anchoCm`/`largoM` en `null`) y **19 tampoco
 * declaran piezas** (`cantidad = 0`, los que entraron por importación en las
 * corridas 15 a 19). Los únicos 6 completos son los de «Producir sin lote»
 * (corrida N.º 28, `SL-1`…`SL-6`), porque ahí el paquete NACE de una medida
 * cubicada.
 *
 * Sin escuadría el volumen del paquete no se puede recalcular: el freno de
 * cifras imposibles (`produccion-cifras-imposibles.ts`) cae a su criterio flojo
 * —el rango de sanidad por pieza— en vez del recálculo exacto, no se puede
 * imprimir una lista de empaque, y el m³ declarado no tiene contra qué cotejarse.
 *
 * ## Las dos unidades
 *
 * En el aserradero se canta **pulgadas y pies** («dos por ocho de cinco») y el
 * Libro guarda **centímetros y metros** (así lo pide el formato LO-CTP). La
 * conversión es la misma del cubicador (`toInches`/`toFeet`): 2" → 5.08 cm,
 * 5 pies → 1.52 m — exactamente lo que ya está guardado en `SL-1`.
 *
 * ## El cuadre NO pisa el dato
 *
 * Cargar la escuadría **no reescribe** `volumenM3`. Lo que hace es poder decir
 * la diferencia: «tus medidas dan 2.4380 m³ y el asiento declara 2.5000». Quién
 * de los dos está mal lo sabe el que midió la pila, no el programa — y un libro
 * oficial que se autocorrige es un libro que nadie puede auditar.
 *
 * La tolerancia es **la misma** de `produccion-cifras-imposibles`
 * (`TOLERANCIA_MEDIDA` = 10 %): este módulo REUSA `avisosDeCifra`, no escribe un
 * segundo criterio que en tres meses diverja del primero.
 *
 * PURO y client-safe (sin prisma, sin fetch).
 */

import { toFeet, toInches, type Unidad } from "./cubicacion";
import { volumenDimensionado } from "./produccion-paquetes";
import { avisosDeCifra, type AvisoDeCifra } from "./produccion-cifras-imposibles";

// ── Lo tipeado ↔ lo que guarda el libro ─────────────────────────────────────

/** Un centímetro por pulgada y un metro por pie: las dos del cubicador. */
export const CM_POR_PULGADA = 2.54;
export const M_POR_PIE = 0.3048;

/** Lo que se tipea: el número como texto y en qué unidad se cantó. */
export interface EscuadriaTipeada {
  espesor: string;
  ancho: string;
  largo: string;
  uEspesor: Unidad;
  uAncho: Unidad;
  uLargo: Unidad;
}

/** Lo que guarda el libro: espesor y ancho en cm, largo en m. */
export interface EscuadriaDelLibro {
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
}

/**
 * Cómo arranca el formulario de un paquete que todavía no tiene medidas: en las
 * unidades de la plaza. Nadie mide un espesor en metros.
 */
export const ESCUADRIA_EN_BLANCO: EscuadriaTipeada = {
  espesor: "",
  ancho: "",
  largo: "",
  uEspesor: "pulg",
  uAncho: "pulg",
  uLargo: "pies",
};

/** El número tipeado, con coma o con punto — en la plaza se escribe `2,5`. */
const num = (v: string): number => {
  const n = Number(
    String(v ?? "")
      .trim()
      .replace(",", "."),
  );
  return Number.isFinite(n) ? n : 0;
};

/* Dos decimales: es lo que el libro guarda hoy (`5.08`, `20.32`, `1.52`) y lo
   que una cinta métrica distingue. Un tercer decimal en centímetros es ruido. */
const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Lo tipeado, pasado a lo que el libro guarda.
 *
 * Cada dimensión que falta o no es positiva sale `null`: media escuadría es peor
 * que ninguna, porque parece un dato (misma regla que `volumenDimensionado`).
 */
export function aEscuadriaDelLibro(t: EscuadriaTipeada): EscuadriaDelLibro {
  const cm = (valor: string, u: Unidad) => {
    const n = num(valor);
    return n > 0 ? r2(toInches(n, u) * CM_POR_PULGADA) : null;
  };
  const m = (valor: string, u: Unidad) => {
    const n = num(valor);
    return n > 0 ? r2(toFeet(n, u) * M_POR_PIE) : null;
  };
  return {
    espesorCm: cm(t.espesor, t.uEspesor),
    anchoCm: cm(t.ancho, t.uAncho),
    largoM: m(t.largo, t.uLargo),
  };
}

/**
 * Lo guardado, puesto en el formulario.
 *
 * Se abre en **cm y m**, que es como está escrito: reconvertir 1.52 m a pies da
 * 4.99, y un operador que ve «4.99 pies» donde midió 5 desconfía de la pantalla
 * con razón. Para cargar de cero, la plaza tiene `ESCUADRIA_EN_BLANCO`.
 */
export function aEscuadriaTipeada(m: EscuadriaDelLibro): EscuadriaTipeada {
  const txt = (v: number | null) => (v != null && v > 0 ? String(v) : "");
  return {
    espesor: txt(m.espesorCm),
    ancho: txt(m.anchoCm),
    largo: txt(m.largoM),
    uEspesor: "cm",
    uAncho: "cm",
    uLargo: "m",
  };
}

/** ¿Están las TRES? Con dos no hay volumen que calcular. */
export function escuadriaCompleta(m: EscuadriaDelLibro): boolean {
  return Boolean(m.espesorCm && m.anchoCm && m.largoM);
}

/** «5.08 × 20.32 cm · 1.52 m» — cómo se escribe una escuadría en una celda. */
export function fmtEscuadria(m: EscuadriaDelLibro): string {
  if (!escuadriaCompleta(m)) return "—";
  return `${m.espesorCm} × ${m.anchoCm} cm · ${m.largoM} m`;
}

// ── El cuadre contra el volumen declarado ───────────────────────────────────

export type EstadoCuadre =
  /** Le falta alguna de las tres medidas: no hay nada que comparar. */
  | "sin-medidas"
  /** Tiene medidas pero no dice cuántas piezas: tampoco hay volumen que dar. */
  | "sin-piezas"
  /** El asiento no declara volumen para este paquete. */
  | "sin-volumen"
  /** El volumen declarado y el de las medidas coinciden dentro del 10 %. */
  | "cuadra"
  /** Se separan más del 10 %: uno de los dos números está mal. */
  | "no-cuadra";

export interface CuadreDeEscuadria {
  estado: EstadoCuadre;
  /** `espesor × ancho × largo × piezas`, o `null` si no se puede calcular. */
  calculadoM3: number | null;
  /** Lo que el asiento dice. */
  declaradoM3: number;
  /** `declarado − calculado`. Positivo = el asiento declara de más. */
  diferenciaM3: number | null;
  /** El aviso de `produccion-cifras-imposibles`, con la cuenta escrita. */
  aviso: AvisoDeCifra | null;
  /** Una línea para la pantalla. Siempre dice algo, incluso si no hay cuadre. */
  texto: string;
}

/** m³ con los cuatro decimales que guarda el libro (mismo `es-PE` del resto). */
const m3_4 = (v: number): string =>
  v.toLocaleString("es-PE", { minimumFractionDigits: 4, maximumFractionDigits: 4 });

/**
 * ¿El volumen declarado y sus medidas dicen lo mismo?
 *
 * El veredicto NO se calcula acá: se le pregunta a `avisosDeCifra`, que es donde
 * vive el criterio (y su tolerancia del 10 %, justificada contra los 6 paquetes
 * dimensionados reales, que caen entre 0.993 y 1.001 del recálculo). Acá sólo se
 * arma el par de números para la pantalla.
 */
export function cuadreDeEscuadria(p: {
  codigo?: string | null;
  /** Piezas del paquete. */
  cantidad: number | null | undefined;
  volumenM3: number | null | undefined;
  espesorCm: number | null;
  anchoCm: number | null;
  largoM: number | null;
}): CuadreDeEscuadria {
  const piezas = Number(p.cantidad ?? 0) || 0;
  const declarado = Number(p.volumenM3 ?? 0) || 0;
  const base = { calculadoM3: null, declaradoM3: declarado, diferenciaM3: null, aviso: null };

  if (!escuadriaCompleta(p)) {
    return {
      ...base,
      estado: "sin-medidas",
      texto:
        "Sin escuadría: el volumen declarado no tiene contra qué cotejarse. " +
        "Carga espesor, ancho y largo y el libro lo recalcula.",
    };
  }
  if (!(piezas > 0)) {
    return {
      ...base,
      estado: "sin-piezas",
      texto:
        "Tiene escuadría pero no dice cuántas piezas: sin las piezas, las medidas " +
        "no dan un volumen.",
    };
  }
  const calculado = volumenDimensionado(p.espesorCm, p.anchoCm, p.largoM, piezas);
  if (calculado == null)
    return { ...base, estado: "sin-medidas", texto: "Sin escuadría completa." };
  if (!(declarado > 0)) {
    return {
      ...base,
      calculadoM3: calculado,
      estado: "sin-volumen",
      texto: `Sus medidas dan ${m3_4(calculado)} m³ y el asiento no declara volumen para este paquete.`,
    };
  }

  /* El criterio es el del libro, no uno nuevo: se le pasa el paquete tal cual a
     `avisosDeCifra` y se lee su veredicto. Si mañana la tolerancia cambia allá,
     esta pantalla cambia con ella. */
  const aviso =
    avisosDeCifra({
      volumenM3: declarado,
      piezas,
      unidad: "m3",
      paquetes: [
        {
          codigo: p.codigo ?? null,
          cantidad: piezas,
          volumenM3: declarado,
          espesorCm: p.espesorCm,
          anchoCm: p.anchoCm,
          largoM: p.largoM,
        },
      ],
    }).find((a) => a.motivo === "medida-no-cuadra") ?? null;

  const diferencia = Number((declarado - calculado).toFixed(4));
  return {
    estado: aviso ? "no-cuadra" : "cuadra",
    calculadoM3: calculado,
    declaradoM3: declarado,
    diferenciaM3: diferencia,
    aviso,
    texto: aviso
      ? aviso.texto
      : `Cuadra: sus medidas dan ${m3_4(calculado)} m³ y el asiento declara ${m3_4(declarado)} m³.`,
  };
}
