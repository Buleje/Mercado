# ADR-012: Polling HTTP vs Supabase Realtime para el Chat del Marketplace (Bloque D2)

## Estado
✅ Aceptada (Fase 2) · 🟡 Revisable en Fase 3 (cuando Realtime sea necesario)

## Fecha
2026-04-08

## Contexto

El Bloque D2 del Marketplace introduce un chat 1-a-1 entre buyers y sellers. Los mensajes deben aparecer "rápido" en la UI del otro lado para que la conversación se sienta fluida. Tenemos dos opciones arquitectónicas:

1. **Polling HTTP** — el cliente hace GET cada N segundos al endpoint de mensajes
2. **Supabase Realtime** — subscripciones WebSocket a `postgres_changes` de la tabla `ConversationMessage`

Brandon no tiene todavía Realtime activado en su proyecto Supabase actual (us-east-2 pooler). Implementar Realtime requeriría:
- Activar la feature en el dashboard de Supabase
- Agregar `@supabase/supabase-js` y `@supabase/realtime-js` al bundle
- Publicar los cambios de `ConversationMessage` en el `supabase_realtime` publication
- Configurar RLS correcto para que cada buyer solo reciba sus propios mensajes
- Medir el impacto en el bundle del cliente
- Mantener dos código paths (online/offline/disconnect reconnect)

Mientras tanto, el proyecto ya tiene un stack de polling maduro:
- `tenantFetch` client-side con inject automático de `x-tenant-id`
- Cache híbrido memory+redis con `getOrSet` TTL corto (10s en messages)
- `DISTINCT ON` + índices compuestos por `(threadId, createdAt DESC)` (13 índices en D2)
- Hooks custom con `setTimeout` loop + cleanup en unmount
- Fire-and-forget `markAsRead` dentro del GET que ya existe

## Opciones consideradas

### Opción A: Polling HTTP (elegida para Fase 2)

```typescript
// hooks.ts
const loop = async () => {
  if (cancelled) return;
  await load();
  timerRef.current = setTimeout(loop, 5000);
};
```

- ✅ Cero dependencias nuevas — usa la infra ya desplegada
- ✅ Compatible con el pattern de los otros tabs (OrdersTab, DeliveryTab)
- ✅ Cache en memoria de 10s absorbe el 99% de los polls duplicados
- ✅ Backend resiliente — si el cliente tiene red flaky, sólo pierde un round
- ✅ Observabilidad simple: cada GET es un span HTTP normal en Sentry/OTEL
- ✅ Rate limiting del middleware ya lo protege (60 req/min/IP)
- ✅ Graceful degradation — sin JS sigue funcionando (en hypothetical SSR)
- ❌ Latencia percibida de 3-5s entre mensaje enviado y recibido
- ❌ Hace polls en períodos donde no hay actividad (costo marginal de CPU)
- ❌ No soporta "X está escribiendo..." (typing indicator)

### Opción B: Supabase Realtime (deferida a Fase 3)

```typescript
const channel = supabase
  .channel(`thread:${threadId}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "ConversationMessage" }, (payload) => {
    appendMessage(payload.new);
  })
  .subscribe();
