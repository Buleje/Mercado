/**
 * Tests — Feature Flags v2 Evaluador
 *
 * >= 10 casos cubriendo:
 *  - kill switch
 *  - rolloutPct 0, 100 y parcial
 *  - determinismo
 *  - targetTenants
 *  - targetRoles
 *  - variantes A/B
 *  - distribucion uniforme (1000 tenants, tolerancia ±5%)
 */

import { describe, it, expect } from 'vitest'
import { evaluate } from '@/lib/flags/v2/evaluator'
import type { FlagRule, FlagContext } from '@/lib/flags/v2/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function ctx(tenantId: string, userId?: string, userRole?: string): FlagContext {
  return { tenantId, userId, userRole }
}

function rule(overrides: Partial<FlagRule> & { name: string; enabled: boolean }): FlagRule {
  return { ...overrides }
}

// ── Kill switch ───────────────────────────────────────────────────────────────

describe('kill switch', () => {
  it('enabled:false siempre retorna active:false sin importar rolloutPct', () => {
    const r = rule({ name: 'feat_x', enabled: false, rolloutPct: 100 })
    const result = evaluate(r, ctx('tenant-a'))
    expect(result.active).toBe(false)
    expect(result.variant).toBeUndefined()
  })

  it('enabled:false con targetTenants incluido igual retorna active:false', () => {
    const r = rule({ name: 'feat_x', enabled: false, targetTenants: ['tenant-a'] })
    expect(evaluate(r, ctx('tenant-a')).active).toBe(false)
  })

  it('enabled:false con variantes retorna active:false y sin variant', () => {
    const r = rule({
      name: 'ab_test',
      enabled: false,
      variants: { control: 50, treatment: 50 },
    })
    const result = evaluate(r, ctx('tenant-a'))
    expect(result.active).toBe(false)
    expect(result.variant).toBeUndefined()
  })
})

// ── rolloutPct ────────────────────────────────────────────────────────────────

describe('rolloutPct', () => {
  it('rolloutPct:100 siempre retorna active:true para cualquier tenant', () => {
    const r = rule({ name: 'full_rollout', enabled: true, rolloutPct: 100 })
    const tenants = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'tienda-lima', 'bodega-iquitos']
    for (const t of tenants) {
      expect(evaluate(r, ctx(t)).active).toBe(true)
    }
  })

  it('rolloutPct:0 siempre retorna active:false', () => {
    const r = rule({ name: 'zero_rollout', enabled: true, rolloutPct: 0 })
    const tenants = ['alpha', 'beta', 'gamma', 'delta', 'epsilon']
    for (const t of tenants) {
      expect(evaluate(r, ctx(t)).active).toBe(false)
    }
  })

  it('rolloutPct:50 — aproximadamente 50% de tenants distintos reciben la flag', () => {
    const r = rule({ name: 'half_rollout', enabled: true, rolloutPct: 50 })
    const total = 1000
    let activeCount = 0
    for (let i = 0; i < total; i++) {
      if (evaluate(r, ctx(`tenant-${i}`)).active) activeCount++
    }
    const pct = (activeCount / total) * 100
    // Tolerancia ±5% => esperamos entre 45% y 55%
    expect(pct).toBeGreaterThanOrEqual(45)
    expect(pct).toBeLessThanOrEqual(55)
  })
})

// ── Determinismo ──────────────────────────────────────────────────────────────

describe('determinismo', () => {
  it('el mismo tenantId siempre produce el mismo resultado con rolloutPct:50', () => {
    const r = rule({ name: 'stable_flag', enabled: true, rolloutPct: 50 })
    const testCtx = ctx('bodega-san-martin', 'user-42')
    const first = evaluate(r, testCtx)
    for (let i = 0; i < 100; i++) {
      const repeated = evaluate(r, testCtx)
      expect(repeated.active).toBe(first.active)
    }
  })

  it('variante asignada es estable para el mismo contexto', () => {
    const r = rule({
      name: 'ab_stable',
      enabled: true,
      rolloutPct: 100,
      variants: { control: 50, treatment: 50 },
    })
    const testCtx = ctx('tienda-pucallpa', 'user-77')
    const first = evaluate(r, testCtx)
    for (let i = 0; i < 50; i++) {
      expect(evaluate(r, testCtx).variant).toBe(first.variant)
    }
  })
})

