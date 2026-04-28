---
name: bsm-typography-rules
description: Reglas blindadas de tipografía y filtros visibles del storefront/admin. Aplica esto cada vez que crees o edites componentes UI en /marketplace, /admin, /superadmin, /tienda. Evita texto diminuto, garantiza filtros grandes/cuadrados, jerarquía visual con impacto. Usar SIEMPRE antes de tocar UI visible al cliente.
user-invocable: true
model: sonnet
allowed-tools: Read, Grep, Glob
argument-hint: "[storefront|admin|filtros|hero|tarjeta]"
---

# Tipografía y filtros visuales — Buleje (reglas blindadas)

> Brandon (2026-04-28): "Evita a toda costa en cualquier sección de marketplace o admin letras diminutas o pequeñas que no sean visibles. Siempre adapta letras claras que se puedan leer y tengan buen impacto. Filtros: cuadrados, más visibles, más grandes."

Estas reglas son **NO NEGOCIABLES** para componentes vistos por el cliente final.

---

## 1. Tamaños mínimos por contexto

| Contexto | Mínimo | Recomendado | NUNCA usar |
|---|---|---|---|
| Body text storefront (descripción tienda, producto, FAQ) | `text-base` (16px) | `text-base` o `text-lg` | `text-xs`, `text-2xs` |
| Nombre de producto en card | `text-base` | `text-base sm:text-lg font-bold` | `text-sm` o menor |
| Precio en card (CTA visual) | `text-xl` | `text-xl sm:text-2xl font-black` | < `text-lg` |
| Categorías chips | `text-base font-bold` | `text-base font-bold` | `text-xs`, `text-sm` |
| Filtros (search, sort, view-toggle) | `text-base h-12` | input de **48px alto** mín, `border-2`, `rounded-2xl` | `text-xs h-8` o inputs flacos |
| Stats en hero (rating, delivery, ubicación) | `text-base` con `gap-x-4` | `text-base font-medium` con icons `h-4 w-4` | `text-xs gap-1.5` con icons `h-3 w-3` |
| Empty state | `text-lg font-bold` | `text-lg font-bold` para titular | `text-sm` para titular |
| CTA buttons | `text-base font-bold` mín | `text-base font-bold h-12` | `text-xs` o `h-7` |

`text-2xs` (10px) **solo** se permite en:
- `Kicker` / eyebrow uppercase tracking-wider
- Sparkline values
- Badge `Inactivo`/`Destacada` (no informativo, decorativo)
- Position pills numéricos (`1/12`)

---

## 2. Filtros del storefront — formato cuadrado y grande

```tsx
// ❌ MAL — input flaco con border 1px
<input className="px-3 py-2 text-sm rounded-lg border" />

// ✅ BIEN — input grande, border 2px, padding generoso
<input className="h-12 pl-12 pr-4 text-base rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]" />
```

| Prop | Valor mínimo |
|---|---|
| Altura | `h-12` (48px) |
| Border | `border-2` |
| Radius | `rounded-2xl` (16px) |
| Padding horizontal | `pl-12 pr-4` (con icono) o `px-4` |
| Texto | `text-base font-medium` |
| Focus | `focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)]` |
| Icono dentro | `h-5 w-5` |

**View toggles** (grid/list, etc): cuadrados `h-12 w-12` (no `h-8 w-8`), separados con `border-l-2` no `border-l`.

---

## 3. Categorías chips — cuadradas, no pílulas chiquitas

```tsx
// ❌ MAL — chip pequeño tipo tag
<button className="rounded-full px-3.5 py-1.5 text-sm">

// ✅ BIEN — card cuadrada vertical con count grande
<button className="flex flex-col items-center gap-1.5 rounded-2xl px-5 py-3.5 min-w-[110px] text-base font-bold border-2 hover:-translate-y-0.5 hover:shadow-md">
  <span className="text-base font-bold">{label}</span>
  <span className="h-6 px-2 rounded-full text-xs font-black tabular-nums">{count}</span>
</button>
```

---

## 4. Cards de producto — jerarquía con impacto

