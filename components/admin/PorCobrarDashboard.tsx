"use client";

/**
 * PorCobrarDashboard — la lista única de lo que te deben.
 *
 * Era un tablero de cuatro tarjetas que sólo sumaban y enlazaban: para ver UNA
 * deuda había que entrar a otra pestaña (Brandon 2026-09-21: «una sola vista
 * compacta, para reducir el tiempo de ir buscando cada uno»). Ahora la vista ES
 * la tabla: una fila por deuda, ordenada por urgencia de cobranza, con las
 * cifras en una línea y en los chips que filtran. Todas salen del backend
 * (`?detalle=1` deriva el resumen de las MISMAS filas que lista: la cabecera no
 * puede decir un número que la tabla no sume).
 *
 * F12 (2026-09-29): cada monto va en su moneda (antes todo se sumaba como
 * soles) y quien también está en «Lo que debo» muestra el cruce —te debe · le
 * debes · neto, las cifras de esa lista— con su botón Liquidar.
 *
 * Lo que NO cambia: el cobro se registra en cada módulo y cada fila lleva ahí.
 * La madera vive en el Libro CTP (otro módulo): ese salto lo recarga entero.
 */

import { useMemo, useState } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { Wallet, RefreshCw, Search } from "@buleje/design-system/icons";
import { cn, limaDateKey } from "@/lib/utils";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { usePorCobrar } from "@/hooks/use-por-cobrar";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import { ACCION_LIQUIDAR, PARAM_ACCION, PARAM_PERSONA } from "@/components/admin/adelantos/cuentas/liquidar-por-url";
import type { PorCobrarTipo } from "@/lib/db/por-cobrar.db";
import FilaPorCobrar from "./por-cobrar/FilaPorCobrar";
import { CHIP, CHIP_OFF, CHIP_ON, ORDEN, TIPOS, enMonedas } from "./por-cobrar/estilo";

/** Salto a otro módulo del panel: recarga el módulo destino entero. */
function goTab(tab: string) {
  window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab } }));
}

/**
 * Liquidar la cuenta de una persona: el modal vive en «Cuenta por persona»
 * (Adelantos → Resumen) y se abre con `?accion=liquidar&persona=<clave>`, la
 * misma URL que manda la Caja de Mi Plata.
 */
function irALiquidar(clave: string) {
  irAlOrigen({ tab: "plata", params: { vista: "adelantos", [PARAM_ACCION]: ACCION_LIQUIDAR, [PARAM_PERSONA]: clave } });
}

