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
 * son la suma de las MISMAS partidas que se listan; acá nunca se re-suma.
 *
 * Patrón del panel (11-10): título + ⓘ, Indicadores plegables y «⋯» en una
 * fila; buscador y fuentes en otra, pegada a la tabla; Pagar (o Liquidar) a
 * 48 px. Frente a Compras › Por pagar (las facturas de cada proveedor) lo
 * propio de esta vista es el total de TODAS las fuentes por acreedor y lo
 * vencido primero: la lista de facturas sigue allá, enlazada desde el «⋯».
 */

import { useMemo, useState } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, MoreHorizontal, ReceiptText, RefreshCw, Scale, Search, Truck } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import TarjetaIndicador from "@/components/admin/por-cobrar/TarjetaIndicador";
import { usePorPagar } from "@/hooks/use-por-pagar";
import { ENLACE_FUENTE, ETIQUETA_FUENTE, FUENTES_POR_PAGAR, type EnlacePorPagar, type FuentePorPagar } from "@/lib/finance/por-pagar";
import FilaPorPagar from "./por-pagar/FilaPorPagar";
import { BUSCADOR, CHIP, CHIP_OFF, CHIP_ON, ESTILO, enMonedas } from "./por-pagar/estilo";

export default function PorPagarDashboard({ onIr }: { onIr?: (vista: string) => void } = {}) {
  const { data, loading, error, recargar } = usePorPagar();
  const [filtro, setFiltro] = useState<FuentePorPagar | "todo">("todo");
  const [q, setQ] = useState("");

  /* Sólo las fuentes que tienen algo: seis chips en cero eran seis botones
     muertos en una pantalla que se mira para saber a quién pagarle. */
  const fuentes = useMemo(
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

  const deFuente = (f: FuentePorPagar) => data.porFuente.filter((x) => x.fuente === f);
  const total = enMonedas(data.totales.map((t) => ({ moneda: t.moneda, monto: t.total }))) || montoEnMoneda(0, "PEN");
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

  const kpis = useKpisPlegables({
    claveMemoria: "plata-por-pagar",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && data.personas.length === 0,
    resumen: `Debes ${total}`,
    tarjetas: [
      <TarjetaIndicador key="todo" rotulo="Debes" valor={total} detalle={`a ${data.personas.length} ${data.personas.length === 1 ? "acreedor" : "acreedores"}`} icono={ReceiptText} tono="destacado" />,
      <TarjetaIndicador key="vencido" rotulo="Ya vencido" valor={enMonedas(vencido) || montoEnMoneda(0, "PEN")} detalle={vencido.length > 0 ? "Va primero en la lista" : "Nada pasado de su fecha"} icono={AlertTriangle} tono={vencido.length > 0 ? "alerta" : "normal"} />,
      ...(cruzable.length > 0
        ? [<TarjetaIndicador key="cruce" rotulo="Se cruza" valor={enMonedas(cruzable)} detalle="Esas personas también te deben: Liquidar" icono={Scale} />]
        : []),
      ...fuentes.map((f) => (
        <TarjetaIndicador
          key={f}
          rotulo={ETIQUETA_FUENTE[f].plural}
          valor={enMonedas(deFuente(f).map((x) => ({ moneda: x.moneda, monto: x.total })))}
          detalle={`${deFuente(f).reduce((s, x) => s + x.count, 0)} partida${deFuente(f).reduce((s, x) => s + x.count, 0) === 1 ? "" : "s"}`}
          icono={ESTILO[f].icon}
        />
      )),
    ],
  });

  const acciones: MenuAccion[] = [
    { id: "proveedores", label: "Facturas de proveedores", hint: "Compras › Por pagar, factura por factura", icon: Truck, onSelect: () => abrir(ENLACE_FUENTE.cuenta_por_pagar) },
    { id: "liquidar", label: "Cuenta por persona", hint: "Liquidar a quien te debe y le debes (Adelantos › Resumen)", icon: Scale, onSelect: () => abrir(ENLACE_FUENTE.cuenta_forestal) },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: recargar },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle as="h3" className="whitespace-nowrap text-[var(--text-primary)]">Lo que debo</SectionTitle>
          <InfoTip
            title="Lo que debes"
            what="Suma lo que le debes a cada uno: adelantos que te dieron, cuentas por pagar a proveedores, préstamos que te hicieron y cuentas forestales a favor de la otra parte. Cada moneda va aparte. Toca una partida para ir a pagarla donde se registra; lo vencido va primero."
            affects="El aserrío que te hicieron es parte de la cuenta de esa persona: lo que ya pagaste cubre primero la guía que nombra y después lo más viejo, así nunca se suma dos veces."
            example="Si alguien te adelantó S/ 3 000 y a la vez te debe un aserrío de S/ 500, verás su neto (le debes S/ 2 500) y el botón Liquidar."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Facturas de proveedores, cuenta por persona y actualizar" />
        </div>
      </div>

      {kpis.panel}

      {error && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-ink)]">
          No se pudo cargar lo que debes ({error}).
          <button type="button" onClick={recargar} className="min-h-12 rounded-xl px-3 underline">Reintentar</button>
        </p>
      )}
      {data.truncado && (
        <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-warning-ink)]">
          La cuenta forestal tiene más movimientos de los que entran acá: puede faltar algo.
        </p>
      )}

      {loading && data.personas.length === 0 && !error && (
        <p className="text-sm text-[var(--text-secondary)]">Cargando lo que debes…</p>
      )}
      {!loading && !error && data.personas.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
          <ReceiptText className="h-4 w-4 text-[var(--data-success-500)]" aria-hidden="true" />
          No le debes nada a nadie ahora mismo.
        </p>
      )}

      {data.personas.length > 0 && (
        <>
          {/* Buscador y fuentes en UNA fila, pegada a la tabla que filtran */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre, código o guía" aria-label="Busca por nombre, código o guía" className={BUSCADOR} />
            </div>
            {fuentes.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por de qué es la deuda">
                <button type="button" onClick={() => setFiltro("todo")} aria-pressed={filtro === "todo"} className={cn(CHIP, filtro === "todo" ? CHIP_ON : CHIP_OFF)}>
                  Todo <span className="tabular-nums text-[var(--text-tertiary)]">{data.personas.length}</span>
                </button>
                {fuentes.map((fuente) => {
                  const Icon = ESTILO[fuente].icon;
                  const activo = filtro === fuente;
                  return (
                    <button key={fuente} type="button" onClick={() => setFiltro(activo ? "todo" : fuente)} aria-pressed={activo} className={cn(CHIP, activo ? CHIP_ON : CHIP_OFF)}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {ETIQUETA_FUENTE[fuente].plural} <span className="tabular-nums text-[var(--text-tertiary)]">{deFuente(fuente).reduce((s, x) => s + x.count, 0)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* `sm:pr-14`: el mismo corredor libre que «Por cobrar» le deja al
              botón flotante de acciones rápidas. */}
          <DataTable zebra className="[&_tbody_td]:py-1" wrapperClassName="sm:pr-14">
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
                  <td colSpan={5} className="py-6 text-center text-sm font-bold text-[var(--text-secondary)]">
                    Nadie con ese filtro. Toca «Todo» para verlos a todos.
                  </td>
                </tr>
              )}
            </tbody>
          </DataTable>
        </>
      )}
    </div>
  );
}
