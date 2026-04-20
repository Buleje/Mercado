/**
 * lib/sagas/types.ts
 *
 * Tipos centrales del Saga pattern.
 * Un Saga es una secuencia de pasos transaccionales con compensación LIFO.
 * Si el paso N falla, se compensan N-1, N-2, ... 0 en orden inverso.
 */

/**
 * Un paso dentro de un Saga.
 *
 * @template TContext - Objeto mutable que fluye a través de todos los pasos.
 *   Cada paso puede enriquecer el contexto (ej. escribir el orderId creado
 *   para que el paso de cobro lo lea).
 */
export interface SagaStep<TContext> {
  /** Nombre legible. Se usa en logs y en SagaResult. */
  name: string;

  /**
   * Lógica principal del paso.
   * Puede mutar `ctx` para pasar datos al siguiente paso.
   * Debe lanzar un Error si algo sale mal.
   */
  execute: (ctx: TContext) => Promise<void>;

  /**
   * Lógica de compensación (rollback).
   * Se invoca SOLO si este paso ya se ejecutó exitosamente y un paso
   * posterior falló. El `error` es el error original que desencadenó
   * la compensación.
   *
   * Opcional: si un paso es idempotente o no requiere deshacer
   * (ej. enviar una notificación), se puede omitir.
   */
  compensate?: (ctx: TContext, error: Error) => Promise<void>;
}

/**
 * Resultado de ejecutar un Saga completo.
 *
 * - ok:true  → todos los pasos ejecutaron sin error. `context` tiene el
 *              estado final enriquecido por los pasos.
 * - ok:false → un paso lanzó un error. `compensated` lista (en orden LIFO)
 *              los pasos que se compensaron. `failed` es el nombre del paso
 *              que originó el fallo.
 */
export type SagaResult<TContext> =
  | { ok: true; context: TContext }
  | {
      ok: false;
      error: Error;
      /** Nombres de pasos compensados, en orden LIFO (último→primero). */
      compensated: string[];
      /** Nombre del paso que lanzó el error original. */
      failed: string;
    };
