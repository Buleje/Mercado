/**
 * conteo-guia-th.ts — recibir la guía del Libro TH CONTANDO las trozas que
 * bajan del camión (ADR-450 L1).
 *
 * Hasta el 29-09-2026 «Recibir» metía TODAS las trozas de la guía como
 * llegadas. En el patio se cuentan: la guía dice 8 y bajan 7, o una baja más
 * corta de lo que dice el papel. Tres reglas, todas reusadas:
 *
 *   · la que NO llegó entra igual al libro, marcada (`noRecepcionada`, ADR-325
 *     §1): el documento dice que existe y esconderla sería alterar el acta. El
 *     m³ del ingreso sigue siendo el de la guía (I2 con `≤`): la diferencia se
 *     informa como faltante, no se ajusta sola;
 *   · la que llegó DISTINTA no pisa las medidas de la guía (el principio de
 *     `planearMedida`): lo medido en planta va aparte (`recibida*`) y su m³ lo
 *     calcula el servidor con la fórmula del Libro TH (`smalianVolume`, la que
 *     escribió el Trozado — no la de `cubicacion-verificacion`, que suma 1 %);
 *   · una medida dentro de la tolerancia de la cinta (5 cm de largo, 1 cm de
 *     diámetro) NO es una medida distinta: no se guarda.
 *
 * Sin contar = no llegó, pero sólo si quien recibe lo confirma: el servidor
 * nunca deduce «no llegó» de una fila que la pantalla olvidó mandar.
 *
 * PURO y client-safe: la pantalla usa `resumenConteo` para el pie en vivo y el
 * servidor `planearConteo` para decidir, con los MISMOS números.
 */

import { z } from "zod";
import { smalianVolume } from "./loth-constants";
import { MAX_DIAMETRO_CM } from "./medidas-troza";
import { limpiarMotivo, motivoOpcionalSchema } from "./motivo";
import { fmtM3 } from "./cubicacion-formato";
import type { LineaDeIngresoTh, TrozaDeIngresoTh } from "./guia-th-al-ctp";

// ── Topes y tolerancias (de la cinta, no del punto flotante) ────────────────

/** Diferencia de largo que la cinta no distingue: 5 cm. */
export const TOLERANCIA_LARGO_M = 0.05;
/** Diferencia de diámetro que la cinta no distingue: 1 cm. */
export const TOLERANCIA_DIAMETRO_CM = 1;
/** Una troza de más de 30 m no existe: es un dedo que se fue. */
export const MAX_LARGO_RECIBIDO_M = 30;
/** El mismo tope de piezas por ingreso (`TOPE_TROZAS_POR_INGRESO`). */
export const MAX_TROZAS_CONTEO = 500;
/** Cuánto acepta la observación de UNA troza. */
export const MAX_OBS_CONTEO = 120;
/** Códigos escaneados que no vienen en la guía: van a la auditoría, no al libro. */
export const MAX_SOBRANTES = 50;
/** El motivo que queda en `recepcionObs` cuando no se escribió otro. */
export const MOTIVO_NO_LLEGO = "No llegó al patio al recibir la guía";

/** El `epsilon` de la comparación: 5,00 − 4,95 da 0,0500000000007 en float. */
const EPS = 1e-9;
const r2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number): number => Math.round((n + Number.EPSILON) * 1000) / 1000;
const r4 = (n: number): number => Math.round(n * 10000) / 10000;

// ── Lo que manda la pantalla ────────────────────────────────────────────────

const cm = z.number().finite().positive().max(MAX_DIAMETRO_CM);

/** Lo medido en planta: sólo lo que se corrigió; lo que falta sale de la guía. */
export const MedidaRecibida = z.object({
  d1Cm: cm.nullable().optional(),
  d2Cm: cm.nullable().optional(),
  largoM: z.number().finite().positive().max(MAX_LARGO_RECIBIDO_M).nullable().optional(),
});
export type MedidaRecibida = z.infer<typeof MedidaRecibida>;

