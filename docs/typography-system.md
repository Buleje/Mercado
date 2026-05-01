# Sistema de Tipografía — Buleje (Bodega San Martín)

**Última actualización:** 2026-05-01

> Buleje opera **DOS sistemas tipográficos distintos**. Mezclarlos rompe la
> coherencia visual. Antes de tocar UI: leé en qué zona estás trabajando y
> usá el sistema correspondiente.

---

## 1. Las dos zonas

| Zona | Audiencia | Sistema | Tono |
|---|---|---|---|
| **Admin** (`/admin`, `/admin/**`) | Dueño de tienda, cajero, almacenero, repartidor (operativo) | Estándar sobrio | Funcional, denso, productividad |
| **Superadmin** (`/superadmin/**`) | Owner de la plataforma | Estándar sobrio (igual admin) | Funcional |
| **Marketplace** (`/marketplace/**`, `/(store)/**`, `/t/[slug]/**`) | Cliente final, comprador | Comercial / atracción | Editorial, marketing, emocional |
| **Landing** (`/`, `/abrir-tienda`, `/pricing`) | Visitante / lead bodeguero | Comercial / atracción | Editorial, marketing, emocional |

---

## 2. Sistema **Estándar** (admin / superadmin / temas internos)

### Principios
- **Densidad alta** — el operador necesita ver mucho en poco espacio.
- **Sobrio** — sin italic, sin font-display gigante, sin animaciones tipográficas.
- **Tabular numbers** en TODA cifra (cantidades, S/, fechas).
- **font-weight escalonado** — `semibold` body, `bold` énfasis, `extrabold` hero KPIs únicamente.

### Primitivos del DS (única fuente de verdad)

```tsx
import { PageTitle, SectionTitle, CardTitle, BodyText, Kicker } from "@buleje/design-system";
```

| Primitivo | Render | Tamaño | Peso | Uso |
|---|---|---|---|---|
| `<Kicker>` | `<span>` | `text-2xs` (10px) | `semibold` | Eyebrow uppercase tracking-wider sobre el título del módulo |
| `<PageTitle>` | `<h1>` | `text-2xl → text-3xl` (responsive) | `extrabold` | UN solo `<h1>` por página admin (regla a11y) |
| `<SectionTitle>` | `<h2>` | `text-xl` | `bold` | Subtítulo de sección dentro de un módulo |
| `<CardTitle>` | `<h3>` | `text-base` | `semibold` | Título de tarjeta o bloque |
| `<BodyText>` | `<p>` | `text-sm` | `normal` | Párrafo descriptivo |

### Header de módulo — patrón único

**Usar siempre `<AdminModuleHeader>`** (`components/admin/shared/AdminModuleHeader.tsx`):

```tsx
<AdminModuleHeader
  eyebrow="Operaciones · Hoy"
  title="Pedidos del día"
  description="Gestiona pedidos activos, asigna delivery y verifica pagos."
  icon={Package}
>
  <button>Acción primaria</button>
</AdminModuleHeader>
```

> Resultado: Kicker + PageTitle (font-display, **NO italic**) + descripción + icono + slot acciones.

### KPI cards — patrón único (de EInvoice / Inventario)

```tsx
<div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
  <p className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)] mb-1">
    {label}
  </p>
  <p className="text-xl font-extrabold tabular-nums text-[var(--text-primary)]">
    {value}
  </p>
</div>
```

**Excepción legítima:** Hero KPIs de dashboard "TV" o monitor (ej. `TVDashboard`, `BreakEvenDashboard`) pueden usar `text-4xl font-extrabold` — el contexto es display de pared, no operativo.

### Tabs — `<AdminTabBar>`

```tsx
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

<AdminTabBar
  tabs={[{ id, label, shortLabel?, icon? }]}
  activeTab={tab}
  onTabChange={setTab}
  moduleId="mi-modulo"
/>
```

### Reglas duras (NO negociables)

| ❌ Prohibido | ✅ Correcto |
|---|---|
| `<h1 className="...">` | `<PageTitle>` |
| `<h2 className="...">` en admin | `<SectionTitle>` |
| `<h3 className="...">` | `<CardTitle>` |
| `font-display italic` en admin | solo `font-display` (sin italic) — exclusivo en `<PageTitle>` |
| `text-3xl/4xl/5xl` para PageTitle | DS resuelve `text-2xl/3xl` automático |
| Header propio con `<div className="flex flex-col p-6 mb-6">...` | `<AdminModuleHeader>` |
| Tabs con `border-b-2` propias | `<AdminTabBar>` |
| Wrapper `max-w-6xl mx-auto p-6` | El admin shell ya da padding |

