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

### Arquitectura y complejidad
- [ ] YAGNI: ningún patrón/abstracción añadido "por si acaso"
- [ ] SRP por capa: route handler valida+delega, DB class tiene la lógica, Prisma persiste
- [ ] Ningún archivo nuevo > 400 líneas (componentes) o > 100 líneas (hooks)
- [ ] Si hay decisión arquitectónica importante → nuevo ADR en `docs/adr/`
- [ ] Si hay feature nueva riesgosa → envuelta en feature flag (`lib/feature-flags.ts`)
- [ ] Eventos de dominio nuevos → registrados en `lib/events/`

### Si aplica
- [ ] Cambios en proxy.ts: probar todas las rutas (admin, store, API)
- [ ] Cambios en schema.prisma: `npx prisma validate` + plan de migración en `docs/` (ver migration-planner agent)
- [ ] Cambios en CheckoutModal/CartSidebar: probar multi-tab + pasar tests de `__tests__/checkout/`
- [ ] Cambios en app/admin/page.tsx: smoke manual de los tabs afectados
- [ ] Nuevas queries en `lib/db/*.db.ts`: verificar que no crean N+1 (sin `for + await prisma.x`)
- [ ] Nuevos `@@index` si se agregan campos para WHERE/ORDER BY
- [ ] Fire-and-forget solo para logs/notifs: procesos críticos van a BullMQ (`lib/queue/`)

## Tests
- [ ] Tests unitarios agregados/actualizados
- [ ] Tests e2e actualizados (si aplica)
- [ ] Tests pasan: `npm run test`
- [ ] Cobertura no baja del umbral (80% líneas / 70% branches)

## Observabilidad
- [ ] Errores logueados con `lib/logger.ts` + `requestId`
- [ ] Sentry captura errores críticos (no sólo `.catch(() => {})` silencioso)

## Screenshots (si aplica)
<!-- Capturas de pantalla de cambios visuales -->

## Notas para el reviewer
<!-- Contexto adicional, trade-offs, áreas de riesgo -->

---

> 💡 **Gate pre-merge:** Usa `/review` y `/test-all` antes de marcar como listo para revisión.
> 📚 **Prácticas 2026:** Ver `docs/practicas-2026-audit.md` para el estándar de calidad del proyecto.
