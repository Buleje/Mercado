"use client";

/**
 * Tesorería — dónde está la plata hoy: cada cuenta de banco, la caja física y
 * las billeteras, con su saldo, y lo que entró y salió de cada una.
 *
 * ANTES (hasta 2026-09-29) esta vista se llamaba Tesorería pero no leía la
 * tesorería: pintaba ventas, fiados y cuentas por pagar con fórmulas propias,
 * y las cuentas cargadas (en `main`, BCP S/ 15 000 y caja chica S/ 5 500) no
 * aparecían en ningún lado. Lo que mostraba tiene hoy su casa, medida:
 *   · saldo del mes, ingresos y gastos → Resumen (`/api/finanzas/monthly-summary`);
 *   · vencimientos de cuentas por pagar → Por cobrar › Lo que debo;
 *   · fiados pendientes con recordatorio por WhatsApp → Por cobrar › Fiados;
 *   · flujo de 30 días → Movimientos › Caja (la proyección de 13 semanas).
 *
 * Todo sale de `/api/treasury/*` vía `useTesoreria`; los totales los suma el
 * servidor (`/api/treasury/resumen`). SÓLO LECTURA: ver el porqué en el hook.
 */

import { useCallback, useMemo, useState } from "react";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { Landmark, RefreshCw } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { TOPE_MOVIMIENTOS, useTesoreria } from "@/hooks/use-tesoreria";
import TarjetaCuenta from "@/components/admin/unified/finanzas/tesoreria/TarjetaCuenta";
import MovimientosTesoreria from "@/components/admin/unified/finanzas/tesoreria/MovimientosTesoreria";
import { CHIP, CHIP_OFF, enMonedas } from "@/components/admin/unified/finanzas/tesoreria/estilo";

const AVISO_ERROR = "rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const AVISO_NEUTRO = "flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]";