| Elemento | Antes (chico) | Ahora (mín) |
|---|---|---|
| Padding card | `p-3` | `p-4` |
| Nombre producto | `text-sm font-semibold` | `text-base sm:text-lg font-bold` |
| Descripción | `text-xs text-secondary` | `text-sm font-medium leading-relaxed` |
| Tienda | `text-xs text-tertiary` con icon `h-3` | `text-sm font-medium text-secondary` con icon `h-4` |
| Precio | OK `text-xl sm:text-2xl font-black` | OK |
| Stock | `text-xs` | `text-sm font-bold` |
| Botón carrito | `h-12 w-12` | OK (mín `h-10 w-10`) |
| `min-h` para nombre 2 líneas | `min-h-[2.5rem]` | `min-h-[2.75rem]` |

---

## 5. Tokens del DS (referencia rápida)

```css
/* Tipografía */
--ts-2xs: 10px;   /* SOLO kickers/sparklines/badges */
--ts-xs:  12px;   /* SOLO meta/timestamps en admin tabular */
--ts-sm:  14px;   /* Mínimo en admin/dashboards body */
--ts-base: 16px;  /* MÍNIMO en storefront body */
--ts-lg:  18px;   /* Subtítulos */
--ts-xl:  20px;   /* Títulos sección/precios */
--ts-2xl: 24px;   /* H2 módulo */
--ts-3xl: 30px;   /* Hero KPI / page title */
```

Para storefront, **prefiere clases nativas Tailwind** (`text-base`, `text-lg`, `text-xl`) sobre `text-[length:var(--ts-*)]` — son más legibles para el siguiente mantenedor.

---

## 6. Anti-patterns frecuentes a corregir

| Anti-pattern | Reemplazo |
|---|---|
| `text-gray-500` sin `dark:` | `text-[var(--text-secondary)]` |
| `text-gray-400` sin `dark:` | `text-[var(--text-tertiary)]` |
| `border-gray-200` sin `dark:` | `border-[var(--rule-base)]` |
| `bg-white` sin `dark:` | `bg-[var(--surface-raised)]` |
| `bg-gray-50` sin `dark:` | `bg-[var(--surface-sunken)]` |
| `text-emerald-500/600` saturado | `text-[var(--data-success)]` |
| `text-rose-500/red-600` saturado | `text-[var(--data-error)]` |
| `text-[10px]` o `text-[length:var(--ts-2xs)]` en body | Subir a `text-xs` mín, `text-sm` recomendado |

El admin shell tiene **safety-net CSS** (`globals.css:2318+`) que auto-corrige `bg-gray-*`/`text-gray-*` en dark, pero **prefiere tokens del DS desde el principio** — el safety net no cubre todos los casos.

---

## 7. Filosofía visual (Brandon, 2026-04-28)

> "Evita lo plano y aburrido. Siempre trata de ser visible visual todo aspecto de mejora."

- **Hover states obligatorios** en cualquier card/botón clickable: `hover:-translate-y-0.5 hover:shadow-md`
- **Border 2px** (`border-2`) en filtros y cards de selección — `border` (1px) se ve plano
- **Radius generoso** — `rounded-2xl` para filtros/categorías, `rounded-xl` mínimo para cards de producto
- **Sombras con tinte accent** en CTAs primarios: `shadow-[0_4px_14px_rgba(0,180,166,0.35)]`
- **Iconos h-4/h-5** en stats — nunca `h-3` que apenas se ve
- **Posición visual destacada** con halo `shadow-[0_0_0_2px_var(--accent-soft)]` en items #1 / featured

---

## 8. Cómo aplicar este skill

Cuando recibas una tarea que toque cualquiera de:
- `app/marketplace/**`
- `components/marketplace/**`
- `components/store/**`
- `app/(store)/**`
- `app/admin/**` (módulos visibles, no settings internos)

→ **Lee este SKILL.md primero**, luego edita.

Si encontrás `text-xs`, `text-2xs`, `text-[10px]`, `border-gray-*` sin override, o filtros con `h-8/h-9` en componentes ya editados, **corrige al pasar** aunque no sea el foco de la tarea — es debt visual que rompe la regla blindada.
