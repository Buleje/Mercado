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
 *
 * Patrón del panel (11-10): título + ⓘ, Indicadores plegables (la cifra de
 * cada tipo) y «⋯» en una fila; buscador y tipos en otra, pegada a la tabla;
 * en cada fila Cobrar (o Liquidar) a 48 px y «⋯». La tarjeta de los fiados que
 * repetía la cifra de su chip se fue: su cifra está en los Indicadores y el
 * salto a Me deben, en el «⋯». Lo propio de esta vista frente a Me deben,
 * Adelantos y Préstamos es el total de TODAS las fuentes y el orden de cobro
 * (lo vencido primero): las listas de cada módulo siguen en su módulo.
 */

import { useMemo, useState } from "react";
import { DataTable, SectionTitle } from "@buleje/design-system";
import { DollarSign, Gauge, HandCoins, Landmark, MoreHorizontal, RefreshCw, Scale, Search, Trees, Wallet } from "@buleje/design-system/icons";
import { cn, limaDateKey } from "@/lib/utils";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { usePorCobrar } from "@/hooks/use-por-cobrar";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import { ACCION_LIQUIDAR, PARAM_ACCION, PARAM_PERSONA } from "@/components/admin/adelantos/cuentas/liquidar-por-url";
import type { PorCobrarTipo } from "@/lib/db/por-cobrar.db";
import FilaPorCobrar from "./por-cobrar/FilaPorCobrar";
import TarjetaIndicador from "./por-cobrar/TarjetaIndicador";
import { ME_DEBEN } from "./por-cobrar/FiadosEnVentasYCaja";
import { BUSCADOR, CHIP, CHIP_OFF, CHIP_ON, ORDEN, TIPOS, enMonedas } from "./por-cobrar/estilo";

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

