---
applyTo: "**/error.tsx,**/loading.tsx,**/not-found.tsx"
---

# Error Handling — Bodega San Martín

## Archivos de error de Next.js App Router

```
app/
  error.tsx          → Errores no capturados en la app
  loading.tsx        → Estado de carga de rutas
  not-found.tsx      → 404
  (store)/
    error.tsx        → Errores específicos del storefront
    loading.tsx      → Loading del storefront
  admin/
    error.tsx        → Errores del panel admin
    loading.tsx      → Loading del admin
```

## error.tsx — estructura obligatoria

```tsx
"use client"; // SIEMPRE — error boundaries son Client Components

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log al servicio de errores (Sentry ya configurado)
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <h2 className="text-xl font-semibold text-zinc-800 dark:text-zinc-200">
        Algo salió mal
      </h2>
      <p className="text-zinc-500 text-sm">{error.message}</p>
      <button
        onClick={reset}
        className="px-4 py-2 bg-[#2d6a4f] text-white rounded-lg hover:bg-[#245a42]"
      >
        Reintentar
      </button>
    </div>
  );
}
```

## loading.tsx — skeleton patterns

```tsx
export default function Loading() {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="rounded-lg bg-zinc-100 dark:bg-zinc-800 h-48 animate-pulse" />
      ))}
    </div>
  );
}
```

## Toast notifications (useToast)

```tsx
import { useToast } from "@/contexts/toast-context";

const { toast } = useToast();

// Éxito:
toast({ title: "Pedido creado", description: "Tu pedido #123 está en camino", variant: "success" });

// Error:
toast({ title: "Error", description: error.message, variant: "destructive" });

// Aviso:
toast({ title: "Stock bajo", description: "Solo quedan 3 unidades", variant: "warning" });
```

## Error en API routes — formato estándar

```typescript
// 400 — Validación fallida:
return NextResponse.json({ error: "Datos inválidos", issues: parsed.error.issues }, { status: 400 });

// 401 — No autenticado:
return NextResponse.json({ error: "No autorizado" }, { status: 401 });

// 404 — No encontrado:
return NextResponse.json({ error: "Recurso no encontrado" }, { status: 404 });

// 409 — Conflicto (idempotency):
return NextResponse.json({ error: "Orden ya existe", orderId: existing.id }, { status: 409 });

// 500 — Error interno:
return NextResponse.json({ error: "Error interno del servidor" }, { status: 500 });
```

## Sentry (ya configurado)

```typescript
// sentry.client.config.ts — errores del cliente
// sentry.server.config.ts — errores del servidor
// sentry.edge.config.ts   — errores en middleware/edge

// Reportar error manual:
import * as Sentry from "@sentry/nextjs";
Sentry.captureException(error);
```

## Gotchas

- **error.tsx DEBE ser "use client"** — Next.js lo requiere para error boundaries
- **`reset` function** — disponible como prop en error.tsx — botón de "reintentar"
- **No mostrar stack traces al usuario** — solo en logs del servidor
- **Toast vs modal** — toast para éxito/error no crítico; modal AlertDialog para confirmaciones destructivas

## Anti-patrones

- NO usar `try/catch` en componentes para suprimir errores silenciosamente
- NO mostrar mensajes de error técnicos (stack trace) al usuario final
- NO olvidar el botón de retry en error.tsx — el usuario debe poder recuperarse
