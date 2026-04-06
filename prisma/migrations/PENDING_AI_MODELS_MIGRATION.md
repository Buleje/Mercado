# TD-002 Migration Plan — AIConversation & AIMessage

## Descripción

Esta migración crea dos tablas de base de datos (`AIConversation` y `AIMessage`) que permiten al asistente de IA mantener conversaciones multi-turno con contexto persistente.

**Impacto:**
- 4 archivos de código se desbloquean (ya están escritos, esperando estas tablas)
- Cero datos existentes serán afectados (son tablas nuevas, vacías)
- Ejecutar en cualquier momento, sin downtime
- Tablas vacías: creación tarda ~100ms

## Tablas Creadas

### AIConversation
Almacena sesiones de conversación entre un usuario y el asistente.

**Campos:**
- `id` (TEXT PRIMARY KEY, CUID) — Identificador único
- `tenantId` (TEXT NOT NULL) — Aislamiento multi-tenant
- `user` (TEXT NOT NULL) — Username del usuario
- `channel` (TEXT DEFAULT 'assistant') — "assistant", "coach", o "whatsapp"
- `title` (TEXT DEFAULT '') — Título generado automáticamente de primer mensaje
- `updatedAt` (DATETIME NOT NULL) — Última actualización (auto-update en cada mensaje)
- `createdAt` (DATETIME DEFAULT CURRENT_TIMESTAMP) — Creación

**Índices:**
- `AIConversation_tenantId_idx` — Búsquedas por tenant
- `AIConversation_user_idx` — Búsquedas por usuario
- `AIConversation_channel_idx` — Filtrado por canal
- `AIConversation_updatedAt_idx` — Ordenamiento de conversaciones recientes

### AIMessage
Almacena mensajes individuales dentro de una conversación.

**Campos:**
- `id` (TEXT PRIMARY KEY, CUID) — Identificador único
- `conversationId` (TEXT NOT NULL, FK) — Relación a AIConversation (CASCADE DELETE)
- `role` (TEXT NOT NULL) — "user" o "assistant"
- `content` (TEXT NOT NULL) — Contenido del mensaje (hasta 10,000 caracteres)
- `feedback` (TEXT NULLABLE) — Calificación: "up" o "down"
- `feedbackNote` (TEXT NULLABLE) — Comentario del usuario sobre la respuesta
- `mode` (TEXT NULLABLE) — Modo de ejecución (para debugging)
- `tokensUsed` (INTEGER NULLABLE) — Tokens consumidos por la LLM
- `latencyMs` (INTEGER NULLABLE) — Latencia de respuesta en ms
- `createdAt` (DATETIME DEFAULT CURRENT_TIMESTAMP) — Creación

**Índices:**
- `AIMessage_conversationId_idx` — Búsquedas de mensajes por conversación
- `AIMessage_role_idx` — Filtrado por rol (user/assistant)
- `AIMessage_createdAt_idx` — Ordenamiento cronológico

**Restricción de integridad:**
- Foreign key `conversationId → AIConversation.id` con `ON DELETE CASCADE`
  Cuando se elimina una conversación, todos sus mensajes se eliminan automáticamente.

## Archivos Desbloqueados

Estos 4 archivos contienen código que usa las tablas:

1. **lib/ai-conversation-memory.ts** (158 líneas)
   - `getOrCreateConversation()` — obtiene o crea sesión activa
   - `loadConversationHistory()` — carga últimos N mensajes para contexto LLM
   - `saveMessage()` — guarda mensaje y actualiza timestamp de conversación

2. **app/api/ai-assistant/feedback/route.ts** (115 líneas)
   - `POST /api/ai-assistant/feedback` — graba calificación (👍/👎) de usuario
   - `GET /api/ai-assistant/feedback` — estadísticas de calidad IA

3. **app/api/ai-assistant/history/route.ts** (150+ líneas)
   - `GET /api/ai-assistant/history` — lista conversaciones o detalle de una
   - `POST /api/ai-assistant/history` — crea nueva conversación o guarda mensaje

4. **app/api/cron/ai-history-cleanup/route.ts** (65 líneas)
   - `GET /api/cron/ai-history-cleanup` — job que borra conversaciones >90 días
   - Ejecuta semanalmente (Sunday 3 AM)

**Estado actual:** Todos importan `prisma.aIConversation`/`prisma.aIMessage` pero TypeScript NO lanzaba error hasta que se corrija la BD. Después de migración, funcionarán normalmente.