const ICONO_TIPO: Record<PorCobrarTipo, typeof Wallet> = { fiado: HandCoins, prestamo: Landmark, adelanto: DollarSign, madera: Trees };
/** Dónde se cobra cada tipo: la línea chica de su tarjeta. */
const DONDE_SE_COBRA: Record<PorCobrarTipo, string> = {
  fiado: "en Ventas y caja › Me deben",
  prestamo: "en Préstamos",
  adelanto: "en Adelantos",
  madera: "en la cuenta del Libro CTP",
};

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

  /* Las cifras SIEMPRE salen del backend: nunca se re-suma en el navegador.
     Cada moneda, aparte. */
  const deTipo = (tipo: PorCobrarTipo) => data.porTipo.filter((x) => x.tipo === tipo);
  const cuantosDe = (tipo: PorCobrarTipo) => deTipo(tipo).reduce((s, x) => s + x.count, 0);
  const total = enMonedas(data.totales.map((t) => ({ moneda: t.moneda, monto: t.total }))) || montoEnMoneda(0, "PEN");
  /* Sólo los tipos que tienen algo: un chip en cero es un botón muerto. */
  const tipos = ORDEN.filter((t) => cuantosDe(t) > 0);

  /** Sección hermana → salto instantáneo; vista de otro módulo → su enlace; otro módulo (o sin padre) → recarga. */
  const irASeccion = (destino: string, externo = false, vista?: string) => {
    if (onIr && !externo) onIr(destino);
    else if (vista) irAlOrigen({ tab: destino, params: { vista } });
    else goTab(destino);
  };

  const kpis = useKpisPlegables({
    claveMemoria: "plata-por-cobrar",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: loading && data.items.length === 0,
    resumen: `Te deben ${total}`,
    tarjetas: [
      <TarjetaIndicador key="todo" rotulo="Te deben" valor={total} detalle={`en ${data.items.length} cuenta${data.items.length === 1 ? "" : "s"}`} icono={Wallet} tono="destacado" />,
      /* Sólo los tipos con algo pendiente, como los chips: una tarjeta en S/ 0,00 no dice nada. */
      ...tipos.map((tipo) => (
        <TarjetaIndicador
          key={tipo}
          rotulo={TIPOS[tipo].plural}
          valor={enMonedas(deTipo(tipo).map((x) => ({ moneda: x.moneda, monto: x.total })))}
          detalle={`${cuantosDe(tipo)} ${cuantosDe(tipo) === 1 ? "cuenta" : "cuentas"} · se cobra ${DONDE_SE_COBRA[tipo]}`}
          icono={ICONO_TIPO[tipo]}
        />
      )),
      ...(data.cruzable.length > 0
        ? [<TarjetaIndicador key="cruce" rotulo="Se cruza" valor={enMonedas(data.cruzable)} detalle="También les debes a esas personas: Liquidar" icono={Scale} />]
        : []),
    ],
  });

  const acciones: MenuAccion[] = [
    { id: "me-deben", label: "Ver los fiados", hint: "Ventas y caja › Me deben, donde se cobran", icon: HandCoins, onSelect: () => irAlOrigen({ tab: ME_DEBEN.tab, params: { ...ME_DEBEN.params } }) },
    { id: "adelantos", label: "Ver los adelantos", hint: "Mi Plata › Adelantos", icon: DollarSign, onSelect: () => irASeccion("adelantos") },
    { id: "prestamos", label: "Ver los préstamos", hint: "Mi Plata › Préstamos", icon: Landmark, onSelect: () => irASeccion("prestamos") },
    { id: "fiarle", label: "A quién fiarle", hint: "Sí, con cuidado o no, cliente por cliente", icon: Gauge, onSelect: () => irASeccion("scoring") },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: recargar },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle as="h3" className="whitespace-nowrap text-[var(--text-primary)]">Todo lo que me deben</SectionTitle>
          <InfoTip
            title="Lo que te deben"
            what="Suma lo que te debe cada uno: fiados, préstamos que diste, adelantos que diste y madera despachada a cuenta. Cada moneda va aparte. «Cobrar» te lleva al módulo donde se registra el cobro; la madera se cobra desde la cuenta corriente del Libro CTP. Lo vencido va primero."
            affects="Si esa persona también está en «Lo que debo», su fila muestra cuánto te debe, cuánto le debes y el neto, con el botón Liquidar. El total no resta nada: lo que tú le debes sigue en «Lo que debo»."
            example="Si te deben S/ 12 323 por madera y a esa misma persona le debes S/ 3 031 de un adelanto que te dio, verás «Neto: te debe S/ 9 292» y Liquidar."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Fiados, adelantos, préstamos, a quién fiarle y actualizar" />
        </div>
      </div>

      {kpis.panel}

      {error && (
        <p className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-error-ink)]">
          No se pudo cargar lo que te deben ({error}).
          <button type="button" onClick={recargar} className="min-h-12 rounded-xl px-3 underline">Reintentar</button>
        </p>
      )}
      {!error && !data.crucesDisponibles && data.items.length > 0 && (
        <p className="rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-4 py-3 text-sm font-bold text-[var(--data-warning-ink)]">
          No se pudo cruzar con lo que debes: la lista está completa, pero sin los netos.
        </p>
      )}

      {loading && data.items.length === 0 && !error && (
        <p className="text-sm text-[var(--text-secondary)]">Cargando lo que te deben…</p>
      )}
      {!loading && !error && data.items.length === 0 && (
        <p className="flex items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3 text-sm font-bold text-[var(--text-secondary)]">
          <Wallet className="h-4 w-4 text-[var(--data-success-500)]" aria-hidden="true" />
          Nadie te debe nada ahora mismo.
        </p>
      )}

      {data.items.length > 0 && (
        <>
          {/* Buscador y tipos en UNA fila, pegada a la tabla que filtran */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[14rem] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden="true" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Busca por nombre o detalle" aria-label="Busca por nombre o detalle" className={BUSCADOR} />
            </div>
            {tipos.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por tipo de deuda">
                <button type="button" onClick={() => setFiltro("todo")} aria-pressed={filtro === "todo"} className={cn(CHIP, filtro === "todo" ? CHIP_ON : CHIP_OFF)}>
                  Todo <span className="tabular-nums text-[var(--text-tertiary)]">{data.items.length}</span>
                </button>
                {tipos.map((tipo) => {
                  const Icon = TIPOS[tipo].icon;
                  const activo = filtro === tipo;
                  return (
                    <button key={tipo} type="button" onClick={() => setFiltro(activo ? "todo" : tipo)} aria-pressed={activo} className={cn(CHIP, activo ? CHIP_ON : CHIP_OFF)}>
                      <Icon className="h-4 w-4" aria-hidden="true" />
                      {TIPOS[tipo].plural} <span className="tabular-nums text-[var(--text-tertiary)]">{cuantosDe(tipo)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* `sm:pr-14`: el botón flotante «Abrir acciones rápidas» es fixed en
              x 1200-1256 y se comía el «Cobrar» de la fila que quedara a esa
              altura (medido con `elementFromPoint`): ese corredor queda libre. */}
          <DataTable zebra className="[&_tbody_td]:py-1" wrapperClassName="sm:pr-14">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Quién te debe</th>
                <th className="text-right">Monto</th>
                <th>Desde</th>
                <th>Vence</th>
                <th className="text-right">Acción</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <FilaPorCobrar
                  key={`${f.tipo}-${f.id}-${f.moneda}`}
                  fila={f}
                  hoy={hoy}
                  cruce={(f.cruce && crucePorClave.get(f.cruce)) || null}
                  onCobrar={() => irASeccion(TIPOS[f.tipo].destino, TIPOS[f.tipo].externo, TIPOS[f.tipo].vista)}
                  onScoring={() => irASeccion("scoring")}
                  onLiquidar={irALiquidar}
                />
              ))}
              {filas.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-sm font-bold text-[var(--text-secondary)]">
                    Ninguna cuenta con ese filtro. Toca «Todo» para verlas todas.
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
