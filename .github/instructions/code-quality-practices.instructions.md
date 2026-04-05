---
applyTo: "**/*.{ts,tsx}"
---

# Mejores Prácticas de Código — Obligatorias 2026

Aplicar SIEMPRE al escribir o modificar código TypeScript/React en este proyecto.

## Clean Code
- Funciones de máximo 15 líneas y responsabilidad única
- Nombres descriptivos: `calcularMargenBruto()` no `calc()`, `isProductActive` no `flag`
- Sin comentarios obvios — el código debe ser auto-documentado
- Extraer bloques complejos a funciones con nombre que explique el "qué"

## SOLID
- **S** — Cada archivo/clase/componente tiene UNA razón para cambiar
- **O** — Extender comportamiento sin modificar código existente (Strategy, plugins)
- **L** — Subtipos reemplazables sin romper contratos
- **I** — Interfaces pequeñas y específicas, no "god interfaces"
- **D** — Depender de abstracciones (interfaces/tipos), no de implementaciones concretas

## Capas (nunca mezclar)
```
Route Handler → solo valida input (Zod safeParse) + delega
DB Class      → lógica de negocio + acceso a datos (lib/db/*.db.ts)
Prisma        → solo ORM, nunca expuesto directamente
```

## Validación y Seguridad
- `safeParse()` de Zod — NUNCA `.parse()` (lanza excepción sin control)
- `tenantId` en TODAS las queries — aislamiento multi-tenant
- Rate limiting en endpoints públicos
- Sanitizar inputs antes de queries o renders

## Performance
- Prisma `include` para relaciones — prevenir N+1
- `@@index` en schema.prisma para campos en WHERE/ORDER BY/JOIN frecuentes
- `invalidate()` / `invalidateByPrefix()` después de CADA write a BD
- Paginación por cursor (Keyset) — nunca OFFSET en tablas grandes
- `getOrSet(key, ttl, fn)` para datos de acceso frecuente

## Testing
- Tests en paths críticos PRIMERO: facturación, ventas, inventario, auth
- Cobertura mínima: 80% líneas, 80% statements, 70% branches, 75% functions
- Mock solo lo necesario — prefiere integration tests con BD real cuando sea posible
- Nombres de tests descriptivos: `should reject order when stock is insufficient`

## Patterns
- **Repository Pattern**: lib/db/*.db.ts — nunca Prisma directo desde route handlers
- **Strategy Pattern**: Para lógica variable (descuentos, precios, notificaciones)
- **Feature Flags**: lib/feature-flags.ts para features nuevas en desarrollo
- **Fire-and-forget**: `.catch(() => {})` SOLO para logs/notificaciones no críticas

## Componentes React
- `"use client"` solo cuando necesitas hooks, eventos o estado
- Props tipadas con interface, no inline
- Extraer hooks custom para lógica reutilizable (`useDebounce`, `usePagination`)
- Lazy loading con `next/dynamic` para módulos pesados

## Logging y Observabilidad
- Usar `lib/logger.ts` — nunca `console.log` en producción
- Incluir contexto: `logger.info('Order created', { orderId, tenantId, userId })`
- Errores con stack trace completo: `logger.error('Payment failed', { error, orderId })`

## Antes de commitear
- `npx eslint [archivo] --max-warnings 0` — zero warnings
- `npx tsc --noEmit` — zero type errors (build los ignora)
- Tests del módulo modificado deben pasar
- Conventional Commit: `feat:`, `fix:`, `refactor:`, etc.
