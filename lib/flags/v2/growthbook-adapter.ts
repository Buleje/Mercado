/**
 * Feature Flags v2 — GrowthBook Adapter (STUB)
 *
 * TODO: instalar SDK oficial cuando se active GrowthBook en produccion:
 *   npm install @growthbook/growthbook
 *
 * Este adapter implementa `FlagStore` para que el sistema v2 pueda
 * leer reglas desde GrowthBook como fuente de verdad remota.
 * Mientras no este configurado, delega al `InMemoryFlagStore` pasado
 * en el constructor y loguea un warning en desarrollo.
 */

import type { FlagStore } from './store'
import type { FlagRule } from './types'
import { InMemoryFlagStore } from './store'

// ── Config ────────────────────────────────────────────────────────────────────

const GROWTHBOOK_API_HOST = process.env.GROWTHBOOK_API_HOST ?? ''
const GROWTHBOOK_CLIENT_KEY = process.env.GROWTHBOOK_CLIENT_KEY ?? ''
const IS_CONFIGURED = Boolean(GROWTHBOOK_API_HOST && GROWTHBOOK_CLIENT_KEY)

// ── Adapter ───────────────────────────────────────────────────────────────────

/**
 * GrowthBookFlagStore — adapter para @growthbook/growthbook SDK.
 *
 * Estado actual: STUB — retorna "not configured" en dev y delega al
 * fallback store proporcionado (por defecto InMemoryFlagStore vacio).
 *
 * Cuando se active:
 *  1. `npm install @growthbook/growthbook`
 *  2. Descomentar las secciones marcadas con `// GROWTHBOOK_IMPL`
 *  3. Setear GROWTHBOOK_API_HOST y GROWTHBOOK_CLIENT_KEY en .env
 */
export class GrowthBookFlagStore implements FlagStore {
  private readonly fallback: FlagStore

  constructor(fallback: FlagStore = new InMemoryFlagStore()) {
    this.fallback = fallback

    if (!IS_CONFIGURED && process.env.NODE_ENV !== 'test') {
      // not configured — usando fallback store
    }
  }

  async get(name: string): Promise<FlagRule | undefined> {
    if (!IS_CONFIGURED) {
      return this.fallback.get(name)
    }

    // GROWTHBOOK_IMPL: cuando SDK instalado, hacer fetch a la Feature API
    // const gb = new GrowthBook({ apiHost: GROWTHBOOK_API_HOST, clientKey: GROWTHBOOK_CLIENT_KEY })
    // await gb.loadFeatures()
    // const feature = gb.evalFeature(name)
    // return feature ? mapGrowthBookFeatureToFlagRule(name, feature) : undefined
    return this.fallback.get(name)
  }

  async list(): Promise<FlagRule[]> {
    if (!IS_CONFIGURED) {
      return this.fallback.list()
    }

    // GROWTHBOOK_IMPL:
    // const gb = new GrowthBook({ apiHost: GROWTHBOOK_API_HOST, clientKey: GROWTHBOOK_CLIENT_KEY })
    // await gb.loadFeatures()
    // return Object.entries(gb.getFeatures()).map(([name, f]) => mapGrowthBookFeatureToFlagRule(name, f))
    return this.fallback.list()
  }

  async set(rule: FlagRule): Promise<void> {
    // GrowthBook es read-only desde el cliente — las reglas se gestionan desde su dashboard.
    // En dev/test, permite escritura en el fallback para facilitar pruebas.
    if (!IS_CONFIGURED) {
      return this.fallback.set(rule)
    }
    // En prod con GrowthBook configurado, set() es no-op (use el dashboard de GB)
  }

  async delete(name: string): Promise<void> {
    if (!IS_CONFIGURED) {
      return this.fallback.delete(name)
    }
    // No-op cuando GrowthBook esta configurado — gestionar desde dashboard
  }

  /** Indica si el adapter esta conectado a GrowthBook real. */
  get isConfigured(): boolean {
    return IS_CONFIGURED
  }
}

// ── Helpers (para cuando se active GROWTHBOOK_IMPL) ──────────────────────────

// function mapGrowthBookFeatureToFlagRule(name: string, feature: unknown): FlagRule {
//   // TODO: mapear FeatureResult de GrowthBook SDK a FlagRule v2
//   return { name, enabled: true }
// }