export default function PorCobrarDashboard({ onIr }: { onIr?: (seccion: string) => void } = {}) {
  const { data, loading, error, recargar } = usePorCobrar();
  const [filtro, setFiltro] = useState<PorCobrarTipo | "todo">("todo");
  const [q, setQ] = useState("");

  const hoy = limaDateKey();
  const filas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return data.items.filter((f) => {
      if (filtro !== "todo" && f.tipo !== filtro) return false;
      if (!texto) return true;
      return `${f.quien} ${f.nota ?? ""}`.toLowerCase().includes(texto);
    });
  }, [data.items, filtro, q]);
  const crucePorClave = useMemo(() => new Map(data.cruces.map((c) => [c.clave, c])), [data.cruces]);

  /* Las cifras SIEMPRE salen del backend: el chip activo manda cuál se muestra,
     nunca se re-suma en el navegador. Cada moneda, aparte. */
  const deTipo = (tipo: PorCobrarTipo) => data.porTipo.filter((x) => x.tipo === tipo);
  const cifra = filtro === "todo"
    ? { montos: data.totales.map((t) => ({ moneda: t.moneda, monto: t.total })), count: data.items.length, rotulo: "Te deben" }
    : {
        montos: deTipo(filtro).map((x) => ({ moneda: x.moneda, monto: x.total })),
        count: deTipo(filtro).reduce((s, x) => s + x.count, 0),
        rotulo: `Te deben en ${TIPOS[filtro].plural.toLowerCase()}`,
      };

  /** Sección hermana → salto instantáneo; otro módulo (o sin padre) → recarga. */
  const irASeccion = (destino: string, externo = false) => {
    if (onIr && !externo) onIr(destino);
    else goTab(destino);
  };

  return (
    <div className="space-y-4">
      {/* Una sola fila: la cifra (o el título, si no hay nada) y «Actualizar».
          Sin cabecera propia: dentro de Mi Plata un encabezado anidado no pinta
          el título y el botón quedaba solo en una fila (igual que en «Lo que debo»). */}
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          {data.items.length > 0 ? (
            <>
              <SectionTitle as="h3">{cifra.rotulo}</SectionTitle>
              <span className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{enMonedas(cifra.montos) || montoEnMoneda(0, "PEN")}</span>
              <span className="text-sm text-[var(--text-tertiary)]">
                en {cifra.count} cuenta{cifra.count === 1 ? "" : "s"}
              </span>
              {filtro === "todo" && data.cruzable.length > 0 && (
                <span className="text-sm font-semibold text-[var(--text-secondary)]">· {enMonedas(data.cruzable)} también les debes a esas personas</span>
              )}
              <InfoTip
                title="Lo que te deben"
                what="Suma lo que te debe cada uno: fiados, préstamos que diste, adelantos que diste y madera despachada a cuenta. Cada moneda va aparte. «Cobrar» te lleva al módulo donde se registra el cobro; la madera se cobra desde la cuenta corriente del Libro CTP. El botón del medidor abre el scoring del cliente, que sale de todo su historial y no sólo de esa deuda."
                affects="Si esa persona también está en «Lo que debo», su fila muestra cuánto te debe, cuánto le debes y el neto, con el botón Liquidar. El total no resta nada: lo que tú le debes sigue en «Lo que debo»."
                example="Si te deben S/ 12 323 por madera y a esa misma persona le debes S/ 3 031 de un adelanto que te dio, verás «Neto: te debe S/ 9 292» y Liquidar."
              />
            </>
          ) : (
            <SectionTitle as="h3">Por cobrar</SectionTitle>
          )}
        </div>
        <button
          onClick={recargar}
          className="shrink-0 rounded-xl p-2 text-[var(--text-tertiary)] transition-colors hover:bg-primary/10 hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          title="Actualizar"
          aria-label="Actualizar la lista"
        >
          <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
        </button>
      </div>

      {error && (
        <p className="rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          No se pudo cargar lo que te deben ({error}). Toca actualizar para reintentar.
        </p>
      )}
      {!error && !data.crucesDisponibles && data.items.length > 0 && (
        <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          No se pudo cruzar con lo que debes: la lista está completa, pero sin los netos.
        </p>
      )}

      {loading && data.items.length === 0 && !error && (
        <p className="text-sm text-[var(--text-tertiary)]">Cargando lo que te deben…</p>
      )}
      {!loading && !error && data.items.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
          <Wallet className="h-4 w-4 text-[var(--data-success-500)]" aria-hidden="true" />
          Nadie te debe nada ahora mismo: ni fiados, ni préstamos, ni adelantos, ni madera despachada a cuenta.
        </p>
      )}

      {data.items.length > 0 && (
        <>
          {/* Chips por tipo: filtran y muestran su cifra, cada moneda aparte */}
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFiltro("todo")}
              aria-pressed={filtro === "todo"}
              className={cn(CHIP, filtro === "todo" ? CHIP_ON : CHIP_OFF)}
            >
              Todo · {enMonedas(data.totales.map((t) => ({ moneda: t.moneda, monto: t.total })))}
            </button>
            {ORDEN.map((tipo) => {
              const t = TIPOS[tipo];
              const deEste = deTipo(tipo);
              const cuantos = deEste.reduce((s, x) => s + x.count, 0);
              const Icon = t.icon;
              const activo = filtro === tipo;
              return (
                <button
                  key={tipo}
                  onClick={() => setFiltro(activo ? "todo" : tipo)}
                  aria-pressed={activo}
                  disabled={cuantos === 0}
                  className={cn(CHIP, activo ? CHIP_ON : CHIP_OFF, cuantos === 0 && "cursor-not-allowed opacity-45")}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {t.plural} · {enMonedas(deEste.map((x) => ({ moneda: x.moneda, monto: x.total }))) || montoEnMoneda(0, "PEN")}
                  <span className="text-[length:var(--ts-xs)] font-black tabular-nums text-[var(--text-tertiary)]">{cuantos}</span>
                </button>
              );
            })}
          </div>

          {/* Buscador pegado a la tabla que filtra */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca por nombre o detalle"
              aria-label="Busca por nombre o detalle"
              className="h-11 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
            />
          </div>

          {/* `sm:pr-14`: el botón flotante «Abrir acciones rápidas» es fixed en
              x 1200-1256 y se comía 45 de los 82 px del «Cobrar» de la fila que
              quedara a esa altura (medido con `elementFromPoint`). En una lista
              cuyo único gesto es cobrar, ese corredor tiene que quedar libre. */}
          <DataTable zebra wrapperClassName="sm:pr-14">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Quién te debe</th>
                <th className="text-right">Monto</th>
                <th>Desde</th>
                <th>Vence</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <FilaPorCobrar
                  key={`${f.tipo}-${f.id}-${f.moneda}`}
                  fila={f}
                  hoy={hoy}
                  cruce={(f.cruce && crucePorClave.get(f.cruce)) || null}
                  onCobrar={() => irASeccion(TIPOS[f.tipo].destino, TIPOS[f.tipo].externo)}
                  onScoring={() => irASeccion("scoring")}
                  onLiquidar={irALiquidar}
                />
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm font-bold text-[var(--text-tertiary)]">
                    Ninguna cuenta con ese filtro. Toca «Todo» para verlas todas.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>

          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            Mostrando {filas.length} de {data.items.length} cuentas.
          </p>
        </>
      )}
    </div>
  );
}
