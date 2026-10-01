"use client";

/**
 * «Productos disponibles» — la madera ASERRADA que sigue en la planta (ADR-349),
 * con el MISMO formato que «Trozas disponibles» (Brandon 2026-09-27: «el mismo
 * formato, KPIs, gráficos y otras mejoras»).
 *
 * Orden por pregunta: cuánto hay (indicadores), cómo se reparte (gráficos) y el
 * detalle en cuatro pestañas —por permiso, por especie, por producto y paquete
 * por paquete—. Un filtro elegido en cualquier lado (fila, barra, cabecera,
 * tarjeta) acota todo lo demás; los chips dicen qué está puesto.
 *
 * El saldo NO se calcula acá: lo da `saldosDeCorridas` (ADR-316). Las cuentas
 * de la página están en `lib/forestal/productos-disponibles-resumen` (puro, con
 * test): UN criterio —disponible = libre + apartado— y lo marcado como usado
 * siempre aparte. Antes era un solo archivo de 2 187 líneas; las acciones de
 * siempre siguen todas (ver `productos-disponibles-acciones.tsx`).
 */

import { useId, useState } from "react";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, ChevronDown, FileDown, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { SkeletonEditorial } from "@/components/ui-system/SkeletonEditorial";
import { ChipsDeFiltros } from "@/components/admin/shared/filtros-columna";
import { useLocalStorage } from "@/hooks/use-local-storage";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { esPantallaAngosta } from "@/lib/forestal/tabla-paginacion";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { claveEspecie } from "@/lib/forestal/loth-constants";
import {
  SIN_ESPECIE,
  SIN_PERMISO,
  SIN_PRODUCTO,
  claveProducto,
  clavePermiso,
  detalleDeGrupo,
  type DimensionProducto,
  type FilaGrupo,
} from "@/lib/forestal/productos-disponibles-resumen";
import CtpApartados, { CtpApartadoPanel, useApartado, type Apartado } from "./ctp-apartados";
import CtpAvisoAlcancePermiso from "./CtpAvisoAlcancePermiso";
import ReprocesoSugeridoBanda from "./reproceso-sugerido-banda";
import { filtrosEnTexto, useProductosDisponibles } from "./hooks/use-productos-disponibles";
import { candidatasDelSugerido, useAccionesProductos } from "./hooks/use-acciones-productos";
import { ModalesProductos } from "./productos-disponibles-acciones";
import { useKpisProductosDisponibles } from "./productos-disponibles-kpis";
import { GraficoEdadPt, GraficoEspeciesPt, GraficoProductosPt } from "./productos-disponibles-graficos";
import { TablaGruposProductos, gruposConNombre, subDimension } from "./productos-disponibles-grupos";
import { TablaPaquetesDisponibles } from "./productos-disponibles-tabla";

const PESTANAS: readonly Apartado[] = [
  { id: "permiso", label: "Por permiso" },
  { id: "especie", label: "Por especie" },
  { id: "producto", label: "Por producto" },
  { id: "paquete", label: "Paquete por paquete" },
];
/** El ⓘ de cada pestaña: frases cortas, con un ejemplo. */
const AYUDA: Record<string, { what: string; affects: string; example: string }> = {
  permiso: {
    what: "Cuánto hay de cada permiso. Lo marcado usado va aparte.",
    affects: "Clic en un permiso: la página muestra solo lo suyo. La flecha abre sus especies.",
    example: "Clic en «Sin permiso» para ver lo que no dice su título.",
  },
  especie: {
    what: "Cuánto hay de cada especie, en pt y m³.",
    affects: "Clic en una especie: la página muestra solo esa. La flecha abre sus productos.",
    example: "Tornillo: cuántos pt hay y en qué productos.",
  },
  producto: {
    what: "Cuánto hay de cada producto para vender.",
    affects: "Clic en un producto: la página muestra solo ese. La flecha abre sus especies.",
    example: "Madera aserrada comercial: cuántos pt y de qué especies.",
  },
  paquete: {
    what: "Cada paquete con sus medidas, edad y acciones.",
    affects: "Tilda filas para cubicar, apartar o despachar con guía.",
    example: "Filtra «Parado hace» para ver lo de más de 90 días.",
  },
};

function Grafico({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <figure className="min-w-0 space-y-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <CardTitle as="h4" className="text-sm font-bold text-[var(--text-primary)]">
        {titulo}
      </CardTitle>
      {children}
    </figure>
  );
}

