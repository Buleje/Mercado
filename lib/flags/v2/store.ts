/**
 * Feature Flags v2 — Store interface + InMemoryFlagStore
 *
 * La interface `FlagStore` permite swappear el backend de persistencia
 * (InMemory para dev/test, Supabase para prod, GrowthBook via adapter).
 */

import type { FlagRule } from './types'

// ── Interface ─────────────────────────────────────────────────────────────────

export interface FlagStore {
  /** Obtiene una regla por nombre. Retorna `undefined` si no existe. */
  get(name: string): Promise<FlagRule | undefined>
  /** Lista todas las reglas disponibles. */
  list(): Promise<FlagRule[]>
  /** Guarda o reemplaza una regla. */
  set(rule: FlagRule): Promise<void>
  /** Elimina una regla por nombre. Silencioso si no existe. */
  delete(name: string): Promise<void>
}

// ── InMemoryFlagStore ─────────────────────────────────────────────────────────

/**
 * Implementacion en memoria — optima para tests y desarrollo local.
 * No persiste entre reinicios del servidor.
 *
 * Uso:
 *   const store = new InMemoryFlagStore()
 *   await store.set({ name: 'checkout_v3', enabled: true, rolloutPct: 20 })
 *   const rule = await store.get('checkout_v3')
 */
export class InMemoryFlagStore implements FlagStore {
  private readonly rules = new Map<string, FlagRule>()

  /** Precarga reglas al construir el store (util en tests). */
  constructor(initial: FlagRule[] = []) {
    for (const rule of initial) {
      this.rules.set(rule.name, { ...rule })
    }
  }

  async get(name: string): Promise<FlagRule | undefined> {
    const rule = this.rules.get(name)
    // Retornamos copia defensiva para evitar mutacion externa
    return rule ? { ...rule } : undefined
  }

  async list(): Promise<FlagRule[]> {
    return Array.from(this.rules.values()).map((r) => ({ ...r }))
  }

  async set(rule: FlagRule): Promise<void> {
    this.rules.set(rule.name, { ...rule })
  }

  async delete(name: string): Promise<void> {
    this.rules.delete(name)
  }

  /** Vacia el store — util para limpiar estado entre tests. */
  clear(): void {
    this.rules.clear()
  }

  /** Cantidad de reglas almacenadas — util para assertions en tests. */
  get size(): number {
    return this.rules.size
  }
}
