# Admin Panel Reorganization + AI Assistant as Central Hub

**Date:** 2026-03-23
**Status:** Reviewed (issues fixed)
**Approach:** Enfoque B — Reorganization inteligente

## Problem

The admin panel has 15 sidebar modules, 28 unified module containers, and 136 tab components (180+ sections total). For a family bodega in Pucallpa with 1-3 employees:
- Too many modules to navigate
- Duplicate functionality across modules (5 financial views, 4 customer views, 4 inventory views)
- Enterprise features that don't apply (fleet management, HR payroll, treasury, A/B testing)
- AI assistant exists (13,643 lines) but returns 502 error — not functional
- No clear "home base" — user opens admin and doesn't know where to start

## Solution

Consolidate 15 modules into 8. Eliminate ~91 tabs. Make the AI Assistant the main screen that tells the user what to do today.

## Architecture

### Module Structure: 15 → 8

```
BEFORE (15 modules, ~136 tabs):
├── Panel Principal (2 tabs)
├── POS & Caja (5 tabs)
├── Inventario (9 tabs)
├── Catálogo & Precios (12 tabs)
├── Compras & Proveedores (11 tabs)
├── Logística & Entregas (7 tabs)
├── Clientes & CRM (5 tabs)
├── Marketing & Ventas (5 tabs)
├── Analytics & BI (7 tabs)
├── Finanzas (8 tabs)
├── Tesorería (6 tabs)
├── RRHH (? tabs)
├── Tareas & Automatización (? tabs)
├── Reportes & Herramientas (4 tabs)
├── Sistema & Seguridad (? tabs)
└── Configuración (4 tabs)

AFTER (8 modules, ~36 tabs):
├── 1. Asistente IA (3 tabs) ← MAIN SCREEN
├── 2. Ventas & Caja (5 tabs)
├── 3. Inventario (5 tabs)
├── 4. Productos & Precios (5 tabs)
├── 5. Compras & Proveedores (4 tabs)
├── 6. Mi Plata (5 tabs)
├── 7. Mis Clientes & Delivery (4 tabs)
└── 8. Configuración (4 tabs)
```

### Module 1: Asistente IA (Main Screen)

This is the landing page when user opens /admin. Combines dashboard + AI chat + alerts.

**Tabs:**
1. **Dashboard IA** — AI-driven home screen showing:
   - Greeting with today's summary (sales, pending orders, alerts)
   - Action buttons generated from real data ("Ver 3 pedidos urgentes", "5 productos por vencer")
   - Quick stats: ventas hoy, margen, pedidos pendientes
   - Trend arrows comparing vs yesterday/last week
2. **Chat** — Full conversational AI with business context
   - Processes natural language: "cuanto vendi esta semana", "quien me debe mas"
   - Can trigger actions: "pide 10 cajas de arroz", "sube precio del aceite 5%"
   - Shows data inline (tables, charts) within chat
3. **Alertas** — Unified alert center
   - Stock bajo, productos por vencer, pedidos sin atender +2h
   - Pagos pendientes a proveedores
   - Configurable notification preferences

**AI Floating Button:** Also available as a chat bubble (bottom-right) on ALL other modules. User can ask questions contextually ("en inventario: cuanto arroz queda?").

**Technical approach for AI:**
- Fix `/api/ai-assistant` endpoint (currently 502)
- Use existing business snapshot data (already pulls sales, stock, customers, orders)
- AI processes user query + business context → returns structured response
- Actions map to existing API endpoints (POST /api/orders, PUT /api/products, etc.)
- Offline fallback with pre-calculated responses (already exists in component)

### Module 2: Ventas & Caja (5 tabs)

**Tabs kept:**
1. Punto de Venta (POS) — POSView.tsx
2. Caja Registradora — CashRegisterTab.tsx
3. Arqueo de Caja — CashAuditTab.tsx (includes shift close)
4. Pedidos Online — OrdersTab (from page.tsx, with urgency badges)
5. Me deben (Fiao) — AccountsReceivableTab.tsx

**Tabs removed:**
- ~~Turnos~~ → integrated into Arqueo (shift close button already added)
- ~~Sales Forecast~~ → AI handles this
- ~~Conversion Metrics~~ → enterprise, not useful
- ~~Comisiones~~ → no commission structure needed

### Module 3: Inventario (5 tabs)

**Tabs kept:**
1. Mi Stock — InventoryTab.tsx (main stock view)
2. Kardex — KardexTab.tsx (movement history per product; product selector uses searchable dropdown instead of pill grid — already implemented)
3. Lotes & Vencimientos — BatchesTab.tsx (expiry tracking)
4. Mermas & Pérdidas — ShrinkageTab.tsx
5. Alertas de Stock — AutoReorderTab.tsx (low stock alerts + reorder suggestions)

