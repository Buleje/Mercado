/**
 * loth-trozas-a-mano — las trozas que se anotan A MANO en «Despachar con guía»
 * (Brandon 15-10: «poner D1, D2, largo, cantidad y que el volumen salga solo;
 * crear y agregar esas trozas sin vincularlas todavía a un permiso»).
 *
 * Una fila = N trozas iguales (cantidad, casi siempre 1). Al registrar, cada
 * troza se asienta en el Trozado del libro y sale en la guía con el resto: la
 * lista de trozas a movilizar imprime una fila por troza, con cantidad 1, como
 * las del libro.
 *
 * El volumen es la fórmula SERFOR (`smalianVolume`, 4 decimales) por troza, ×
 * la cantidad. El navegador lo muestra; el SERVIDOR lo vuelve a calcular con
 * esta misma función desde las medidas (nunca se cree el volumen del cliente).
 *
 * Los límites de las medidas son los del Cubicador (`RANGO_FORMULA.smalian`).
 * PURO y client-safe: lo importan el modal, la ruta y la DB class.
 */
import { z } from "zod";
import { smalianVolume } from "./loth-constants";
import { RANGO_FORMULA } from "./cubicacion-trozas-formula";
import { r4, type TrozaDelLibro } from "./loth-guia-despacho";

const R = RANGO_FORMULA.smalian;

/** Una guía lleva hasta 150 trozas (= el tope del POST de despacho). */
export const TROZAS_POR_GUIA_MAX = 150;

/** Lo que se anota de una fila: medidas del papel (cm y m) y cuántas trozas iguales. */
export interface TrozaAMano {
  d1Cm: number;
  d2Cm: number;
  largoM: number;
  cantidad: number;
}

/** Lo que el libro guarda: Ø en METROS a 3 decimales (Decimal 8,3), largo a 2 (Decimal 8,2). */
const aM = (cm: number): number => Math.round(cm * 10) / 1000;
const largo2 = (m: number): number => Math.round(m * 100) / 100;

/** El largo más corto que el libro puede guardar (Decimal 8,2): 1 cm. */
const LARGO_MIN_M = 0.01;
const RANGO_D = `va de ${R.diametroMin} a ${R.diametroMax} cm`;
const RANGO_L = `El largo va de ${String(LARGO_MIN_M).replace(".", ",")} a ${R.largoMax} m`;

/*
 * El largo se valida YA redondeado a lo que guarda el libro: «0,001» pasaba
 * `> 0` y quedaba 0 m y 0 m³ en el Trozado (revisión 15-10). Y la troza tiene
 * que dar volumen: una de 0 m³ no se despacha.
 */
export const trozaAManoSchema = z
  .object({
    d1Cm: z.number().finite().min(R.diametroMin, `D1 ${RANGO_D}`).max(R.diametroMax, `D1 ${RANGO_D}`),
    d2Cm: z.number().finite().min(R.diametroMin, `D2 ${RANGO_D}`).max(R.diametroMax, `D2 ${RANGO_D}`),
    largoM: z
      .number()
      .finite()
      .max(R.largoMax, RANGO_L)
      .refine((m) => largo2(m) >= LARGO_MIN_M, RANGO_L),
    cantidad: z
      .number()
      .int("La cantidad es un número entero")
      .min(1, "Al menos 1 troza")
      .max(TROZAS_POR_GUIA_MAX, `Hasta ${TROZAS_POR_GUIA_MAX} trozas`),
  })
  .superRefine((t, ctx) => {
    if (!(volumenPorTroza(t) > 0)) {
      ctx.addIssue({ code: "custom", path: ["largoM"], message: "Con esas medidas el volumen da 0 m³: revisa el largo" });
    }
  });

/**
 * Las medidas de UNA troza como las guarda el libro y su volumen SERFOR (m³, 4
 * decimales). D1 es el mayor y D2 el menor (las columnas del libro): Smalian no
 * cambia. El volumen sale DESPUÉS de redondear las medidas a lo que guarda el
 * libro: así la línea de Trozado, la guía y la fila de alta dicen lo mismo.
 */