const SIN_DIM: Record<DimensionProducto, string> = { permiso: SIN_PERMISO, especie: SIN_ESPECIE, producto: SIN_PRODUCTO };
const CLAVE_DIM: Record<DimensionProducto, (v: string) => string> = {
  permiso: clavePermiso,
  especie: claveEspecie,
  producto: claveProducto,
};
/** ¿Este grupo es el que está filtrando? Por clave; «Sin …» es la fila de clave vacía. */
const activoEn = (dim: DimensionProducto, valores: readonly string[]) => (g: FilaGrupo) =>
  valores.some((v) => (v === SIN_DIM[dim] ? g.clave === "" : CLAVE_DIM[dim](v) === g.clave));

export default function CtpProductosDisponibles({ period }: { period: CtpPeriod }) {
  const e = useProductosDisponibles(period);
  const a = useAccionesProductos(e);
  const idBase = useId();
  const { activo, ir } = useApartado("productos-disponibles", PESTANAS);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  const [verGraficos, setVerGraficos] = useLocalStorage<boolean>("ctp-productos-disponibles-graficos", !esPantallaAngosta());
  const chips = filtrosEnTexto(e.filtro);
  const kpis = useKpisProductosDisponibles(e, chips.length);
  const cargandoPrimera = e.cargando && e.corridas.length === 0;
  const r = e.resumen;

  /* Grupos CON nombre, igual que la tarjeta y el «Total» (lección de Trozas: «5 permisos» sobre
     un pie de 4). Si sólo queda lo que no lo declara, se dice así y no «0». */
  const conNombre = (d: DimensionProducto) =>
    gruposConNombre(e.grupos[d]) > 0 || e.grupos[d].length === 0 ? gruposConNombre(e.grupos[d]) : `sin ${d}`;
  const contadores: Record<string, number | string> = {
    permiso: conNombre("permiso"),
    especie: conNombre("especie"),
    producto: conNombre("producto"),
    paquete: e.aLaVista.length,
  };
  const unidades: Record<string, [string, string]> = {
    permiso: ["permiso", "permisos"],
    especie: ["especie", "especies"],
    producto: ["producto", "productos"],
    paquete: ["fila", "filas"],
  };
  const apartados: Apartado[] = PESTANAS.map((p) => {
    const n = contadores[p.id] ?? 0;
    if (cargandoPrimera) return { ...p, contador: "…" };
    return typeof n === "number" ? { ...p, contador: n, unidad: unidades[p.id]?.[n === 1 ? 0 : 1] } : { ...p, contador: n };
  });
  const dim = activo as DimensionProducto;

  return (
    <div className="space-y-4" data-vista-productos>
      {/* Título, indicadores y Excel en UNA fila; el panel se abre debajo. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex min-w-0 items-center gap-1.5">
            <SectionTitle as="h2">Productos disponibles</SectionTitle>
            <InfoTip
              title="Productos disponibles"
              what="La madera aserrada con saldo: libre o apartada. Lo marcado usado va aparte."
              affects="pt = m³ × 424. Lo apartado sigue contando: ya tiene dueño."
              example="Tilda paquetes y despáchalos con guía sin volver a elegirlos."
            />
          </div>
          {kpis.boton}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={async () => setErrorExcel(await e.descargarExcel())}
              disabled={e.filtradas.length === 0 || e.descargando}
              title="Una hoja por tabla: permiso, especie, producto y paquetes"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" aria-hidden />
              {e.descargando ? "Generando…" : "Excel"}
            </button>
          </div>
        </div>
        {kpis.panel}
      </div>

      {e.contratoFiltro && e.codigoPermisoActivo && (
        <CtpAvisoAlcancePermiso
          codigo={e.codigoPermisoActivo}
          acotado={["los productos", "los indicadores", "los gráficos"]}
        />
      )}
      {/* Lo que la distribución sugirió reprocesar: de qué corrida sale no se adivina (ADR-404 → 316). */}
      {e.sugerido && (
        <ReprocesoSugeridoBanda
          borrador={e.sugerido}
          candidatas={candidatasDelSugerido(e)}
          onUsar={(id) => {
            const c = e.corridas.find((x) => x.id === id);
            if (c) a.setReprocesar(c);
          }}
          pendientes={e.pendientes}
          onDescartar={e.avanzarCola}
          onDescartarTodos={e.pendientes > 1 ? e.descartarCola : undefined}
        />
      )}
      {e.nota && (
        <p role="status" className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-success-500)]/40 bg-[var(--data-success-50)] px-4 py-3 text-sm font-bold text-[var(--data-success-ink)] dark:bg-[var(--data-success-500)]/12">
          <span className="flex-1">{e.nota}</span>
          <button type="button" onClick={() => e.setNota(null)} aria-label="Cerrar el aviso" className="shrink-0">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </p>
      )}
      {(e.error || errorExcel) && (
        <p role="alert" className="rounded-2xl border-2 border-[var(--data-error-500)] px-4 py-3 text-sm font-bold text-[var(--text-primary)]">
          {e.error ? `No se pudieron leer los productos: ${e.error}` : `No se pudo bajar el Excel: ${errorExcel}`}
        </p>
      )}
      {r.descuadre.corridas > 0 && (
        <p role="status" className="flex items-center gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] px-4 py-3 text-sm text-[var(--text-primary)]">
          <AlertTriangle className="h-4 w-4 shrink-0 text-[var(--data-warning-ink)]" aria-hidden />
          <span>
            {r.descuadre.corridas} corrida{r.descuadre.corridas === 1 ? "" : "s"} no cuadra
            {r.descuadre.corridas === 1 ? "" : "n"} con sus paquetes. Las cifras usan el libro.
          </span>
          <InfoTip
            title="Paquetes que no cuadran"
            what={`Sus paquetes suman ${fmtM3(r.descuadre.paquetesM3)} m³. El libro dice ${fmtM3(r.descuadre.libroM3)} m³.`}
            affects="Pasa si salió una parte de la corrida. Manda el libro: indicadores, tablas y Excel."
            example="La tabla de paquetes muestra cada paquete con su propio m³."
          />
        </p>
      )}

      <ChipsDeFiltros
        chips={chips.map((c) => ({ id: c.id, label: c.label, texto: `${c.label}: ${c.texto}` }))}
        onQuitar={(id) => e.quitar(id as (typeof chips)[number]["id"])}
        onLimpiarTodo={e.limpiar}
      />

      {/* Gráficos: plegables y recordados (en el celular arrancan plegados). */}
      <section aria-label="Gráficos" className="space-y-3">
        <button
          type="button"
          onClick={() => setVerGraficos((v) => !v)}
          aria-expanded={verGraficos}
          className="flex min-h-10 items-center gap-2 rounded-xl px-1 text-left text-sm transition-colors hover:bg-[var(--surface-sunken)]"
        >
          <ChevronDown className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${verGraficos ? "" : "-rotate-90"}`} aria-hidden />
          <span className="font-bold text-[var(--text-primary)]">Gráficos</span>
          {!verGraficos && <span className="text-[var(--text-secondary)]">pt por especie y por producto · días parado</span>}
        </button>
        {verGraficos && cargandoPrimera && (
          <div className="grid gap-3 lg:grid-cols-3" aria-busy>
            {["pt por especie", "pt por producto y especie", "pt por días parado"].map((titulo) => (
              <Grafico key={titulo} titulo={titulo}>
                <SkeletonEditorial className="h-40 w-full" />
              </Grafico>
            ))}
          </div>
        )}
        {verGraficos && !cargandoPrimera && (
          <div className="grid gap-3 lg:grid-cols-3">
            <Grafico titulo="pt por especie">
              <GraficoEspeciesPt grupos={e.grupos.especie} activas={e.filtro.especie} onElegir={(v) => e.alternar("especie", v)} />
            </Grafico>
            <Grafico titulo="pt por producto y especie">
              <GraficoProductosPt pila={e.pila} activos={e.filtro.producto} onElegir={(v) => e.alternar("producto", v)} />
            </Grafico>
            <Grafico titulo="pt por días parado">
              <GraficoEdadPt edad={e.edad} activos={e.filtro.tramos} onElegir={(v) => e.alternar("tramos", v)} />
              {e.edad.sinFecha.filas > 0 && (
                <figcaption className="text-sm text-[var(--text-secondary)]">
                  {e.edad.sinFecha.filas} sin fecha: no cuentan días.
                </figcaption>
              )}
            </Grafico>
          </div>
        )}
      </section>

      <section aria-label="Detalle" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CtpApartados apartados={apartados} activo={activo} onIr={ir} idBase={idBase} etiqueta="Detalle de los productos" />
          <InfoTip title={PESTANAS.find((p) => p.id === activo)?.label ?? "Detalle"} {...(AYUDA[activo] ?? AYUDA.paquete)} />
        </div>
        <CtpApartadoPanel idBase={idBase} id={activo}>
          {activo === "paquete" ? (
            <TablaPaquetesDisponibles e={e} a={a} />
          ) : (
            <TablaGruposProductos
              key={dim}
              dim={dim}
              filas={e.grupos[dim] ?? []}
              esActivo={activoEn(dim, e.filtro[dim] ?? [])}
              onElegir={(v) => e.alternar(dim, v)}
              onElegirDetalle={(sub, v) => e.alternar(sub, v)}
              detalleDe={(g) => detalleDeGrupo(e.bases[dim], dim, g.clave, subDimension(dim))}
              cargando={cargandoPrimera}
            />
          )}
        </CtpApartadoPanel>
      </section>

      <ModalesProductos e={e} a={a} />
    </div>
  );
}