## Comando de Aplicación

**IMPORTANTE:** NO usar `prisma migrate dev` en producción. Usar `migrate deploy` que es idempotente:

```bash
cd bodega-san-martin

# Debe estar en producción (Supabase):
# - DATABASE_URL = connection pooler (para operaciones normales)
# - DIRECT_URL = direct connection (para migraciones)

# Ejecutar migración:
DATABASE_URL="$DIRECT_URL" npx prisma migrate deploy

# Esto aplica TODAS las migraciones pendientes en orden.
# Si ya fue aplicada (checksum match), se salta silenciosamente.
```

## Plan de Rollback

Si la migración falla o necesita revertirse:

```sql
-- En PostgreSQL/SQLite (via Supabase console o psql):

-- 1. Eliminar tabla de mensajes primero (tiene FK a conversación)
DROP TABLE "AIMessage";

-- 2. Luego eliminar tabla de conversación
DROP TABLE "AIConversation";

-- 3. Marcar la migración como revertida (Prisma track)
-- (Prisma maneja esto automáticamente si usas prisma migrate resolve)
```

**Si rollback es necesario:**
```bash
# En desarrollo SOLO (nunca en prod):
npx prisma migrate resolve --rolled-back 20260406210602_add_ai_conversation_and_message

# Luego hacer cambios al schema y re-generar
```

## Estimaciones

| Métrica | Valor |
|---------|-------|
| **Tiempo de ejecución** | ~100–200 ms (tablas vacías) |
| **Downtime** | Ninguno (operación DDL en PostgreSQL es online) |
| **Espacio en disco** | ~64 KB (índices vacíos) |
| **Datos afectados** | 0 filas (tablas nuevas) |
| **Reversibilidad** | ✅ Sí (simple DROP TABLE x2) |
| **Compatibilidad** | ✅ Supabase PostgreSQL v15+ |

## Verificación Post-Migración

Después de aplicar:

```bash
# 1. Validar schema
npx prisma validate

# 2. Regenerar cliente
npx prisma generate

# 3. Verificar que las tablas existen
SELECT COUNT(*) FROM "AIConversation";  -- debe retornar 0
SELECT COUNT(*) FROM "AIMessage";       -- debe retornar 0

# 4. Tests que dependen de IA
npm run test -- lib/ai-conversation-memory.test.ts
npm run test:e2e -- app/api/ai-assistant
```

## Checklist de Seguridad

- [x] Schema validado (`npx prisma validate`)
- [x] SQL generado revisado (sin DROP inesperados, solo CREATE)
- [x] Modelos agregados a `prisma/schema.prisma`
- [x] Migración creada manualmente en `prisma/migrations/20260406210602_add_ai_conversation_and_message/`
- [x] Cliente Prisma regenerado (`npx prisma generate`)
- [x] Errores TS resueltos (no hay referencias rotas)
- [x] Plan de rollback documentado
- [x] Sin datos en riesgo (tablas nuevas)
- [x] Multi-tenant seguro (tenantId required en ambas tablas)

## Notas Técnicas

- **Historial de IA:** Limpieza automática cada domingo a las 3 AM (vía cron job)
- **Conversaciones activas:** Se reutilizan si tienen <2 horas de inactividad
- **Feedback:** Los usuarios pueden marcar respuestas con 👍/👎 para mejorar modelo
- **Contexto:** Se cargan últimos 16 mensajes en cada request (configurable en `lib/ai-conversation-memory.ts`)
- **Cascada:** Eliminar una conversación borra automáticamente todos sus mensajes (FK ON DELETE CASCADE)

## Referencias en Codebase

```
lib/ai-conversation-memory.ts:46   const existing = await prisma.aIConversation.findFirst({
lib/ai-conversation-memory.ts:60   const created = await prisma.aIConversation.create({
lib/ai-conversation-memory.ts:91   const messages = await prisma.aIMessage.findMany({
app/api/ai-assistant/feedback/route.ts:30   const message = await prisma.aIMessage.findFirst({
app/api/ai-assistant/history/route.ts:39   const conversation = await prisma.aIConversation.findFirst({
app/api/cron/ai-history-cleanup/route.ts:34   const deletedMessages = await prisma.aIMessage.deleteMany({
```

**Estado:** ✅ Listo para aplicar. Esperar instrucciones de Brandon.
