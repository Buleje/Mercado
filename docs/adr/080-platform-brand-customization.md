# ADR-080 — Platform brand customization (Buleje, no tenants)

- **Status:** Accepted
- **Fecha:** 2026-04-26
- **Autores:** Brandon Buleje
- **Relacionado:** ADR-019 (Next 16 cache), ADR-074 (DS admin/superadmin scope),
  ADR-068 (design tokens), `lib/data/marketplace-categories.json` (mismo
  patrón de seed file-system).
- **No confundir con:** ADR-074 (branding **del tenant** en `/admin/store-page`).
  Este ADR cubre la marca **de la plataforma Buleje** que ven todos los
  visitantes del marketplace, no la de cada bodega.

---

## 1. Contexto (Feynman)

Buleje tiene dos capas de marca que conviven:

| Capa | Quién la define | Quién la ve | Persistencia |
|---|---|---|---|
| **Tenant brand** | Cada bodega en `/admin/store-page` | Clientes del storefront `/t/[slug]` | `Tenant` (Prisma) |
| **Platform brand** | Superadmin Buleje | Cualquier visitante del marketplace público | **Faltaba** (hardcoded) |

Hasta esta semana, el nombre "Buleje", la tagline, los logos del navbar y
footer, los colores del marketplace y los datos legales estaban
**hardcodeados** en TSX. Cambiar el tagline o subir un nuevo logo
requería un PR + redeploy.

Necesitamos que el superadmin pueda:

1. Cambiar identidad (nombre, tagline, descripción, ciudad).
2. Subir logos (light, dark, square, favicon, OG image).
3. Ajustar paleta primaria/secondary/accent del marketplace.
4. Editar datos de contacto, redes y legal.
5. Programar **event-mode** — override temporal de logo + colores
   (Black Friday, Navidad, aniversario) que se activa por fecha sin
   tocar la identidad permanente.

…sin requerir un deploy.

## 2. Decisión

Crear un **único hub de personalización de marca platform-level** con:

- **Storage**: `lib/data/platform-brand.json` en disco (file system).
- **API pública**: `GET /api/platform-brand` — sin auth, cacheable, la consume
  el navbar / footer / SEO del marketplace.
- **API privada**: `PATCH /api/superadmin/brand` — auth superadmin, merge
  parcial profundo (solo se mandan las claves a cambiar).
- **UI**: `/superadmin/marca` — edición end-to-end con preview.
- **Hook cliente**: `usePlatformBrand()` — caché en módulo + dedupe de
  inflight; `clearPlatformBrandCache()` post-save.

### 2.1 ¿Por qué file-system y no Prisma?

| Criterio | File-system (`platform-brand.json`) | Tabla Prisma |
|---|---|---|
| Cardinalidad | **1 fila** (singleton) — la marca es única | Sobre-ingeniería |
| Multi-tenant | No aplica (es platform-level) | Crearía confusión |
| Volatilidad | Bajísima (cambios humanos puntuales) | OK pero no aporta |
| Migraciones | Editar JSON, no migration SQL | Cada campo nuevo = migration |
| Patrón previo | `lib/data/marketplace-categories.json` ya existe | — |
| Backup | Git + Vercel filesystem snapshot | Backup DB |

**Decisión**: file-system. Es coherente con `marketplace-categories.json`,
elimina complejidad de schema, y el writer es serializable por el lock
implícito del filesystem (no hay concurrencia real — solo escribe
superadmin desde una sesión).

### 2.2 Schema (lib/platform-brand.ts)

```ts
export type PlatformBrand = {
  identity:  { name; tagline; description; since; city; country };
  logos:     { logoLight; logoDark; logoSquare; favicon; ogImage }; // null o /uploads/...
  colors:    { primary; secondary; accent; ...background/text };
  contact:   { email; phone; whatsapp; address };
  socials:   { facebook; instagram; tiktok; ... };
  seo:       { metaTitle; metaDescription; keywords[]; ... };
  legal:     { ruc; razonSocial; politicaPrivacidadUrl; ... };
  eventMode: { enabled; startDate; endDate;
               overrides: { logo?; colors?; tagline?; }; };
};
```

### 2.3 Public vs auth payload

`GET /api/platform-brand` (public) devuelve un subset **seguro** —
identity + logos + colors + contact public + socials + SEO + active
event-mode override. **No** expone el bloque `legal` ni datos privados
de contacto. La ruta del superadmin (`/api/superadmin/brand`) sí
devuelve el objeto completo para edición.

### 2.4 Event-mode

```jsonc
{
  "eventMode": {
    "enabled": true,
    "startDate": "2026-11-29T00:00:00Z",  // viernes negro
    "endDate":   "2026-12-02T23:59:59Z",
    "overrides": {
      "logo":   "/uploads/brand/black-friday-logo.webp",
      "colors": { "primary": "#000000", "accent": "#ff003c" },
      "tagline": "Buleje Black Friday — hasta 70%"
    }
  }
}
```

El reader compone identity ⊕ override automáticamente cuando la fecha
actual está en rango. Fuera del rango, devuelve la identidad permanente.

## 3. Consecuencias

### Positivas

- Cambios de marca sin deploy.
- Event-mode programable (viernes negro, navidad).
- Hub único para identity + logos + colors + SEO + legal.
- Patrón consistente con `marketplace-categories.json` (otro
  singleton platform-level).
- Sin overhead de migraciones DB para evolución del schema.

### Negativas / riesgos

- **Concurrencia**: dos superadmins editando simultáneamente — el
  segundo sobreescribe al primero. Mitigación: optimistic concurrency
  con `If-Match`/etag — pendiente para v2.
- **Backup**: el JSON vive solo en filesystem de Vercel. Mitigación:
  versionado en git (commit por cambio) + dump diario al storage de
  Supabase — pendiente.
- **Cache**: Next 16 fetch cache puede servir versión vieja. Mitigación:
  `clearPlatformBrandCache()` en cliente + `revalidatePath('/')` post
  PATCH (TODO).

## 4. Alternativas consideradas

| Alternativa | Por qué no |
|---|---|
| Tabla Prisma `PlatformBrand` (1 row) | Sobre-ingeniería: cada campo nuevo requiere migración para una sola fila |
| Variables de entorno | Forzaría redeploy en cada cambio — el opuesto del objetivo |
| Edge Config (Vercel) | Bien, pero acopla a Vercel y duplica el patrón de `marketplace-categories.json` |
| Strapi / CMS externo | Demasiado para una sola entidad singleton |

## 5. Migración / rollout

1. **Día 1** (ya): commit del feature → seed inicial en
   `lib/data/platform-brand.json` con los valores hardcodeados de hoy.
2. **Día 2-7**: migrar cada consumidor hardcoded a `usePlatformBrand()` o
   `getPlatformBrand()` en server components. Empezar por `Footer.tsx`
   (ya listo).
3. **Pendiente**: `<PlatformBrandProvider>` en root layout para SSR sin
   double-fetch + revalidatePath('/') en el PATCH handler.

## 6. Referencias

- `lib/platform-brand.ts` — server-only read/write.
- `lib/use-platform-brand.ts` — hook cliente + caché.
- `app/api/platform-brand/route.ts` — public GET.
- `app/api/superadmin/brand/route.ts` — auth PATCH.
- `app/superadmin/marca/page.tsx` — UI.
- `lib/data/platform-brand.json` — seed.
- `lib/data/marketplace-categories.json` — patrón previo análogo.
