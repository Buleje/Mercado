/**
 * conteo-patio-guardado.ts — el acta de un conteo del patio, tal como se guarda
 * en el libro y se lista para todos (Brandon 2026-09-26, sobre ADR-436).
 *
 * El conteo se arma en la tablet (`conteo-patio.ts`, en localStorage mientras
 * se cuenta). Al terminar, el equipo manda el `ConteoPatio` ENTERO — la foto
 * del patio contra la que contó y sus lecturas — y el servidor:
 *   1. lo valida con `conteoPatioSchema` (el mismo formato que el equipo guarda);
 *   2. recalcula el resumen con `resumirConteo` (totales en backend: lo que el
 *      equipo diga de «contadas» no se cree, se cuenta);
 *   3. separa las diferencias en tres listas:
 *        · faltantes — esperadas y no escaneadas;
 *        · sobrantes — piezas DEL LIBRO escaneadas que no se esperaban
 *          (consumida, despachada, no llegó… o salió del patio mientras se
 *          contaba): el libro dice que no están y están;
 *        · sorpresas — códigos que no son de ninguna troza (chapa ajena, mal
 *          escrita, o una pieza que nunca se cargó).
 *
 * PURO y client-safe: la pantalla del historial puede usar los mismos tipos.
 */

import { z } from "zod";
import { LABEL_BLOQUEO, type MotivoBloqueo } from "./consumo-trozas";
import { codigoDeTroza, motivoDeSorpresa, resumirConteo, type ConteoPatio } from "./conteo-patio";

/** Lo que cabe: el patio que el servidor manda (5.000) con holgura, y sus lecturas. */
export const MAX_TROZAS_CONTEO = 6000;
export const MAX_LECTURAS_CONTEO = 12000;

const esMotivo = (m: string): m is MotivoBloqueo => m in LABEL_BLOQUEO;
/* ISO de verdad: `Date.parse("1")` da el año 2001 y `2026-02-31` pasaba como
   03-03 (revisión 26-09). El equipo manda `toISOString()`. */
const iso = z.iso.datetime({ offset: true, message: "Fecha y hora inválidas" });
const textoONulo = (max: number) => z.string().max(max).nullable();

const trozaDelConteoSchema = z.object({
  id: z.string().trim().min(1).max(60),
  codificacion: textoONulo(120),
  codigoPlanta: textoONulo(80),
  especieComun: textoONulo(120),
  gtfNumber: textoONulo(80),
  volumenM3: z.number().finite().nonnegative().max(1000).nullable(),
  motivo: z
    .string()
    .refine(esMotivo, "Motivo desconocido")
    .transform((m) => m as MotivoBloqueo)
    .nullable(),
});

const lecturaSchema = z.object({
  trozaId: z.string().trim().min(1).max(60).nullable(),
  codigo: z.string().trim().min(1).max(160),
  en: iso,
});

/** El `ConteoPatio` v1 del equipo (`conteo-patio.ts`), validado campo por campo. */
export const conteoPatioSchema = z.object({
  v: z.literal(1),
  fecha: z.iso.date({ message: "Usa una fecha real AAAA-MM-DD" }),
  iniciadoEn: iso,
  quien: z.string().max(120),
  trozas: z.array(trozaDelConteoSchema).max(MAX_TROZAS_CONTEO),
  fotoEn: iso,
  truncado: z.boolean(),
  lecturas: z.array(lecturaSchema).max(MAX_LECTURAS_CONTEO),
  terminadoEn: iso.nullable(),
});

export const guardarConteoSchema = z.object({
  conteo: conteoPatioSchema,
  notas: z.string().trim().max(1000).nullish(),
});

export type GuardarConteoInput = z.infer<typeof guardarConteoSchema>;

export interface FaltanteConteo {
  id: string;
  codigo: string;
  especieComun: string | null;
  gtfNumber: string | null;
  volumenM3: number | null;
}

