# ADR-509 — Rubro «Belleza y cuidado personal»

- **Estado:** aceptado (2026-10-20). Schema: valor nuevo `belleza` en `enum Industry` (migración `20261020b_industry_belleza_adr509`, expand puro).
- **Pedido por:** Brandon (20-10) eligió «Rubro Belleza» para todos los negocios y ponérselo a Musa, que figuraba como `bodega` porque el enum no lo tenía.

## Decisión

1. **Enum:** `ALTER TYPE "Industry" ADD VALUE IF NOT EXISTS 'belleza' BEFORE 'otro'`. Ninguna fila cambia; el default sigue en `bodega`. Postgres 17 lo deja correr en la transacción del aplicador; el valor no se usa en la misma transacción (no hay UPDATE en el .sql). Revertir = volver los negocios a `bodega` (Postgres no borra valores de enum).
2. **Registro de verticales** (`lib/verticals/registry.ts`): etiqueta «Belleza y cuidado personal», ícono `Sparkles`, destacados Productos · Ventas y Caja · Clientes · Canales · Metas, título «Mi Tienda de Belleza». Módulos = los de bodega menos Préstamos (su vista sigue en Mi Plata por su origen `plata`). **Se quedan** Contratos (el Archivo del drive se abre por el origen `contratos`) y Cotizaciones (venta a salones): sacar las dos le quitaba 32 pares a un negocio que sale de bodega (medido con el guardián). También se quedan y Guías de Remisión (envíos por agencia). Lo forestal no depende del rubro: lo prenden sus especializaciones.
3. **Guardián del panel** (`__tests__/panel-sin-perdida.test.ts`, bloque «rubro nuevo sin pérdida»): cada rubro nuevo se compara contra el rubro del que salen sus negocios (`belleza` ⊇ `bodega`) en barra, celular y menú, en todo plan × rol × plantilla, con la regla de hoy en los dos lados. Pérdidas = 0; altas = sólo las de `reports/panel/altas-aprobadas.json` con el rubro nuevo en el contexto (hoy ninguna).
4. **Dónde se elige / se ve:** onboarding `/setup` (opción nueva, sin «Pronto», y ejemplo de primer producto y categorías del rubro), registro de tienda del marketplace (lista = `SUPPORTED_INDUSTRIES`), plantilla «Belleza y cuidado personal» entre las plantillas por rubro del Modo creativo de la tienda, insignia de la barra lateral.
5. **Musa** pasa a `belleza` con `scripts/musa/poner-rubro-belleza.ts` (idempotente, `--simulacro`, `--volver`, respaldo en `.claude/autonomo/respaldos/`), por `TenantsDB.cambiarRubro`. **En dos tiempos:** un cliente de Prisma generado antes del valor nuevo tira «Value 'belleza' not found in enum 'Industry'» al leer esa fila (y los listados de todos los negocios que traen `industry`). Por eso el dato se escribe sólo con el dev server reiniciado después del `generate` (el script lo revisa y no escribe si no) y con producción desplegada con el cliente nuevo (flag `--prod-al-dia`, porque comparte la base).

## Consecuencias

- Un negocio belleza ve exactamente lo que veía como bodega (116 pares en Enterprise · admin · plantilla global, con el supuesto del guardián de todas las especializaciones encendidas); cambia el orden destacado y los textos.
- Quedan fuera, a propósito: la taxonomía del marketplace (`Store.category`, `lib/constants/marketplace-categories.ts`) no tiene «belleza» — es otra lista (categorías de tienda, no rubro del panel); la sección de la landing `RubroSwitcher`; y Planificación, que elige su plantilla «belleza» por el texto de la ficha (`rubroDeTexto`), no por `Tenant.industry`.
