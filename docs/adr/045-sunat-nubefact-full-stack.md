# ADR 045 — SUNAT NubeFact Full Stack Integration

**Estado:** Propuesto — implementacion pendiente
**Fecha:** 2026-04-10
**Autor:** Claude (arquitecto de soluciones) — sesion Sprint 2 wave 3
**Sprint:** 2 (AI + WhatsApp + Growth)
**Tier S item:** Desbloquea B2B — ROI estimado S/200+ por tenant/mes

---

## Contexto

Brandon necesita facturacion electronica automatica para desbloquear el segmento B2B. Sin comprobantes electronicos validados por SUNAT, los clientes con RUC no pueden deducir gastos — lo cual bloquea contratos con negocios (restaurantes, farmacias, distribuidores) que representan el 60-80% del ticket promedio mas alto.

El modelo `SunatInvoice` ya existe en `prisma/schema.prisma` (linea 2761) con todos los campos necesarios: `nubefactId`, `pdfUrl`, `sunatStatus`, `xmlContent`, `cdrResponse`. La tabla ya esta deployada. NubeFact es el proveedor certificado elegido — API REST, sin necesidad de generar XML manualmente.

**Por que este ADR:** La venta existe en `lib/db/sales.db.ts` y `app/api/sales/route.ts` (ambos en dirty tree — NO tocar). Se necesita un observer pattern que enganche post-sale sin modificar esos archivos.

## Decision

Implementar la integracion NubeFact como un modulo autonomo en `lib/sunat/` que:

1. Recibe un `SaleId` via event emitter desacoplado (no modifica `sales.db.ts`)
2. Construye el payload NubeFact desde los datos de `Sale` + `SaleItem`
3. Llama la API NubeFact con retry exponencial (3 intentos, backoff 1s/2s/4s)
4. Persiste el resultado en `SunatInvoice` via nueva clase `lib/db/sunat.db.ts`
5. Recibe webhooks de actualizacion desde NubeFact para sincronizar CDR/estado

El pattern elegido es un **Node.js EventEmitter** exportado como singleton (`lib/sunat/sale-events.ts`). Los callers existentes en `sales.db.ts` estan protegidos — en vez de modificarlos, se inyecta el emit en `app/api/sales/route.ts` via un wrapper `POST /api/sunat/emit-on-sale` que recibe el `saleId` como callback optativo.

**Alternativa mas limpia a largo plazo:** cuando el tree este limpio, agregar `sunatEmitter.emit("sale.created", saleId)` directamente en `lib/db/sales.db.ts`. El ADR-046 del mismo sprint ya demuestra que el event emitter es el patron correcto.

### Archivos nuevos (rutas NUEVAS — no dirty)

| Archivo | Proposito |
|---------|-----------|
| `lib/sunat/types.ts` | Tipos TypeScript del contrato NubeFact (request/response) |
| `lib/sunat/sale-events.ts` | EventEmitter singleton + `SaleCreatedEvent` type |
| `lib/sunat/nubefact-client.ts` | Cliente HTTP NubeFact con retry exponencial |
| `lib/sunat/invoice-builder.ts` | Construye payload NubeFact desde `Sale` + `SaleItem` |
| `lib/sunat/invoice-worker.ts` | Worker idempotente: escucha `sale.created` → emite a NubeFact |
| `lib/sunat/webhook-validator.ts` | Valida firma HMAC del webhook NubeFact |
| `lib/db/sunat.db.ts` | CRUD de `SunatInvoice` con tenantId isolation |
| `app/api/sunat/webhook/route.ts` | POST receiver de actualizaciones NubeFact |
| `app/api/sunat/config/route.ts` | GET/PUT config del tenant (serie, RUC, token) |
| `app/api/sunat/invoices/route.ts` | GET listado facturas del tenant |
| `app/api/sunat/invoices/[id]/route.ts` | GET detalle + reintento manual |
| `app/api/sunat/emit-on-sale/route.ts` | POST interno — recibe saleId y dispara el worker |
| `components/admin/sunat/SunatConfigCard.tsx` | Panel de configuracion SUNAT en /admin |
| `components/admin/sunat/InvoiceStatusBadge.tsx` | Badge de estado (pending/accepted/rejected/voided) |
| `components/admin/sunat/InvoicesList.tsx` | Tabla de facturas con filtros y reintentos |
| `__tests__/sunat-invoice-builder.test.ts` | Unit tests del builder (boleta, factura, nota credito) |
| `__tests__/sunat-nubefact-client.test.ts` | Unit tests del cliente (retry, timeout, error handling) |
| `__tests__/sunat-webhook.test.ts` | Integration tests del webhook (firma valida, invalida, update) |

### Tipos TypeScript clave (`lib/sunat/types.ts`)