---

## 3. Sistema **Comercial** (marketplace / store / landing)

### Principios
- **Editorial** — la marca habla, vende, emociona.
- **Permitido**: `font-display italic`, `text-5xl/6xl/7xl`, `tracking-tight`, animaciones.
- **Densidad baja** — espacio en blanco generoso.
- Hero values e impacto emocional priman sobre densidad de información.

### Patrones

```tsx
// Hero del landing — sí lleva editorial italic
<h1 className="font-display italic text-5xl sm:text-7xl font-black leading-[0.95] tracking-[var(--ls-tight)]">
  Vendé cómodo desde tu bodega.
</h1>

// Section title del marketplace — sí lleva editorial
<h2 className="font-display italic text-3xl sm:text-4xl font-black tracking-tight">
  Lo más pedido en tu zona
</h2>
```

### Excepciones a la regla
- **Detalles operativos** (ej. precio, peso, sku) dentro del marketplace **siguen siendo `tabular-nums font-bold`** — no italic.
- **Inputs de checkout** siguen tipografía estándar para legibilidad/accesibilidad.

---

## 4. Cuándo usar `font-display italic`

| Contexto | Italic? |
|---|---|
| Landing hero, marketplace hero | ✅ |
| Marketplace section titles ("Recetas de la semana") | ✅ |
| Storefront `/t/[slug]` headers | ✅ |
| Admin PageTitle | ❌ |
| Admin SectionTitle | ❌ |
| Admin/Superadmin KPI values | ❌ |
| Modal de pedido (admin) | ❌ |
| Footer / textos legales / forms | ❌ |

---

## 5. Stack tipográfico actual

| Variable | Familia | Uso |
|---|---|---|
| `--font-sans` | Inter (default) | Body, UI, admin |
| `--font-display` | Fraunces | Editorial — landing, marketplace, admin PageTitle (sin italic) |
| `--font-mono` | JetBrains Mono | Códigos, IDs, tabular |

Tokens de tamaño (`@theme` de Tailwind):
`--ts-2xs · --ts-xs · --ts-sm · --ts-base · --ts-lg · --ts-xl · --ts-2xl · --ts-3xl`

---

## 6. Auditoría — desviaciones detectadas (2026-05-01)

| Métrica | Conteo | Acción |
|---|---|---|
| Admin con `font-display italic` (clase) | 0 archivos | ✅ Limpio |
| Admin con comentarios mencionando "italic" obsoleto | 3 archivos | ✅ Corregido en este commit |
| Admin con `<h1/h2/h3 className=...>` directo | 33 archivos | 🟡 Refactor incremental — ver `reports/audit-typography/admin-raw-headings.md` |
| Admin con `text-4xl/5xl/6xl` | 25 archivos | 🟢 Mayoría son hero KPIs legítimos (dashboards TV, break-even) — revisar caso por caso |
| Admin que adoptó `<AdminModuleHeader>` | 40+ archivos | ✅ Buena adopción |
| Admin que importa primitivos del DS | 378 archivos | ✅ Excelente |

---

## 7. Cómo aplicar este documento

### Antes de crear un módulo nuevo (admin/superadmin)
1. Importá `<AdminModuleHeader>` y `<AdminTabBar>`.
2. Importá `PageTitle/SectionTitle/CardTitle/Kicker` del DS para textos.
3. NO escribas `<h1>`/`<h2>`/`<h3>` con className propio.
4. Para KPIs: copiá el patrón de EInvoice (`text-xl font-extrabold tabular-nums`).

### Antes de crear UI marketplace/storefront/landing
1. SÍ podés usar `font-display italic text-5xl/6xl` para hero.
2. Pero cualquier dato operativo (precio, fecha, ID) sigue siendo `tabular-nums font-bold`.
3. Si hay un primitivo del DS marketplace (`MarketplaceHero`, `ProductCard`, etc.), úsalo.

### Lint / hooks
- `scripts/dev-helpers/lint-design-tokens.ts` ya valida tokens. Próxima fase: agregar regla "no `<h1/h2/h3>` raw en `components/admin/**`".
- ADR-070 / ADR-075 cubren tipografía y heading-with-design-class.

---

## 8. Referencias

- `packages/design-system/src/typography.tsx` — primitivos
- `components/admin/shared/AdminModuleHeader.tsx` — header estándar
- `components/admin/shared/AdminTabBar.tsx` — tabs estándar
- `docs/adr/ADR-070-typography-scale.md` (si existe) — escala canónica
- `docs/adr/ADR-075-design-strict.md` (si existe) — gates lint
