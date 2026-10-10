"use client";

/**
 * PorPagarDashboard — «Lo que debo»: la lista hermana de «Por cobrar» (F10).
 *
 * Desde ADR-448 lo RECIBIDO salió de «Por cobrar» y ninguna vista lo tomaba;
 * tampoco las cuentas por pagar con su saldo, el aserrío que te hicieron ni la
 * cuenta forestal que quedó a favor de otro. Esta vista es la de «Por cobrar»
 * mirada del otro lado: una fila por acreedor con su total y el desglose por
 * fuente, cada partida lleva a su origen y lo vencido va primero.
 *
 * Todas las cifras salen del backend (`/api/finanzas/por-pagar`): los totales
 * son la suma de las MISMAS partidas que se listan y el chip activo sólo decide
 * cuál se muestra, nunca se re-suma acá.
 */

import { useMemo, useState } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { ReceiptText, RefreshCw, Search } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { usePorPagar } from "@/hooks/use-por-pagar";
import { ETIQUETA_FUENTE, FUENTES_POR_PAGAR, type EnlacePorPagar, type FuentePorPagar } from "@/lib/finance/por-pagar";
import FilaPorPagar from "./por-pagar/FilaPorPagar";
import { CHIP, CHIP_OFF, CHIP_ON, ESTILO, enMonedas } from "./por-pagar/estilo";

