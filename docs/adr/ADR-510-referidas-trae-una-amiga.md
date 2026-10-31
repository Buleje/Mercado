# ADR-510 — Referidas «Trae a una amiga»: premios configurables por negocio, pagados en cupones

- **Estado:** aceptado (2026-10-20). Sin schema: usa `Settings.featureFlagsJson`, `Customer.referredBy` y `Coupon`.
- **Pedido por:** Brandon (20-10): «Referidas como el manual» para todos los negocios; Musa primero. Fuente: manual de Musa («S/ 10 para la que recomienda Y S/ 10 para la recomendada, con compra mínima de S/ 59»; «los descuentos no se suman»).

## Contexto

Había tres caminos con montos fijos en el código y ninguno configurable: `ReferralsDB` (10 % a la amiga, S/ 10 a quien recomienda, 30 días) leía la tabla `Referral`, que **no existe** en la base (todas sus rutas daban 500); el camino vivo eran **puntos** (`CustomersDB.applyReferralCode` y `lib/loyalty/referral.ts`: +50); `/api/me/referral-status` decía 10 puntos por referida (mal) y su lista filtraba por código cuando `referredBy` guarda el CELULAR (siempre vacía).

## Decisión

1. **Reglas del negocio** en `featureFlagsJson.referidas` (`SettingsDB.pisarClavesFlags`): `activo`, `premioQuienRefiere` y `premioAmiga` (`{tipo: monto|porcentaje, valor}`, % ≤ 50, 0 = sin premio), `amigaRecibe` (`al_usar_codigo` | `tras_primera_compra`), `compraMinima`, `acumulable`, `vigenciaDias` (1-365). Reglas puras en `lib/referidas/reglas.ts`.
2. **Sin guardar, nada cambia:** el defecto es lo que el código tenía fijo, y mientras el negocio no guarde, las rutas públicas siguen por los puntos de siempre. Guardar es lo que enciende el motor nuevo.
3. **Quién trajo a quién:** `Customer.referredBy` (celular de quien recomienda, se escribe con `updateMany … where referredBy: null`, así dos altas a la vez no se pisan) + la fecha en `featureFlagsJson.referidasAltas[últimos 9 dígitos]` = `{por, desde}`. Sólo se anota a una clienta nueva (sin compras o con la primera hace ≤ 30 días), nunca a sí misma.
4. **Premios = cupones** (`Coupon`, `maxUses: 1`, `minPurchase` = compra mínima, vence a `vigenciaDias`), con código determinista `AMIGA-xxxxxxxx` / `GRACIAS-xxxxxxxx` (hash de tenant + celular + fecha del alta + rol) y `createMany skipDuplicates`: emitir dos veces = 0 cupones nuevos. La primera compra cuenta ventas del POS y pedidos en estados que entran, por los últimos 9 dígitos del celular.
5. **Usar el código desde la tienda** exige sesión de clienta verificada con ese mismo celular (401 si no): un desconocido no junta cupones con números ajenos. El panel anota a mano (Puntos › Más › Trae a una amiga, sólo `admin`) por celular o por código, y deshace (anula los cupones sin usar; 409 si alguno se usó).

## Consecuencias

- El cobro de la tienda ya respeta la compra mínima del cupón (`app/api/orders`). **Pendiente en zona de peligro:** `acumulable: false` todavía no se aplica al cobrar (falta llamar a `combinarConOtrosDescuentos` en `app/api/orders/route.ts`), y el cupón se acredita al abrir el panel, al consultar el estado o por `/api/referrals/complete`, no en el instante de la venta (falta `ReferralsDB.acreditar` tras completar en `lib/db/orders.db.ts` y en `app/api/sales`). La pantalla lo dice en su ⓘ.
- Los puntos por referida (+50) siguen para los negocios que no guardaron reglas.
