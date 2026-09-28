"use client";

/**
 * «Trozas disponibles» — la madera rolliza viva del patio, por permiso, por
 * especie y troza por troza (Brandon 2026-09-27).
 *
 * Pedido: «de ese permiso qué especies hay: volumen, cantidad de trozas, m³,
 * pies tablares… en Consumos va a ocupar mucho, así que quiero otra página».
 * Acá se mudaron desde Consumos la tabla por permiso, los indicadores del
 * patio y el Excel por permiso (nada se borró: Consumos se quedó con el
 * trabajo de la sierra y una línea que trae hasta acá).
 *
 * Orden por pregunta: cuánto hay (indicadores), cómo se reparte (gráficos) y
 * el detalle en tres pestañas. Un filtro elegido en cualquier lado —fila,
 * barra, cabecera— acota todo lo demás; los chips dicen qué está puesto.
 */

import { useId, useState } from "react";
import { CardTitle, SectionTitle } from "@buleje/design-system";
import { AlertTriangle, ChevronDown, FileDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ChipsDeFiltros } from "@/components/admin/shared/filtros-columna";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { esPantallaAngosta } from "@/lib/forestal/tabla-paginacion";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { especiesDelPermiso } from "@/lib/forestal/trozas-disponibles";
import CtpApartados, { CtpApartadoPanel, useApartado, type Apartado } from "./ctp-apartados";
import CtpAvisoAlcancePermiso from "./CtpAvisoAlcancePermiso";
import CtpPatioPorPermiso from "./CtpPatioPorPermiso";
import { filtrosEnTexto, useTrozasDisponibles } from "./hooks/use-trozas-disponibles";
import { useKpisTrozasDisponibles } from "./trozas-disponibles-kpis";
import { GraficoAntiguedad, GraficoEspecies, GraficoPermisos } from "./trozas-disponibles-graficos";
import { EspeciesDelPermiso, TablaEspecies } from "./trozas-disponibles-especies";
import { TablaTrozasDisponibles } from "./trozas-disponibles-tabla";