export default function PorPagarDashboard({ onIr }: { onIr?: (vista: string) => void } = {}) {
  const { data, loading, error, recargar } = usePorPagar();
  const [filtro, setFiltro] = useState<FuentePorPagar | "todo">("todo");
  const [q, setQ] = useState("");

  /* Sólo las fuentes que tienen algo: seis chips en cero eran seis botones
     muertos en una pantalla que se mira para saber a quién pagarle. */
  const chips = useMemo(
    () => FUENTES_POR_PAGAR.filter((f) => data.porFuente.some((x) => x.fuente === f && x.count > 0)),
    [data.porFuente],
  );

  const filas = useMemo(() => {
    const texto = q.trim().toLowerCase();
    return data.personas.filter((p) => {
      if (filtro !== "todo" && !p.partidas.some((x) => x.fuente === filtro)) return false;
      if (!texto) return true;
      return `${p.nombre} ${p.partidas.map((x) => x.nota ?? "").join(" ")}`.toLowerCase().includes(texto);
    });
  }, [data.personas, filtro, q]);

  const cifra = filtro === "todo"
    ? { montos: data.totales.map((t) => ({ moneda: t.moneda, monto: t.total })), count: data.personas.length, rotulo: "Debes" }
    : {
        montos: data.porFuente.filter((f) => f.fuente === filtro).map((f) => ({ moneda: f.moneda, monto: f.total })),
        count: data.porFuente.filter((f) => f.fuente === filtro).reduce((s, f) => s + f.count, 0),
        rotulo: `Debes en ${ETIQUETA_FUENTE[filtro].plural.toLowerCase()}`,
      };
  const vencido = data.totales.filter((t) => t.vencido > 0).map((t) => ({ moneda: t.moneda, monto: t.vencido }));
  const cruzable = data.totales.filter((t) => t.cruzable > 0).map((t) => ({ moneda: t.moneda, monto: t.cruzable }));

  /** Sección de Mi Plata → cambio de vista sin recargar; otro módulo → `admin:navigate`. */
  const abrir = (e: EnlacePorPagar) => {
    if (e.tab === "plata" && e.vista && onIr) {
      /* La sub-vista del módulo anidado (Adelantos) viaja en `?sub=`: se deja
         escrita ANTES de cambiar de vista, que es cuando ese módulo la lee. */
      try {
        const url = new URL(window.location.href);
        if (e.sub) url.searchParams.set("sub", e.sub);
        else url.searchParams.delete("sub");
        window.history.replaceState(null, "", url.toString());
      } catch {
        /* sin history: cae en la vista, sin sub-vista */
      }
      onIr(e.vista);
      return;
    }
    window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: e.tab, vista: e.vista, sub: e.sub } }));
  };

  return (
    <div className="space-y-4">
      {/* Una sola fila: la cifra (o el título, si no hay nada) y «Actualizar».
          Sin cabecera propia: dentro de Mi Plata un encabezado anidado no se
          dibuja y el botón quedaba solo en una fila. */}
      <div className="flex items-start gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-1">
          {data.personas.length > 0 ? (
            <>
              <SectionTitle as="h3">{cifra.rotulo}</SectionTitle>
              <span className="text-2xl font-extrabold tabular-nums text-[var(--text-primary)]">{enMonedas(cifra.montos) || montoEnMoneda(0, "PEN")}</span>
              <span className="text-sm text-[var(--text-tertiary)]">
                a {cifra.count} {filtro === "todo" ? (cifra.count === 1 ? "acreedor" : "acreedores") : (cifra.count === 1 ? "cuenta" : "cuentas")}
              </span>
              {filtro === "todo" && vencido.length > 0 && (
                <span className="text-sm font-bold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">· {enMonedas(vencido)} ya vencido</span>
              )}
              {filtro === "todo" && cruzable.length > 0 && (
                <span className="text-sm font-semibold text-[var(--text-secondary)]">· {enMonedas(cruzable)} se cruza en Liquidar</span>
              )}
              <InfoTip
                title="Lo que debes"
                what="Suma lo que le debes a cada uno: adelantos que te dieron, cuentas por pagar, préstamos que te hicieron y cuentas forestales a favor de la otra parte. Cada moneda va aparte. Toca una partida para ir a pagarla donde se registra."
                affects="El aserrío que te hicieron es parte de la cuenta de esa persona: lo que ya pagaste cubre primero la guía que nombra y después lo más viejo, así nunca se suma dos veces."
                example="Si alguien te adelantó S/ 3 000 y a la vez te debe un aserrío de S/ 500, verás su neto (le debes S/ 2 500) y el botón Liquidar."
              />
            </>
          ) : (
            <SectionTitle as="h3">Lo que debo</SectionTitle>
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
          No se pudo cargar lo que debes ({error}). Toca actualizar para reintentar.
        </p>
      )}
      {data.truncado && (
        <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          La cuenta forestal tiene más movimientos de los que entran acá: puede faltar algo.
        </p>
      )}

      {loading && data.personas.length === 0 && !error && (
        <p className="text-sm text-[var(--text-tertiary)]">Cargando lo que debes…</p>
      )}
      {!loading && !error && data.personas.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
          <ReceiptText className="h-4 w-4 text-[var(--data-success-500)]" aria-hidden="true" />
          No le debes nada a nadie ahora mismo: ni adelantos recibidos, ni proveedores, ni préstamos, ni cuentas forestales a favor de otro.
        </p>
      )}

      {data.personas.length > 0 && (
        <>
          {/* Chips por fuente: filtran y muestran su cifra */}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFiltro("todo")} aria-pressed={filtro === "todo"} className={cn(CHIP, filtro === "todo" ? CHIP_ON : CHIP_OFF)}>
              Todo · {enMonedas(data.totales.map((t) => ({ moneda: t.moneda, monto: t.total })))}
            </button>
            {chips.map((fuente) => {
              const Icon = ESTILO[fuente].icon;
              const activo = filtro === fuente;
              const deEsta = data.porFuente.filter((f) => f.fuente === fuente);
              return (
                <button
                  key={fuente}
                  onClick={() => setFiltro(activo ? "todo" : fuente)}
                  aria-pressed={activo}
                  className={cn(CHIP, activo ? CHIP_ON : CHIP_OFF)}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  {ETIQUETA_FUENTE[fuente].plural} · {enMonedas(deEsta.map((f) => ({ moneda: f.moneda, monto: f.total })))}
                  <span className="text-[length:var(--ts-xs)] font-black tabular-nums text-[var(--text-tertiary)]">{deEsta.reduce((s, f) => s + f.count, 0)}</span>
                </button>
              );
            })}
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Busca por nombre, código o guía"
              aria-label="Busca por nombre, código o guía"
              className="h-11 w-full rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] pl-11 pr-4 text-sm font-medium text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-muted)]"
            />
          </div>

          {/* `sm:pr-14`: el mismo corredor libre que «Por cobrar» le deja al
              botón flotante de acciones rápidas. */}
          <DataTable zebra wrapperClassName="sm:pr-14">
            <thead>
              <tr>
                <th>A quién le debes</th>
                <th>De qué</th>
                <th className="text-right">Total</th>
                <th>Vence</th>
                <th><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {filas.map((p) => (
                <FilaPorPagar key={p.clave} persona={p} hoy={data.hoy} onAbrir={abrir} />
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-6 text-center text-sm font-bold text-[var(--text-tertiary)]">
                    Nadie con ese filtro. Toca «Todo» para verlos a todos.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>

          <p className="text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            Mostrando {filas.length} de {data.personas.length}.
          </p>
        </>
      )}
    </div>
  );
}
