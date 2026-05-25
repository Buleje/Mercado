# ADR-117: Módulo Adelantos & Liquidaciones

**Fecha:** 2026-05-25 · **Estado:** Aceptado · **Autor:** Brandon + Claude

## Contexto
Brandon da **adelantos de dinero a personas (proveedores/trabajadores) por servicios** y los
liquida a medida que la persona le entrega producto o servicio. Los módulos existentes no cubren
este caso: `Prestamo` es dinero con cuotas+interés, `Fiado` es crédito a clientes, `Treasury` es
libro de caja. Faltaba un "saldo a favor del negocio que se consume con entregas valuadas".

## Decisión
Nuevo módulo **Adelantos** (tab `adelantos`), independiente, sin tocar Tesorería.

**Modelo de datos** (5 objetos additivos, migración `adelantos_liquidaciones`):
- `AdelantoBeneficiario` — persona/proveedor del módulo (nombre, doc, teléfono). Saldo consolidado.
- `Adelanto` — monto adelantado + `saldoPendiente` (mantenido por backend) + `modalidad`
  (`CUENTA_CORRIENTE` | `ENTREGAS_PACTADAS`) + `status` (`ABIERTO`/`LIQUIDADO`/`EXCEDIDO`/`CANCELADO`).
- `AdelantoEntrega` — liquidación que reduce el saldo: `tipo` (`LIBRE` | `PRODUCTO`), `valor` (S/
  **siempre calculado en backend**), `productId?` (referencia suelta a Product, sin relación formal),
  `sumadoAStock`.
- `AdelantoEntregaPactada` — plan de entregas esperadas (modalidad pactada), con link 1:1 a la entrega real.

**State machine de liquidación** (atómica, `prisma.$transaction` en `AdelantosDB.registrarEntrega`):
`saldoPendiente = montoAdelantado − Σ entregas.valor`; `>0 → ABIERTO`, `==0 → LIQUIDADO`,
`<0 → EXCEDIDO` (el negocio le debe a la persona). El valor de entregas PRODUCTO se calcula
`precio × cantidad` desde el catálogo (override manual opcional); incremento de stock opcional.

## Consecuencias
- (+) Cubre el caso real con doble modalidad, entregas libres o por catálogo, y saldo en tiempo real.
- (+) Seguro: `tenantId` 1er param en todo, CSRF + rate-limit + Zod en endpoints, totales backend
  (anti-fraude regla #6), `$transaction` atómico. Verificado e2e (saldo/status/excedido/aislamiento/CSRF).
- (+) Rápido: índices `(tenantId,status)`, `(tenantId,fechaAdelanto)`, `(beneficiarioId)`, `(adelantoId,...)`.
- (−) `productId` sin FK formal (desacople de Product) → integridad referencial app-level.
- Deuda/follow-ups: integración con Tesorería (egreso), recordatorios WhatsApp, documentos adjuntos,
  tests Vitest del módulo, charts de evolución en Resumen.

## Alternativas descartadas
- Extender `Prestamo` con un tipo nuevo: contaminaba la lógica de cuotas+interés/amortización.
- Usar `Treasury` movimientos: no modela el saldo a favor por persona ni la liquidación por entregas.

## Referencias
- `prisma/schema.prisma` (modelos Adelanto*), `lib/db/adelantos.db.ts`, `app/api/adelantos/**`,
  `components/admin/adelantos/AdelantosModule.tsx`. Patrón espejo de `lib/db/prestamos.db.ts`.
