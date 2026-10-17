/**
 * Vínculos entre partes del Directorio (ADR-430, Brandon 2026-09-22).
 *
 * «Vincular ese directorio a otro directorio que sea un permiso o un tercero,
 * e hipervincular todo con la cuenta o saldo para una contabilidad más
 * detallada.» Un vínculo une una parte con OTRA parte o con un PERMISO
 * (`ForestContrato`), nunca con los dos a la vez.
 *
 * La deuda va siempre al cliente (decisión 4): el vínculo no mueve cargos,
 * sólo deja ver el saldo propio junto al de sus vinculados.
 *
 * PURO y client-safe.
 */
import { z } from "zod";
import { diaDelCalendario } from "./precio-cliente";

export const RELACIONES_PARTE = ["trabaja_para", "representa", "intermediario_de", "tercero", "otro"] as const;
export type RelacionParte = (typeof RELACIONES_PARTE)[number];

export const ETIQUETA_RELACION: Record<RelacionParte, string> = {
  trabaja_para: "Trabaja para",
  representa: "Representa a",
  intermediario_de: "Intermediario de",
  tercero: "Tercero de",
  otro: "Otro vínculo con",
};

export interface VinculoParte {
  id: string;
  parteId: string;
  relacion: RelacionParte;
  /** La otra parte del Directorio, si el vínculo es con una parte. */
  vinculadaParteId: string | null;
  vinculadaNombre: string | null;
  /** El permiso, si el vínculo es con un permiso. */
  contratoId: string | null;
  contratoCodigo: string | null;
  desde: string | null;
  hasta: string | null;
  notas: string | null;
  /**
   * Fase 2 (22-09): si el vínculo SALE de la parte que se consultó («ella
   * anotó este vínculo») o ENTRA hacia ella («otra parte la anotó a ella»).
   * `listar` antes sólo devolvía los que salen: la ficha de la parte
   * VINCULADA no veía el vínculo.
   */
  sentido: "sale" | "entra";
  /**
   * El nombre de la parte DUEÑA del vínculo (`parteId` de la fila). Sólo se
   * llena con `sentido: "entra"` — ahí la parte consultada ES la vinculada, y
   * `vinculadaNombre` queda en `null` porque no tiene sentido apuntarse a
   * ella misma.
   */
  parteNombre: string | null;
}

/**
 * Cómo se lee un vínculo que ENTRA, desde el lado de la parte vinculada: «X
 * es su representante», no «Representa a X» (esa frase es de quien lo anotó).
 * Los vínculos con un PERMISO nunca entran (un `ForestContrato` no tiene
 * ficha propia que los liste).
 */
export const ETIQUETA_RELACION_INVERSA: Record<RelacionParte, string> = {
  trabaja_para: "trabaja para esta parte",
  representa: "es su representante",
  intermediario_de: "es su intermediario",
  tercero: "es tercero de esta parte",
  otro: "tiene otro vínculo con esta parte",
};

/** Cuerpo de `POST /api/admin/forestal/directorio/vinculos`. */
export const vinculoParteInputSchema = z
  .object({
    parteId: z.string().trim().min(1).max(64),
    relacion: z.enum(RELACIONES_PARTE),
    vinculadaParteId: z.string().trim().min(1).max(64).nullable().optional(),
    contratoId: z.string().trim().min(1).max(64).nullable().optional(),
    desde: diaDelCalendario.nullable().optional(),
    hasta: diaDelCalendario.nullable().optional(),
    notas: z.string().trim().max(300).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const conParte = !!v.vinculadaParteId;
    const conPermiso = !!v.contratoId;
    if (conParte === conPermiso) {
      ctx.addIssue({ code: "custom", message: "Vincula con UNA parte del Directorio o con UN permiso, no con los dos ni con ninguno." });
    }
    if (conParte && v.vinculadaParteId === v.parteId) {
      ctx.addIssue({ code: "custom", message: "Una parte no se vincula consigo misma." });
    }
    if (v.desde && v.hasta && v.hasta < v.desde) {
      ctx.addIssue({ code: "custom", message: "El vínculo termina antes de empezar." });
    }
  });

export type VinculoParteInput = z.infer<typeof vinculoParteInputSchema>;

/** Lo que devuelve `GET /api/admin/forestal/directorio/saldo?parteId=` (sólo lectura). */
export interface SaldoConsolidado {
  /** Saldo de la cuenta de la parte: positivo = nos debe. */
  propio: { cargos: number; abonos: number; saldo: number };
  /** Cada vinculado con su propio saldo; nunca se mezclan las libretas. */
  vinculados: {
    parteId: string;
    nombre: string;
    relacion: RelacionParte;
    /** Como en `VinculoParte`: «sale» la anotó esta parte, «entra» la anotó la otra. */
    sentido: "sale" | "entra";
    saldo: number;
  }[];
  /** Propio + vinculados, sólo para mirar. */
  total: number;
}
