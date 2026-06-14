# Spec — Messenger Superadmin ↔ Tenants

> **Fecha:** 2026-06-14 · **Autor:** Brandon + Claude · **Estado:** aprobado (diseño)
> **Tipo:** feature nueva · **Zona de peligro:** sí (schema.prisma → migración)

## 1. Contexto y objetivo

El superadmin (plataforma SaaS Buleje) hoy no tiene forma de **conversar** con los
dueños de los tenants. Existe `SupportInbox.tsx` (no cableado al nav, basado en
`SupportTicket` = 1 mensaje + 1 reply, insuficiente para ida y vuelta).

**Objetivo:** un Messenger real, bidireccional, estilo el chat del marketplace/admin,
para que el superadmin **inicie y reciba** conversaciones con dueños de tenants, con
features avanzadas: plantillas, broadcast segmentado, asistencia IA y triage.

## 2. Decisiones (brainstorming 2026-06-14)

| Decisión | Elección |
|---|---|
| Interlocutor | **Dueños de tenants** (bidireccional: iniciar + recibir) |
| Arquitectura | **Modelos nuevos** `PlatformConversation` + `PlatformMessage` (Messenger real) |
| Features avanzadas | **Las 4**: plantillas, broadcast segmentado, IA, triage |
| Nombre en nav | **"Chat"** (grupo Inicio del superadmin) |

No se reusa `ConversationThread` (es buyer↔seller, scoped por store, contadores
buyer/seller) ni `SupportTicket` (1 reply). Modelo dedicado = límpio y profundo.

## 3. Arquitectura

```
superadmin UI (/superadmin/chat)
   └─ MessengerClient (lista · hilo · composer)
        └─ fetch → app/api/superadmin/chat/**  (requireSuperadmin + Zod safeParse)
             └─ lib/db/platform-chat.db.ts  (única vía a Prisma; cache + audit)
                  └─ PlatformConversation / PlatformMessage  (Postgres)
tenant UI (admin del negocio)
   └─ PlatformInboxPanel (leer/responder mensajes de la plataforma)
        └─ fetch → app/api/admin/platform-chat/**  (requireAdmin)
             └─ lib/db/platform-chat.db.ts  (mismas tablas, scope tenantId)
```

### 3.1 Modelos Prisma

```prisma
model PlatformConversation {
  id                String    @id @default(cuid())
  tenantId          String                          // tenant interlocutor
  tenantName        String
  subject           String?
  status            String    @default("open")      // open|closed|archived
  priority          String    @default("medium")    // low|medium|high
  assignedTo        String?                          // username superadmin
  labelsJson        String?                          // JSON string[]
  unreadForPlatform Int       @default(0)
  unreadForTenant   Int       @default(0)
  lastMessageAt     DateTime?
  lastMessageText   String?
  lastSenderType    String?                          // platform|tenant|system
  createdBy         String    @default("platform")
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  messages          PlatformMessage[]
  @@index([tenantId])
  @@index([status])
  @@index([assignedTo])
  @@index([lastMessageAt(sort: Desc)])
  @@index([tenantId, status])
}

model PlatformMessage {
  id               String    @id @default(cuid())
  conversationId   String
  tenantId         String
  senderType       String                            // platform|tenant|system
  senderName       String
  senderId         String?
  body             String
  messageType      String    @default("text")        // text|image|broadcast|note|system_event
  attachmentUrl    String?
  isInternalNote   Boolean   @default(false)         // solo visible al superadmin
  metadataJson     String?
  readByPlatformAt DateTime?
  readByTenantAt   DateTime?
  deletedAt        DateTime?
  createdAt        DateTime  @default(now())
  conversation     PlatformConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  @@index([conversationId])
  @@index([tenantId])
  @@index([conversationId, createdAt(sort: Desc)])
}
```

**Migración (danger-zone):** SQL idempotente (`CREATE TABLE IF NOT EXISTS`,
índices `IF NOT EXISTS`), aplicada vía script `pg` directo con `DIRECT_URL`
(el pooler cuelga `prisma migrate`), luego `prisma generate` + reiniciar dev.
Sin `DROP`. Tablas nuevas ⇒ sin riesgo de pérdida de datos. ADR nuevo.

### 3.2 DB class — `lib/db/platform-chat.db.ts`

Conforme al rubric `db-class.json`. Métodos (todos con audit + invalidate cache):
- `listConversations({ status?, assignedTo?, label?, search?, q? })` — superadmin, cross-tenant.
- `getConversation(id)` / `getMessages(conversationId, { includeNotes })`.
- `createConversation({ tenantId, subject?, createdBy })`.
- `sendMessage({ conversationId, senderType, senderName, body, messageType?, attachmentUrl?, isInternalNote? })` — actualiza `lastMessage*` + contador no-leídos del lado opuesto.
- `markRead({ conversationId, side: "platform"|"tenant" })`.
- `setLabels / assign / setPriority / setStatus`.
- `broadcast({ filter, body, createdBy })` — resuelve tenants por filtro, crea/actualiza 1 conversación por tenant con `messageType:"broadcast"`. Devuelve `{ sent, skipped }`.
- Lado tenant: `listForTenant(tenantId)` / `getMessagesForTenant` (excluye `isInternalNote`).

