# ADR-119 — Drive de Documentos del Negocio v3

**Estado:** Aceptado · **Fecha:** 2026-05-25 · **Autor:** Buleje + Claude

## Contexto

El tab `documentos` (`DocumentosModule.tsx`, ~722 líneas) es un "Drive interno"
funcional (upload, carpetas, share, versionado, firma, plantillas, OCR, IA) pero
**genérico**: clon de Google Drive que no aprovecha el dominio del negocio.

El schema `Document` (`prisma/schema.prisma:4256`) **ya tiene** campos sin UI:
`expiresAt`, `customerId`, `orderId`, `supplierId`, `ocrText`, `aiCategory`,
`aiTags`. El `DocumentsDB.list()` (`lib/db/documents.db.ts:156`) ya filtra por
todos ellos. El valor está atrapado en el backend.

Para una pizzería/bodega en Perú, los documentos que importan vencen
(licencia de funcionamiento municipal, certificado DIGESA, contratos de
alquiler/proveedor) y un vencimiento perdido = multa o cierre. Hoy nada avisa.

## Decisión

Evolucionar a **"Drive del Negocio"** con 4 capacidades de dominio + rediseño
visual híbrido adaptativo, reutilizando la infra existente (17 endpoints,
`DocumentsDB`, `lib/whatsapp.ts`, patrón cron `adelantos-recordatorios`).

### Capacidades

1. **Vencimientos + alertas WhatsApp** — vista "Por vencer", badges de color,
   cron diario que avisa por WhatsApp a 7/3/1 días. Anti-spam vía
   `expiryReminderSentAt`.
2. **Escáner cámara móvil** — `capture="environment"` → upload → OCR + IA
   categoriza/nombra. El celular como escáner.
3. **Vincular a cliente/pedido/proveedor** — picker en el detalle; los docs
   aparecen luego desde la ficha de la entidad. Usa campos ya existentes.
4. **Compartir WhatsApp + búsqueda IA** — `wa.me` con link de share existente +
   búsqueda semántica (expansión de query IA sobre `ocrText`/tags/nombre).

### Visual (híbrido adaptativo)
- Grid editorial con thumbnail real en desktop ancho; lista densa en móvil.
- Anillo de almacenamiento vs límite del plan.
- Badges de vencimiento (verde/ámbar/rojo según días).

## Cambio de schema (expand, aditivo, zero-downtime)

```prisma
model Document {
  // ...
  expiryReminderSentAt DateTime?   // NUEVO — anti-spam del cron de vencimiento
  @@index([tenantId, expiresAt])   // NUEVO — query de "por vencer"
}
```

Solo agrega columna nullable + índice. Sin backfill, sin breaking change.
Patrón expand→migrate (no requiere contract). Aplicar con DIRECT_URL.

## Consecuencias

**+** Documentos contextuales y proactivos; valor único anti-multas; móvil-first.
**+** Reuso máximo: 1 columna nueva, 1 cron nuevo, 1 endpoint scan; resto extiende.
**−** Cron adicional en `vercel.json`. Búsqueda semántica consume tokens IA
(mitigado: solo si el usuario activa el toggle, fallback a keyword).
**−** `DocumentosModule.tsx` crece; se parte en sub-componentes (`<DocCard>`,
`<StorageRing>`, `<ExpiryBadge>`, `<EntityLinkPicker>`).

## Alternativas

- **pgvector / Qdrant para search semántica:** descartado por ahora — sobre-
  ingeniería para el volumen actual; expansión de query IA sobre OCR alcanza.
- **Documentos fiscales SUNAT en este módulo:** ya existe `documentos-emitidos`
  + tabs Facturación/Guías/Notas. Este Drive es para documentos libres del
  negocio, no comprobantes electrónicos. Se mantiene la separación.

## Referencias
- `lib/db/documents.db.ts`, `lib/types/documents.ts`
- `app/api/cron/adelantos-recordatorios/route.ts` (patrón cron+WhatsApp)
- `lib/whatsapp.ts`, `lib/twilio.ts`
- ADR-117/118 (adelantos — patrón vertical reusado)