export interface SobranteConteo {
  trozaId: string;
  codigo: string;
  especieComun: string | null;
  gtfNumber: string | null;
  volumenM3: number | null;
  /** El motivo de T1, o `fuera` = salió del patio mientras se contaba. */
  motivo: MotivoBloqueo | "fuera";
  motivoTexto: string;
  en: string;
}

export interface SorpresaConteo {
  codigo: string;
  en: string;
}

/** Lo que va a la fila `ForestPatioConteo` (sin tenant ni quién). */
export interface ActaParaGuardar {
  fecha: string;
  iniciadoEn: string;
  terminadoEn: string | null;
  fotoEn: string;
  truncado: boolean;
  esperadas: number;
  contadas: number;
  m3Esperado: number;
  m3Contado: number;
  faltantes: FaltanteConteo[];
  sobrantes: SobranteConteo[];
  sorpresas: SorpresaConteo[];
}

const m3 = (v: number) => Math.round(v * 10_000) / 10_000;

/** Arma el acta desde el conteo del equipo. Los totales salen de `resumirConteo`, no del equipo. */
export function actaParaGuardar(c: ConteoPatio): ActaParaGuardar {
  const r = resumirConteo(c);
  const sobrantes: SobranteConteo[] = [];
  const sorpresas: SorpresaConteo[] = [];
  for (const s of r.sorpresas) {
    if (s.tipo === "desconocida") {
      sorpresas.push({ codigo: s.codigo, en: s.en });
    } else if (s.tipo === "bloqueada") {
      sobrantes.push({
        trozaId: s.troza.id,
        codigo: codigoDeTroza(s.troza),
        especieComun: s.troza.especieComun,
        gtfNumber: s.troza.gtfNumber,
        volumenM3: s.troza.volumenM3,
        motivo: s.motivo,
        motivoTexto: motivoDeSorpresa(s),
        en: s.en,
      });
    } else {
      sobrantes.push({
        trozaId: s.trozaId,
        codigo: s.codigo,
        especieComun: null,
        gtfNumber: null,
        volumenM3: null,
        motivo: "fuera",
        motivoTexto: motivoDeSorpresa(s),
        en: s.en,
      });
    }
  }
  return {
    fecha: c.fecha,
    iniciadoEn: c.iniciadoEn,
    terminadoEn: c.terminadoEn,
    fotoEn: c.fotoEn,
    truncado: c.truncado,
    esperadas: r.total,
    contadas: r.contadas,
    m3Esperado: m3(r.m3.esperado),
    m3Contado: m3(r.m3.encontrado),
    faltantes: r.faltan.map((t) => ({
      id: t.id,
      codigo: codigoDeTroza(t),
      especieComun: t.especieComun,
      gtfNumber: t.gtfNumber,
      volumenM3: t.volumenM3,
    })),
    sobrantes,
    sorpresas,
  };
}

/** Una fila del historial (GET sin `id`): el resumen, sin las listas. */
export interface ResumenActaConteo {
  id: string;
  fecha: string;
  hechoPor: string;
  registradoPor: string | null;
  iniciadoEn: string;
  terminadoEn: string | null;
  truncado: boolean;
  esperadas: number;
  contadas: number;
  /** = esperadas − contadas. */
  faltan: number;
  sobrantes: number;
  sorpresas: number;
  m3Esperado: number | null;
  m3Contado: number | null;
  notas: string | null;
  createdAt: string;
  updatedAt: string;
}

/** El acta entera (GET `?id=`): el resumen, las tres listas y el conteo para reimprimirla. */
export interface ActaConteoDetalle {
  resumen: ResumenActaConteo;
  faltantes: FaltanteConteo[];
  sobrantes: SobranteConteo[];
  sorpresas: SorpresaConteo[];
  /** El `ConteoPatio` que mandó el equipo: `actaDelConteo(conteo)` la reimprime igual. */
  conteo: ConteoPatio | null;
}
