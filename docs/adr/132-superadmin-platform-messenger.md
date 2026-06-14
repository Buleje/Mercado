# ADR-132 — Messenger Plataforma ↔ Tenants (superadmin)

> **Fecha:** 2026-06-14 · **Estado:** aceptado · **Zona de peligro:** schema (3 tablas nuevas)
> Spec: `docs/superpowers/specs/2026-06-14-superadmin-messenger-design.md`

## Contexto

El superadmin (plataforma SaaS) no tenía forma de **conversar** con los dueños de
los tenants. Existía `SupportTicket` (1 mensaje + 1 reply) y un `SupportInbox`
no cableado al nav. `ConversationThread` es buyer↔seller (por tienda), no sirve
para platform↔tenant. Se necesitaba un Messenger real bidireccional + features
avanzadas (plantillas, broadcast segmentado, IA, triage) y, como extensión,
notas CRM por tenant en la gestión de `/superadmin/tenants`.

## Decisión

**Modelos dedicados** (no reusar ConversationThread ni Note):

- `PlatformConversation` — hilo platform↔tenant: `tenantId, tenantName, subject,
  status(open|closed|archived), priority(low|medium|high), assignedTo, labelsJson,
  unreadForPlatform, unreadForTenant, lastMessage*, createdBy`.
- `PlatformMessage` — `conversationId, tenantId, senderType(platform|tenant|system),
  senderName, body, messageType(text|image|broadcast|note|system_event),
  attachmentUrl, isInternalNote, readBy{Platform,Tenant}At`.
- `PlatformTenantNote` — notas internas del superadmin sobre un tenant (CRM).

**Acceso:** `lib/db/platform-chat.db.ts` (raw SQL parametrizado + cache +
invalidate, patrón ADR-011). Las notas usan raw SQL en su route (evita depender
de reiniciar dev tras `prisma generate`).

**Contratos API:**
- Superadmin (`requirePlatformAPI`): `GET/POST /api/superadmin/chat/conversations`,
  `GET/PATCH .../[id]`, `GET/POST .../[id]/messages`, `POST .../[id]/read`,
  `POST /api/superadmin/chat/broadcast` (segmento por plan/estado o tenantIds),
  `POST /api/superadmin/chat/ai` (draft/summary/tone vía `lib/ai/provider`),
  `GET/POST /api/superadmin/tenants/[slug]/notes`.
- Tenant (`requireAdmin`): `GET /api/admin/platform-chat`,
  `GET/POST /api/admin/platform-chat/[id]/messages`, `POST .../[id]/read`.
  Aislamiento: el tenant solo ve sus conversaciones y nunca notas internas.

**UI:**
- Superadmin: `/superadmin/chat` (Messenger completo: lista + hilo + composer con
  plantillas/IA/notas/triage + modales Broadcast y Nueva conversación) + ítem
  "Chat" en el rail + popover "Chat con negocios" en el header.
- Tenant: `/admin/buleje` (`PlatformInboxPanel`) + botón en el header admin.
- En `/superadmin/tenants`: "Chatear" por fila + "Mensaje" masivo (broadcast con
  tenantIds) + tab Notas en el modal de detalle.

**Migración:** tablas creadas vía SQL idempotente (Supabase MCP `apply_migration`),
`prisma generate`, reiniciar dev. Sin DROP, RLS deshabilitado (consistente con el
aislamiento app-level de Buleje — ver §Consecuencias).

## Consecuencias

- (+) Canal directo plataforma↔negocio, base para soporte/retención/anuncios.
- (+) Modelos limpios, sin contaminar buyer↔seller ni las notas del negocio.
- (−) CSRF obligatorio en todos los POST/PATCH del cliente (`csrfHeaders`).
- (−) Las tablas nuevas heredan RLS-off como el resto del schema (aislamiento es
  app-level, no Postgres RLS). Acceso por service-role; no exponer anon key.
- IA degrada con 503 si falta `ANTHROPIC_API_KEY`/`GROQ`.

## Alternativas consideradas

1. **Reusar `SupportTicket`** — descartado: 1 reply, no es Messenger real.
2. **Reusar `ConversationThread`** con senderType "platform" — descartado:
   contadores buyer/seller y scope por store no mapean; ensucia el chat D2.
3. **Reusar `Note`** para notas CRM — descartado: es del admin del negocio; las
   notas del superadmin se filtrarían en la vista del tenant.

## Referencias
- `lib/db/platform-chat.db.ts`, `app/api/superadmin/chat/**`, `app/api/admin/platform-chat/**`
- `components/superadmin/chat/**`, `components/admin/PlatformInboxPanel.tsx`
- ADR-011 (raw SQL DB classes), ADR-058 (WhatsApp AI-first, contexto de chat)
