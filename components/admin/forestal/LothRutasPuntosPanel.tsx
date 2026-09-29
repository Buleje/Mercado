"use client";

/**
 * LothRutasPuntosPanel — el cuerpo del bloque «Rutas y puntos» debajo del
 * mapa del Libro TH (pedido de Brandon, 29-09: «detalles de coordenadas de
 * cada ruta, de acopio, campamento»).
 *
 * Una fila por ruta —nombre y tipo, largo en metros, pendiente máxima si se
 * conoce el relieve, inicio y fin en UTM y en lat/lng— que se despliega en sus
 * vértices; y una fila por punto del plano con su coordenada. Tocar el nombre
 * la resalta en el mapa y la encuadra; copiar deja el texto listo para
 * WhatsApp o el informe. Las filas salen de `loth-rutas-coordenadas`, las
 * mismas que la ficha del mapa y los archivos: no pueden decir cosas distintas.
 *
 * A 400 px la tabla se vuelve tarjetas sola (`useMobileTableCards`).
 */

import { Fragment, useState } from "react";
import { DataTable } from "@buleje/design-system";
import { ChevronDown, Locate } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatNumber } from "@/lib/format";
import { textoDePunto, textoDeRuta, textoLargo, textoPendiente, type FilaPunto, type FilaRuta } from "@/lib/forestal/loth-rutas-coordenadas";
import { BotonCopiar, CoordTexto, ListaVertices, MuestraVia } from "./loth-rutas-ui";
import type { EstadoRelieve } from "./hooks/use-loth-mapa-rutas";

const plural = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;

