# ADR-130 — Publicaciones por tienda (feed social + comentarios)

> Estado: **Aceptado** · Fecha: 2026-06-12 · Autor: Brandon + Claude

## Contexto

El modal de agregar al carrito se mantuvo **liviano** (ADR previo de esta sesión:
cantidad + modificadores + agregar). Los comentarios de producto se movieron a la
**página de detalle**. Queda la pregunta de dónde vive el contenido social que
genera **retención**: que una tienda publique novedades ("hoy llegaron empanadas
calientes", "promo de pollo este finde", una foto del local) y que los vecinos
**comenten** y vuelvan a pedir.

Hoy no existe ningún feed por tienda. El único contenido social son las reseñas
(`Review`) atadas a productos/orden. Necesitamos un canal **editorial del dueño**,
no transaccional.

## Decisión

Crear un **feed de Publicaciones por tienda**, estilo Instagram/Facebook ligero:

- El **dueño** publica desde el seller-central (`/vender/mi-tienda`): texto +
  imagen opcional. Puede fijar (pin) una publicación.
- Los **vecinos** ven el feed en la página de la tienda
  (`/marketplace/[slug]`) y pueden **comentar** (requiere sesión de cliente).
- Moderación vía `status` (published | hidden) + soft-delete (`deletedAt`).

### Modelos (aditivo — 2 tablas nuevas, sin tocar tablas existentes)

```prisma
model StorePost {
  id           String    @id @default(cuid())
  tenantId     String
  storeId      String
  store        Store     @relation(fields: [storeId], references: [id], onDelete: Cascade)
  body         String                       // texto de la publicación (máx 1000 en API)
  imageUrl     String?
  pinned       Boolean   @default(false)
  status       String    @default("published") // published | hidden
  likeCount    Int       @default(0)
  commentCount Int       @default(0)        // denormalizado
  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt
  deletedAt    DateTime?
  comments     StorePostComment[]

  @@index([tenantId])
  @@index([storeId, status, pinned, createdAt(sort: Desc)], name: "StorePost_store_feed_idx")
}

model StorePostComment {
  id         String    @id @default(cuid())
  tenantId   String
  postId     String
  post       StorePost @relation(fields: [postId], references: [id], onDelete: Cascade)
  customerId String?                        // quién comentó (sesión de cliente)
  authorName String
  body       String                         // máx 500 en API
  status     String    @default("published") // published | hidden
  createdAt  DateTime  @default(now())
  deletedAt  DateTime?

  @@index([tenantId])
  @@index([postId, status, createdAt], name: "StorePostComment_post_idx")
}
```

`Store` gana la relación virtual `posts StorePost[]` (sin columna nueva en Store).

### Capas

| Capa | Artefacto |
|---|---|
| DB | `lib/db/store-posts.db.ts` — `tenantId` 1er param, cache + audit + invalidate |
| API dueño | `POST/DELETE /api/marketplace/stores/[slug]/posts` (`requireAdmin` + match tenantId) |
| API público | `GET /api/marketplace/stores/[slug]/posts` (feed + comentarios) |
| API cliente | `POST /api/marketplace/stores/[slug]/posts/[postId]/comments` (`getCustomerPayload`) |
| UI dueño | tab "Publicaciones" en seller-central |
| UI cliente | sección de feed en `/marketplace/[slug]` |

## Consecuencias

- **+Retención**: razón recurrente para volver a la tienda (no solo cuando se
  necesita algo puntual).
- Migración **aditiva** → riesgo bajo, sin downtime, reversible (DROP de 2 tablas).
- Moderación mínima v1 (status + soft-delete). Sin reportes/notificaciones aún.
- Denormalizamos `commentCount` (consistencia eventual vía la DB class).

## Alternativas consideradas

1. **Reutilizar `Review` con un `postId`**: rechazado — `Review` ya es triple
   propósito (reseña de producto / de tienda / "comentario"); un 4º uso lo vuelve
   inmanejable.
2. **Engordar el modal de agregar** con comentarios sociales: rechazado en esta
   sesión — estorba el checkout rápido y duplica la página de detalle.
3. **Banners (`StoreBanner`) como feed**: rechazado — son publicidad estática
   programable, no contenido conversacional.

## Referencias

- ADR-059 marketplace-retention.
- Sesión 2026-06-12: agotados+Avísame, modal liviano, filtros rail, este feed.
- Modelo plantilla: `Review` (tenantId, storeId, status, soft-delete, índices).
