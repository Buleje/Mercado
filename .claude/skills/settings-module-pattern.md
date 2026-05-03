---
name: settings-module-pattern
description: Patrón blindado de SettingsModule.tsx + api/settings/route.ts. Activar SIEMPRE antes de tocar `components/admin/SettingsModule.tsx`, `app/api/settings/route.ts`, `lib/jsondb.ts` (campos de DbSettings), o cualquier sub-tab del módulo Configuración. Evita 5 bugs históricos: slug→cuid duplication, exposición de credentials, sync cross-modelo perdido, missing csrfHeaders, coverUrl no en schema.
---

# Settings Module — Patrón blindado

Compound learning del módulo `SettingsModule.tsx` (2223 líneas) + `api/settings/route.ts` (248 líneas).
Detectado tras 4 ediciones repetidas en sesiones recientes.

---

## 1. Estructura del módulo (SettingsModule.tsx)

### Grilla de secciones — `SECTION_META`

Toda nueva sección requiere **3 cosas en orden**:

| Paso | Archivo | Cambio |
|---|---|---|
| 1 | `SettingsModule.tsx` línea ~46 | Agregar `SectionId` al union type |
| 2 | `SettingsModule.tsx` línea ~69 | Agregar entry en `SECTION_META[]` con `id, icon, title, desc, color` |
| 3 | `SettingsModule.tsx` (sección de render) | Agregar el case en el switch/conditional render |

### Color tokens (NUNCA hex hardcodeado)

Categorías por intención (ver línea 63-68):
- **Setup inicial** → `text-[var(--data-warning)] bg-[var(--data-warning-50)]`
- **Operación** → `text-[var(--data-success)] bg-[var(--accent-soft)]`
- **Comunicación** → `text-[var(--text-secondary)] bg-[var(--surface-sunken)]`
- **Personalización** → `text-primary bg-primary/10`
- **Sistema avanzado** → `text-slate-500 bg-slate-50`

### Sub-componentes lazy

Cada sub-tab grande usa `dynamic()` (líneas 24-36):

```tsx
const TeamTab = dynamic(() => import("@/components/admin/TeamTab"));
const SidebarReorderPanel = dynamic(() => import("@/components/admin/SidebarReorderPanel"));
```

> Razón: SettingsModule pesa 135KB. Sin lazy split, todos los tabs cargan aunque uses solo 1.

---

## 2. API route — `app/api/settings/route.ts`

### GET — patrón obligatorio

```ts
export async function GET(req: NextRequest) {
  try {
    const tenantId = await resolveTenantIdForRoute(req);  // JWT > header
    const settings = await withDbRetry(() => SettingsDB.get(tenantId));
    // ⚠️ SIEMPRE strippear credentials + secrets antes de responder.
    // El cliente NO recibe los valores — debe re-tipear si quiere cambiarlos.
    const {
      adminPassword: _pw, adminBypassLogin: _bypass,
      smtpPass: _smtp, whatsappApiToken: _wapp,
      sunatApiKey: _sunat, transferAccountNum: _tan,
      ...publicSettings
    } = settings as DbSettings & {
      adminPassword?: string; adminBypassLogin?: boolean;
      smtpPass?: string; whatsappApiToken?: string;
      sunatApiKey?: string; transferAccountNum?: string;
    };
    return NextResponse.json(publicSettings, {
      headers: { "Cache-Control": "private, no-cache, max-age=0" },
    });
  } catch (e) {
    logger.error("[settings] GET error", { err: ... });
    return NextResponse.json({ error: "Database error" }, { status: 503 });
  }
}
```

> **Nota:** PUT debe ignorar valores `""` para estos secrets — sino el cliente
> los borra al guardar (porque GET ya no los devuelve).
> Patrón: `...(body.smtpPass !== undefined && body.smtpPass !== "" && { smtpPass: body.smtpPass })`

### PUT — patrón obligatorio (5 capas)

#### Capa 1: Auth + tenant resolution

```ts
const auth = await requireAdmin(req, ["admin"]);
if (auth instanceof NextResponse) return auth;

const headerTenantId = req.headers.get("x-tenant-id");
const rawTenantId = (headerTenantId && headerTenantId !== "main") ? headerTenantId : auth.tenantId;
```

#### Capa 2: Slug → CUID resolution (BUG HISTÓRICO ⚠️) + Validación

```ts
const TENANT_SLUG_RE = /^[a-z0-9-]{2,40}$/i;

let tenantId = rawTenantId;
if (rawTenantId && !rawTenantId.startsWith("cm") && rawTenantId !== "main") {
  // [SECURITY] Validar formato slug ANTES de findUnique (defensa en profundidad)
  if (!TENANT_SLUG_RE.test(rawTenantId)) {
    return NextResponse.json({ error: "Invalid tenant identifier" }, { status: 400 });
  }
  const t = await prisma.tenant.findUnique({ where: { slug: rawTenantId }, select: { id: true } });
  if (t?.id) tenantId = t.id;
}
```

> **Sin slug→cuid:** UPSERT crea 2 filas (una con slug, otra con cuid). El dueño nunca ve sus uploads.
> Bug fixeado en commit `2fbd0cd5`. **No volver a romper.**
> **Sin Zod:** un slug malformado podría triggerar errores Prisma inesperados.

#### Capa 3: Spread condicional

Todo campo nuevo → línea adicional al spread:

