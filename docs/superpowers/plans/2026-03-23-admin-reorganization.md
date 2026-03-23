# Admin Panel Reorganization + AI Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 15 admin modules (136 tabs) into 8 modules (~35 tabs) with AI Assistant as the main screen and floating copilot on all pages.

**Architecture:** Rewrite AdminSidebar.tsx with 8 new module definitions. Update page.tsx routing to match. Fix the broken AI assistant API. Create a new Dashboard IA as the landing page. Add a floating AI chat button visible across all modules.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Framer Motion, Groq API (existing key in .env)

**Spec:** `docs/superpowers/specs/2026-03-23-admin-reorganization-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `components/admin/unified/AsistenteIAModule.tsx` | Module container for AI Assistant (3 tabs: dashboard-ia, chat, alertas) |
| `components/admin/DashboardIATab.tsx` | AI-driven main screen: KPI summary + action cards + inline chat |
| `components/admin/AlertsCenterTab.tsx` | Unified alerts center (stock, vencimientos, pedidos, deudas) |
| `components/admin/AIFloatingButton.tsx` | Floating chat bubble for all non-AI modules |
| `app/api/products/bulk-price/route.ts` | PUT endpoint for bulk price updates (needed by PreciosPromosModule) |

### Modified Files
| File | Changes |
|------|---------|
| `components/admin/AdminSidebar.tsx` | Replace 15 modules with 8 new modules. Remove PRO gating. |
| `app/admin/page.tsx` | Update Tab type, TAB_MIGRATION, dynamic imports, module rendering switch. Remove ~20 unused imports. Set default tab to `asistente-ia`. |
| `app/api/ai-assistant/route.ts` | Add rule-based fallback when GROQ_API_KEY missing. Fix 502/503 errors. |

### Archived (no longer imported, files stay on disk)
~20 unified module files and ~91 tab components become unused. They remain on disk but are no longer imported in page.tsx.

---

## Task 1: Rewrite AdminSidebar with 8 Modules

**Files:**
- Modify: `components/admin/AdminSidebar.tsx` (lines 54-214)

- [ ] **Step 1: Read current sidebar module definitions**

Read `components/admin/AdminSidebar.tsx` lines 54-214 to understand BASIC_SIDEBAR_MODULES, PRO_SIDEBAR_MODULES, and CONFIG_SIDEBAR_MODULE.

- [ ] **Step 2: Replace BASIC_SIDEBAR_MODULES with new 8-module structure**

Replace the entire `BASIC_SIDEBAR_MODULES` array with:

```typescript
export const BASIC_SIDEBAR_MODULES: SidebarModule[] = [
  {
    id: "asistente-ia",
    label: "Asistente IA",
    icon: Brain,
    tabs: [
      { id: "dashboard-ia", label: "Mi negocio hoy" },
      { id: "chat-ia", label: "Chat" },
      { id: "alertas", label: "Alertas" },
    ],
  },
  {
    id: "ventas-caja",
    label: "Ventas & Caja",
    icon: ShoppingCart,
    tabs: [
      { id: "pos", label: "Punto de venta" },
      { id: "caja-registradora", label: "Caja" },
      { id: "arqueo", label: "Arqueo de caja" },
      { id: "pedidos", label: "Pedidos" },
      { id: "cuentas-cobrar", label: "Me deben (fiao)" },
    ],
  },
  {
    id: "inventario",
    label: "Inventario",
    icon: Package,
    tabs: [
      { id: "stock", label: "Mi stock" },
      { id: "kardex", label: "Kardex" },
      { id: "lotes", label: "Vencimientos" },
      { id: "mermas", label: "Pérdidas" },
      { id: "alertas-stock", label: "Alertas stock" },
    ],
  },
  {
    id: "productos",
    label: "Productos & Precios",
    icon: Tag,
    tabs: [
      { id: "productos", label: "Catálogo" },
      { id: "categorias", label: "Categorías" },
      { id: "promociones", label: "Ofertas" },
      { id: "cupones", label: "Cupones" },
      { id: "historial-precios", label: "Historial precios" },
    ],
  },
  {
    id: "compras",
    label: "Compras",
    icon: Truck,
    tabs: [
      { id: "ordenes-compra", label: "Pedidos a proveedor" },
      { id: "proveedores", label: "Mis proveedores" },
      { id: "recepcion", label: "Recepción" },
      { id: "cuentas-pagar", label: "Les debo" },
    ],
  },
  {
    id: "plata",
    label: "Mi Plata",
    icon: DollarSign,
    tabs: [
      { id: "pl", label: "Ingresos y egresos" },
      { id: "gastos", label: "Gastos" },
      { id: "rentabilidad", label: "Ganancias por producto" },
      { id: "reportes", label: "Reportes" },
      { id: "exportar", label: "Exportar a Excel" },
    ],
  },
  {
    id: "clientes",
    label: "Mis Clientes",
    icon: Users,
    tabs: [
      { id: "crm", label: "Mis clientes" },
      { id: "delivery", label: "Delivery" },
      { id: "resenas", label: "Opiniones" },
      { id: "fidelizacion", label: "Clientes frecuentes" },
    ],
  },
];
```

- [ ] **Step 3: Update CONFIG_SIDEBAR_MODULE**

```typescript
export const CONFIG_SIDEBAR_MODULE: SidebarModule = {
  id: "config",
  label: "Configuración",
  icon: Settings,
  tabs: [
    { id: "usuarios", label: "Usuarios & Equipo" },
    { id: "roles", label: "Permisos" },
    { id: "plan", label: "Mi plan" },
    { id: "pagina-inicio", label: "Mi página web" },
  ],
};
```

- [ ] **Step 4: Delete PRO_SIDEBAR_MODULES entirely**

Remove the entire `PRO_SIDEBAR_MODULES` array and its export. No more Pro gating.

- [ ] **Step 5: Add Brain import to lucide-react imports**

Add `Brain` to the existing lucide-react import at the top of the file.

- [ ] **Step 6: Remove Pro gating UI code**

In the sidebar rendering section, remove:
- The `ProSectionDivider` component
- The Lock icon overlay on Pro modules
- Any `isPro` conditional logic
- The `UpgradeBanner` trigger

- [ ] **Step 7: Verify sidebar renders correctly**

Run: `npm run dev` and check localhost:3000/admin
Expected: Sidebar shows 8 modules (Asistente IA first) + Configuración at bottom. No Pro section.

- [ ] **Step 8: Commit**

```bash
git add components/admin/AdminSidebar.tsx
git commit -m "refactor: consolidate sidebar from 15 to 8 modules, remove Pro gating"
```

---

## Task 2: Update page.tsx Module Routing

**Files:**
- Modify: `app/admin/page.tsx` (lines 1-200 for imports/types, lines 1000+ for rendering)

- [ ] **Step 1: Read current page.tsx structure**

Read `app/admin/page.tsx` lines 1-200 to understand current Tab type, dynamic imports, and TAB_MIGRATION.

- [ ] **Step 2: Update Tab type to match new 8 modules**

Replace the `Tab` type with:

```typescript
type Tab =
  | "asistente-ia"
  | "ventas-caja"
  | "inventario"
  | "productos"
  | "compras"
  | "plata"
  | "clientes"
  | "config"
  | "pedidos"
  | "plan";