const nf = (n: number) => formatNumber(n);
const PESTANAS: readonly Apartado[] = [
  { id: "permiso", label: "Por permiso" },
  { id: "especie", label: "Por especie" },
  { id: "troza", label: "Por troza" },
];
/** Qué dice el ⓘ de cada pestaña: la nota que antes iba al pie de «Por permiso». */
const AYUDA: Record<string, { what: string; affects: string; example: string }> = {
  permiso: {
    what: "Trozas y m³ de cada permiso en el patio. Lo que espera su guía va aparte.",
    affects:
      "Clic en un permiso: toda la página muestra solo lo suyo. La flecha abre sus especies.",
    example: "10-HUA-PUE · 2026-007: 46 trozas y 135.587 m³ en el patio.",
  },
  especie: {
    what: "Cuánto hay de cada especie en el patio. Lo que espera su guía va aparte.",
    affects: "Clic en una especie: toda la página muestra solo esa especie.",
    example: "Cachimbo: 12 trozas y 28.947 m³, en 1 permiso.",
  },
  troza: {
    what: "Cada troza, con su guía, medidas y estado. Incluye las sin recepcionar.",
    affects: "Filtra desde la cabecera de cada columna. Las más viejas van primero.",
    example: "Filtra «Sin recepcionar» para ver qué guías faltan recibir.",
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

export default function CtpTrozasDisponibles({ onIr }: { onIr?: (vista: string) => void }) {
  const e = useTrozasDisponibles();
  const idBase = useId();
  const { activo, ir } = useApartado("trozas-disponibles", PESTANAS);
  const [errorExcel, setErrorExcel] = useState<string | null>(null);
  const [verGraficos, setVerGraficos] = useLocalStorage<boolean>(
    "ctp-trozas-disponibles-graficos",
    !esPantallaAngosta(),
  );
  const chips = filtrosEnTexto(e.filtro);
  const kpis = useKpisTrozasDisponibles(e, chips.length);
  const ayuda = AYUDA[activo] ?? AYUDA.permiso;
  const cargandoPrimera = e.cargando && e.vivas.length === 0;

  /* Permisos CON nombre, igual que «Total · N permisos» al pie; si sólo queda
     madera sin permiso, se dice así y no «0 permisos» con una fila a la vista. */
  const permisos = e.porPermiso.totales.permisos;
  const contadorPermiso =
    permisos > 0 || e.porPermiso.filas.length === 0 ? permisos : "sin permiso";
  const apartados: Apartado[] = PESTANAS.map((p) => {
    const contador = cargandoPrimera
      ? "…"
      : p.id === "permiso"
        ? contadorPermiso
        : p.id === "especie"
          ? e.especies.length
          : e.filtradas.length;
    const base = p.id === "permiso" ? "permiso" : p.id === "especie" ? "especie" : "troza";
    const unidad = contador === 1 ? base : `${base}s`;
    return { ...p, contador, unidad: typeof contador === "number" ? unidad : undefined };
  });

  return (
    <div className="space-y-4">
      {/* Título, indicadores y Excel en UNA fila; el panel se abre debajo. */}
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="mr-1 flex min-w-0 items-center gap-1.5">
            <SectionTitle as="h2">Trozas disponibles</SectionTitle>
            <InfoTip
              title="Trozas disponibles"
              what="La madera en troza recibida: libre o en lote. Lo que espera su guía va aparte."
              affects="Los m³ son pieza por pieza, no el saldo que se declara. El pt es aserrable al 56 %."
              example="46 trozas en el patio. Otras 38 esperan su guía."
            />
          </div>
          {kpis.boton}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={async () => setErrorExcel(await e.descargarExcel())}
              disabled={e.porPermiso.filas.length === 0 || e.descargando}
              title="Una hoja por permiso, otra por especie y qué se exportó"
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-50"
            >
              <FileDown className="h-4 w-4" aria-hidden />
              {e.descargando ? "Generando…" : "Excel por permiso"}
            </button>
          </div>
        </div>
        {kpis.panel}
      </div>

      {e.contratoFiltro && e.codigoPermisoActivo && (
        <CtpAvisoAlcancePermiso
          codigo={e.codigoPermisoActivo}
          acotado={["las trozas", "los indicadores", "los gráficos"]}
        />
      )}
      {e.truncado && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] px-4 py-3 text-sm text-[var(--text-primary)]"
        >
          <AlertTriangle
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
            aria-hidden
          />
          Se leyeron {nf(e.truncado.leidas)} de {nf(e.truncado.hay)} trozas. Las cifras son de lo
          leído.
        </p>
      )}
      {(e.error || errorExcel) && (
        <p
          role="alert"
          className="rounded-2xl border-2 border-[var(--data-error-500)] px-4 py-3 text-sm font-bold text-[var(--text-primary)]"
        >
          {e.error
            ? `No se pudo leer el patio: ${e.error}`
            : `No se pudo descargar el Excel: ${errorExcel}`}
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
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform ${verGraficos ? "" : "-rotate-90"}`}
            aria-hidden
          />
          <span className="font-bold text-[var(--text-primary)]">Gráficos</span>
          {!verGraficos && (
            <span className="text-[var(--text-secondary)]">
              m³ por especie y por permiso · días en el patio
            </span>
          )}
        </button>
        {verGraficos && (
          <div className="grid gap-3 lg:grid-cols-3">
            <Grafico titulo="m³ por especie">
              <GraficoEspecies
                filas={e.especies}
                activas={e.filtro.especie}
                onElegir={(v) => e.alternar("especie", v)}
              />
            </Grafico>
            <Grafico titulo="m³ por permiso y especie">
              <GraficoPermisos
                pila={e.pila}
                activos={e.filtro.permiso}
                onElegir={(v) => e.alternar("permiso", v)}
              />
            </Grafico>
            <Grafico titulo="Trozas por días en el patio">
              <GraficoAntiguedad
                tramos={e.antiguedad.tramos}
                activos={e.filtro.tramos}
                onElegir={(v) => e.alternar("tramos", v)}
              />
              {e.antiguedad.sinRecepcionar.trozas > 0 && (
                <figcaption className="text-sm text-[var(--text-secondary)]">
                  {nf(e.antiguedad.sinRecepcionar.trozas)} sin recepcionar (
                  {fmtM3(e.antiguedad.sinRecepcionar.m3)} m³): no cuentan días.
                </figcaption>
              )}
            </Grafico>
          </div>
        )}
      </section>

      <section aria-label="Detalle" className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <CtpApartados
            apartados={apartados}
            activo={activo}
            onIr={ir}
            idBase={idBase}
            etiqueta="Detalle de las trozas"
          />
          <InfoTip title={PESTANAS.find((p) => p.id === activo)?.label ?? "Detalle"} {...ayuda} />
        </div>
        <CtpApartadoPanel idBase={idBase} id={activo}>
          {activo === "permiso" ? (
            <CtpPatioPorPermiso
              sinCabecera
              filas={e.porPermiso.filas}
              totales={e.porPermiso.totales}
              activos={e.filtro.permiso}
              onElegir={(p) => e.alternar("permiso", p)}
              onRecepcionar={onIr ? () => onIr("ingresos") : undefined}
              cargando={cargandoPrimera}
              error={e.error}
              detalleDe={(p) => (
                <EspeciesDelPermiso
                  filas={especiesDelPermiso(e.basePermisos, p, e.ahora)}
                  onElegir={(v) => e.alternar("especie", v)}
                />
              )}
            />
          ) : activo === "especie" ? (
            <TablaEspecies
              filas={e.especies}
              activas={e.filtro.especie}
              onElegir={(v) => e.alternar("especie", v)}
              cargando={cargandoPrimera}
            />
          ) : (
            <TablaTrozasDisponibles e={e} />
          )}
        </CtpApartadoPanel>
      </section>
    </div>
  );
}