```ts
// Contrato NubeFact v1 (simplificado — ver docs oficiales)
export interface NubefactInvoiceRequest {
  operacion: "generar_comprobante";
  tipo_de_comprobante: 1 | 2 | 3 | 7; // 1=factura, 2=boleta, 3=nota-debito, 7=nota-credito
  serie: string;                        // "B001" | "F001"
  numero: number;
  sunat_transaction: 1;
  cliente_tipo_de_documento: 1 | 6;    // 1=DNI, 6=RUC
  cliente_numero_de_documento: string;
  cliente_denominacion: string;
  fecha_de_emision: string;             // "DD-MM-YYYY"
  moneda: 1;                            // 1=PEN
  tipo_de_cambio?: string;
  porcentaje_de_igv: 18;
  items: NubefactLineItem[];
  // ...resto del contrato
}

export interface NubefactLineItem {
  unidad_de_medida: string;             // "NIU" = unidad
  codigo: string;
  descripcion: string;
  cantidad: number;
  valor_unitario: number;               // sin IGV
  precio_unitario: number;              // con IGV
  subtotal: number;
  tipo_de_igv: 1;                       // 1=gravado
  igv: number;
  total: number;
}

export interface NubefactResponse {
  aceptada_por_sunat: boolean;
  codigo_sunat?: string;
  descripcion_sunat?: string;
  enlace_del_pdf: string;
  enlace_del_xml: string;
  nubefact_id: string;
  error?: string;
}

export type SunatInvoiceStatus = "pending" | "accepted" | "rejected" | "voided";

export interface SaleCreatedEvent {
  saleId: string;
  tenantId: string;
  comprobanteTipo: "boleta" | "factura" | "ticket";
  comprobanteRuc?: string;
  customerName?: string;
}
```

### Retry exponencial (`lib/sunat/nubefact-client.ts`)

```ts
// Pseudo — no implementar aqui, es referencia para el backend engineer
const RETRY_DELAYS = [1000, 2000, 4000]; // ms

async function callWithRetry(payload: NubefactInvoiceRequest): Promise<NubefactResponse> {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    try {
      const res = await fetch(env.NUBEFACT_API_URL, {
        method: "POST",
        headers: { Authorization: `Token ${env.NUBEFACT_TOKEN}` },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok && attempt < RETRY_DELAYS.length) {
        await sleep(RETRY_DELAYS[attempt]);
        continue;
      }
      return res.json();
    } catch (err) {
      if (attempt === RETRY_DELAYS.length) throw err;
      await sleep(RETRY_DELAYS[attempt]);
    }
  }
}
```

### Worker idempotente (`lib/sunat/invoice-worker.ts`)

El worker verifica si ya existe un `SunatInvoice` para el `saleId` antes de emitir (campo `orderId` del modelo). Si existe y `sunatStatus != "rejected"`, retorna sin accion. Esto previene doble emision por retries del EventEmitter o reintentos manuales.

### Migration Prisma

No se requiere nueva migracion — `SunatInvoice` ya existe en el schema. Solo agregar `TenantSunatConfig` si no existe en el tree limpio.

Verificar: `grep -n "TenantSunatConfig" prisma/schema.prisma`

Si no existe, crear `prisma/migrations/proposed-tenant-sunat-config.sql`:

```sql
-- proposed-tenant-sunat-config.sql
-- Solo ejecutar si TenantSunatConfig no existe en el schema
CREATE TABLE IF NOT EXISTS "TenantSunatConfig" (
  "tenantId"    TEXT NOT NULL PRIMARY KEY,
  "ruc"         TEXT NOT NULL,
  "razonSocial" TEXT NOT NULL,
  "token"       TEXT NOT NULL,           -- NUBEFACT_TOKEN por tenant
  "serieFactura" TEXT NOT NULL DEFAULT 'F001',
  "serieBoleta"  TEXT NOT NULL DEFAULT 'B001',
  "nextNumFactura" INTEGER NOT NULL DEFAULT 1,
  "nextNumBoleta"  INTEGER NOT NULL DEFAULT 1,
  "isActive"    BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt"   TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt"   TIMESTAMP NOT NULL DEFAULT NOW()
);
```

## DAG de dependencias entre archivos

```
lib/sunat/types.ts
  └── lib/sunat/nubefact-client.ts
  └── lib/sunat/invoice-builder.ts
        └── lib/db/sunat.db.ts
              └── lib/sunat/invoice-worker.ts
                    └── lib/sunat/sale-events.ts  ← singleton
                          └── app/api/sunat/emit-on-sale/route.ts  (disparo externo)
lib/sunat/webhook-validator.ts
  └── app/api/sunat/webhook/route.ts
lib/db/sunat.db.ts
  └── app/api/sunat/invoices/route.ts
  └── app/api/sunat/invoices/[id]/route.ts
  └── app/api/sunat/config/route.ts
components/admin/sunat/InvoiceStatusBadge.tsx
  └── components/admin/sunat/InvoicesList.tsx
        └── components/admin/sunat/SunatConfigCard.tsx
```

