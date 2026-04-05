## Resumen
<!-- Descripción breve de los cambios -->

## Tipo de cambio
- [ ] feat: Nueva funcionalidad
- [ ] fix: Corrección de bug
- [ ] refactor: Refactorización
- [ ] perf: Mejora de rendimiento
- [ ] docs: Documentación
- [ ] test: Tests
- [ ] chore: Mantenimiento

## Definition of Done

### Calidad de código
- [ ] Clean Code: funciones < 15 líneas, nombres descriptivos
- [ ] Zod `safeParse()` en todos los endpoints (nunca `.parse()`)
- [ ] `tenantId` incluido en todas las queries a BD
- [ ] Cache invalidado después de operaciones de escritura
- [ ] Sin secrets hardcodeados en el código
- [ ] Sin N+1: usar Prisma `include` para relaciones

### Seguridad
- [ ] `requireAdmin()` en routes protegidas con roles correctos
- [ ] `export const dynamic = "force-dynamic"` en route handlers
- [ ] Rate limiting en endpoints públicos nuevos
- [ ] Input validation en boundaries (user input, APIs externas)

### Verificación
- [ ] `npm run lint` pasa sin warnings
- [ ] `npm run build` pasa exitosamente
- [ ] `npx tsc --noEmit` sin errores de tipos
- [ ] Tests unitarios para paths críticos (cobertura >= 80%)
- [ ] Responsive: funciona en mobile (375px+)

### Si aplica
- [ ] Cambios en proxy.ts: probar todas las rutas (admin, store, API)
- [ ] Cambios en schema.prisma: `npx prisma validate` + plan de migración
- [ ] Cambios en CheckoutModal/CartSidebar: probar multi-tab

## Tests
- [ ] Tests unitarios agregados/actualizados
- [ ] Tests e2e actualizados (si aplica)
- [ ] Tests pasan: `npm run test`

## Screenshots (si aplica)
<!-- Capturas de pantalla de cambios visuales -->

## Notas para el reviewer
<!-- Contexto adicional, trade-offs, áreas de riesgo -->