> Nota multi-tenant: el superadmin opera **cross-tenant** legítimamente (es plataforma).
> Las queries del lado tenant SIEMPRE filtran por `tenantId` (1er argumento).
> `isInternalNote=true` jamás se devuelve al endpoint del tenant.

### 3.3 API

Superadmin (`requireSuperadmin`, Zod `safeParse`, sin `force-dynamic`):
- `GET  /api/superadmin/chat/conversations` — lista + filtros.
- `POST /api/superadmin/chat/conversations` — iniciar (body: tenantId, subject?, firstMessage?).
- `GET  /api/superadmin/chat/conversations/[id]/messages`
- `POST /api/superadmin/chat/conversations/[id]/messages` — enviar (texto/nota/imagen).
- `POST /api/superadmin/chat/conversations/[id]/read`
- `PATCH /api/superadmin/chat/conversations/[id]` — status/priority/labels/assign.
- `POST /api/superadmin/chat/broadcast` — broadcast segmentado.
- `POST /api/superadmin/chat/ai` — `{ mode: "draft"|"summary"|"tone", ... }` vía `claude-router`.
- `GET  /api/superadmin/chat/templates` (+ reuse `/api/message-templates`).

Tenant (`requireAdmin`):
- `GET  /api/admin/platform-chat` — conversaciones de la plataforma para este tenant.
- `GET  /api/admin/platform-chat/[id]/messages`
- `POST /api/admin/platform-chat/[id]/messages` — responder.
- `POST /api/admin/platform-chat/[id]/read`

### 3.4 UI

**Superadmin** `/superadmin/chat` (route nueva) → `SuperAdminMessenger` (client):
- Columna izq: lista de conversaciones (avatar tenant, último mensaje, no-leídos, etiquetas, filtros por estado/etiqueta/asignado, búsqueda, botón "Nueva conversación").
- Centro: hilo (burbujas platform/tenant, eventos system, notas internas resaltadas, adjuntos).
- Composer: textarea + plantillas + adjuntar + "✨ IA" (borrador/resumen/tono) + enviar.
- Modal "Broadcast" (filtros de segmento + preview de N destinatarios + mensaje).
- Lenguaje visual = el chat del marketplace/admin (reusar primitivos donde aplique; máx ~300 LOC por componente, lógica a hooks).
- Nav: ítem **"Chat"** en `NAV_GROUPS` grupo `inicio` + badge de no-leídos en el header (junto al ⌘K).

**Tenant** (admin del negocio): `PlatformInboxPanel` — panel/tab para leer y responder
los mensajes de la plataforma. No muestra notas internas. Indicador de no-leídos.

### 3.5 Features avanzadas (detalle)

| Feature | Implementación |
|---|---|
| Plantillas | Reusa `MessageTemplate`; selector en composer; variables `{tienda}`,`{plan}`,`{estado}` resueltas al insertar |
| Broadcast | Filtros: plan (`free\|starter\|pro\|enterprise`), estado (trial/activo/moroso), vertical. Preview de destinatarios. 1 `PlatformMessage(messageType:broadcast)` por tenant. Idempotente por `(broadcastId, tenantId)` en metadataJson |
| IA | `claude-router`: `draft` (sugiere respuesta dado el hilo), `summary` (resume hilo largo), `tone` (reescribe formal/cercano). Fire-and-forget UI; degrada con aviso si falta `ANTHROPIC_API_KEY`/`GROQ` |
| Triage | `labelsJson`, `priority`, `assignedTo`, `status`, `isInternalNote`, filtros + búsqueda en `listConversations`, marcar leído/no-leído |

## 4. Seguridad / multi-tenant
- Superadmin endpoints: `requireSuperadmin`. Cross-tenant permitido (es plataforma).
- Tenant endpoints: `requireAdmin` + scope `tenantId` obligatorio; nunca devuelven notas internas ni conversaciones de otros tenants.
- Raw SQL solo parametrizado (`$1 $2`). Totales/contadores en backend.
- Audit log en cada write (Ley 29733). Rate-limit en endpoints de envío.

## 5. Fases de implementación
1. **Base**: migración (modelos+índices idempotentes) → `platform-chat.db.ts` → API superadmin núcleo (list/create/messages/send/read) → UI superadmin (lista·hilo·composer) + nav "Chat".
2. **Triage**: labels/priority/assign/status/notas internas/filtros/búsqueda/no-leído.
3. **Broadcast + IA**: modal broadcast segmentado + endpoint `ai`.
4. **Lado tenant**: `PlatformInboxPanel` en admin + endpoints `/api/admin/platform-chat/**` (cierra el bidireccional).

Cada fase: `tsc --noEmit` EXIT 0 + verificación ejecutable (curl + screenshot) antes de "listo".

## 6. Testing
- Unit (Vitest): `platform-chat.db.ts` (send actualiza contadores, broadcast idempotente, notas internas no salen al tenant).
- E2E (Playwright): superadmin inicia conversación → tenant la ve y responde → superadmin recibe.
- Multi-tenant: tenant A no ve conversaciones de tenant B.

## 7. Fuera de alcance (YAGNI por ahora)
- Tiempo real con WebSockets (se usa polling/refresh; SSE opcional futuro).
- Chat con repartidores/vendors (solo dueños de tenants).
- Traducción automática, llamadas/voz, reacciones emoji.
- Retención/archivado automático.

## 8. ADR
Crear `docs/adr/0XX-superadmin-platform-messenger.md` (contratos de API + modelos nuevos).
