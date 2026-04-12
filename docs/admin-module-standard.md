# Estándar de Módulos Admin — Buleje ERP

> Guía obligatoria para todos los módulos del panel admin.
> Cada módulo nuevo o refactorizado DEBE seguir esta estructura.

## Estructura de un módulo

```
ModuleHeader (título + descripción + acciones)
├── KPI Strip (métricas rápidas, solo si aplica)
├── AdminTabBar vertical (sub-tabs del módulo)
│   ├── Tab content area
│   │   ├── Filtros/búsqueda (si la tab tiene lista)
│   │   ├── Contenido principal (tabla/grid/form/dashboard)
│   │   └── Acciones (guardar/exportar/crear)
```

## Reglas de UX

### 1. Sin datos duplicados
- Cada dato se edita en UN solo lugar
- Otros módulos pueden MOSTRAR el dato (solo lectura) con link al módulo original
- Ejemplo: precio de producto se edita SOLO en Productos, no en Inventario ni POS

### 2. Lenguaje simple (modo sencillo por defecto)
- Usar `useVocabulary().t("key")` para términos técnicos
- Default: "Ganancia" no "Margen bruto"
- El usuario elige en Config > Apariencia

### 3. Navegación predecible
- Sub-tabs laterales (AdminTabBar vertical) para módulos con 2+ secciones
- Breadcrumbs: Admin > Categoría > Tab
- Máximo 2 clicks para llegar a cualquier función

### 4. Consistencia visual
- Header: h2 font-extrabold + descripción text-muted
- KPIs: grid de 4-6 cards con icono + número + label
- Tablas: rounded-2xl, headers sticky, row hover
- Formularios: labels arriba, inputs full-width, guardar al fondo
- Colores: primary (#00B4A6 teal) para acciones, gray para secundario

### 5. Feedback inmediato
- Toast al guardar/eliminar/error
- Loading spinners en botones
- Badges rojos para items que necesitan atención
- Empty states con ilustración + CTA

## Módulos consolidados (12)

| Módulo | Sub-tabs | Responsabilidad única |
|--------|----------|----------------------|
| Dashboard | (single) | Resumen IA del negocio + widgets |
| Ventas | POS, Pedidos, Turnos | Todo en el mostrador |
| Inventario | (single) | Stock, movimientos, vencimientos |
| Productos | Catálogo, Promociones | Precios y ofertas |
| Compras | Proveedores, Devoluciones | Cadena de suministro |
| Finanzas | Plata, Tesorería, Facturación | Todo el dinero |
| Clientes | CRM, Fíados, Préstamos, Scoring | Todo sobre clientes |
| Analytics | Reportes, Predicciones | Datos y tendencias |
| Recetas | (single) | Producción |
| Marketplace | Tiendas, Delivery, Chat | Multi-vendor |
| Documentos | Cotizaciones, Guías, Notas, Contratos | Documentos comerciales |
| Mi Tienda | (single) | Personalización storefront |
| Config | Ajustes, Plan, Auditoría | Sistema y equipo |

## Anti-patterns (NO hacer)

- Dashboard dentro de cada módulo (usar el Dashboard central)
- Formulario de creación de entidad en 2+ módulos
- Tabs horizontales (usar AdminTabBar vertical)
- Emojis genéricos (usar Lucide icons con colores marca)
- Palabras técnicas sin usar `t()` del vocabulario
- Sidebar con más de 13 categorías
