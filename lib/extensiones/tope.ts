/**
 * Tope de tiempo y aviso de falla para las piezas (ADR-457). Sirve en el
 * servidor y en el navegador: no importa nada de ninguno de los dos.
 */
import * as Sentry from "@sentry/nextjs";
import { logger } from "@/lib/logger";
import { TOPE_PIEZA_MS } from "@/extensiones/_contrato";

export class PiezaLentaError extends Error {
  constructor(que: string, ms: number) {
    super(`${que} tardó más de ${ms} ms`);
    this.name = "PiezaLentaError";
  }
}

/**
 * La promesa o un error a los `ms`. No cancela la promesa original (JS no
 * tiene cómo): sólo deja de esperarla, que es lo que necesita la pantalla.
 */
export function conTope<T>(p: Promise<T>, ms: number = TOPE_PIEZA_MS, que = "la pieza"): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reloj = new Promise<never>((_, rechazar) => {
    timer = setTimeout(() => rechazar(new PiezaLentaError(que, ms)), ms);
  });
  return Promise.race([p, reloj]).finally(() => clearTimeout(timer));
}

export interface DondeFallo {
  piezaId?: string;
  enchufe: string;
  tenantId?: string;
  /** `leer` (la tabla), `opciones` (no pasan el Zod), `cargar`, `agregar`, `huerfana`… */
  etapa: string;
}

/**
 * Una pieza falló: se ve la versión normal y se avisa. Nunca tira (lo llaman
 * desde un `catch`). Va a Sentry con etiquetas para filtrar por pieza.
 */
export function reportarFalloPieza(err: unknown, donde: DondeFallo): void {
  logger.warn("[pieza] falló; se muestra la versión normal", { ...donde, error: String(err) });
  try {
    Sentry.captureException(err instanceof Error ? err : new Error(String(err)), {
      tags: { pieza: donde.piezaId ?? "-", enchufe: donde.enchufe, etapa: donde.etapa },
      extra: { tenantId: donde.tenantId },
    });
  } catch (sentryErr) {
    // Sentry caído no puede tumbar la pantalla que justo estamos salvando.
    logger.warn("[pieza] Sentry no aceptó el aviso", { error: String(sentryErr) });
  }
}
