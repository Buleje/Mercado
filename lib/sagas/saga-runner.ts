/**
 * lib/sagas/saga-runner.ts
 *
 * SagaRunner<TContext>
 * -------------------
 * Orquesta la ejecución de pasos en orden y la compensación LIFO si falla
 * cualquier paso intermedio.
 *
 * Garantías:
 * 1. Compensación LIFO: si el paso 3 falla, compensa 2 luego 1 (no al revés).
 * 2. Un compensate que lanza NO bloquea los demás compensates (Promise.allSettled).
 * 3. Si compensate es undefined el paso se omite silenciosamente.
 * 4. Nunca lanza — siempre devuelve SagaResult.
 */

import { logger } from "@/lib/logger";
import type { SagaResult, SagaStep } from "./types";

export class SagaRunner<TContext> {
  private readonly steps: SagaStep<TContext>[] = [];

  /** Agrega un paso al saga. Los pasos se ejecutan en orden de inserción. */
  addStep(step: SagaStep<TContext>): this {
    this.steps.push(step);
    return this; // fluent API
  }

  /**
   * Ejecuta el saga con el contexto inicial dado.
   *
   * El contexto es mutable: cada paso puede escribir en él para pasar datos
   * al siguiente paso (ej. `ctx.orderId = "ord_123"`).
   *
   * Nunca lanza — siempre resuelve con SagaResult<TContext>.
   */
  async run(ctx: TContext): Promise<SagaResult<TContext>> {
    const executed: SagaStep<TContext>[] = [];

    for (const step of this.steps) {
      try {
        logger.info(`[saga] execute: ${step.name}`);
        await step.execute(ctx);
        executed.push(step);
        logger.info(`[saga] done: ${step.name}`);
      } catch (rawErr) {
        const error = rawErr instanceof Error ? rawErr : new Error(String(rawErr));

        logger.error(`[saga] failed: ${step.name}`, {
          error: error.message,
          executedSoFar: executed.map((s) => s.name),
        });

        // Compensar en LIFO: el último ejecutado se compensa primero.
        const compensated = await this.compensate(executed, error, ctx);

        return {
          ok: false,
          error,
          compensated,
          failed: step.name,
        };
      }
    }

    return { ok: true, context: ctx };
  }

  // ── Helpers privados ────────────────────────────────────────────────────────

  /**
   * Ejecuta los compensates en orden inverso (LIFO).
   *
   * Usa Promise.allSettled internamente para que un compensate que falla
   * no detenga los demás. Los errores de compensate se registran pero no
   * se propagan al llamador.
   *
   * Retorna los nombres de los pasos compensados (en LIFO).
   */
  private async compensate(
    executed: SagaStep<TContext>[],
    originalError: Error,
    ctx: TContext,
  ): Promise<string[]> {
    // LIFO: invertir copia para no mutar el array original
    const lifo = [...executed].reverse();
    const compensated: string[] = [];

    // Ejecutar compensates de forma secuencial para respetar el orden LIFO
    // y evitar race conditions en el contexto mutable.
    for (const step of lifo) {
      if (!step.compensate) {
        logger.debug(`[saga] compensate skipped (no compensate): ${step.name}`);
        continue;
      }

      try {
        logger.info(`[saga] compensate: ${step.name}`);
        await step.compensate(ctx, originalError);
        compensated.push(step.name);
        logger.info(`[saga] compensated: ${step.name}`);
      } catch (compErr) {
        // Un compensate que falla es un problema serio (double-fault),
        // pero NO debe bloquear los demás compensates.
        logger.error(`[saga] compensate error: ${step.name}`, {
          originalError: originalError.message,
          compensateError: compErr instanceof Error ? compErr.message : String(compErr),
        });
        // Igual marcamos el paso como "intentado" para trazabilidad
        compensated.push(step.name);
      }
    }

    return compensated;
  }
}