```ts
const updated: DbSettings = {
  ...current,
  ...(body.miCampoNuevo !== undefined && { miCampoNuevo: body.miCampoNuevo }),
  // ...
};
```

#### Capa 4: Sync cross-modelo (branding)

Logo/banner/colors viven en **3 lugares** (Settings + Tenant + Store). Sincronizar en BG fire-and-forget:

```ts
if (body.logoUrl !== undefined || body.businessName !== undefined) {
  prisma.tenant.update({ ... }).catch(err => logger.warn("[settings] tenant sync skipped", { error: String(err) }));
}

if (body.logoUrl !== undefined || body.coverUrl !== undefined) {
  prisma.store.updateMany({ ... }).catch(...);

  // ⚠️ coverUrl NO está en schema.prisma — usar raw SQL
  if (body.coverUrl !== undefined) {
    prisma.$executeRaw`UPDATE "Store" SET "cover" = ${body.coverUrl || null} WHERE "tenantId" = ${tenantId}`
      .catch(err => logger.warn("[settings] store cover sync skipped", { error: String(err) }));
  }
}
```

> **Razón coverUrl:** se agregó vía ALTER TABLE manual pero schema.prisma está en zona peligrosa.
> El patrón expand-only mantiene compat con clientes viejos.

#### Capa 5: Activity log fire-and-forget

```ts
const changed = Object.keys(body).filter(k => k !== "adminPassword").join(", ");
enqueueActivityLog({ ... }).catch(err => logger.warn("[settings] activity enqueue failed", ...));
```

> **NUNCA `await`** — bloquea respuesta. El audit log es secundario al UX.

---

## 3. Cliente — patrón de fetch desde SettingsModule.tsx

### CSRF obligatorio en PUT

```tsx
import { csrfHeaders } from "@/lib/csrf-client";

const response = await fetch("/api/settings", {
  method: "PUT",
  headers: { "Content-Type": "application/json", ...csrfHeaders() },
  body: JSON.stringify({ logoUrl: newUrl }),
});
```

> **Sin `csrfHeaders()`:** 403 sistemático. Bug histórico fixeado en commit `845d2c36`.

### Toast + optimistic update

```tsx
import { toast } from "sonner";

try {
  setOptimisticState(newValue);  // UI primero
  const r = await fetch(...);
  if (!r.ok) throw new Error(...);
  toast.success("Guardado");
} catch {
  setOptimisticState(previousValue);  // rollback
  toast.error("No se pudo guardar");
}
```

---

## 4. Side-effect: agregar campo nuevo a `DbSettings`

Si agregás campo a `DbSettings` (en `lib/jsondb.ts`), tocá **estos 4 archivos**:

| Archivo | Cambio |
|---|---|
| `lib/jsondb.ts` | Agregar al type `DbSettings` |
| `app/api/settings/route.ts` línea ~80 | Agregar al spread `updated` |
| `components/admin/SettingsModule.tsx` | Agregar UI + estado |
| `prisma/schema.prisma` (si persiste) | Agregar columna + migración expand-only |

---

## 5. Tests obligatorios al tocar este módulo

```bash
# 1. TS check específico
npx tsc --noEmit components/admin/SettingsModule.tsx app/api/settings/route.ts

# 2. Smoke test del endpoint (con cookies QA)
source /tmp/bsm-auth.env
curl -s "http://localhost:3000/api/settings" -H "Cookie: $BSM_COOKIES" | jq '.businessName'

# 3. Visual verify del tab admin/configuración
node scripts/visual-verify-admin-focused.mjs --tab=configuracion
```

---

## 6. Anti-patterns a NUNCA hacer

| ❌ NO hacer | ✅ En su lugar |
|---|---|
| `await prisma.tenant.update(...)` en sync | `.catch(err => logger.warn(...))` fire-and-forget |
| `body.X` sin verificar `!== undefined` | `...(body.X !== undefined && { X: body.X })` |
| Header `x-tenant-id` directo | `resolveTenantIdForRoute(req)` — JWT prioritario |
| Devolver `adminPassword` en GET | Destructurar y excluir SIEMPRE |
| Schema change a `Settings` model directo | Usar `prisma.$executeRaw` para coverUrl pattern |
| Componentes nuevos en línea (eager) | `dynamic()` import |
| Toast genérico tipo "Error" | Mensaje específico + rollback optimista |

---

## 7. Cuándo pedir ayuda al `audit-first` skill

- Si el cambio toca >3 sub-tabs simultáneamente
- Si agregás un nuevo `SectionId` (impacta UI navigation)
- Si modificás el flujo de sync cross-modelo (Tenant ↔ Store ↔ Settings)
- Si cambiás `requireAdmin` o el tier de auth

En esos casos: invocar `audit-first` para leer ADRs relacionados (077 gift-cards, 079 vendor-approval) antes de tocar.

---

## 8. Bugs históricos resueltos (referencia)

| Commit | Bug | Fix |
|---|---|---|
| `2fbd0cd5` | Slug→cuid creaba filas duplicadas en upsert | Resolución antes de write |
| `845d2c36` | Subir logo daba 403 | Faltaba CSRF headers + management tier |
| `21f26c81` | Inventario upload + portada SSR | Sync cross-modelo + raw SQL coverUrl |
| `113a70a3` | Equipo+nav+reorden+tutorial fragmentados | Consolidados en SectionId del SettingsModule |

**No re-introducir esos bugs.**
