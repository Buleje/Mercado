# CSRF Migration Plan — Admin Components

## Contexto

El proyecto valida **CSRF double-submit cookie** en `proxy.ts` (middleware de Next.js)
para **TODA mutación** (`POST`/`PATCH`/`PUT`/`DELETE`) a `/api/*`, excepto:

- Endpoints con Bearer API key (`Authorization: Bearer sk_...`).
- Webhooks (`/api/webhooks/*`).
- Cron jobs (`/api/cron/*`).
- Health endpoints.

Esto significa que **cualquier `fetch()` cliente que haga POST/PATCH/PUT/DELETE
debe incluir el header `x-csrf-token`** o el server devuelve **403 Forbidden**.

## Problema histórico

615+ fetches en `components/admin/**/*.tsx` no inyectan el header. Funcionan
"por accidente" cuando el navegador todavía tiene un token válido en cookie y
el server lo lee — pero al fallar la validación, devuelve `403 CSRF token
invalido o ausente`.

Bug visible 2026-04-20: bulk-clear-images del módulo Stock fallaba consistentemente.

## Solución canónica

Tres opciones, en orden de preferencia:

### 1. `useAdminFetch` (hook recomendado)

```ts
import { useAdminFetch } from "@/hooks/use-admin-fetch";

function MyComponent() {
  const fetchAdmin = useAdminFetch();

  async function handleSave() {
    const { ok, data, error } = await fetchAdmin("/api/products/bulk", {
      method: "POST",
      body: JSON.stringify({ ids, fields: { active: true } }),
    });
    if (!ok) return;
    refresh();
  }
}
```

Auto-inyecta `x-csrf-token`, `Content-Type`, `cache: "no-store"`, y muestra toast
en error.

### 2. `csrfHeaders` (helper directo)

Cuando no querés el wrapper completo:

```ts
import { csrfHeaders } from "@/lib/csrf-client";

await fetch("/api/products/bulk", {
  method: "POST",
  headers: csrfHeaders({ "Content-Type": "application/json" }),
  body: JSON.stringify(...),
});
```

### 3. Manual (legacy)

```ts
function getCsrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

await fetch("/api/...", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    ...(getCsrfToken() && { "x-csrf-token": getCsrfToken()! }),
  },
});
```

## Plan de migración por prioridad

### Tier 1 — bloqueantes (hacer primero)

Componentes con mutations frecuentes que ya están reportados:

- [x] `components/admin/InventoryTab.tsx` — bulk operations + CRUD productos. **Migrado 2026-04-20.**
- [ ] `components/admin/POSTab.tsx` (o equivalente) — checkout y ventas.
- [ ] `components/admin/AdminUsersTab.tsx` — crear/editar/borrar usuarios.
- [ ] `components/admin/AccountsReceivableTab.tsx` — fiados.

### Tier 2 — alta frecuencia

- [ ] `components/admin/AdminChatTab.tsx`
- [ ] `components/admin/ai-center/**`
- [ ] `components/admin/CustomersTab.tsx`
- [ ] `components/admin/SuppliersTab.tsx`

### Tier 3 — baja frecuencia / lectura predominante

- [ ] Resto de admin (~80+ componentes con dashboards y reportes).

## Cómo encontrar fetches sin CSRF

```bash
# Lista archivos con fetch directo a /api/ sin csrfHeaders
grep -rL "csrfHeaders\|useAdminFetch" $(grep -rlE 'fetch\("/api/' components/admin --include="*.tsx") 2>/dev/null
```

## Test de regresión

`e2e/admin-bulk-images.spec.ts` verifica que NO haya errores 403 en consola
durante una operación bulk típica. Replicar el patrón para otras acciones:

```ts
const csrfErrors = consoleErrors.filter((e) => /403|csrf/i.test(e));
expect(csrfErrors).toHaveLength(0);
```
