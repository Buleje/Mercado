---
applyTo: "**/prisma/**,**/schema.prisma"
---

# Prisma Schema — Buleje

## Configuración crítica

```prisma
generator client {
  provider = "prisma-client"
  output   = "../lib/generated/prisma"  // ← NO es @prisma/client
}

datasource db {
  provider = "postgresql"
  // URL via env vars — SESSION pooler para runtime, DIRECT_URL para migraciones
}
```

## Import del cliente

```typescript
// CORRECTO:
import { prisma } from "@/lib/prisma";  // Singleton

// INCORRECTO — no usar directamente:
import { PrismaClient } from "@/lib/generated/prisma"; // Nunca instanciar directo
```

## Patrones comunes del schema

```prisma
// Multi-tenant (casi todos los modelos):
tenantId    String    @default("main")
@@index([tenantId])

// Soft-delete:
deletedAt   DateTime?  // null = activo, DateTime = eliminado

// Timestamps estándar:
createdAt   DateTime  @default(now())
updatedAt   DateTime  @updatedAt
```

## Mapa de 66 modelos

### Core de negocio
| Modelo | Propósito |
|--------|-----------|
| `Tenant` | SaaS multi-tenant. Slug = subdominio. Stripe billing. |
| `Product` | Catálogo. `expiresAt` = fecha más próxima de vencimiento del stock |
| `Batch` | Lotes FEFO. `expiryDate` ← campo correcto (no expiresAt) |
| `Customer` | PK = phone. Loyalty, crédito, referrals |
| `Order` | Estado machine: pending→confirmed→preparing→ready→delivered |
| `OrderItem` | Items de orden con costPrice snapshot |
| `Sale` | Venta POS. Diferente de Order (venta directa en caja) |
| `SaleItem` | Items de venta POS |

### Inventario y compras
| Modelo | Propósito |
|--------|-----------|
| `Inventory` | Stock por producto/almacén |
| `InventoryMovement` | Audit trail: entrada/salida/merma/transferencia |
| `Transfer` | Transferencia entre almacenes |
| `Location` | Ubicación física en almacén |
| `Purchase` | Orden de compra a proveedor |
| `PurchaseItem` | Items de compra con precio de costo |
| `Supplier` | Proveedores |
| `SupplierEvaluation` | Rating de proveedores |
| `Return` | Devoluciones (con/sin orden) |
| `ReturnItem` | Items devueltos |

### Finanzas
| Modelo | Propósito |
|--------|-----------|
| `CashRegister` | Apertura/cierre de caja |
| `Payable` | Cuentas por pagar |
| `Expense` | Gastos del negocio |
| `Invoice` | Facturas |
| `CommissionRule` | Reglas de comisión para vendedores |

### CRM y marketing
| Modelo | Propósito |
|--------|-----------|
| `Coupon` | Cupones de descuento |
| `Promotion` | Promociones (2x1, descuento %) |
| `Review` | Reseñas de productos |
| `LoyaltyTransaction` | Historial de puntos loyalty |
| `ShoppingList` | Listas de compra del cliente |
| `Campaign` | Campañas de email/SMS |
| `Newsletter` | Suscriptores |
| `Referral` | Sistema de referidos |

### Sistema y configuración
| Modelo | Propósito |
|--------|-----------|
| `AdminUser` | Usuarios del panel admin |
| `Session` | Sesiones activas (HMAC-SHA256) |
| `PushSubscription` | Suscripciones Web Push por cliente |
| `ActivityLog` | Audit trail de acciones admin |
| `Notification` | Notificaciones del sistema |
| `MessageTemplate` | Plantillas de mensajes WhatsApp/email |
| `Settings` | Configuración por tenant |
| `Page` | Páginas CMS |
| `PageBlock` | Bloques de contenido CMS |
| `Goal` | Metas de ventas |
| `Task` | Tareas internas |
| `AutoReorder` | Reglas de reorden automático |
| `PriceHistory` | Historial de precios |
| `ABTest` | Tests A/B |
| `Survey` | Encuestas |
| `DeliverySlot` | Slots de entrega |
| `AutoAlert` | Alertas automáticas |

## Comandos de schema

```bash
cd buleje
npx prisma validate          # Validar sin migrar
npm run db:migrate           # Migrar (requiere DIRECT_URL en .env)
npx prisma generate          # Regenerar cliente después de cambios
npm run db:seed              # Seed inicial de datos
```

## Gotchas ⚠️

- **Output es `lib/generated/prisma`** — no `@prisma/client`. Importar desde `@/lib/prisma`
- **Batch tenía modelo duplicado** — corregido. Mantener solo el de línea ~969
- **`expiryDate` en Batch, `expiresAt` en Product** — distintos propósitos, no confundir
- **Migraciones requieren `DIRECT_URL`** — pgBouncer (session pooler) no soporta `prisma migrate`
- **Soft-delete `deletedAt`** — siempre filtrar `where: { deletedAt: null }` para activos
- **`tenantId @default("main")`** — en dev está ok, en producción SIEMPRE setear correctamente
- **Nunca instanciar `PrismaClient` directo** — usar el singleton de `lib/prisma.ts`
