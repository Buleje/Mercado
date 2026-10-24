import "server-only";
import { logger } from "@/lib/logger";

/**
 * cola-analisis — de a pocos, no todos juntos.
 *
 * Subir una carpeta con 30 fotos disparaba 30 análisis a la vez: con un modelo
 * en la nube es caro y te come el cupo del día de un saque; con un modelo
 * corriendo en tu propia máquina (Ollama en CPU) directamente la tumba —cada
 * uno reserva ~6 GB—. El resultado era peor que lento: fallaban casi todos.
 *
 * Esto no acelera nada; ordena. Los análisis entran de a `DOC_ANALISIS_CONCURRENCIA`
 * (2 por defecto) y el resto espera su turno en el orden en que llegó.
 *
 * Vive en memoria del proceso a propósito: es un límite por instancia, no un
 * sistema de colas. Si algún día hace falta que sobreviva a un reinicio, eso es
 * BullMQ (`lib/queue/`), no esto.
 */

const MAX = Math.max(1, Number(process.env.DOC_ANALISIS_CONCURRENCIA) || 2);

let enCurso = 0;
const esperando: (() => void)[] = [];

/** Cuántos están corriendo y cuántos esperan (para logs y diagnóstico). */
export function estadoDeLaCola(): { enCurso: number; esperando: number; max: number } {
  return { enCurso, esperando: esperando.length, max: MAX };
}

export async function enColaDeAnalisis<T>(etiqueta: string, tarea: () => Promise<T>): Promise<T> {
  if (enCurso >= MAX) {
    logger.info("documents.analisis.en_espera", { etiqueta, ...estadoDeLaCola() });
    await new Promise<void>((seguir) => esperando.push(seguir));
  }
  enCurso += 1;
  try {
    return await tarea();
  } finally {
    enCurso -= 1;
    // El siguiente de la fila arranca aunque el anterior haya fallado: un
    // documento ilegible no puede dejar la cola trabada para siempre.
    esperando.shift()?.();
  }
}