**Tabs removed:**
- ~~Métricas de inventario~~ → duplicates Stock view
- ~~Inventario Físico~~ → rare operation, bodega counts by eye
- ~~Almacenes~~ → single location, not needed
- ~~Ubicaciones~~ → single location, not needed
- ~~Transferencias~~ → single location, not needed
- ~~Reposición inteligente~~ → AI handles reorder suggestions

### Module 4: Productos & Precios (5 tabs)

**Tabs kept:**
1. Catálogo — ProductsAdminTab.tsx (product list, edit, add)
2. Categorías — CategoriesEditorTab.tsx
3. Ofertas & Promociones — PromotionsTab.tsx
4. Cupones — CouponsTab.tsx
5. Historial de Precios — PriceHistoryTab.tsx (includes bulk edit)

**Tabs removed:**
- ~~Combos Editor~~ → duplicates Combos functionality
- ~~Kits~~ → enterprise feature
- ~~Etiquetas~~ → no label printer
- ~~Homepage Editor~~ → moved to Configuración
- ~~Price Benchmark~~ → no digital competitors to compare
- ~~A/B Tests~~ → enterprise feature
- ~~Barcode Scanner~~ → becomes a button inside Catálogo, not a separate tab

### Module 5: Compras & Proveedores (4 tabs)

**Tabs kept:**
1. Pedidos a Proveedor — PurchaseOrdersTab.tsx
2. Mis Proveedores — SuppliersTab.tsx
3. Recepción de Mercadería — ReceivingTab.tsx
4. Les Debo — PayablesTab.tsx

**Tabs removed:**
- ~~Planificación de compras~~ → AI suggests what to buy
- ~~Aprobaciones~~ → single owner approves everything
- ~~Contratos~~ → informal supplier relationships
- ~~Cotizaciones (RFQ)~~ → calls supplier directly
- ~~Portal de proveedor~~ → suppliers don't use the system
- ~~Evaluaciones~~ → knows suppliers personally
- ~~Control de calidad~~ → visual inspection on receipt

### Module 6: Mi Plata (5 tabs)

**Tabs kept:**
1. Ingresos & Egresos — PLTab.tsx (simplified profit/loss)
2. Gastos — ExpensesTab.tsx
3. Ganancias por Producto — ProfitabilityTab.tsx (which products make money)
4. Reportes — ReportsTab.tsx (sales summaries)
5. Exportar a Excel — ImportExportTab.tsx

**Tabs removed:**
- ~~Balance Sheet~~ → accountant handles this
- ~~Cash Flow~~ → duplicates Ingresos & Egresos
- ~~Presupuestos~~ → doesn't budget formally
- ~~Budget vs Real~~ → no budget to compare
- ~~Break-even~~ → enterprise analysis
- ~~Margin Dashboard~~ → duplicates Ganancias
- ~~Tesorería~~ → enterprise treasury management
- ~~Liquidez~~ → enterprise
- ~~Cheques~~ → cash/mobile payment only
- ~~Conciliación bancaria~~ → no bank reconciliation needed
- ~~Centro de cobros~~ → duplicates "Me deben" in Ventas
- ~~Cuentas por cobrar~~ → duplicates "Me deben"
- ~~Cost Center~~ → single cost center (the bodega)

### Module 7: Mis Clientes & Delivery (4 tabs)

**Tabs kept:**
1. Mis Clientes — CRMTab.tsx (customer list with quick filters)
2. Delivery — DeliveryCalendarTab.tsx (delivery schedule + delivery fee tracking per order)
3. Opiniones — NPSTab.tsx or SurveysTab.tsx (customer feedback)
4. Clientes Frecuentes — LoyaltyTab.tsx (repeat buyers, simple loyalty)

Note: Delivery cost visibility is preserved within each order in the Delivery tab (fee per delivery). Aggregate delivery costs appear in Mi Plata → Gastos.

**Tabs removed:**
- ~~Customer 360~~ → AI provides customer insights on demand
- ~~Segmentación~~ → AI handles segmentation
- ~~Segmentos automáticos~~ → enterprise
- ~~CLV Analytics~~ → enterprise
- ~~Campañas de marketing~~ → word-of-mouth business
- ~~Marketing automation~~ → enterprise
- ~~Referidos~~ → not applicable
- ~~Encuestas~~ → simple feedback is enough
- ~~Rutas de reparto~~ → 1-2 delivery people, no route optimization
- ~~Gestión de flota~~ → no fleet
- ~~Costos de logística~~ → simple delivery fee
- ~~Seguimiento de envíos~~ → WhatsApp tracking
- ~~Devoluciones avanzadas~~ → simple returns at counter
- ~~Communication Hub~~ → uses WhatsApp directly

