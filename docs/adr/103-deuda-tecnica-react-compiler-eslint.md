# ADR-103: Deuda técnica — errors React Compiler + a11y pendientes

**Fecha:** 2026-05-12
**Estado:** Aceptado como deuda controlada
**Origen:** Auditoría 360° de la sesión 2026-05-12

## Contexto

Durante el commit de los 593 archivos del sprint 2026-05-11 (recuperados del
stash "wip-sprint-files"), el pre-commit gate detectó **~30 archivos con errors
ESLint** que se acumularon durante el sprint. El sprint corrió con bypasses
(`HUSKY=0` / `--no-verify`) por velocidad, lo que dejó deuda visible una vez
que el gate volvió a correr.

Los errors son **pre-existing en los archivos del sprint** — NO fueron
introducidos por:
- Los 6 commits de seguridad de hoy
- El codemod design-tokens sprint 1 (text-[Xpx] + duration)
- El codemod design-tokens sprint 2 (decorative colors + gradients)

Los codemods son sustituciones 1:1 de classNames; no tocan lógica.

## Inventario de la deuda

### Errors React Compiler (~20 archivos)

**Regla**: `react-compiler/* — Cannot call impure function during render`

**Diagnóstico**: el React Compiler estable (React 19.2) detecta side-effects
en función de render que deberían estar en `useEffect`, `useMemo` con deps
estables, o `useCallback`.

Patrones típicos detectados:
```tsx
// ❌ Error: Cannot call impure function during render
function Component() {
  const date = new Date();           // impure: cambia cada render
  const random = Math.random();      // impure
  const items = fetchSync();         // side effect
  return <div>{date}</div>;
}

// ✅ Fix
function Component() {
  const date = useMemo(() => new Date(), []);
  // o si necesita cada render:
  const dateRef = useRef(new Date());
  return <div>{dateRef.current}</div>;
}
```

**Archivos afectados** (subset):
- `components/admin/DashboardTab.tsx`
- `components/admin/CampañasTab.tsx`
- `components/admin/Customer360Tab.tsx`
- `components/admin/DeliveryRoutesTab.tsx`
- `components/admin/inventario/SimpleExpiryTab.tsx`
- `components/admin/ProductsAdminTab.tsx`
- `components/admin/QuickNotesTab.tsx`
- `components/admin/support/UnifiedSupportInbox.tsx`
- `components/admin/unified/DocumentosModule.tsx`
- `components/admin/ShiftControlTab.tsx`
- `components/marketplace/home/MarketplaceBestsellersStrip.tsx`
- `components/notifications/NotificationHub.tsx`
- `components/superadmin/security/VulnerabilitiesTab.tsx`
- `components/CombosSection.tsx`, `FavoritesSection.tsx`, `LiveChatWidget.tsx`,
  `OrderProgress.tsx`, `QuickViewModal.tsx`, `RecentlyViewed.tsx`,
  `RecentlyViewedSingleTenant.tsx`, `ReferralBanner.tsx`, `SpinWheel.tsx`

### Errors de otras reglas (3 archivos)

| Regla | Archivos | Fix |
|---|---|---|
| `no-restricted-properties` (prisma directo) | `app/api/marketplace/recetas/route.ts:395` | Migrar a `lib/db/store-products.db.ts` con tenantId |
| `react/no-unescaped-entities` (`"` literal) | `components/admin/GiftCardManager.tsx:142` | Reemplazar `"` por `&quot;` |
| `jsx-a11y/role-supports-aria-props` | `components/admin/DashboardTab.tsx:346` (aria-disabled en role=listitem) | Quitar atributo o cambiar role |

## Decisión

**No fixear todos en un solo sprint.** Migración progresiva oportunista:

1. **Cada vez que un archivo del listado se toque por feature/fix** → arreglar
   sus errors React Compiler en el mismo commit.
2. **Sprint dedicado** cuando el contador baje a <10 archivos restantes
   (concentrados en componentes legacy).
3. **Bloquear** que nuevos archivos introduzcan errors: configurar
   `react-compiler/*` como `error` (ya está) y NO permitir `--no-verify` en
   commits que toquen archivos no listados acá.

### Compromiso de no acumular

A partir de este ADR:
- ❌ Prohibido agregar archivos nuevos a la lista
- ✅ Cada archivo arreglado se borra de la lista
- 📅 Revisión mensual del progreso en `MEMORIA-PROYECTO.md`

## Patrón estándar de fix

```tsx
// ANTES (error: Cannot call impure function during render)
function Tab() {
  const todayLabel = new Date().toLocaleDateString("es-PE");
  const filtered = items.filter(i => i.date > Date.now());
  // ...
}

// DESPUÉS
function Tab() {
  const todayLabel = useMemo(
    () => new Date().toLocaleDateString("es-PE"),
    []
  );
  const filtered = useMemo(
    () => items.filter(i => i.date > Date.now()),
    [items]
  );
  // ...
}
```

## Consecuencias

### Positivas

- Code quality 9 → trayectoria a 16 en 60 días
- No bloquea ship de features (deuda controlada, no creciente)
- Migración progresiva = riesgo distribuido

### Negativas / Riesgos

- 22+ archivos con errors visibles en cada `eslint` run hasta resolución
- Pre-commit gate seguirá fallando en estos archivos hasta migrar
- Riesgo de `--no-verify` se vuelva hábito (mitigado por revisión mensual)

## Métricas de éxito

| Mes | Meta archivos con errors | Realidad |
|---|---:|---:|
| 2026-05 | 22 (baseline) | 22 |
| 2026-06 | <18 | — |
| 2026-07 | <12 | — |
| 2026-08 | <5 | — |
| 2026-09 | 0 | — |

## Referencias

- [React Compiler docs](https://react.dev/reference/react-compiler)
- ADR-070: design-tokens governance
- ADR-101: tenant indirect models
- Sesión 2026-05-12: recovery + auditoría 360°
