# Buleje Design System v4

Primitives editoriales + motion + brand icons. Todo importable desde `@/components/ui-system`.

---

## Principios

1. **Nada genérico** — si se ve plantilla Tailwind → rehacer con firma Buleje
2. **60-30-10 cromático** — 60% neutro, 30% slate, 10% teal accent
3. **Dato visible > decorado** — sin icono sin métrica al lado
4. **Un paso, una acción** — 1 objetivo primario por pantalla (Hick's law)
5. **Accesible por default** — WCAG AA contraste, focus visible, keyboard nav
6. **Performance medido** — LCP<2s, INP<200ms, CLS<0.1

---

## Tokens v4

### Colores (CSS variables en `app/globals.css`)

| Rol | Token | Light | Dark |
|---|---|---|---|
| Fondo principal | `var(--surface-canvas)` | `#ffffff` | `#0a0a0a` |
| Fondo sunken | `var(--surface-sunken)` | `#fafafa` | `#171717` |
| Fondo card | `var(--surface-raised)` | `#ffffff` | `#1a1a1a` |
| Hero invertido | `var(--brand-ink)` | `#060a0d` | `#060a0d` |
| Texto display | `var(--text-primary)` | `#0a0a0a` | `#fafafa` |
| Texto body | `var(--text-secondary)` | `#525252` | `#a3a3a3` |
| Texto caption | `var(--text-tertiary)` | `#a3a3a3` | `#525252` |
| Accent teal | `var(--accent)` / `var(--brand-accent)` | `#00B4A6` | `#2dd4bf` |
| Rule fino | `var(--rule-soft)` | `#f5f5f5` | `#262626` |
| Rule base | `var(--rule-base)` | `#e5e5e5` | `#404040` |

### Data palette (charts)

8 colores que se aplican por serie. Default usa `data-1` (neutral).

```tsx
import { CHART_PALETTE } from "@/components/ui-system/charts/palette";
// CHART_PALETTE[0] = var(--data-1) | Neutral principal
// CHART_PALETTE[4] = var(--data-5) | Teal accent
```

### Elevation (4 niveles)

```css
.card { box-shadow: var(--elev-1); }       /* card default */
.card:hover { box-shadow: var(--elev-2); }  /* hover */
.modal { box-shadow: var(--elev-3); }       /* modals */
.overlay { box-shadow: var(--elev-4); }     /* overlays críticos */
```

### Typography (clamp fluid)

| Token | Uso | Clamp |
|---|---|---|
| `var(--fs-display)` | Hero H1 | 2.5rem → 4.5rem |
| `var(--fs-h1)` | Page H1 | 1.875rem → 3rem |
| `var(--fs-h2)` | Section H2 | 1.5rem → 2.25rem |
| `var(--fs-h3)` | Card title | 1.125rem → 1.5rem |
| `var(--fs-body)` | Párrafo | 0.875rem → 1rem |
| `var(--fs-caption)` | Meta | 0.75rem |
| `var(--fs-kicker)` | Uppercase kicker | 0.625rem |

O con clases Tailwind utility:

```tsx
<h1 className="text-fs-display">Hero</h1>
<h2 className="text-fs-h1">Page title</h2>
```

---

## Primitives — cuándo usar cada uno

| Primitive | Uso | Ejemplo |
|---|---|---|
| `Button` | Todo CTA | `<Button variant="primary" size="md">Pedir</Button>` |
| `Card` | Contenedor | `<Card variant="interactive">...</Card>` |
| `Chip` | Tags, filtros | `<Chip variant="accent">Oferta</Chip>` |
| `Eyebrow` | Kicker pequeño | `<Eyebrow>Nuevo</Eyebrow>` |
| `Kicker` | Uppercase pre-title | `<Kicker icon={<Store/>}>Catálogo</Kicker>` |
| `SectionHeader` | eyebrow+title+desc | `<SectionHeader kicker="Tienda" title="Productos"/>` |
| `RuledTitle` | Title con rule | H-level con línea superior |
| `NumberStat` | KPI animado | `<NumberStat value={453} delta="+12%"/>` |
| `Stat` | Stat simple | `<Stat value="500+" label="Productos"/>` |
| `EmptyState` | Loading/vacío | `<EmptyState icon={<Shopping/>} title="..."/>` |
| `IconBadge` | Icono en caja | `<IconBadge icon={<Heart/>} variant="outline"/>` |
| `StatusDot` | Punto estado | `<StatusDot variant="success" pulse/>` |
| `DataRow` | Clave-valor | `<DataRow label="Total" value="S/450"/>` |
| `Divider` | Rule horizontal | `<Divider variant="soft"/>` |

---

## Motion — presets canónicos

```tsx
import { fadeUp, EASE, DURATION, revealOnView, tapPress } from "@/components/ui-system";

// 1. Scroll reveal (UNA línea)
<motion.div {...revealOnView}>Contenido</motion.div>

// 2. Button press feedback
<motion.button whileTap={tapPress}>Click</motion.button>

// 3. Modal entrance
<motion.div variants={modalVariants} initial="hidden" animate="show" exit="exit" />

// 4. Custom
<motion.div
  initial={{ opacity: 0 }}
  animate={{ opacity: 1 }}
  transition={{ duration: DURATION.base, ease: EASE.editorial }}
/>
```

**Curvas disponibles:** `editorial` · `snap` · `soft` · `entrance` · `exit` · `bounce`

**Duraciones:** `instant` (0.08) · `fast` (0.15) · `base` (0.25) · `slow` (0.4) · `deliberate` (0.6) · `theatrical` (0.8)

---

## Brand Icons v4 (20 custom SVG)

```tsx
import { Canasta, Olla, MapaUcayali, BilleteSoles } from "@/components/ui-system";

<Canasta className="h-5 w-5 text-gray-700" strokeWidth={1.5} />
```

### Catálogo

| Icono | Dónde usar |
|---|---|
| `BulejeMark` | Navbars, favicon, loaders |
| `JungleLeaf` | Regional Ucayali, SEO local |
| `DeliveryMoto` | Delivery tracking, WhatsApp |
| `RecipePot` | Recetario en grid |
| `CoinStack` | KPIs ingresos |
| `TrendLine` | Rendimiento |
| `DocumentContract` | SUNAT, legal |
| `RiverCurve` | Hero decorativo |
| `Canasta` | Orden/pedido |
| `Olla` | Cocina/chef |
| `Pesa` | Inventario peso |
| `BolsaDelivery` | Tracking orders |
| `RecetarioOpen` | Detail recetas |
| `CuadernoFiado` | Fiados, CRM |
| `HuellaCliente` | Lealtad |
| `MapaUcayali` | Zonas delivery |
| `BilleteSoles` | Caja, efectivo |
| `TanqueGas` | Insumo bodega |
| `NodosRed` | Multi-tienda |
| `CursoGrafico` | Finanzas trend |

---

## Do / Don't

### ❌ Don't

```tsx
{/* Gradiente primary genérico */}
<div className="bg-gradient-to-br from-primary to-primary-dark">...</div>

{/* Emoji decorativo */}
<h3>❤️ Nuestra Historia</h3>

{/* Shadow genérico */}
<div className="shadow-lg">...</div>

{/* Color hardcoded */}
<div className="bg-[#00B4A6] text-white">...</div>

{/* Ease default */}
<motion.div transition={{ duration: 0.3 }} />
```

### ✓ Do

```tsx
{/* Editorial dark hero */}
<section style={{ background: "var(--brand-ink)" }}>...</section>

{/* Kicker con lucide */}
<Kicker icon={<Heart className="h-3 w-3" strokeWidth={1.75}/>}>Historia</Kicker>

{/* Elevation token */}
<Card className="elev-1 elev-hover">...</Card>

{/* Accent como último recurso (10%) */}
<span className="text-[var(--accent)] font-bold">{total}</span>

{/* Motion con preset canónico */}
<motion.div {...revealOnView} />
```

---

## Cheatsheet crear página nueva

```tsx
import { Kicker, SectionHeader, Card, Button } from "@/components/ui-system";
import { motion } from "framer-motion";
import { revealOnView, fadeUp } from "@/components/ui-system";

export default function MiPage() {
  return (
    <main className="min-h-screen bg-[var(--surface-canvas)]">
      {/* Hero editorial */}
      <section className="py-20 sm:py-28" style={{ background: "var(--brand-ink)" }}>
        <div className="max-w-4xl mx-auto px-4 text-center">
          <Kicker className="text-white/55 mb-6">Nueva página</Kicker>
          <h1 className="text-fs-display text-white">Título impactante</h1>
          <p className="mt-4 text-white/60">Subtítulo con beneficio específico.</p>
        </div>
      </section>

      {/* Contenido */}
      <section className="py-16">
        <div className="max-w-7xl mx-auto px-4">
          <SectionHeader
            kicker="Sección"
            title="Título"
            description="Descripción"
          />
          <motion.div {...revealOnView} className="mt-10 grid md:grid-cols-3 gap-4">
            {items.map(item => (
              <Card key={item.id} variant="interactive">...</Card>
            ))}
          </motion.div>
        </div>
      </section>
    </main>
  );
}
```

---

## Roadmap v5 (después de v4)

- [ ] MotionConfig global con `reducedMotion="user"`
- [ ] Radix-based `<DataTable>` unificada
- [ ] `<Tooltip>` editorial consistente
- [ ] `<Popover>` wrapper
- [ ] Form primitives (Field, Input, Label, Hint, Error)
- [ ] `<Command>` palette Radix