### Module 8: Configuración (5 tabs)

**Tabs kept:**
1. Usuarios & Equipo — AdminUsersTab.tsx + TeamTab.tsx (combined into one view)
2. Permisos — RolePermissionsTab.tsx
3. Mi Plan — PlanTab.tsx
4. Mi Página Web — HomepageEditorTab.tsx (moved from Catálogo)

**Tabs removed:**
- ~~Audit Log~~ → overkill for bodega
- ~~Security Logs~~ → overkill
- ~~Webhooks~~ → developer feature
- ~~System Health~~ → developer feature
- ~~RRHH/Planilla~~ → informal payment to helpers
- ~~Tareas Kanban~~ → no project management needed
- ~~Workflow Templates~~ → no automation workflows
- ~~Proyectos~~ → not applicable
- ~~Backup/Restore~~ → automatic on Vercel
- ~~Changelog~~ → developer feature
- ~~Business Rules~~ → too complex

## Sidebar Design

```
┌──────────────────────┐
│ 🤖 Asistente IA      │ ← Active/highlighted by default
│                      │
│ 🛒 Ventas & Caja     │
│ 📦 Inventario        │
│ 🏷️ Productos & Precios│
│ 🚚 Compras           │
│ 💰 Mi Plata          │
│ 👥 Mis Clientes      │
│                      │
│ ─────────────────    │
│ ⚙️ Configuración     │
│                      │
│ 🏪 Ver tienda        │
│ 🚪 Cerrar sesión     │
└──────────────────────┘
```

- 8 modules + 2 actions (Ver tienda, Cerrar sesión)
- No Pro/Basic gating needed — all modules available
- Module names are SHORT and in Spanish bodeguero language
- No truncation needed (all names fit)

## AI Assistant Technical Design

### Dual Mode Architecture

```
Mode A: Main Screen (Dashboard IA)
├── BusinessSnapshotWidget — real-time KPIs
├── ActionCardsWidget — AI-generated action items
├── AlertsBanner — urgent items needing attention
└── ChatInline — embedded chat for deeper questions

Mode B: Floating Copilot (on all other modules)
├── FloatingButton — bottom-right chat bubble, always visible
├── ChatPopup — opens 400x500px chat window overlay
├── ContextAware — receives current moduleId + tabId as props
│   Module context suggestions:
│   - inventario → "¿Ver productos por vencer?", "¿Stock bajo?"
│   - ventas → "¿Resumen de ventas hoy?", "¿Pedidos sin atender?"
│   - compras → "¿Qué debo pedir?", "¿A quién le debo?"
│   - mi-plata → "¿Cuánto gané hoy?", "¿Gastos del mes?"
│   - clientes → "¿Clientes inactivos?", "¿Quién me debe?"
│   - productos → "¿Qué producto se vende más?", "¿Precios desactualizados?"
└── QuickActions — 2-3 contextual buttons above chat input, change per module
```

### AI Capabilities (Priority Order)

1. **Business Snapshot** — "How's my business today?" (already implemented, needs fixing)
2. **Natural Language Queries** — "How much rice do I have?" → queries inventory API
3. **Alert Prioritization** — Ranks what needs attention NOW vs later
4. **Action Suggestions** — "You're low on milk, want me to create a purchase order?"
5. **Data Visualization** — Shows simple charts inline in chat responses
6. **Action Execution** — Triggers API calls on user confirmation

### API Fix Strategy

The `/api/ai-assistant` currently returns 502/503 because it requires `GROQ_API_KEY` (Groq LLM API). The project already has a valid GROQ key in `.env`. Fix approach:

1. **Primary mode (GROQ_API_KEY present):** Full AI with Groq LLM — natural language understanding, complex queries, action suggestions. This is the default since the key exists in `.env`.
2. **Fallback mode (no key):** Rule-based responses from business data — pattern matching + database queries. Graceful degradation, not an error page.
3. **Current 5 action types supported:** update_price, update_stock, toggle_product, create_product, update_order_status. These map to existing API endpoints.

### Rule-Based Fallback Mode (When No AI Key)

For common queries, use pattern matching + database queries:
- "ventas hoy" → query /api/admin/dashboard → format response
- "stock de [producto]" → query /api/products?search=[producto] → format
- "quien me debe" → query /api/accounts-receivable → format
- "pedidos pendientes" → query /api/orders?status=pending → format
- Quick actions map directly to existing API endpoints
- Returns 200 with structured data, never 502/503

