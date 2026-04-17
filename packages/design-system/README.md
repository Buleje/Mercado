# @buleje/design-system (POC)

**Estado:** Scaffolding POC (ADR-069 proxima iteracion).
**Alcance actual:** Re-exports de `PrimaryButton`, `IconBadge` desde `components/admin/shared`. Permite migrar imports a `@buleje/design-system` sin mover archivos.

## Uso

```tsx
// Antes (import de la ubicacion fisica)
import { PrimaryButton } from "@/components/admin/shared/PrimaryButton";
import { IconBadge } from "@/components/admin/shared/IconBadge";

// Despues (import del workspace)
import { PrimaryButton, IconBadge } from "@buleje/design-system";
```

## Por que un workspace

1. **Ownership claro:** el design system vive en su propio package con versioning semantic.
2. **Dependency graph explicito:** no mas imports cruzados entre admin/store/customer.
3. **Publishable si hace falta:** si alguna vez queremos liberar componentes a otro repo o proyecto, ya esta empaquetado.
4. **Tests y stories co-localizados:** `packages/design-system/src/*.stories.tsx` + `*.test.tsx` cerca del source.

## Estructura (propuesta, fase 2)

```
packages/design-system/
├── package.json
├── README.md
├── src/
│   ├── index.ts                 # barrel exports
│   ├── PrimaryButton.tsx        # movido desde components/admin/shared/
│   ├── PrimaryButton.stories.tsx
│   ├── PrimaryButton.test.tsx
│   ├── IconBadge.tsx
│   ├── IconBadge.stories.tsx
│   ├── IconBadge.test.tsx
│   └── tokens.ts                # re-export de @/lib/utils cn(), tokens CSS
└── tsconfig.json
```

## Fase 1 (actual — este commit)

- Scaffolding `package.json` + `README.md` + `src/index.ts` re-exportando desde rutas existentes.
- Path alias `@buleje/design-system` configurado en tsconfig root.
- Consumers pueden migrar gradualmente.

## Fase 2 (siguiente PR)

- Mover fisicamente `PrimaryButton.tsx`, `IconBadge.tsx` + stories + tests al package.
- Actualizar imports en todos los consumidores (~30 archivos).
- Correr TSC y lint para verificar.

## Fase 3 (opcional)

- Activar npm workspaces en root `package.json`.
- Publicar internamente via changesets si se necesita versioning real.
- Mover hooks compartidos (`cn()`, etc.) al package.