/** Cómo se marcó que llegó. Va sólo a la auditoría: no lleva columna. */
export const COMO_SE_CONTO = ["escaneada", "a_mano"] as const;
export type ComoSeConto = (typeof COMO_SE_CONTO)[number];

/**
 * Una troza de la guía, contada. `orden` es su posición en la lista de la
 * guía (`TrozaDeIngresoTh.orden`, no cambia). La pantalla manda TODAS: la que
 * no se contó va `llego: false` y, si hay alguna así, `confirmaFaltantes`.
 */
export const TrozaContada = z.object({
  orden: z.number().int().min(1).max(MAX_TROZAS_CONTEO),
  llego: z.boolean(),
  como: z.enum(COMO_SE_CONTO).optional(),
  medida: MedidaRecibida.optional(),
  obs: motivoOpcionalSchema(MAX_OBS_CONTEO),
});
/** Ya validada (la observación, limpia de invisibles). */
export type TrozaContada = z.infer<typeof TrozaContada>;
/** Lo que arma la pantalla antes de mandarla. */
export type TrozaContadaInput = z.input<typeof TrozaContada>;

export const HuellaSchema = z.string().trim().min(8).max(64);
export const ConteoSchema = z.array(TrozaContada).min(1).max(MAX_TROZAS_CONTEO);
/**
 * Un código escaneado que no viene en la guía. Va a la auditoría: sin
 * invisibles ni controles de dirección (revisión de seguridad 29-09: un
 * «\u202Egnp.exe\u2066» se leía al revés en el rastro) ni controles ASCII
 * que una pistola puede colar (tab, retorno).
 */
const codigoSobrante = z
  .string()
  .transform((v) => limpiarMotivo(v).replace(/[\u0000-\u001f\u007f]/g, "").trim())
  .pipe(z.string().min(1).max(60));
export const SobrantesSchema = z.array(codigoSobrante).max(MAX_SOBRANTES);

// ── La huella de la guía ────────────────────────────────────────────────────