```

- [ ] **Step 3: Simplify dynamic imports — keep only used modules**

Keep these imports:
```typescript
const AsistenteIAModule = dynamic(() => import("@/components/admin/unified/AsistenteIAModule"), { loading: TabSpinner });
const POSCajaModule = dynamic(() => import("@/components/admin/unified/POSCajaModule"), { loading: TabSpinner });
const InventarioAlmacenesModule = dynamic(() => import("@/components/admin/unified/InventarioAlmacenesModule"), { loading: TabSpinner });
const CatalogoTiendaModule = dynamic(() => import("@/components/admin/unified/CatalogoTiendaModule"), { loading: TabSpinner });
const ComprasModule = dynamic(() => import("@/components/admin/unified/ComprasModule"), { loading: TabSpinner });
const FinanzasModule = dynamic(() => import("@/components/admin/unified/FinanzasModule"), { loading: TabSpinner });
const CRMClientesModule = dynamic(() => import("@/components/admin/unified/CRMClientesModule"), { loading: TabSpinner });
const PlanTab = dynamic(() => import("@/components/admin/PlanTab"), { loading: TabSpinner });
const AIAssistant = dynamic(() => import("@/components/admin/AIAssistant"), { ssr: false });
const GlobalSearch = dynamic(() => import("@/components/admin/GlobalSearch"), { ssr: false });
const AlertCenter = dynamic(() => import("@/components/admin/AlertCenter"), { ssr: false });
```

Remove imports for: ReposicionModule, PreciosPromosModule, ProveedoresModule, LogisticaModule, DevolucionesCalidadModule, VentasMarketingModule, FidelizacionModule, EncuestasSoporteModule, AnalyticsBIModule, ProyeccionesModule, TesoreriaModule, FacturacionModule, GastosActivosModule, RRHHModule, ProyectosTareasModule, ComunicacionesModule, AlertasAutomModule, ReportesDocModule, AgendaUtilidadesModule, SeguridadModule, SistemaModule, AgentsDashboardTab, ChangelogModule, VisitantesTab.

- [ ] **Step 4: Update TAB_MIGRATION to map all old IDs to new 8 modules**

```typescript
const TAB_MIGRATION: Record<string, Tab> = {
  // → Asistente IA
  dashboard: "asistente-ia", "dashboard-ejecutivo": "asistente-ia",
  "panel-principal": "asistente-ia", agentes: "asistente-ia", changelog: "asistente-ia",
  // → Ventas & Caja
  pos: "ventas-caja", caja: "ventas-caja", "arqueo-caja": "ventas-caja",
  turnos: "ventas-caja", "pos-caja": "ventas-caja",
  // → Inventario
  inventario: "inventario", kardex: "inventario", lotes: "inventario",
  mermas: "inventario", almacenes: "inventario", ubicaciones: "inventario",
  transferencias: "inventario", "auto-reorden": "inventario",
  "inventario-almacenes": "inventario", reposicion: "inventario",
  // → Productos & Precios
  "categorias-editor": "productos", "combos-editor": "productos",
  combos: "productos", kits: "productos", "pagina-inicio": "config",
  benchmark: "productos", "historial-precios": "productos",
  promociones: "productos", cupones: "productos", "ab-tests": "productos",
  "catalogo-tienda": "productos", "precios-promos": "productos",
  // → Compras
  compras: "compras", "plan-compras": "compras", recepcion: "compras",
  proveedores: "compras", "pagos-proveedor": "compras",
  // → Mi Plata
  pl: "plata", "balance-general": "plata", "flujo-caja": "plata",
  presupuestos: "plata", gastos: "plata", rentabilidad: "plata",
  margenes: "plata", finanzas: "plata", tesoreria: "plata",
  facturacion: "plata", "gastos-activos": "plata",
  reportes: "plata", "importar-exportar": "plata",
  "reportes-documentos": "plata",
  // → Mis Clientes
  crm: "clientes", "cliente-360": "clientes", clientes: "clientes",
  visitantes: "clientes", fidelizacion: "clientes",
  nps: "clientes", resenas: "clientes", delivery: "clientes",
  "crm-clientes": "clientes",
  // → Config
  usuarios: "config", roles: "config", equipo: "config",
  configuracion: "config", seguridad: "config", sistema: "config",
  // → Legacy modules redirect to closest match
  logistica: "clientes", "ventas-marketing": "ventas-caja",
  "analytics-bi": "plata", rrhh: "config",
  "proyectos-tareas": "asistente-ia",
};
```

- [ ] **Step 5: Update default tab to asistente-ia**

Find the line that sets the default/initial tab and change it to `"asistente-ia"`.

- [ ] **Step 6: Update module rendering switch statement**

Find the module rendering section (around line 1000+) and update to match the new 8 modules:

```typescript
{activeTab === "asistente-ia" && <AsistenteIAModule tenantId={tenantId} />}
{activeTab === "ventas-caja" && <POSCajaModule tenantId={tenantId} />}
{activeTab === "inventario" && <InventarioAlmacenesModule tenantId={tenantId} />}
{activeTab === "productos" && <CatalogoTiendaModule tenantId={tenantId} />}
{activeTab === "compras" && <ComprasModule tenantId={tenantId} />}
{activeTab === "plata" && <FinanzasModule tenantId={tenantId} />}
{activeTab === "clientes" && <CRMClientesModule tenantId={tenantId} />}
{activeTab === "config" && /* existing config rendering */}
{activeTab === "pedidos" && /* existing OrdersTab */}
{activeTab === "plan" && <PlanTab />}
```

Remove all other module rendering blocks for deleted modules.

- [ ] **Step 7: Verify page compiles**

Run: `npm run build`
Expected: Build passes. Warnings about unused imports are OK at this stage.

- [ ] **Step 8: Commit**

```bash
git add app/admin/page.tsx
git commit -m "refactor: update admin routing for 8-module structure"
```

---

## Task 3: Create AsistenteIAModule Container

**Files:**
- Create: `components/admin/unified/AsistenteIAModule.tsx`

- [ ] **Step 1: Create the module file**

```typescript
"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { Brain, MessageSquare, Bell } from "lucide-react";
import { cn } from "@/lib/utils";