// ── targetTenants ─────────────────────────────────────────────────────────────

describe('targetTenants', () => {
  it('tenantId fuera de targetTenants retorna active:false', () => {
    const r = rule({ name: 'tenant_flag', enabled: true, targetTenants: ['vip-1', 'vip-2'] })
    expect(evaluate(r, ctx('regular-tenant')).active).toBe(false)
  })

  it('tenantId dentro de targetTenants retorna active:true', () => {
    const r = rule({ name: 'tenant_flag', enabled: true, targetTenants: ['vip-1', 'vip-2'] })
    expect(evaluate(r, ctx('vip-1')).active).toBe(true)
    expect(evaluate(r, ctx('vip-2')).active).toBe(true)
  })

  it('targetTenants vacio aplica a todos los tenants', () => {
    const r = rule({ name: 'open_flag', enabled: true, rolloutPct: 100, targetTenants: [] })
    expect(evaluate(r, ctx('cualquier-tenant')).active).toBe(true)
  })
})

// ── targetRoles ───────────────────────────────────────────────────────────────

describe('targetRoles', () => {
  it('rol no incluido en targetRoles retorna active:false', () => {
    const r = rule({ name: 'admin_flag', enabled: true, targetRoles: ['admin', 'superadmin'] })
    expect(evaluate(r, ctx('t1', undefined, 'cajero')).active).toBe(false)
  })

  it('rol incluido en targetRoles retorna active:true', () => {
    const r = rule({ name: 'admin_flag', enabled: true, targetRoles: ['admin', 'superadmin'] })
    expect(evaluate(r, ctx('t1', undefined, 'admin')).active).toBe(true)
  })

  it('sin userRole en contexto y targetRoles definido retorna active:false', () => {
    const r = rule({ name: 'role_required', enabled: true, targetRoles: ['cajero'] })
    expect(evaluate(r, ctx('t1')).active).toBe(false)
  })
})

// ── Variantes A/B ─────────────────────────────────────────────────────────────

describe('variantes', () => {
  it('variante es undefined cuando la flag no tiene variants', () => {
    const r = rule({ name: 'simple_flag', enabled: true, rolloutPct: 100 })
    const result = evaluate(r, ctx('t1'))
    expect(result.active).toBe(true)
    expect(result.variant).toBeUndefined()
  })

  it('variante pertenece al conjunto de variantes definidas', () => {
    const r = rule({
      name: 'price_ab',
      enabled: true,
      rolloutPct: 100,
      variants: { control: 50, treatment: 50 },
    })
    const total = 200
    const validVariants = new Set(['control', 'treatment'])
    for (let i = 0; i < total; i++) {
      const result = evaluate(r, ctx(`tenant-${i}`))
      expect(result.active).toBe(true)
      expect(validVariants.has(result.variant!)).toBe(true)
    }
  })

  it('variantes con pesos 50/50 distribuyen aproximadamente parejo (tolerancia ±8%)', () => {
    const r = rule({
      name: 'balanced_ab',
      enabled: true,
      rolloutPct: 100,
      variants: { control: 50, treatment: 50 },
    })
    const total = 1000
    const counts: Record<string, number> = { control: 0, treatment: 0 }
    for (let i = 0; i < total; i++) {
      const result = evaluate(r, ctx(`t-${i}`))
      if (result.variant) counts[result.variant]++
    }
    const controlPct = (counts.control / total) * 100
    expect(controlPct).toBeGreaterThanOrEqual(42)
    expect(controlPct).toBeLessThanOrEqual(58)
  })

  it('variantes triple con pesos desiguales respetan la proporcion aproximada', () => {
    const r = rule({
      name: 'triple_ab',
      enabled: true,
      rolloutPct: 100,
      variants: { a: 25, b: 25, c: 50 },
    })
    const total = 2000
    const counts: Record<string, number> = { a: 0, b: 0, c: 0 }
    for (let i = 0; i < total; i++) {
      const result = evaluate(r, ctx(`t-${i}`))
      if (result.variant) counts[result.variant]++
    }
    // c deberia tener ~50% = ~1000 de 2000
    const cPct = (counts.c / total) * 100
    expect(cPct).toBeGreaterThanOrEqual(42)
    expect(cPct).toBeLessThanOrEqual(58)
  })
})

