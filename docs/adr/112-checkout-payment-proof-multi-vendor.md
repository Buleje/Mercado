# ADR-112 — Checkout marketplace: comprobante de pago por tienda (Yape/Plin/Transfer)

**Fecha:** 2026-05-12
**Estado:** Aceptado
**Stakeholders:** Brandon (dueño), Buleje SaaS

## Contexto

El checkout del marketplace (`/checkout/entrega` → `/checkout/confirmar`) tenía 3 métodos de pago hardcoded (Efectivo / Yape / Plin) **sin filtrar por la config del negocio** ni adjuntar comprobante al pedido. El cliente elegía Yape y el flujo solo mostraba "el vendedor te contacta por WhatsApp" — sin QR, sin captura, sin trazabilidad.

A su vez:
- El admin del negocio recibía pedidos Yape "a ciegas" sin foto del pago.
- En carritos multi-tienda (cross-tenant), no había forma de cobrar a cada vendor por separado.
- El campo `PaymentApproval.imageUrl` ya existía en schema pero solo lo usaba el flujo PRE-tenant (registro para abrir tienda), no las orders del cliente final.

## Decisión

Implementamos un flujo de **comprobante por tienda** alineado con el modelo multi-vendor del marketplace:

### Frontend

1. `/checkout/entrega` hace fetch a `GET /api/marketplace/storefront/payment-config?stores=slug1,slug2` al montar.
2. Filtra los métodos visibles: solo aparecen los habilitados por al menos una tienda del carrito (`cashEnabled`, `yapeEnabled`, `plinEnabled`, `transferEnabled`).
3. Agrega **Transferencia bancaria** como nuevo método (manual igual que Yape/Plin).
4. Al elegir un método no-efectivo, muestra una tarjeta por tienda con `[Pagar ahora]`. Click abre `<PaymentProofModal>` con: QR / titular / teléfono / cuenta + dropzone + monto exacto copiable.
5. Subir captura → `POST /api/marketplace/checkout/payment-proof` retorna `{ proofUrl, proofToken }` (HMAC firmado).
6. CTA "Revisar pedido" deshabilitado hasta que **todas** las tiendas no-efectivo tengan proof.

### Backend

1. **Endpoint público** `GET /api/marketplace/storefront/payment-config` retorna por tienda solo data pública (QR, titular, número). Cache 60s.
2. **Endpoint autenticado** `POST /api/marketplace/checkout/payment-proof` requiere `requireCustomer(req)`. Valida magic bytes (anti-spoof), optimiza con Sharp 1200px/webp 82%, sube a Supabase Storage (`media/order-proofs/{slug}/{customerId}-{ts}-{rand}.webp`). Emite `proofToken` HMAC con `${customerId}.${storeSlug}.${method}.${amountCents}.${pathHash}.${sig}`.
3. **Order creation** (`POST /api/marketplace/orders`): si viene `paymentProof`, exige sesión customer + verifica token + crea `PaymentApproval` con `imageUrl` + linkea `Order.paymentApprovalId`.
4. **Endpoint admin** `GET /api/admin/orders/[id]/payment-proof` retorna captura + status. Admin del mismo tenant o superadmin pueden consultar.

### UI admin

Componente reutilizable `<PaymentProofViewer orderId={id} />` con lazy fetch + lightbox fullscreen + badge de status. Insertado en:
- `components/admin/OrdersTab/OrdersDetailPanel.tsx` (tab=pedidos)
- `components/admin/unified/marketplace/OrderDetailDrawer.tsx` (tab=marketplace)
- `app/superadmin/orders/OrdersClient.tsx` (modal superadmin)

## Invariantes preservados (checkout-flow.instructions.md)

- **Totales en backend**: el modal solo muestra el monto que recibe del frontend; el backend recalcula al crear Order.
- **Idempotency intacta**: el modal no crea Order; el flujo de finalize en `/checkout/confirmar` mantiene su idempotency key.
- **Reservas de stock**: no se tocan.
- **Cupones server-side**: no se tocan.