/** La línea de la cabecera plegada: cuántas rutas, cuánto camino y cuántos puntos. */
export function resumenRutas(rutas: readonly FilaRuta[], puntos: readonly FilaPunto[]): string {
  if (rutas.length === 0 && puntos.length === 0) return "Todavía no hay rutas ni puntos en el plano";
  const largo = rutas.reduce((s, r) => s + r.largoM, 0);
  return [
    rutas.length > 0 ? `${plural(rutas.length, "ruta", "rutas")} · ${textoLargo(largo)}` : null,
    puntos.length > 0 ? plural(puntos.length, "punto", "puntos") : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

const RELIEVE_TXT: Record<EstadoRelieve, string> = {
  nada: "Sale del relieve que el planificador guarda de la zona.",
  cargando: "Leyendo el relieve guardado de la zona…",
  listo: "Sale del relieve que el planificador guardó de la zona, con la misma cuenta que usa para proponer las trochas.",
  sinRelieve: "Todavía no se guardó el relieve de esta zona: abre «Planificar» en la barra del mapa y se trae una vez.",
  error: "No se pudo leer el relieve guardado: se vuelve a intentar al recargar el mapa.",
};

const KICKER = "flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const BTN_NOMBRE =
  "group inline-flex min-h-10 w-full items-center gap-2 rounded-lg px-1.5 text-left hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";
const BTN_VERTICES =
  "inline-flex h-10 items-center gap-1 whitespace-nowrap rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 text-xs font-bold text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";
/** La fila resaltada: la misma que tiene el halo turquesa en el mapa. */
const FILA_ELEGIDA = "bg-[var(--surface-sunken)] shadow-[inset_3px_0_0_var(--accent)]";

interface Props {
  rutas: readonly FilaRuta[];
  puntos: readonly FilaPunto[];
  relieve: EstadoRelieve;
  /** La resaltada en el mapa (`via:…` / `ref:…`). */
  clave: string | null;
  /** Resaltarla y llevarla a la vista del mapa. */
  onVer: (clave: string) => void;
}

export default function LothRutasPuntosPanel({ rutas, puntos, relieve, clave, onVer }: Props) {
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  const alternar = (id: string) =>
    setAbiertas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  // Todas en la misma zona (lo normal: un permiso cae en un huso): va una vez, en el encabezado.
  const zonas = new Set([...rutas.flatMap((r) => [r.inicio.zona, r.fin.zona]), ...puntos.map((p) => p.punto.zona)]);
  const zona = zonas.size === 1 ? [...zonas][0] : null;
  const conZona = zona == null;

  if (rutas.length === 0 && puntos.length === 0) {
    return (
      <p className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
        Traza una ruta o marca un punto en el mapa, o usa <b>Planificar</b> para que te los proponga.
      </p>
    );
  }

  return (
    <div className="space-y-4 p-4">
      {rutas.length > 0 && (
        <div className="space-y-2">
          <p className={KICKER}>
            Rutas ({rutas.length})
            <InfoTip
              title="Rutas del plano"
              what="Cada trocha, camino o río del plano, con su largo y dónde empieza y termina."
              affects={`Pendiente máxima: ${RELIEVE_TXT[relieve]}`}
              example="Toca el nombre y el mapa te la muestra; «vértices» abre cada punto de la traza."
            />
          </p>
          <DataTable wrapperClassName="rounded-xl">
            <thead>
              <tr>
                <th>Ruta</th>
                <th className="text-right">Largo</th>
                <th className="text-right">Pend. máx.</th>
                <th>Inicio{zona && ` · UTM ${zona}`}</th>
                <th>Fin{zona && ` · UTM ${zona}`}</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rutas.map((r) => {
                const abierta = abiertas.has(r.id);
                const idLista = `loth-ruta-vertices-${r.id}`;
                return (
                  <Fragment key={r.id}>
                    <tr data-ruta={r.id} className={clave === r.clave ? FILA_ELEGIDA : undefined}>
                      <td>
                        <button type="button" onClick={() => onVer(r.clave)} aria-pressed={clave === r.clave} title="Verla en el mapa" className={BTN_NOMBRE}>
                          <MuestraVia color={r.color} punteada={r.tipo === "trocha" || r.tipo === "marginal"} />
                          <span className="min-w-0 flex-1">
                            <span className="block font-bold text-[var(--text-primary)]">{r.nombre}</span>
                            <span className="block text-xs text-[var(--text-secondary)]">{r.tipoLabel}</span>
                          </span>
                          <Locate className="h-4 w-4 flex-none text-[var(--text-tertiary)] group-hover:text-[var(--accent-ink)]" aria-hidden="true" />
                        </button>
                      </td>
                      <td className="whitespace-nowrap text-right font-bold tabular-nums">{textoLargo(r.largoM)}</td>
                      <td className="whitespace-nowrap text-right tabular-nums text-[var(--text-secondary)]">{textoPendiente(r.pendienteMaxPct)}</td>
                      <td>
                        <CoordTexto c={r.inicio} conZona={conZona} />
                      </td>
                      <td>
                        <CoordTexto c={r.fin} conZona={conZona} />
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1.5">
                          <BotonCopiar texto={textoDeRuta(r, true)} que={`las coordenadas de ${r.nombre}`} etiqueta={`Copiar las coordenadas de ${r.nombre}`} />
                          <button type="button" onClick={() => alternar(r.id)} aria-expanded={abierta} aria-controls={idLista} className={BTN_VERTICES}>
                            {plural(r.vertices.length, "vértice", "vértices")}
                            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${abierta ? "rotate-180" : ""}`} aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    {abierta && (
                      <tr data-vertices-de={r.id}>
                        <td colSpan={6}>
                          <ListaVertices id={idLista} vertices={r.vertices} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </DataTable>
        </div>
      )}

      {puntos.length > 0 && (
        <div className="space-y-2">
          <p className={KICKER}>
            Puntos ({puntos.length})
            <InfoTip
              title="Puntos del plano"
              what="Patio de acopio, campamento, ingreso, centros poblados: cada uno con su coordenada."
              example="Copia la del patio y pégala en el GPS del motosierrista o en WhatsApp."
            />
          </p>
          <DataTable wrapperClassName="rounded-xl">
            <thead>
              <tr>
                <th>Punto</th>
                <th>Tipo</th>
                <th>Coordenada{zona && ` · UTM ${zona}`}</th>
                <th>
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {puntos.map((p) => (
                <tr key={p.id} data-punto={p.id} className={clave === p.clave ? FILA_ELEGIDA : undefined}>
                  <td>
                    <button type="button" onClick={() => onVer(p.clave)} aria-pressed={clave === p.clave} title="Verlo en el mapa" className={BTN_NOMBRE}>
                      <span aria-hidden="true" className="h-3 w-3 flex-none rounded-full ring-2 ring-[var(--surface-raised)]" style={{ backgroundColor: p.color }} />
                      <span className="min-w-0 flex-1 font-bold text-[var(--text-primary)]">{p.nombre}</span>
                      <Locate className="h-4 w-4 flex-none text-[var(--text-tertiary)] group-hover:text-[var(--accent-ink)]" aria-hidden="true" />
                    </button>
                  </td>
                  <td className="text-[var(--text-secondary)]">{p.tipoLabel}</td>
                  <td>
                    <CoordTexto c={p.punto} conZona={conZona} />
                  </td>
                  <td>
                    <div className="flex justify-end">
                      <BotonCopiar texto={textoDePunto(p)} que={`la coordenada de ${p.nombre}`} etiqueta={`Copiar la coordenada de ${p.nombre}`} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}
    </div>
  );
}