## Test strategy

| Tipo | Archivo | Casos cubiertos |
|------|---------|-----------------|
| Unit | `sunat-invoice-builder.test.ts` | boleta sin RUC, factura con RUC, calculo IGV 18%, items multiples, nombre fallback |
| Unit | `sunat-nubefact-client.test.ts` | retry 3 intentos, timeout 10s, response 4xx, response 5xx, respuesta valida |
| Integration | `sunat-webhook.test.ts` | firma HMAC valida, firma invalida (401), update accepted, update rejected, replay idempotente |

Mock NubeFact: `__tests__/mocks/nubefact-server.ts` usando `msw` (ya en el proyecto como dev dependency).

## Variables de entorno requeridas

```env
NUBEFACT_TOKEN="Bearer eyJ..."          # Token maestro o por tenant
NUBEFACT_API_URL="https://api.nubefact.com/api/v1/comprobantes"
NUBEFACT_WEBHOOK_SECRET="whsec_..."     # Para validar firma HMAC de callbacks
NUBEFACT_MODE="production"              # "sandbox" en dev
```

Agregar a `.env.example` y validar en `lib/env.ts` (solo si `NODE_ENV === "production"`).

## Alternativas evaluadas

1. **Generar XML UBL 2.1 propio + conexion directa SUNAT OSE** — descartado: generacion de XML UBL es extremadamente compleja (30+ campos obligatorios, firma digital XAdES). NubeFact abstrae todo esto.
2. **EFACT / Alegra** — descartados: NubeFact tiene mejor precio (S/0.10/comprobante vs S/0.25+), API mas simple, y es el mas usado en Pucallpa segun research.
3. **Queue BullMQ para retry** — descartado en esta primera version: el retry inline con exponential backoff es suficiente. Si el volumen sube (>1000 facturas/dia), migrar a BullMQ queue. ADR separado cuando sea necesario.

## Consecuencias

### Positivas
- Desbloquea segmento B2B — negocios con RUC pueden deducir IGV
- Cumplimiento legal obligatorio para facturacion electronica Peru 2024
- Cero modificaciones a archivos dirty (`sales.db.ts`, `sales/route.ts`)
- Worker idempotente — safe ante retries y doble click
- PDF generado por NubeFact disponible para descarga inmediata

### Negativas / riesgos
- Costo: ~S/0.10 por comprobante — a 500 ventas/mes = S/50/mes por tenant (absorbible en plan B2B)
- NubeFact es un tercero — si su API cae, las facturas quedan en `pending` (mitigacion: worker de reintento via cron `app/api/cron/sunat-retry/route.ts`)
- El observer pattern via `emit-on-sale` endpoint es un "hack temporal" — cuando el tree este limpio, migrar a emit directo en `sales.db.ts`

### Seguridad
- `NUBEFACT_TOKEN` nunca se expone en el cliente — solo server-side
- Webhook validado con HMAC-SHA256 antes de procesar (regla #10 CLAUDE.md)
- `tenantId` en todas las queries a `SunatInvoice` (regla #3)
- `requireAdmin` en todos los endpoints admin (regla #9)

## Fases de implementacion

| Fase | Archivos | Tiempo estimado |
|------|----------|-----------------|
| 1 — Core | `types.ts`, `nubefact-client.ts`, `invoice-builder.ts`, `lib/db/sunat.db.ts` | 2h |
| 2 — Worker + Events | `sale-events.ts`, `invoice-worker.ts`, `emit-on-sale/route.ts` | 1h |
| 3 — Webhook | `webhook-validator.ts`, `sunat/webhook/route.ts` | 1h |
| 4 — Admin UI | `SunatConfigCard`, `InvoiceStatusBadge`, `InvoicesList` | 2h |
| 5 — Tests | Los 3 archivos de test + mock server | 1.5h |

**Agente delegado:** `backend-platform-engineer` para fases 1-3. `frontend-engineer` para fase 4. `test-writer` para fase 5.

## Referencias

- `prisma/schema.prisma` lineas 2761-2791 — `SunatInvoice` ya deployado
- NubeFact API Docs: https://nubefact.com/documentacion
- SUNAT Facturacion Electronica OSE: https://cpe.sunat.gob.pe
- ADR 016 — plan maestro (B2B unlock objetivo sprint 3)
- ADR 036 — compliance Ley 29733 (audit trail)
- CLAUDE.md reglas #3 (tenantId), #9 (requireAdmin), #10 (no secrets hardcoded), #11 (raw SQL posicional)