## Modelo de carrito multi-vendor

El cliente elige UN método global. Si el carrito tiene 3 tiendas y elige Yape:
- Si las 3 tiendas tienen Yape habilitado → 3 modales (uno por tienda) → 3 comprobantes → 3 Orders con su propio PaymentApproval.
- Si una tienda **no** tiene Yape → tarjeta amarilla "Esta tienda no acepta Yape, va como efectivo contra-entrega".

## Anti-tampering

El `proofToken` se firma con `AUTH_SECRET + "-proof-token"` HMAC-SHA256 y verifica al crear Order:
- `customerId` debe coincidir con la sesión.
- `storeSlug` + `method` + `amountCents` deben coincidir con lo que envía el frontend.
- Sin esto, un atacante podría reusar un `proofUrl` ajeno o cambiar el monto.

## Consecuencias

### Positivas
- El admin ve la foto del pago en su modal de pedidos → cierre del ciclo Yape.
- El cliente sabe exactamente cuánto pagar a qué tienda (multi-vendor).
- Trazabilidad: cada Order tiene `paymentApprovalId` → `imageUrl` ligados.
- Reutilizamos `PaymentApproval` que ya existía (cero migration).

### Negativas / Deuda
- El `proofToken` no expira — un cliente podría reusar un proof viejo si conoce el storeSlug/amount exactos. Mitigación pendiente: TTL del token (15 min).
- Si el cliente abandona checkout, las imágenes quedan huérfanas en Supabase Storage. Pendiente: cron de limpieza `>24h sin Order asociada`.
- No hay tests e2e Playwright del happy path. Pendiente.
- "transfer" no tiene una validación de banco fuerte (cualquier banco/cuenta del admin se acepta).

## Archivos tocados (10 commits, 14 archivos)

| Capa | Archivos |
|---|---|
| API | `app/api/marketplace/storefront/payment-config/route.ts` (nuevo) · `app/api/marketplace/checkout/payment-proof/route.ts` (nuevo) · `app/api/marketplace/orders/route.ts` (PaymentProofSchema + verifyProofToken) · `app/api/admin/orders/[id]/payment-proof/route.ts` (nuevo) |
| Context | `contexts/checkout-data-context.tsx` (CheckoutStoreProof + paymentProofs + setStoreProof) · `hooks/use-checkout-data.ts` |
| UI checkout | `components/checkout/PaymentProofModal.tsx` (nuevo) · `app/checkout/entrega/page.tsx` (integración) · `app/checkout/confirmar/page.tsx` (envío proof) |
| UI admin | `components/admin/PaymentProofViewer.tsx` (nuevo, reutilizable) · `components/admin/OrdersTab/OrdersDetailPanel.tsx` · `components/admin/unified/marketplace/OrderDetailDrawer.tsx` · `app/superadmin/orders/OrdersClient.tsx` |
| Schema | `lib/db/misc.db.ts` (DbOrder.paymentMethod admite plin/transfer + paymentApprovalId) |

## Alternativas descartadas

| Opción | Por qué no |
|---|---|
| QR central de Buleje (escrow) | Requeriría reparto contable + KYC + integración bancaria — fuera de scope para validar el wedge comercial |
| Solo permitir 1 tienda en checkout no-efectivo | Rompe la promesa multi-vendor del marketplace |
| Crear Order primero, foto después | Ensucia el tablero del admin con órdenes "pendiente sin foto" |
| Webhook bancario / Yape Vision real-time | Yape no expone API pública; ya tenemos PaymentApproval visión con Claude 4.6 para superadmin |

## Referencias

- ADR-058 — WhatsApp AI-first webhook (PaymentApproval origen)
- ADR-015 — Checkout idempotency
- `checkout-flow.instructions.md` — invariantes del checkout
- Commits: `d9d34110 → 8916cd15` (10 commits en sesión 2026-05-12)