const DashboardIATab = dynamic(() => import("@/components/admin/DashboardIATab"));
const AIAssistant = dynamic(() => import("@/components/admin/AIAssistant"), { ssr: false });
const AlertsCenterTab = dynamic(() => import("@/components/admin/AlertsCenterTab"));

const TABS = [
  { id: "dashboard-ia", label: "Mi negocio hoy", icon: Brain },
  { id: "chat-ia", label: "Chat", icon: MessageSquare },
  { id: "alertas", label: "Alertas", icon: Bell },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface Props { tenantId?: string }

export default function AsistenteIAModule({ tenantId }: Props) {
  const [tab, setTab] = useState<TabId>("dashboard-ia");

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-100 dark:bg-surface rounded-xl p-1 overflow-x-auto">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                tab === t.id
                  ? "bg-[#2d6a4f] text-white shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      {tab === "dashboard-ia" && <DashboardIATab tenantId={tenantId} />}
      {tab === "chat-ia" && (
        <div className="bg-white dark:bg-card rounded-2xl border border-gray-200 dark:border-card-border p-0 min-h-[600px]">
          <AIAssistant embedded />
        </div>
      )}
      {tab === "alertas" && <AlertsCenterTab tenantId={tenantId} />}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/admin/unified/AsistenteIAModule.tsx
git commit -m "feat: create AsistenteIAModule container (3 tabs)"
```

---

## Task 4: Create DashboardIATab (AI-Driven Main Screen)

**Files:**
- Create: `components/admin/DashboardIATab.tsx`

- [ ] **Step 1: Create the AI dashboard component**

Build a component that:
1. Fetches `/api/admin/dashboard` for KPIs (sales, orders, stock)
2. Fetches `/api/batches/expiring?days=7` for expiring products
3. Shows greeting with time-of-day context ("Buenos días/tardes/noches")
4. Displays 4 KPI cards: Ventas hoy, Pedidos pendientes, Productos por vencer, Stock bajo
5. Shows action cards generated from real data:
   - "Ver N pedidos urgentes" if pending orders > 0
   - "N productos por vencer" if expiring batches > 0
   - "Revisar stock bajo" if low stock products > 0
6. Includes inline chat input at bottom ("Pregúntame lo que sea...")
7. Uses brand colors (#2d6a4f primary, #f4a261 secondary)
8. Responsive: cards stack on mobile, grid on desktop

Target: ~200-250 lines. Use `useSWR` or `useEffect+fetch` for data loading. Show loading skeletons while fetching.

- [ ] **Step 2: Verify it renders**

Navigate to localhost:3000/admin → should show DashboardIATab as default
Expected: Greeting, KPI cards, action buttons visible

- [ ] **Step 3: Commit**

```bash
git add components/admin/DashboardIATab.tsx
git commit -m "feat: create AI-driven dashboard as main admin screen"
```

---

## Task 5: Create AlertsCenterTab

**Files:**
- Create: `components/admin/AlertsCenterTab.tsx`

- [ ] **Step 1: Create unified alerts component**

Build a component that fetches and displays alerts from multiple sources:
1. `/api/batches/expiring?days=7` — productos por vencer
2. `/api/auto-reorder` — stock bajo
3. `/api/orders?status=pendiente` or use dashboard data — pedidos sin atender

Display each alert as a card with:
- Icon (color-coded: red=urgent, orange=warning, blue=info)
- Title and description
- Action button ("Ver", "Atender", "Revisar")
- Sorted by urgency (critical first)

Target: ~150 lines.

- [ ] **Step 2: Commit**

```bash
git add components/admin/AlertsCenterTab.tsx
git commit -m "feat: create unified AlertsCenterTab"
```

---

## Task 6: Fix AI Assistant API

**Files:**
- Modify: `app/api/ai-assistant/route.ts`

- [ ] **Step 1: Read current API implementation**

Read the full `app/api/ai-assistant/route.ts` to understand the Groq integration and where the 502/503 occurs.

- [ ] **Step 2: Add rule-based fallback**

After the existing Groq API call, add a try/catch that falls back to rule-based responses when:
- `GROQ_API_KEY` is not set
- Groq API call fails (network error, rate limit)

Rule-based logic:
```typescript
function generateRuleBasedResponse(query: string, snapshot: BusinessSnapshot): string {
  const q = query.toLowerCase();
  if (q.includes("venta") && q.includes("hoy")) return `Ventas de hoy: S/ ${snapshot.metrics.todayRevenue}...`;
  if (q.includes("stock") || q.includes("inventario")) return `Tienes ${snapshot.metrics.outOfStock} productos agotados...`;
  if (q.includes("debe") || q.includes("deuda")) return `Tienes ${snapshot.metrics.pendingPayables} pagos pendientes...`;
  if (q.includes("pedido")) return `Hay ${snapshot.metrics.pendingOrders} pedidos pendientes...`;
  return `Resumen: ${snapshot.text}`;
}
```

- [ ] **Step 3: Ensure API always returns 200**

Wrap the entire handler in try/catch. Never return 502 or 503 — always return 200 with either AI response or rule-based fallback.

- [ ] **Step 4: Test the endpoint**

Run: `curl -X POST http://localhost:3000/api/ai-assistant -H "Content-Type: application/json" -d '{"message":"ventas hoy"}'`
Expected: 200 OK with response text (not 502)

- [ ] **Step 5: Commit**

```bash
git add app/api/ai-assistant/route.ts
git commit -m "fix: AI assistant API always returns 200 with rule-based fallback"
```

---

## Task 7: Add AIAssistant `embedded` Prop Support

**Files:**
- Modify: `components/admin/AIAssistant.tsx`

- [ ] **Step 1: Read AIAssistant component props**

Read `components/admin/AIAssistant.tsx` lines 1-100 to understand current props and rendering.

- [ ] **Step 2: Add `embedded` prop**

Add a prop `embedded?: boolean` that when true:
- Renders the chat interface INLINE (no floating button, no modal)
- Full width, no position:fixed
- No close/minimize buttons
- Shows the quick actions and chat input directly

This is used by AsistenteIAModule's "Chat" tab to embed the full AI chat.

- [ ] **Step 3: Add `moduleContext` prop**

Add a prop `moduleContext?: string` that when provided:
- Prepends module context to the system prompt ("El usuario está en el módulo de Inventario")
- Shows contextual quick suggestions based on the module

- [ ] **Step 4: Commit**

```bash
git add components/admin/AIAssistant.tsx
git commit -m "feat: add embedded and moduleContext props to AIAssistant"
```

---

## Task 8: Create AIFloatingButton

**Files:**
- Create: `components/admin/AIFloatingButton.tsx`

- [ ] **Step 1: Create floating button component**

```typescript
"use client";
import { useState } from "react";
import { Bot, X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const AIAssistant = dynamic(() => import("@/components/admin/AIAssistant"), { ssr: false });

interface Props {
  moduleContext?: string;
}

export default function AIFloatingButton({ moduleContext }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed bottom-6 right-6 z-50 w-14 h-14 rounded-full shadow-lg",
          "flex items-center justify-center transition-all",
          "bg-[#2d6a4f] hover:bg-[#245a42] text-white",
          open && "rotate-90"
        )}
      >
        {open ? <X className="w-6 h-6" /> : <Bot className="w-6 h-6" />}
      </button>

      {/* Chat popup */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-24 right-6 z-50 w-[400px] h-[500px] rounded-2xl shadow-2xl border border-gray-200 dark:border-card-border overflow-hidden bg-white dark:bg-card"
          >
            <AIAssistant embedded moduleContext={moduleContext} />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

- [ ] **Step 2: Add AIFloatingButton to admin layout**

In `app/admin/page.tsx`, add the floating button OUTSIDE the module rendering area, visible on all modules EXCEPT "asistente-ia" (which has its own embedded chat):

```typescript
{activeTab !== "asistente-ia" && (
  <AIFloatingButton moduleContext={activeTab} />
)}
```

- [ ] **Step 3: Commit**

```bash
git add components/admin/AIFloatingButton.tsx app/admin/page.tsx
git commit -m "feat: add floating AI chat button on all admin modules"
```

---

## Task 9: Create Bulk Price API Endpoint

**Files:**
- Create: `app/api/products/bulk-price/route.ts`

- [ ] **Step 1: Create the endpoint**

```typescript
export const dynamic = 'force-dynamic'
import { NextResponse, type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";

export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth instanceof NextResponse) return auth;
  try {
    const { tenantId } = auth;
    const { percentage, category } = await req.json();

    if (typeof percentage !== "number" || percentage === 0) {
      return NextResponse.json({ error: "Porcentaje inválido" }, { status: 400 });
    }

    const where: Record<string, unknown> = { tenantId, active: true };
    if (category && category !== "all") where.category = category;

    const products = await prisma.product.findMany({ where, select: { id: true, price: true } });

    const multiplier = 1 + percentage / 100;
    const updates = products.map(p =>
      prisma.product.update({
        where: { id: p.id },
        data: { price: Math.round(p.price * multiplier * 100) / 100 },
      })
    );

    await prisma.$transaction(updates);

    return NextResponse.json({ updated: products.length, percentage });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/products/bulk-price/route.ts
git commit -m "feat: add PUT /api/products/bulk-price endpoint"
```

---

## Task 10: Verification & Cleanup

**Files:**
- All modified files

- [ ] **Step 1: Run lint**

Run: `cd bodega-san-martin && npm run lint`
Expected: No new errors. Existing 16 warnings are acceptable.

- [ ] **Step 2: Run build**

Run: `cd bodega-san-martin && npm run build`
Expected: Build succeeds. Fix any import errors from removed modules.

- [ ] **Step 3: Fix any build errors**

If build fails due to missing imports, remove the broken import lines. The most common issue will be page.tsx importing deleted unified modules.

- [ ] **Step 4: Visual verification with Playwright**

Navigate to localhost:3000/admin and verify:
1. Sidebar shows 8 modules + Configuración
2. Asistente IA is the default/first screen
3. Each module loads when clicked
4. AI floating button appears on non-AI modules
5. No console errors (especially no 502 on /api/ai-assistant)

- [ ] **Step 5: Run tests**

Run: `cd bodega-san-martin && npm run test`
Expected: All tests pass. Some tests may reference old module names — fix if broken.

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: admin reorganization cleanup and verification"
```

---

## Execution Order

Tasks can be partially parallelized:

```
Task 1 (Sidebar)  ──┐
                     ├── Task 2 (Page routing) ── Task 10 (Verify)
Task 3 (Module)   ──┤
Task 4 (Dashboard)──┤
Task 5 (Alerts)   ──┤
Task 6 (Fix API)  ──┤
Task 7 (Embedded) ──┤
Task 8 (Float btn)──┤
Task 9 (Bulk API) ──┘
```

**Critical path:** Task 1 → Task 2 → Task 10 (sidebar must be done before routing, routing before verification)

**Sequential dependency:** Task 7 (embedded prop) → Task 8 (floating button uses embedded prop)

**Independent:** Tasks 3, 4, 5, 6, 7, 9 can run in parallel after Task 1. Task 8 runs after Task 7.

**Pre-requisites verified:** `/api/admin/dashboard` endpoint already exists and returns KPI data. `GROQ_API_KEY` exists in `.env`. File paths in `components/admin/unified/` are correct (28 files already exist there).

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Build breaks from removed imports | Task 10 step 3 catches and fixes these |
| Existing tests reference old modules | Fix test assertions to use new module IDs |
| AI assistant still 502s | Task 6 adds try/catch fallback — never 502 |
| User loses access to a feature | Files stay on disk, just not routed. Can re-enable. |
