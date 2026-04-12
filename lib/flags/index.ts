/**
 * Feature Flags — Runtime flags con PostHog + env var fallback
 *
 * Uso:
 *   import { isEnabled, getVariant } from '@/lib/flags'
 *   if (await isEnabled('fiado_enabled', { tenantId })) { ... }
 *
 * Fallback: si PostHog no está configurado o está caído,
 * lee de process.env (defense in depth).
 *
 * Referencia: ADR-039
 */

// ── Types ────────────────────────────────────────────────────────────

export interface FlagContext {
  tenantId?: string
  userId?: string
  plan?: string
  region?: string
}

interface CacheEntry {
  value: boolean | string
  expiresAt: number
}

// ── Config ────────────────────────────────────────────────────────────

const POSTHOG_API_KEY = process.env.POSTHOG_API_KEY || ''
const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://us.i.posthog.com'
const CACHE_TTL_MS = 30_000 // 30 segundos

// Cache en memoria
const cache = new Map<string, CacheEntry>()

// ── Flags conocidas con defaults ─────────────────────────────────────

const FLAG_DEFAULTS: Record<string, boolean> = {
  fiado_enabled: true,
  sunat_enabled: true,
  whatsapp_notifications: true,
  checkout_v2: false,
  mcp_bodega_writes: true,
  marketplace_enabled: true,
  loyalty_enabled: true,
  multi_payment_split: false,
  maintenance_mode: false,
  checkout_stripe_bypass: false,
  canary_active: false,
  chaos_enabled: false,
}

// ── Funciones principales ────────────────────────────────────────────

/**
 * Verifica si una feature flag está habilitada.
 *
 * Prioridad:
 * 1. Cache local (30s TTL)
 * 2. PostHog API (si configurado)
 * 3. Environment variable (FEATURE_FLAG_[NAME]=true/false)
 * 4. Default hardcoded
 */
export async function isEnabled(
  flag: string,
  context: FlagContext = {}
): Promise<boolean> {
  const cacheKey = `${flag}:${context.tenantId || 'global'}`

  // 1. Cache check
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value === true
  }

  // 2. PostHog (si configurado)
  if (POSTHOG_API_KEY) {
    try {
      const result = await fetchPostHog(flag, context)
      if (result !== null) {
        cache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
        return result
      }
    } catch {
      // PostHog caído — fallback a env vars
    }
  }

  // 3. Environment variable fallback
  const envKey = `FEATURE_FLAG_${flag.toUpperCase()}`
  const envValue = process.env[envKey]
  if (envValue !== undefined) {
    const result = envValue === 'true' || envValue === '1'
    cache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
    return result
  }

  // 4. Default
  const defaultValue = FLAG_DEFAULTS[flag] ?? false
  cache.set(cacheKey, { value: defaultValue, expiresAt: Date.now() + CACHE_TTL_MS })
  return defaultValue
}

/**
 * Obtiene el variante de una flag (para A/B tests).
 * Retorna el nombre del variante o null si no hay variante.
 */
export async function getVariant(
  flag: string,
  context: FlagContext = {}
): Promise<string | null> {
  const cacheKey = `variant:${flag}:${context.tenantId || 'global'}`

  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) {
    return cached.value as string
  }

  if (POSTHOG_API_KEY) {
    try {
      const result = await fetchPostHogVariant(flag, context)
      if (result) {
        cache.set(cacheKey, { value: result, expiresAt: Date.now() + CACHE_TTL_MS })
        return result
      }
    } catch {
      // fallback
    }
  }

  return null
}

/**
 * Invalida el cache de una flag específica o todas.
 */
export function invalidateFlag(flag?: string): void {
  if (flag) {
    for (const key of cache.keys()) {
      if (key.startsWith(`${flag}:`)) {
        cache.delete(key)
      }
    }
  } else {
    cache.clear()
  }
}

/**
 * Lista todas las flags conocidas con su estado actual.
 */
export async function getAllFlags(context: FlagContext = {}): Promise<
  Array<{ name: string; enabled: boolean; source: string }>
> {
  const results = []
  for (const [name, defaultValue] of Object.entries(FLAG_DEFAULTS)) {
    const enabled = await isEnabled(name, context)
    const source = POSTHOG_API_KEY ? 'posthog' : (process.env[`FEATURE_FLAG_${name.toUpperCase()}`] ? 'env' : 'default')
    results.push({ name, enabled, source })
  }
  return results
}

// ── PostHog API calls ────────────────────────────────────────────────

async function fetchPostHog(flag: string, context: FlagContext): Promise<boolean | null> {
  const distinctId = context.userId || context.tenantId || 'anonymous'

  const response = await fetch(`${POSTHOG_HOST}/decide?v=3`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_API_KEY,
      distinct_id: distinctId,
      person_properties: {
        tenant_id: context.tenantId,
        plan: context.plan,
        region: context.region,
      },
    }),
    signal: AbortSignal.timeout(3000), // 3s timeout
  })

  if (!response.ok) return null

  const data = await response.json()
  const flags = data.featureFlags || {}
  return flag in flags ? !!flags[flag] : null
}

async function fetchPostHogVariant(flag: string, context: FlagContext): Promise<string | null> {
  const distinctId = context.userId || context.tenantId || 'anonymous'

  const response = await fetch(`${POSTHOG_HOST}/decide?v=3`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: POSTHOG_API_KEY,
      distinct_id: distinctId,
    }),
    signal: AbortSignal.timeout(3000),
  })

  if (!response.ok) return null

  const data = await response.json()
  const variants = data.featureFlagPayloads || {}
  return variants[flag] || null
}
