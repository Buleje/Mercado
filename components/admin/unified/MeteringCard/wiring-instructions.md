# Instrucciones de integración — MeteringCard en AnalyticsBIModule

## Objetivo

Agregar `<MeteringCard />` al módulo de Analytics del dashboard unificado de admin.

## Archivo destino

`components/admin/unified/AnalyticsBIModule.tsx`

**Estado:** actualmente en dirty tree. Integrar cuando el working tree se limpie (post-merge ADR-047).

---

## Pasos de integración

### 1. Importar el componente

```tsx
// Agregar al bloque de imports de AnalyticsBIModule.tsx
import MeteringCard from "@/components/admin/unified/MeteringCard/MeteringCard";
```

### 2. Obtener tenantId

`AnalyticsBIModule` ya recibe `tenantId` como prop o lo obtiene del contexto de sesión.
Si no lo tiene, agregar al destructuring de props:

```tsx
interface AnalyticsBIModuleProps {
  tenantId: string;  // agregar si no existe
  // ...resto de props existentes
}
```

### 3. Insertar el card en el layout

Buscar en `AnalyticsBIModule.tsx` la sección de "KPIs del mes" o el grid superior de métricas.
Agregar `<MeteringCard />` como última tarjeta del grid o en una sección propia:

```tsx
{/* Uso facturable del mes — ADR-047 */}
<MeteringCard
  tenantId={tenantId}
  // Opcional: pasar período explícito si el módulo tiene date picker
  // period={{ from: selectedFrom, to: selectedTo }}
/>
```

### 4. Posición recomendada

- Grid de KPIs → **última columna** o **nueva fila** debajo de métricas de ventas
- Si el módulo usa tabs: agregar en el tab "Finanzas" o "Operaciones"
- En mobile (breakpoint `< sm`): full-width, debajo de las otras métricas

### 5. Responsabilidades del RSC

`MeteringCard` es un RSC puro — no necesita estado, context ni providers adicionales.
Incluye su propio `<Suspense>` con skeleton, por lo que no bloquea el render del módulo.

### 6. Variables de entorno requeridas

```env
NEXT_PUBLIC_BASE_URL="https://tu-dominio.com"  # ya debe estar configurado
```

---

## Dependencias ya instaladas

- `recharts ^3.8.0` — sparklines (verificado en package.json)
- Tailwind CSS 4 — estilos (ya configurado en el proyecto)

## Notas

- El card **no calcula totales** — el backend los entrega pre-computados (CLAUDE.md regla #6).
- Cache de 60s via `next: { revalidate: 60 }` en el fetch del RSC.
- Para invalidar el cache tras una venta: llamar `revalidatePath("/admin")` en el server action correspondiente.