// ── Distribucion uniforme del hash ────────────────────────────────────────────

describe('hash distribution', () => {
  it('1000 tenants distintos producen distribucion uniforme en buckets 0-99 (tolerancia ±5%)', () => {
    const r = rule({ name: 'dist_test', enabled: true, rolloutPct: 50 })
    const total = 1000
    let activeCount = 0
    for (let i = 0; i < total; i++) {
      if (evaluate(r, ctx(`unique-tenant-${i}`)).active) activeCount++
    }
    const pct = (activeCount / total) * 100
    expect(pct).toBeGreaterThanOrEqual(45)
    expect(pct).toBeLessThanOrEqual(55)
  })

  it('userId diferente con mismo tenantId produce resultados diferentes en rollout 50%', () => {
    const r = rule({ name: 'user_rollout', enabled: true, rolloutPct: 50 })
    const tenant = 'shared-tenant'
    const total = 200
    let activeCount = 0
    for (let i = 0; i < total; i++) {
      if (evaluate(r, ctx(tenant, `user-${i}`)).active) activeCount++
    }
    const pct = (activeCount / total) * 100
    // No deberia ser 0% ni 100% — el userId afecta el hash
    expect(pct).toBeGreaterThan(10)
    expect(pct).toBeLessThan(90)
  })
})

// ── hooks.ts (isEnabled / getVariant) ────────────────────────────────────────

describe('hooks: isEnabled y getVariant', () => {
  it('isEnabled retorna false para flag inexistente (fail-safe)', async () => {
    const { isEnabled, configureStore } = await import('@/lib/flags/v2/hooks')
    const { InMemoryFlagStore } = await import('@/lib/flags/v2/store')
    configureStore(new InMemoryFlagStore())
    const result = await isEnabled('nonexistent_flag', ctx('t1'))
    expect(result).toBe(false)
  })

  it('getVariant retorna null para flag inexistente', async () => {
    const { getVariant, configureStore } = await import('@/lib/flags/v2/hooks')
    const { InMemoryFlagStore } = await import('@/lib/flags/v2/store')
    configureStore(new InMemoryFlagStore())
    const result = await getVariant('nonexistent_flag', ctx('t1'))
    expect(result).toBeNull()
  })

  it('isEnabled retorna true para flag enabled:true rolloutPct:100', async () => {
    const { isEnabled, configureStore } = await import('@/lib/flags/v2/hooks')
    const { InMemoryFlagStore } = await import('@/lib/flags/v2/store')
    const store = new InMemoryFlagStore([{ name: 'my_flag', enabled: true, rolloutPct: 100 }])
    configureStore(store)
    expect(await isEnabled('my_flag', ctx('t1'))).toBe(true)
  })

  it('getVariant retorna el variante correcto para flag A/B activa', async () => {
    const { getVariant, configureStore } = await import('@/lib/flags/v2/hooks')
    const { InMemoryFlagStore } = await import('@/lib/flags/v2/store')
    const store = new InMemoryFlagStore([
      { name: 'price_test', enabled: true, rolloutPct: 100, variants: { old: 50, new: 50 } },
    ])
    configureStore(store)
    const v = await getVariant('price_test', ctx('t1', 'u1'))
    expect(['old', 'new']).toContain(v)
  })
})
