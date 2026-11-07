"use client";

/**
 * Compras › Sugerencias: el motor de Compras (`/api/compras/sugerencias`),
 * qué reponer según lo vendido y, marcándolos, las órdenes por proveedor.
 *
 * Partido el 10-10 (medía 926 líneas): datos y acciones en
 * `sugerencias/use-sugerencias-compra.ts` (sin cambios de lógica) y cada bloque
 * en `sugerencias/*`. Patrón del panel: cabecera en una fila con Indicadores,
 * filtros en una fila pegada a la lista, avisos de una línea con ⓘ.
 */

import { AlertTriangle, Check, RefreshCw } from "@buleje/design-system/icons";
import EnlacePanel from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useSugerenciasCompra } from "./sugerencias/use-sugerencias-compra";
import { useSugerenciasCabecera } from "./sugerencias/SugerenciasCabecera";
import SugerenciasFiltros from "./sugerencias/SugerenciasFiltros";
import SugerenciasGrupo from "./sugerencias/SugerenciasGrupo";
import SugerenciasBajoMinimo from "./sugerencias/SugerenciasBajoMinimo";
import SugerenciasSinRotacion from "./sugerencias/SugerenciasSinRotacion";
import SugerenciasBarraSeleccion from "./sugerencias/SugerenciasBarraSeleccion";
import SugerenciasExcluidos from "./sugerencias/SugerenciasExcluidos";
import { agruparSugerencias } from "./sugerencias/explicar";
import { bajoSuMinimo } from "./sugerencias/tipos";

/** Aviso de una línea (patrón del panel): ícono, la frase y, si hace falta, ⓘ y la acción. */
const AVISO = "flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-3 py-1 text-sm sm:px-4";

