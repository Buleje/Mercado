---
applyTo: "components/admin/**,app/admin/**"
---

# ERP Admin Panel — Bodega San Martín

## Estructura del panel (107 módulos)

```
app/admin/
  page.tsx           → Dashboard principal con tabs
  layout.tsx         → Layout admin con sidebar/nav

components/admin/
  ← 140+ componentes TSX aquí →
```

## Categorías de módulos admin

### Core (funcional y en uso)
| Tab | Componente | Estado |
|-----|-----------|--------|
| Panel Principal | `PanelPrincipal.tsx` | ✅ Funcional |
| POS/Caja | `POSCaja.tsx` | ✅ Funcional |
| Inventario | `InventarioAlmacenesModule.tsx` | ✅ Funcional |
| Pedidos | `OrdersModule.tsx` | ✅ Funcional |
| Configuración | `SettingsModule.tsx` | ✅ Funcional |
| Seguridad | `SecurityModule.tsx` | ✅ Funcional |

### En progreso (parcialmente conectado a datos reales)
| Tab | Componente |
|-----|-----------|
| Compras | `ComprasModule.tsx` |
| Proveedores | `ProveedoresModule.tsx` |
| CRM | `CRMModule.tsx` |
| Finanzas | `FinanzasModule.tsx` |
| Alertas | `AlertCenter.tsx` |

### Pendiente de datos reales
| Tab | Componente |
|-----|-----------|
| Control de Turno | `ShiftControlTab.tsx` |
| Almacenes | `WarehouseTab.tsx` |
| Rutas de Entrega | `DeliveryRoutesTab.tsx` |
| Tesorería | `TreasuryTab.tsx` |
| RRHH | `HRTab.tsx` |

### Decorativo / futuro
- `ProyectosTareas.tsx`, `Comunicaciones.tsx`, `AgendaUtilidades.tsx`, `BCGMatrix.tsx`

## InventoryMetricsTab (nuevo, 2026-03-21)

```typescript
// components/admin/InventoryMetricsTab.tsx
// 5 KPIs + 2 gráficos Recharts + tabla de lotes críticos
// Registrado como primer sub-tab "📊 Métricas" en InventarioAlmacenesModule
```

## Patrón de tab admin

```tsx
// Cada módulo es un componente grande que recibe datos del parent
// El parent (app/admin/page.tsx) maneja el routing entre tabs

// Patrón típico:
export function MiModulo({ tenantId }: { tenantId: string }) {
  const [activeTab, setActiveTab] = useState("overview");
  const { data, isLoading } = useSWR(`/api/recurso?tenantId=${tenantId}`, fetcher);

  return (
    <Tabs value={activeTab} onValueChange={setActiveTab}>
      <TabsList>
        <TabsTrigger value="overview">Resumen</TabsTrigger>
        <TabsTrigger value="details">Detalles</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">...</TabsContent>
    </Tabs>
  );
}
```

## Componentes de auditoría disponibles

```
ActivityLogTab.tsx    — Historial de acciones del admin
AuditLogTab.tsx       — Log de auditoría detallado
SecurityModule.tsx    — Gestión de usuarios y permisos
```

## Gotchas

- **140+ componentes en components/admin/** — revisar si ya existe uno antes de crear
- **Componentes grandes** — muchos tienen 300-800 líneas; leer completo antes de editar
- **Sub-tabs** — varios módulos tienen sub-tabs internos (ej: Inventario tiene Métricas, Lista, Movimientos)
- **datos "decorativos"** — módulos marcados como "decorativo" tienen datos mock; no conectar a DB sin planning
- **PanelPrincipal.tsx** — componente más visto por los usuarios; cambios visuales aquí tienen impacto alto

## Anti-patrones

- NO crear un componente admin nuevo sin revisar si ya existe uno similar
- NO conectar módulos decorativos a la DB sin coordinar con el flujo de datos existente
- NO hacer cambios globales al layout admin sin verificar en mobile (AdminBottomNav)
