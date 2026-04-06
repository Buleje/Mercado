# `components/admin/` — Panel ERP

~488 archivos. Un componente por tab del admin + sub-componentes y hooks.

## Por qué existe

- `app/admin/page.tsx` carga cada tab con `next/dynamic()` para code splitting.
- Aislar cada módulo permite testear y refactorizar sin romper el resto.
- Reduce el bundle inicial del admin al cargar solo la tab activa.

## Convenciones críticas

| Regla | Por qué |
|---|---|
| **Nunca importar tabs directo** — siempre `next/dynamic` con `loading: TabSpinner` | Code splitting + UX consistente |
| Un módulo grande → carpeta propia con `index.tsx` + sub-componentes + `hooks/` | Mantenible y testeable |
| Estado complejo (5+ `useState`) → extraer a `useReducer` o hook | Reduce bugs y simplifica tests |
| Acceso a datos solo vía `lib/db/*` (nunca `fetch` directo a Prisma) | Multi-tenancy + cache |
| **No bajar el `tenantId` por prop** — viene del context | Evita drift entre tabs |

## Estructura típica de un módulo grande

```
ProductsTab/
├── index.tsx              # Orquestador (< 300 líneas)
├── ProductsList.tsx        # Tabla
├── ProductsFilters.tsx     # Filtros
├── ProductsBulkActions.tsx # Acciones masivas
├── ProductsDetailPanel.tsx # Detalle
├── hooks/
│   ├── useProductsData.ts
│   └── useProductsFilters.ts
└── types.ts
```

## Módulos extraídos como referencia

- `OrdersTab/` — extraído del monolito `admin/page.tsx` (Paso 2 del refactor `docs/refactor-giant-files-plan.md`). Es el patrón a seguir para futuras extracciones.

## Cómo añadir un módulo nuevo

1. Crear `components/admin/MiTab/index.tsx` y exportar `default`.
2. Añadir el dynamic import en `app/admin/page.tsx`:
   ```tsx
   const MiTab = dynamic(() => import("@/components/admin/MiTab"), { loading: TabSpinner });
   ```
3. Añadir el ID de la tab en `app/admin/_lib/tabs.types.ts`.
4. Renderizarlo en el switch de tabs: `{tab === "mi-tab" && <MiTab />}`.
5. Si el módulo necesita permisos, ajustar `lib/auth/role-permissions.ts`.

## Test smoke

Después de tocar cualquier tab grande:
```bash
npm run test -- components/admin
npx tsc --noEmit
```

Y abrir `/admin` en dev para verificar que las tabs cargan sin error.