## Data Flow

```
User opens /admin
  → Load Dashboard IA (default module)
  → Fetch business snapshot (/api/admin/dashboard)
  → AI processes snapshot → generates:
     - Summary text ("Hoy vendiste S/847, 12% más que ayer")
     - Action cards ("3 pedidos urgentes", "5 productos por vencer")
     - Alerts (sorted by priority)
  → User clicks action card → navigates to relevant module
  → OR types question in chat → AI responds with data

User navigates to Inventario
  → Floating AI button visible (bottom-right)
  → User clicks → mini chat opens
  → Context: "inventario" module
  → AI suggests: "¿Quieres ver productos por vencer?" or "¿Revisar stock bajo?"
```

## Files to Modify

### New Files
- `components/admin/unified/AsistenteIAModule.tsx` — New module container
- `components/admin/DashboardIATab.tsx` — AI-driven dashboard (main screen)
- `components/admin/AIFloatingButton.tsx` — Floating chat button for all modules
- `components/admin/AlertsCenterTab.tsx` — Unified alerts tab

### Modified Files
- `components/admin/AdminSidebar.tsx` — New 8-module structure
- `components/admin/AIAssistant.tsx` — Fix chat functionality, add context awareness
- `app/api/ai-assistant/route.ts` — Fix 502, add rule-based mode
- `app/admin/page.tsx` — Update module routing, set Asistente IA as default

### Deleted (or archived) Unified Modules
The following unified module files become unused:
- `AnalyticsBIModule.tsx` → tabs absorbed by AI + Mi Plata
- `TesoreriaModule.tsx` → eliminated (enterprise)
- `VentasMarketingModule.tsx` → eliminated (marketing not needed)
- `CRMClientesModule.tsx` → simplified into Mis Clientes
- `LogisticaModule.tsx` → simplified into Mis Clientes (delivery only)
- `DevolucionesCalidadModule.tsx` → eliminated
- `FacturacionModule.tsx` → eliminated (basic invoicing stays in Mi Plata)
- `GastosActivosModule.tsx` → absorbed into Mi Plata
- `FidelizacionModule.tsx` → simplified into Clientes Frecuentes
- `RRHHModule.tsx` → eliminated
- `AlertasAutomModule.tsx` → absorbed into Asistente IA Alerts
- `ComunicacionesModule.tsx` → eliminated
- `EncuestasSoporteModule.tsx` → eliminated
- `ProyeccionesModule.tsx` → AI handles projections
- `ProyectosTareasModule.tsx` → eliminated
- `ReposicionModule.tsx` → AI handles reorder
- `SeguridadModule.tsx` → eliminated
- `SistemaModule.tsx` → eliminated
- `AgendaUtilidadesModule.tsx` → eliminated
- `ReportesDocModule.tsx` → absorbed into Mi Plata

~20 unified modules to remove/archive.

### Tab Components to Archive
~91 tab components become unused after reorganization. Strategy:
- **Phase 1:** Remove from sidebar and routing (no longer imported). Files stay on disk.
- **Phase 2 (future):** Move unused files to `components/admin/_archived/` directory.
- **Never delete:** Code may be useful for future Pro plan features.
- **Test:** After Phase 1, run `npm run build` — any import errors reveal missed dependencies.

## Success Criteria

1. Admin panel loads with Asistente IA as the main screen — verify by navigating to /admin
2. Sidebar shows exactly 8 modules + Ver tienda + Cerrar sesión = 10 items total
3. Each module has 4-5 tabs maximum — verify by counting tabs in each module
4. AI chat responds to these 5 queries without error: "ventas hoy", "stock bajo", "quien me debe", "pedidos pendientes", "que debo pedir"
5. AI floating button (chat bubble) visible on all 7 non-AI modules
6. `/api/ai-assistant` returns 200 (not 502/503) — with or without GROQ_API_KEY
7. Core functionality preserved: POS checkout works, inventory CRUD works, orders list works, customer list works — verified by navigating each module
8. `npm run build` passes with 0 errors
9. `npm run lint` passes (no new warnings beyond existing 16)

## Migration Strategy

1. **Phase 1:** Create new sidebar with 8 modules, remap tab routing
2. **Phase 2:** Fix AI assistant API, implement rule-based mode
3. **Phase 3:** Create Dashboard IA as main screen
4. **Phase 4:** Add floating AI button to all modules
5. **Phase 5:** Clean up unused imports and dead code

Each phase is independently deployable.
