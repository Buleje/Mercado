# ADR-115 · ConsentEvent + Cookie Banner — Compliance Ley 29733 PE

**Fecha:** 2026-05-18
**Estado:** Propuesto · pendiente migration Prisma
**Autores:** Brandon Buleje + audit profundo arquitectura Sprint 3

## Contexto

Ley 29733 (Protección de Datos Personales del Perú) Art. 16-18 exige
**consentimiento verificable** del titular. Buleje actualmente:

- ✅ Audit log hash-chain (Art. 19)
- ✅ GDPR-equivalent export (Art. 18 derecho de acceso)
- ❌ Sin registro de consentimientos versionado
- ❌ Sin cookie banner de aceptación

Riesgo: multa INDECOPI **S/50K+ por incumplimiento confirmado**. Patrón
típico de fiscalización: revisión a denuncia de cliente que pide saber
qué datos tenemos y desde cuándo consintió.

## Decisión

Implementar registro **`ConsentEvent`** versionado + UI **CookieBanner**
que persiste consents granulares (analytics / marketing / vendor-share /
WhatsApp / términos / privacidad).

### Modelo Prisma (PENDIENTE aplicar)

```prisma
model ConsentEvent {
  id            String    @id @default(cuid())
  tenantId      String?   // null = platform-wide cookies
  customerId    String?   // Customer.phone — null si anónimo
  visitorId     String?   // cookie fingerprint para anónimos
  type          String    // marketing | cookies-analytics | cookies-marketing
                          // | data-share-vendor | whatsapp-notifications
                          // | terms | privacy
  policyVersion String    // "v1.0.0" — bump al cambiar política
  granted       Boolean   // true=acepta, false=rechaza explicito
  source        String    // cookie-banner | checkout | settings | whatsapp-optin | api
  ipAddress     String?   // hashed o /24 trunc (NO full IP)
  userAgent     String?   // truncado 200 chars
  grantedAt     DateTime  @default(now())
  revokedAt     DateTime? // NO se borra el registro al revocar

  @@index([tenantId, customerId, type])
  @@index([visitorId, type])
  @@index([customerId, type, grantedAt(sort: Desc)])
}
```

### Política inicial v1.0.0

Tipos de consent:

| Tipo | Default | Bloquea si rechaza |
|---|---|---|
| `terms` | Requerido | Sí (no completa registro) |
| `privacy` | Requerido | Sí (no completa registro) |
| `cookies-analytics` | Opt-in | No (sigue navegando) |
| `cookies-marketing` | Opt-in | No |
| `marketing` (email/WhatsApp) | Opt-in | No |
| `whatsapp-notifications` | Opt-in checkout | No (recibe solo transaccional) |
| `data-share-vendor` | Implícito al comprar | Bloqueado solo si revoca → orden no se puede entregar |

## Implementación

**Sprint 3 hoy:**
- ✅ ADR + runbook
- ✅ Component cliente `CookieConsentBanner.tsx` (funciona con localStorage hasta que se aplique migration)
- ✅ Endpoint `/api/consent` skeleton

**Pendiente Sprint 4:**
- Aplicar migration `prisma migrate dev` con DIRECT_URL
- Migrar persistencia de localStorage → DB
- UI `/marketplace/mi-cuenta/privacidad` para revisar/revocar
- Export integrar con GDPR export existente

## Consecuencias

### Pros
- Compliance Ley 29733 cierre del gap
- Defendible contra denuncia INDECOPI con evidencia DB
- Mayor confianza del usuario (transparencia)

### Contras
- Cookie banner agrega fricción a primera visita (~5% bounce-rate +1)
- Persistir cada consent = ~50-200 rows/cliente/año (manejable)

## TODO bloqueante para Brandon

1. Aprobar este ADR + redactar política privacidad v1.0.0 (con abogado peruano)
2. Aplicar `prisma migrate dev --name add_consent_event` (requiere DIRECT_URL + red)
3. Validar texto del cookie banner (legal review)
4. Setear cuándo se debe re-pedir consent (cambio de versión política)

## Referencias

- audit profundo 2026-05-18 (Sprint 3)
- Ley 29733 PE Art. 16-18: https://busquedas.elperuano.pe/normaslegales/ley-de-proteccion-de-datos-personales-ley-n-29733-654099-2/
- ADR-114 RLS Postgres (defensa en profundidad complementaria)