export default function TreasuryDashboard() {
  /** La cuenta cuyos movimientos se miran; `null` = todas. */
  const [elegida, setElegida] = useState<string | null>(null);
  const { cuentas, resumen, movimientos, transferencias, recargar } = useTesoreria(elegida);

  const lista = useMemo(() => cuentas.datos ?? [], [cuentas.datos]);
  /* Las dadas de baja van al final: su historia sigue, pero no suman. */
  const ordenadas = useMemo(() => [...lista.filter((c) => c.activa), ...lista.filter((c) => !c.activa)], [lista]);
  const monedas = useMemo(() => new Map(lista.map((c) => [c.id, c.moneda])), [lista]);
  const notas = useMemo(
    () => new Map((transferencias.datos ?? []).map((t) => [t.id, t.descripcion.trim()])),
    [transferencias.datos],
  );
  const monedaDe = useCallback((id: string) => monedas.get(id) ?? "PEN", [monedas]);
  const notaDe = useCallback((id: string | null) => (id ? notas.get(id) || null : null), [notas]);

  /* Mientras llega el pedido de la cuenta recién elegida, lo que ya estaba se
     filtra a esa cuenta: el cambio se ve al instante y no muestra otra. */
  const filas = (movimientos.datos ?? []).filter((m) => !elegida || m.cuentaId === elegida);
  const cuentaElegida = lista.find((c) => c.id === elegida) ?? null;

  const r = resumen.datos;
  const porMoneda = r?.saldoPorMoneda ?? {};
  const unaMoneda = Object.keys(porMoneda).length <= 1 ? (Object.keys(porMoneda)[0] ?? "PEN") : null;
  const error = cuentas.error ?? resumen.error;
  const cargando = cuentas.cargando || resumen.cargando || movimientos.cargando;
  const sinCuentas = !cuentas.cargando && !cuentas.error && lista.length === 0;

  return (
    <div className="space-y-5">
      {/* Una sola fila: la cifra y «Actualizar». Dentro de Mi Plata no va
          cabecera propia (el título del hub ya está arriba). */}
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          {r && r.cuentasActivas > 0 ? (
            <>
              <SectionTitle as="h3">Tienes</SectionTitle>
              <span className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{enMonedas(porMoneda)}</span>
              <span className="text-sm text-[var(--text-tertiary)]">
                en {r.cuentasActivas} {r.cuentasActivas === 1 ? "cuenta" : "cuentas"}
              </span>
              {/* El mes del resumen suma todas las monedas juntas: sólo se
                  muestra si hay una sola. */}
              {unaMoneda && (r.ingresosMes > 0 || r.egresosMes > 0) && (
                <span className="text-sm font-semibold text-[var(--text-secondary)]">
                  · este mes entró {montoEnMoneda(r.ingresosMes, unaMoneda)} y salió {montoEnMoneda(r.egresosMes, unaMoneda)}
                </span>
              )}
            </>
          ) : (
            <SectionTitle as="h3">Tus cuentas</SectionTitle>
          )}
          <InfoTip
            title="Tesorería"
            what="Lo que hay hoy en cada cuenta de banco, en tu caja física y en tus billeteras digitales, sumado por moneda. Las cuentas dadas de baja se ven al final y no suman."
            affects="La proyección de caja (Movimientos › Caja) arranca con esta suma. Sin cuentas cargadas, la estima con lo vendido menos lo gastado en los últimos 30 días."
            example="BCP con S/ 15 000 y la caja chica con S/ 5 500: tienes S/ 20 500. Toca una cuenta para ver solo sus movimientos."
          />
        </div>
        <button
          type="button"
          onClick={recargar}
          className="shrink-0 rounded-xl p-2 text-[var(--text-tertiary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          title="Actualizar"
          aria-label="Actualizar las cuentas y sus movimientos"
        >
          <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} aria-hidden="true" />
        </button>
      </div>

      {error && <p className={AVISO_ERROR}>No se pudieron cargar tus cuentas: {error}</p>}

      {cuentas.cargando && lista.length === 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Cargando tus cuentas">
          {[0, 1].map((i) => <div key={i} className="h-32 animate-pulse rounded-xl bg-[var(--surface-sunken)]" />)}
        </div>
      )}

      {sinCuentas && (
        <p className={AVISO_NEUTRO}>
          <Landmark className="h-4 w-4 text-[var(--text-tertiary)]" aria-hidden="true" />
          Todavía no hay cuentas de banco, caja ni billeteras registradas.
        </p>
      )}

      {ordenadas.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordenadas.map((c) => (
            <TarjetaCuenta
              key={c.id}
              cuenta={c}
              elegida={c.id === elegida}
              onElegir={(id) => setElegida((e) => (e === id ? null : id))}
            />
          ))}
        </div>
      )}

      {lista.length > 0 && (
        <section className="space-y-3" aria-labelledby="tesoreria-movimientos">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <CardTitle id="tesoreria-movimientos">
              {cuentaElegida ? `Movimientos de ${cuentaElegida.nombre}` : "Movimientos"}
            </CardTitle>
            {cuentaElegida && (
              <button type="button" onClick={() => setElegida(null)} className={cn(CHIP, CHIP_OFF)}>
                Ver todas las cuentas
              </button>
            )}
          </div>

          {movimientos.error && <p className={AVISO_ERROR}>No se pudieron cargar los movimientos: {movimientos.error}</p>}
          {movimientos.cargando && filas.length === 0 && !movimientos.error && (
            <p className="text-sm text-[var(--text-tertiary)]">Cargando los movimientos…</p>
          )}
          {!movimientos.cargando && !movimientos.error && filas.length === 0 && (
            <p className={AVISO_NEUTRO}>
              {cuentaElegida ? `${cuentaElegida.nombre} no tiene movimientos todavía.` : "Tus cuentas no tienen movimientos todavía."}
            </p>
          )}
          {filas.length > 0 && (
            <MovimientosTesoreria movimientos={filas} monedaDe={monedaDe} notaDe={notaDe} conCuenta={!cuentaElegida} />
          )}
          {filas.length >= TOPE_MOVIMIENTOS && (
            <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
              Son los últimos {TOPE_MOVIMIENTOS}. Toca una cuenta para ver solo los suyos.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