/** cyrb53: 53 bits, determinista, sin `crypto` (corre igual en el navegador). */
function cyrb53(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

/**
 * La huella de la lista que se contó: orden, código y m³ de cada troza. Viaja
 * en el GET y vuelve en el POST; si al recibir la lista de la guía ya no es la
 * misma (se anuló y se re-emitió con el mismo N°), el conteo no vale → 409.
 */
export function huellaDeReparto(lineas: readonly Pick<LineaDeIngresoTh, "trozas">[]): string {
  const piezas = lineas
    .flatMap((l) => l.trozas)
    .slice()
    .sort((a, b) => a.orden - b.orden)
    .map((t) => `${t.orden}|${(t.codificacion ?? "").trim().toUpperCase()}|${Number(t.volumenM3 ?? 0).toFixed(4)}`);
  return `v1-${cyrb53(piezas.join(";"))}-${piezas.length}`;
}

// ── La medida en planta ─────────────────────────────────────────────────────

/** Las medidas de la guía de UNA troza (cm, cm, m, m³). */
export type MedidaDeGuia = Pick<TrozaDeIngresoTh, "d1Cm" | "d2Cm" | "largoM" | "volumenM3">;

/** Lo que se guarda en `recibida*`: los tres valores FINALES y su m³. */
export interface MedidaRecibidaFinal {
  d1Cm: number | null;
  d2Cm: number | null;
  largoM: number | null;
  /** `smalianVolume` sobre los finales; `null` si falta un dato para calcularlo. */
  volumenM3: number | null;
}

const difiere = (nuevo: number | null | undefined, deGuia: number | null, tolerancia: number): nuevo is number =>
  nuevo != null && Number.isFinite(nuevo) && (deGuia == null || Math.abs(nuevo - deGuia) > tolerancia + EPS);

/**
 * Lo medido en planta, completado con la guía. `null` = no hay medida distinta
 * (no vino ninguna, o todas caen dentro de la tolerancia de la cinta): esa
 * troza llegó como dice el papel.
 */
export function medidaRecibidaFinal(
  guia: MedidaDeGuia,
  medida: MedidaRecibida | null | undefined,
): MedidaRecibidaFinal | null {
  if (!medida) return null;
  const d1 = difiere(medida.d1Cm, guia.d1Cm, TOLERANCIA_DIAMETRO_CM) ? r2(medida.d1Cm) : null;
  const d2 = difiere(medida.d2Cm, guia.d2Cm, TOLERANCIA_DIAMETRO_CM) ? r2(medida.d2Cm) : null;
  const largo = difiere(medida.largoM, guia.largoM, TOLERANCIA_LARGO_M) ? r3(medida.largoM) : null;
  if (d1 == null && d2 == null && largo == null) return null;
  const fd1 = d1 ?? guia.d1Cm;
  const fd2 = d2 ?? guia.d2Cm ?? fd1;
  const fl = largo ?? guia.largoM;
  const vol = fd1 != null && fd2 != null && fl != null ? smalianVolume(fd1 / 100, fd2 / 100, fl) : 0;
  return { d1Cm: fd1, d2Cm: fd2, largoM: fl, volumenM3: vol > 0 ? vol : null };
}

/**
 * El m³ de la guía con la MISMA fórmula que lo medido (`smalianVolume` sobre
 * sus medidas). Lo medido se compara contra esto y no contra el m³ escrito: una
 * guía importada puede traer el m³ tipeado a mano (1,500 con medidas que dan
 * 1,659) y una troza 10 cm más corta salía «mide más que la guía» con brecha
 * negativa (revisión 29-09). Sin las tres medidas, vale el m³ escrito.
 */
export function volumenDeGuiaPorMedidas(guia: MedidaDeGuia): number {
  const d2 = guia.d2Cm ?? guia.d1Cm;
  const v =
    guia.d1Cm != null && d2 != null && guia.largoM != null ? smalianVolume(guia.d1Cm / 100, d2 / 100, guia.largoM) : 0;
  return v > 0 ? v : Number(guia.volumenM3 ?? 0);
}

/**
 * Cuánto de la guía representa una troza que llegó: su m³ ESCRITO más la
 * diferencia física que midió la planta (lo medido − la guía por la misma
 * fórmula). Así una troza sin diferencia suma exactamente lo que dice la guía,
 * y la brecha refleja sólo madera, no un cambio de fórmula.
 */
export function m3QueLlego(guia: MedidaDeGuia, recibida: MedidaRecibidaFinal | null): number {
  const escrito = Number(guia.volumenM3 ?? 0);
  if (!recibida || recibida.volumenM3 == null) return escrito;
  return Math.max(0, r4(escrito + (recibida.volumenM3 - volumenDeGuiaPorMedidas(guia))));
}

// ── El resumen (pantalla en vivo y servidor) ────────────────────────────────

export interface ResumenEspecieConteo {
  especie: string;
  trozas: number;
  llegaron: number;
  /** m³ que declara la guía para esta especie. */
  m3Guia: number;
  /** m³ de lo que llegó: el de la guía, corregido por lo que midió la planta (`m3QueLlego`). */
  m3Llego: number;
  /** m³ de la guía de las que no llegaron (o no se contaron todavía). */
  m3Falta: number;
}

export interface ResumenConteo {
  /** Trozas de la guía con su conteo (válidas, una vez cada una). */
  contadas: number;
  total: number;
  llegaron: number;
  noLlegaron: number;
  sinContar: number;
  /** Llegaron con una medida distinta a la guía (fuera de la tolerancia). */
  distintas: number;
  m3Declarado: number;
  /** m³ de lo que llegó: el de la guía, corregido por lo que midió la planta (`m3QueLlego`). */
  m3Recibido: number;
  /** m³ de la guía de las que no llegaron. */
  m3NoLlego: number;
  /** `m3Declarado − m3Recibido`. Positivo = falta madera. */
  brechaM3: number;
  porEspecie: ResumenEspecieConteo[];
}

const codigoDe = (t: Pick<TrozaDeIngresoTh, "codificacion" | "orden">): string =>
  t.codificacion?.trim() || `N° ${t.orden}`;

/** Las trozas de la guía por su `orden`, con la especie de su renglón. */
function indiceDeGuia(lineas: readonly LineaDeIngresoTh[]) {
  const idx = new Map<number, { troza: TrozaDeIngresoTh; especie: string }>();
  for (const l of lineas) for (const t of l.trozas) idx.set(t.orden, { troza: t, especie: l.especieComun });
  return idx;
}

/**
 * Cuántas se contaron, cuántas llegaron y cuántos m³, TOLERANTE: sirve para el
 * pie mientras se cuenta. Un `orden` que no es de la guía se ignora y uno
 * repetido vale la primera vez (el servidor, en cambio, los rechaza).
 */
export function resumenConteo(
  lineas: readonly LineaDeIngresoTh[],
  conteo: readonly Pick<TrozaContada, "orden" | "llego" | "medida">[],
): ResumenConteo {
  const idx = indiceDeGuia(lineas);
  const porOrden = new Map<number, Pick<TrozaContada, "orden" | "llego" | "medida">>();
  for (const c of conteo) if (idx.has(c.orden) && !porOrden.has(c.orden)) porOrden.set(c.orden, c);

  const esp = new Map<string, ResumenEspecieConteo>();
  let llegaron = 0;
  let noLlegaron = 0;
  let distintas = 0;
  let m3Declarado = 0;
  let m3Recibido = 0;
  let m3NoLlego = 0;
  for (const l of lineas) {
    const e =
      esp.get(l.especieComun) ??
      ({ especie: l.especieComun, trozas: 0, llegaron: 0, m3Guia: 0, m3Llego: 0, m3Falta: 0 } satisfies ResumenEspecieConteo);
    for (const t of l.trozas) {
      const v = Number(t.volumenM3 ?? 0);
      m3Declarado += v;
      e.trozas += 1;
      e.m3Guia += v;
      const c = porOrden.get(t.orden);
      if (c?.llego) {
        const rec = medidaRecibidaFinal(t, c.medida);
        const vr = m3QueLlego(t, rec);
        llegaron += 1;
        e.llegaron += 1;
        if (rec) distintas += 1;
        m3Recibido += vr;
        e.m3Llego += vr;
      } else {
        if (c) {
          noLlegaron += 1;
          m3NoLlego += v;
        }
        e.m3Falta += v;
      }
    }
    esp.set(l.especieComun, e);
  }
  return {
    contadas: porOrden.size,
    total: idx.size,
    llegaron,
    noLlegaron,
    sinContar: idx.size - porOrden.size,
    distintas,
    m3Declarado: r4(m3Declarado),
    m3Recibido: r4(m3Recibido),
    m3NoLlego: r4(m3NoLlego),
    brechaM3: r4(m3Declarado - m3Recibido),
    porEspecie: [...esp.values()].map((e) => ({
      ...e,
      m3Guia: r4(e.m3Guia),
      m3Llego: r4(e.m3Llego),
      m3Falta: r4(e.m3Falta),
    })),
  };
}

// ── El plan (lo que decide el servidor) ─────────────────────────────────────

/** Los 422 del conteo. */
export type CodigoConteo = "CONTEO_INCOMPLETO" | "NADA_LLEGO" | "FALTANTES_SIN_CONFIRMAR";

/** Una troza de la guía, ya decidida: lo que se escribe en su fila del libro. */
export interface PiezaContada {
  orden: number;
  codificacion: string | null;
  especie: string;
  llego: boolean;
  /** Cómo se marcó que llegó (sólo auditoría). */
  como: ComoSeConto | null;
  /** Lo que va a `recepcionObs`: el motivo de la que no llegó o la observación. */
  recepcionObs: string | null;
  /** Lo medido en planta, o `null` si llegó como dice la guía. */
  recibida: MedidaRecibidaFinal | null;
  /** El m³ ESCRITO en la guía (el que va al libro). */
  volumenGuiaM3: number;
  /** El m³ de la guía por la misma fórmula que lo medido (`volumenDeGuiaPorMedidas`). */
  volumenGuiaPorMedidasM3: number;
  /** Mide MÁS que la guía (misma fórmula): se avisa «¿es otra troza?», no se bloquea. */
  masGrandeQueLaGuia: boolean;
}

export type PlanConteo =
  | { ok: true; piezas: PiezaContada[]; resumen: ResumenConteo; avisos: string[] }
  | { ok: false; code: CodigoConteo; motivo: string };

const lista = (cods: readonly string[], max = 5): string =>
  cods.length <= max ? cods.join(", ") : `${cods.slice(0, max).join(", ")} y ${cods.length - max} más`;

const hayMedida = (m: MedidaRecibida | undefined): boolean =>
  !!m && (m.d1Cm != null || m.d2Cm != null || m.largoM != null);

/**
 * Decide la recepción contada. Rechaza (422) lo que no se puede registrar sin
 * inventar: un `orden` que no es de la guía, repetido o que falta
 * (`CONTEO_INCOMPLETO`), una medida en una troza que no llegó, ninguna troza
 * llegada (`NADA_LLEGO`) o faltantes sin confirmar (`FALTANTES_SIN_CONFIRMAR`).
 *
 * Una especie de la que no llegó NINGUNA troza igual se registra, con el m³
 * de la guía y aviso obligatorio (ADR-450 R1, decisión del 29-09): el libro
 * declara lo que dice la GTF; la faltante queda a la vista.
 */
export function planearConteo(
  lineas: readonly LineaDeIngresoTh[],
  conteo: readonly TrozaContada[],
  confirmaFaltantes: boolean | undefined,
): PlanConteo {
  const idx = indiceDeGuia(lineas);
  const vistos = new Map<number, TrozaContada>();
  for (const c of conteo) {
    const deLaGuia = idx.get(c.orden);
    if (!deLaGuia) {
      return {
        ok: false,
        code: "CONTEO_INCOMPLETO",
        motivo: `El conteo trae la troza N° ${c.orden}, que no viene en esta guía. Vuelve a abrir la guía y cuenta otra vez.`,
      };
    }
    if (vistos.has(c.orden)) {
      return {
        ok: false,
        code: "CONTEO_INCOMPLETO",
        motivo: `La troza ${codigoDe(deLaGuia.troza)} está contada dos veces: cada troza de la guía va una sola vez.`,
      };
    }
    if (!c.llego && hayMedida(c.medida)) {
      return {
        ok: false,
        code: "CONTEO_INCOMPLETO",
        motivo: `La troza ${codigoDe(deLaGuia.troza)} figura como que no llegó y trae medidas: si la mediste, llegó.`,
      };
    }
    vistos.set(c.orden, c);
  }
  const faltan = [...idx.values()].filter((x) => !vistos.has(x.troza.orden)).map((x) => codigoDe(x.troza));
  if (faltan.length > 0) {
    return {
      ok: false,
      code: "CONTEO_INCOMPLETO",
      motivo: `Falta${faltan.length === 1 ? "" : "n"} ${faltan.length} troza${faltan.length === 1 ? "" : "s"} en el conteo (${lista(faltan)}): cada troza de la guía va una vez, llegó o no llegó.`,
    };
  }

  const piezas: PiezaContada[] = [...idx.values()]
    .sort((a, b) => a.troza.orden - b.troza.orden)
    .map(({ troza, especie }) => {
      const c = vistos.get(troza.orden) as TrozaContada;
      const recibida = c.llego ? medidaRecibidaFinal(troza, c.medida) : null;
      const v = Number(troza.volumenM3 ?? 0);
      const base = volumenDeGuiaPorMedidas(troza);
      return {
        orden: troza.orden,
        codificacion: troza.codificacion,
        especie,
        llego: c.llego,
        como: c.llego ? (c.como ?? null) : null,
        recepcionObs: c.obs?.trim() || (c.llego ? null : MOTIVO_NO_LLEGO),
        recibida,
        volumenGuiaM3: v,
        volumenGuiaPorMedidasM3: base,
        masGrandeQueLaGuia: recibida?.volumenM3 != null && recibida.volumenM3 > base + EPS,
      };
    });

  const noLlegaron = piezas.filter((p) => !p.llego);
  if (noLlegaron.length === piezas.length) {
    return {
      ok: false,
      code: "NADA_LLEGO",
      motivo: "No llegó ninguna troza de esta guía: así no se recibe. Si la madera todavía no bajó, déjala por recibir.",
    };
  }
  if (noLlegaron.length > 0 && confirmaFaltantes !== true) {
    return {
      ok: false,
      code: "FALTANTES_SIN_CONFIRMAR",
      motivo: `${noLlegaron.length} troza${noLlegaron.length === 1 ? "" : "s"} no ${noLlegaron.length === 1 ? "llegó" : "llegaron"} (${lista(noLlegaron.map((p) => codigoDe(p)))}): confirma que no ${noLlegaron.length === 1 ? "llegó" : "llegaron"} antes de recibir.`,
    };
  }

  const resumen = resumenConteo(lineas, conteo);
  return { ok: true, piezas, resumen, avisos: avisosDelConteo(piezas, resumen) };
}

/** Lo que el conteo deja dicho. No bloquea: se muestra al recibir y va a la auditoría. */
export function avisosDelConteo(piezas: readonly PiezaContada[], resumen: ResumenConteo): string[] {
  const avisos: string[] = [];
  const no = piezas.filter((p) => !p.llego);
  if (no.length > 0) {
    avisos.push(
      `${no.length} de ${piezas.length} troza${piezas.length === 1 ? "" : "s"} no ${no.length === 1 ? "llegó" : "llegaron"} al patio (${lista(no.map((p) => codigoDe(p)))}): quedan en el libro como «no llegó» y el ingreso sigue con los m³ de la guía — faltan ${fmtM3(resumen.m3NoLlego)} m³.`,
    );
  }
  /* R1: una especie sin ninguna troza llegada se registra igual; el aviso es obligatorio. */
  for (const e of resumen.porEspecie) {
    if (e.trozas > 0 && e.llegaron === 0) {
      avisos.push(
        `De ${e.especie} no llegó ninguna troza: su ingreso queda con los ${fmtM3(e.m3Guia)} m³ que declara la guía y todo figura como faltante. Revísalo con el transportista antes de cerrar el mes.`,
      );
    }
  }
  const distintas = piezas.filter((p) => p.recibida);
  if (distintas.length > 0) {
    const medido = r4(distintas.reduce((a, p) => a + (p.recibida?.volumenM3 ?? p.volumenGuiaPorMedidasM3), 0));
    const deGuia = r4(distintas.reduce((a, p) => a + p.volumenGuiaPorMedidasM3, 0));
    avisos.push(
      `${distintas.length} troza${distintas.length === 1 ? "" : "s"} ${distintas.length === 1 ? "llegó" : "llegaron"} con otra medida: en planta ${distintas.length === 1 ? "mide" : "miden"} ${fmtM3(medido)} m³ contra ${fmtM3(deGuia)} m³ de la guía. El libro sigue con la medida de la guía.`,
    );
  }
  for (const p of piezas.filter((x) => x.masGrandeQueLaGuia)) {
    avisos.push(
      `La troza ${codigoDe(p)} mide más que la guía (${fmtM3(p.recibida?.volumenM3 ?? 0)} m³ contra ${fmtM3(p.volumenGuiaPorMedidasM3)} m³ por sus medidas): ¿es otra troza?`,
    );
  }
  return avisos;
}