```

- ✅ Latencia sub-segundo entre mensaje enviado y recibido
- ✅ Menor consumo server-side cuando hay baja actividad
- ✅ Habilita "typing indicator" natural via Presence
- ✅ Habilita read receipts en tiempo real
- ❌ +~35KB al bundle del cliente (`@supabase/realtime-js` + dependencias)
- ❌ Requiere RLS policies correctamente configuradas (riesgo de multi-tenant leak)
- ❌ Reconnect logic, exponential backoff, offline queue — complejidad nueva
- ❌ Requiere activar Realtime publication en Supabase dashboard
- ❌ Debugging más complejo — WebSocket frames en DevTools vs HTTP normal
- ❌ Bill adicional por Realtime messages del plan Supabase

### Opción C: Long-polling (rechazada)

- Peor que polling normal porque mantiene conexiones abiertas sin los beneficios de WebSocket
- El infra del proyecto (middleware `force-dynamic` + Vercel functions) no está optimizado para conexiones largas

### Opción D: Server-Sent Events (rechazada)

- El proyecto ya tiene SSE en otros lugares pero requiere infra nueva para multi-tenant con tenantId
- No aporta suficientes beneficios sobre polling simple dada la frecuencia de chat (no high-frequency)

## Decisión

**Elegimos Opción A — Polling HTTP con intervalos de 5-8s**, con las siguientes restricciones:

1. **ChatTab en admin**: polling 8s para threads · 5s para messages activos
2. **Cache server-side**: 10s en `ChatMessagesDB.listByThread` · 20s en `ChatThreadsDB.listByTenant`
3. **`markAsRead` fire-and-forget** dentro del GET para minimizar round-trips
4. **Feature flag** `marketplace-chat-realtime` reservado para Fase 3 — cuando se active, los hooks detectan el flag y hacen switch al stream Supabase
5. **Realtime NO se implementa** en esta fase — queda documentado como trabajo futuro

El threshold para migrar a Realtime es claro:

> **Cuando P50 de mensajes/thread/minuto > 3 en producción durante 1 semana**, activar Realtime.
> Hasta entonces, polling es más simple, más barato y suficiente para la experiencia del usuario.

## Consecuencias

### Positivas

- Sprint 2 del D2 se pudo cerrar sin dependencias nuevas
- El feature flag `marketplace-chat-realtime` ya está creado → la migración futura es un diff mínimo
- Cero riesgo de multi-tenant leak porque cada request pasa por `requireAdmin` + tenantId server-side
- Los tests unitarios son más simples (no necesitan mockear WebSocket)
- El bundle del cliente queda intacto (no agregamos 35KB)
- Fácil de debuggear — son GETs normales en DevTools Network tab

### Negativas

- **Latencia percibida**: el buyer ve la respuesta del seller en 3-5s en el peor caso. Aceptable para chat de atención al cliente, NO aceptable para chat "tipo WhatsApp live".
- **Costo de polls vacíos**: si hay 100 buyers con threads abiertos sin actividad, son 100 × 720 req/h = 72k req/h contra Supabase. Mitigado por cache de 10s que sirve el 99% sin hit de DB.
- **Sin typing indicator**: feature solicitada en roadmap Fase 3 — bloqueada hasta la migración a Realtime
- **Sin read receipts live**: el ✓✓ se actualiza sólo en el siguiente poll (5s) — no instantáneo

### Mitigaciones activas

| Riesgo | Mitigación |
|---|---|
| Latencia percibida muy alta para el usuario final | Intervalos de 5s son aceptables per UX research sobre chat de atención cliente |
| Polls vacíos matan la DB | Cache hit rate target > 95% · getOrSet TTL 10s · invalidate por prefix solo en writes |
| Escalamiento más allá de 1k threads concurrentes | Realtime migration path documentado arriba con threshold claro |
| WhatsApp spam por cada mensaje | Worker BullMQ respeta idempotency por `(threadId, event, minuteBucket)` — como máximo 1 WhatsApp por minuto por hilo |

## Path de migración a Realtime (cuando se active Fase 3)

1. `npm install @supabase/supabase-js` (+ `@supabase/realtime-js` incluida)
2. En Supabase dashboard: habilitar Realtime publication para `ConversationMessage`
3. Configurar RLS policy: `tenant_id = current_setting('request.jwt.claims.tenant_id')::text`
4. Crear `lib/realtime/chat-channel.ts` con el helper para crear channels por thread
5. Modificar `hooks.ts` de `ChatTab`:
   ```typescript
   if (isFeatureEnabled("marketplace-chat-realtime")) {
     // Subscribe path
     const channel = subscribeToThread(threadId, onNewMessage);
     return () => channel.unsubscribe();
   } else {
     // Polling path (actual)
     loop();
   }
   ```
6. Agregar `typing` events via Presence
7. Actualizar tests
8. Crear ADR-0XX "Migración del chat D2 a Supabase Realtime"

**Estimación**: 6-10 horas de trabajo + testing exhaustivo de edge cases (reconnect, offline, multi-tab sync).

## Referencias

- `hooks.ts` del `ChatTab` (implementación polling actual)
- `lib/feature-flags.ts` (`marketplace-chat-realtime` flag reservado)
- `lib/queue/chat-notifications-worker.ts` (WhatsApp async)
- `prisma/schema.prisma` (ConversationThread + ConversationMessage con índices)
- ADR 011 (raw SQL pattern para delivery — este chat sigue el mismo pattern)
- [Supabase Realtime docs](https://supabase.com/docs/guides/realtime)