export function medidasDelLibro(t: Pick<TrozaAMano, "d1Cm" | "d2Cm" | "largoM">) {
  const diamMayorM = aM(Math.max(t.d1Cm, t.d2Cm));
  const diamMenorM = aM(Math.min(t.d1Cm, t.d2Cm));
  const lengthM = largo2(t.largoM);
  return { diamMayorM, diamMenorM, lengthM, volumeM3: smalianVolume(diamMayorM, diamMenorM, lengthM) };
}

/** Volumen SERFOR de UNA troza de la fila (m³, 4 decimales). */
export const volumenPorTroza = (t: Pick<TrozaAMano, "d1Cm" | "d2Cm" | "largoM">): number => medidasDelLibro(t).volumeM3;

/** Volumen de la fila: el de una troza × la cantidad (lo que suma la guía). */
export const volumenDeFila = (t: TrozaAMano): number => r4(volumenPorTroza(t) * t.cantidad);

/** Cuántas trozas suman las filas. */
export const trozasDeFilas = (filas: readonly TrozaAMano[]): number => filas.reduce((a, f) => a + f.cantidad, 0);

export type CampoAMano = "d1" | "d2" | "largo" | "cantidad";
export type CrudoAMano = Record<CampoAMano, string>;

/** «45,5» y «45.5» valen lo mismo; vacío o letras → `null`. */
function leer(v: string): number | null {
  const t = v.trim().replace(/\s+/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const CAMPO_DE: Record<keyof TrozaAMano, CampoAMano> = { d1Cm: "d1", d2Cm: "d2", largoM: "largo", cantidad: "cantidad" };

/**
 * Revisa lo tipeado en la fila de alta. Cantidad vacía = 1 (lo de siempre).
 * Devuelve la troza lista para agregar o, por campo, qué está mal.
 */
export function revisarTrozaAMano(
  crudo: CrudoAMano,
): { ok: true; troza: TrozaAMano } | { ok: false; errores: Partial<Record<CampoAMano, string>> } {
  const errores: Partial<Record<CampoAMano, string>> = {};
  const d1 = leer(crudo.d1);
  const d2 = leer(crudo.d2);
  const largo = leer(crudo.largo);
  const cantidad = crudo.cantidad.trim() ? leer(crudo.cantidad) : 1;
  if (d1 == null) errores.d1 = "Falta D1";
  if (d2 == null) errores.d2 = "Falta D2";
  if (largo == null) errores.largo = "Falta el largo";
  if (cantidad == null) errores.cantidad = "Falta la cantidad";
  if (Object.keys(errores).length > 0) {
    /* Lo que sí se tipeó también se revisa: «D1 300» no espera a que llegue el largo. */
    const forma = trozaAManoSchema.shape;
    const fuera: [CampoAMano, number | null, z.ZodType][] = [["d1", d1, forma.d1Cm], ["d2", d2, forma.d2Cm], ["largo", largo, forma.largoM], ["cantidad", cantidad, forma.cantidad]];
    for (const [campo, v, esquema] of fuera) {
      const r = v == null ? null : esquema.safeParse(v);
      if (r && !r.success) errores[campo] = r.error.issues[0]?.message ?? "Fuera de rango";
    }
    return { ok: false, errores };
  }
  const r = trozaAManoSchema.safeParse({ d1Cm: d1, d2Cm: d2, largoM: largo, cantidad });
  if (!r.success) {
    for (const issue of r.error.issues) {
      const campo = CAMPO_DE[issue.path[0] as keyof TrozaAMano];
      if (campo && !errores[campo]) errores[campo] = issue.message;
    }
    return { ok: false, errores };
  }
  return { ok: true, troza: r.data };
}

/** Una troza a mano ya numerada: el código que imprime la guía y sus medidas como las guarda el libro. */
export interface PiezaAMano {
  /** El código impreso en la guía y la lista («1», «2»…). El del libro lo arma el servidor (ADR-477). */
  codigo: string;
  diamMayorM: number;
  diamMenorM: number;
  lengthM: number;
  volumeM3: number;
}

/**
 * Las trozas de las filas, una por unidad, numeradas 1, 2, 3… en el orden en
 * que se anotaron, saltando los códigos que ya imprimen las trozas del libro
 * de la misma guía (`ocupados`): en el papel no puede haber dos «3».
 */
export function piezasAMano(filas: readonly TrozaAMano[], ocupados: Iterable<string> = []): PiezaAMano[] {
  const usados = new Set([...ocupados].map((c) => c.trim()));
  const piezas: PiezaAMano[] = [];
  let n = 0;
  for (const f of filas) {
    const medidas = medidasDelLibro(f);
    for (let i = 0; i < f.cantidad; i++) {
      do n += 1;
      while (usados.has(String(n)));
      piezas.push({ codigo: String(n), ...medidas });
    }
  }
  return piezas;
}

/** Prefijo del `id` de una troza a mano en el modal (no es una línea del libro). */
export const ID_A_MANO = "a-mano:";

/** Las trozas a mano con la forma de las del libro, para que la guía las trate igual (detalle, lista, papeles). */
export function trozasDelLibroAMano(piezas: readonly PiezaAMano[], planId: string | null): TrozaDelLibro[] {
  return piezas.map((p) => ({
    ...p,
    id: `${ID_A_MANO}${p.codigo}`,
    lineNo: 0,
    planId,
    fecha: null,
    arbol: null,
    comun: null,
    cientifico: null,
    cites: false,
  }));
}

/** Lo que la cita de una guía tiene siempre igual: hasta el «(» que cierra el N° (así «…0001» no agarra «…00012»). */
const citaDeLaGuia = (gtfNumber: string): string => `Troza anotada a mano al despachar con la GTF ${gtfNumber} (`;

/**
 * La cita que deja en el Trozado cada troza anotada a mano: de qué guía nació.
 * Una sola definición para quien la escribe (`asentarTrozasAManoEnTx`) y quien
 * la lee (`trozadosNacidosDeLaGuia`).
 */
export const observacionAMano = (gtfNumber: string, codigo: string): string =>
  `${citaDeLaGuia(gtfNumber)}en la guía: ${codigo}).`;

/** Una línea de Trozado, con lo que hace falta para saber si nació con una guía. */
export interface TrozadoDeLaGuia {
  id: string;
  treeCode: string | null;
  observations: string | null;
}

/**
 * Las líneas de Trozado que NACIERON con esta guía (anotadas a mano al
 * despacharla): anular la guía las anula con ella. Si quedaran vivas, la
 * guía reanotada crearía otras («1-0123» y «1-019/0123») y el Trozado sumaría
 * la misma madera dos veces; con N° corto el 2.º intento daba T3 (revisión 15-10).
 *
 * El lazo firme es el `trozadoId` que la guía guarda en sus items (ADR-450 L4).
 * Además: sin árbol y con la cita EXACTA de esta GTF. Una troza del libro que
 * ya existía (con árbol o sin él) también va en los items, pero no nació con la
 * guía: anularla solo la libera, no la borra del Trozado.
 */
export function trozadosNacidosDeLaGuia(
  gtf: { gtfNumber: string; items: unknown },
  trozados: readonly TrozadoDeLaGuia[],
): string[] {
  const enLaGuia = new Set(trozadoIdsDeItems(gtf.items));
  const cita = citaDeLaGuia(gtf.gtfNumber.trim());
  return trozados
    .filter((l) => enLaGuia.has(l.id) && !l.treeCode && (l.observations ?? "").startsWith(cita))
    .map((l) => l.id);
}

/** Los `trozadoId` que la guía guarda en sus items (para buscar sus líneas). */
export function trozadoIdsDeItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  return [
    ...new Set(
      items.flatMap((it: unknown) => {
        const id = it && typeof it === "object" ? (it as { trozadoId?: unknown }).trozadoId : null;
        return typeof id === "string" && id ? [id] : [];
      }),
    ),
  ];
}
