# Instrucciones de integración — QuotaAlertBanner en AdminLayout

## Objetivo

Agregar el `<QuotaAlertBanner />` sticky en el layout del panel de administración
para que aparezca en todas las páginas de admin cuando el tenant supera el 70% de su cuota.

## Archivo destino principal

`components/admin/AdminLayout.tsx` (o el wrapper de layout del admin)

**Estado:** verificar si está en dirty tree. Si está limpio, integrar directamente.
Si está sucio, esperar post-merge ADR-047.

---

## Pasos de integración

### Opción A — En AdminLayout.tsx (recomendada)

```tsx
// 1. Importar el hook y el banner
import { QuotaAlertBanner } from "@/components/admin/billing/QuotaAlertBanner";
import { useMeteringSnapshot } from "@/hooks/use-metering";

// 2. Dentro del componente layout:
function AdminLayout({ children, tenantId }: AdminLayoutProps) {
  const { snapshot } = useMeteringSnapshot(tenantId, {
    refreshIntervalMs: 300_000, // revalidar cada 5 min en el layout
  });

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Banner sticky — aparece ANTES del contenido principal */}
      {snapshot && (
        <QuotaAlertBanner
          snapshot={snapshot}
          upgradeHref="/admin/billing/upgrade"
        />
      )}

      {/* Sidebar + contenido principal */}
      <div className="flex">
        <AdminSidebar />
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
```

### Opción B — En app/admin/layout.tsx (App Router)

Si el layout es un Server Component, usar un client wrapper:

```tsx
// app/admin/layout.tsx
import { QuotaAlertBannerWrapper } from "@/components/admin/billing/QuotaAlertBannerWrapper";

export default async function AdminLayout({ children }) {
  const session = await getServerSession();
  const tenantId = session?.user?.tenantId ?? "";

  return (
    <>
      <QuotaAlertBannerWrapper tenantId={tenantId} />
      {children}
    </>
  );
}
```

Crear `QuotaAlertBannerWrapper.tsx` como client component que usa `useMeteringSnapshot`.

---

## Posición en el DOM

```
<body>
  ├── [Barra de admin superior / header]
  ├── <QuotaAlertBanner />  ← sticky top-0, z-index 40
  ├── <AdminSidebar />
  └── <main>...</main>
```

El banner usa `sticky top-0 z-40` — se pegará justo debajo de cualquier header fijo
que tenga `z-50` o superior.

## Comportamiento esperado

| Uso / Límite | Estado del banner |
|---|---|
| < 70% en todas las métricas | No aparece |
| ≥ 70% en alguna métrica | Amarillo — "Estás cerca del límite" |
| ≥ 90% en alguna métrica | Rojo — "Has alcanzado el límite" |
| Usuario cierra (X) | Se oculta por sesión (estado local) |

## Notas de accesibilidad

- `role="alert"` + `aria-live="assertive"` en el banner crítico
- `aria-live="polite"` en el banner de advertencia
- Todos los CTAs tienen `min-h-[44px]` (touch target mobile)
- El modal tiene focus trap: Esc cierra, foco inicial en botón de cierre