export default function SugerenciasCompraTab() {
  const sc = useSugerenciasCompra();
  const cabecera = useSugerenciasCabecera(sc);
  const {
    sugerencias, sinRotacion, avisos, sinStockMinimo, verSinRotacion, setVerSinRotacion, ventanaDias,
    loading, refreshing, error, load, visible, collapsed, selected, creatingItemId, toggleCollapse,
    marcarGrupo, toggleSelect, createOCForOne, setFilter, setSearch, agruparPor, calculadoEn, excluidos,
  } = sc;

  const bajoMinimo = bajoSuMinimo(sinRotacion);
  const grupos = agruparSugerencias(visible, agruparPor);
  // «Nada que comprar» es un estado, no el fin de la pantalla: lo que está bajo
  // su mínimo y lo que NO rota siguen abajo.
  const nadaQueComprar = !loading && !error && sugerencias.length === 0;

  return (
    /* El `pb-32` de la barra fija lo pone la vista que lo monta (SugerenciasVista):
       debajo van otros bloques y el espacio tiene que quedar al final. */
    <div className="space-y-3" data-motor="compras">
      {cabecera.fila}
      {cabecera.panel}

      {loading ? (
        <div className="space-y-3" aria-busy="true" aria-label="Calculando sugerencias">
          <div className="h-12 animate-pulse rounded-xl bg-[var(--rule-soft)]" />
          <div className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-2xl bg-[var(--rule-soft)]" />
            ))}
          </div>
        </div>
      ) : error ? (
        <div role="alert" className={`${AVISO} border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]`}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
          <p className="min-w-0 flex-1">{error}</p>
          <button type="button" onClick={() => void load()} className={button({ variant: "secondary", className: "shrink-0 gap-2 rounded-xl px-3" })}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </div>
      ) : sinStockMinimo ? (
        /* Falta configurar, no falta comprar: sin stock mínimo no se analizó nada. */
        <div className={`${AVISO} border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 text-[var(--text-primary)]`}>
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          <p className="min-w-0">
            {sinStockMinimo.productosActivos > 0
              ? <>Ninguno de tus <strong className="tabular-nums">{sinStockMinimo.productosActivos}</strong> productos tiene stock mínimo: sin él no hay qué calcular.</>
              : "Todavía no cargaste productos: no hay de qué calcular reposición."}
          </p>
          <InfoTip what="El stock mínimo es lo que dice cuándo un producto está por acabarse. Con ponérselo a los que más vendes ya alcanza para empezar." />
          {sinStockMinimo.productosActivos > 0 && (
            <EnlacePanel href="/admin?tab=inventario&vista=stock" apariencia="heredada" className={button({ variant: "secondary", className: "ml-auto shrink-0 rounded-xl px-3 hover:no-underline" })}>
              Cargar mínimos
            </EnlacePanel>
          )}
        </div>
      ) : nadaQueComprar ? (
        /* Verde sólo si de verdad no falta nada: con productos en o bajo su
           mínimo (justo debajo), «nada que reponer» en verde se leía como
           «todo bien» (auditoría Compras C25). */
        <div className={bajoMinimo.length > 0
          ? `${AVISO} border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-primary)]`
          : `${AVISO} border-[var(--data-success-500)]/30 bg-[var(--data-success-500)]/10 text-[var(--text-primary)]`}>
          <Check className={bajoMinimo.length > 0 ? "h-4 w-4 shrink-0 text-[var(--text-secondary)]" : "h-4 w-4 shrink-0 text-[var(--data-success-ink)]"} strokeWidth={2.5} aria-hidden />
          <p className="min-w-0">
            <strong>Nada que reponer</strong> por lo vendido en {ventanaDias} días
            {bajoMinimo.length > 0
              ? <>, pero <strong className="tabular-nums">{bajoMinimo.length}</strong> {bajoMinimo.length === 1 ? "está" : "están"} en o bajo su mínimo (abajo){refreshing ? "…" : "."}</>
              : refreshing ? "…" : "."}
          </p>
          <InfoTip
            title="Nada que reponer"
            what={`Ningún producto llega a su punto de pedido: con lo que se vendió en los últimos ${ventanaDias} días, el stock alcanza hasta la próxima entrega.`}
            example="Si en Comprar ves «a reponer», es correcto: ahí se cuentan los productos en o bajo el stock mínimo que fijaste, sin mirar cuánto se vendió."
          />
        </div>
      ) : null}

      {!loading && !error && <SugerenciasBajoMinimo items={bajoMinimo} ventanaDias={ventanaDias} />}

      {!loading && !error && !nadaQueComprar && !sinStockMinimo && (
        <>
          {/* Lo que la pantalla NO pudo saber. Callarlo haría que una lista
              incompleta se leyera como completa. */}
          {avisos.map((a) => (
            <p key={a} className={`${AVISO} border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 text-[var(--text-primary)]`}>
              <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
              {a}
            </p>
          ))}

          <SugerenciasFiltros sc={sc} />

          {grupos.map((g) => (
            <SugerenciasGrupo
              key={g.clave}
              grupo={g}
              ventanaDias={ventanaDias}
              calculadoEn={calculadoEn}
              plegado={collapsed[g.clave] ?? false}
              elegidos={selected}
              creandoId={creatingItemId}
              onPlegar={() => toggleCollapse(g.clave)}
              onMarcarTodos={() => marcarGrupo(g.items.map((s) => s.productId))}
              onElegir={toggleSelect}
              onCrearOC={(s) => void createOCForOne(s)}
            />
          ))}

          {visible.length === 0 && (
            <div className={`${AVISO} border-dashed border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]`}>
              <p className="min-w-0 flex-1">No hay sugerencias con este filtro.</p>
              <button
                type="button"
                onClick={() => { setFilter("todos"); setSearch(""); }}
                className={button({ variant: "ghost", className: "shrink-0 rounded-xl px-3 text-[var(--accent-ink)] dark:text-[var(--accent)]" })}
              >
                Ver todas
              </button>
            </div>
          )}

          <SugerenciasBarraSeleccion sc={sc} />
        </>
      )}

      {!loading && !error && <SugerenciasExcluidos excluidos={excluidos} />}

      {!loading && !error && (
        <SugerenciasSinRotacion items={sinRotacion} ventanaDias={ventanaDias} abierto={verSinRotacion} onAlternar={() => setVerSinRotacion((v) => !v)} />
      )}
    </div>
  );
}
