"use client";

/**
 * Todas las trozas que entraron al patio, en una tabla (ADR-341).
 *
 * Es «el montón»: lo que las guías recepcionadas dejaron y todavía está por
 * aserrar. Antes, para ver qué madera había, había que abrir guía por guía o
 * entrar al armado de un lote; acá está junto, con los datos que se miran
 * parado frente a la pila —código de planta, especie, medidas, volumen— y de
 * qué guía vino cada una.
 *
 * La misma tabla es el picker: se tildan las piezas que entran a la sierra y el
 * botón de arriba las consume contra el lote elegido. Una lista para mirar y
 * otra para elegir habrían sido dos listas que se contradicen.
 *
 * El filtro y las cifras **ya no viven acá** (ADR-345): los maneja la vista, que
 * los muestra arriba junto a los de la Sección 2. Este componente recibe las
 * filas ya elegidas y se ocupa de dibujarlas.
 */

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, FileCheck, PackageOpen, PenLine } from "@buleje/design-system/icons";
import { agruparTrozas, motivoBloqueo, type AgrupacionPatio, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";
import { FiltroColumna, FiltroColumnaMulti, type FacetaOpcion } from "./ctp-filtros-panel";

/**
 * Los autofiltros de la cabecera (estilo Excel, Brandon 2026-09-03): Guía (varias
 * a la vez), Permiso y Especie. Son las tres columnas que también son filtros del
 * patio; resolución y proveedor no tienen columna y se quedan en el panel.
 * Escriben el MISMO estado que `useFiltroPatio` — la vista los arma.
 */
export interface FiltrosPatioColumna {
  guia?: { value: readonly string[]; options: FacetaOpcion[]; onChange: (v: string[]) => void };
  permiso?: { value: string; options: FacetaOpcion[]; onChange: (v: string) => void };
  especie?: { value: string; options: FacetaOpcion[]; onChange: (v: string) => void };
}
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";

const fmtDia = (iso: string | null | undefined) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString("es-PE", { day: "2-digit", month: "short", timeZone: "UTC" });
};

/** Las medidas como las canta el patio: dos diámetros y el largo. */
function medidas(t: TrozaConsumible): string {
  const d1 = t.d1Cm != null ? Number(t.d1Cm).toFixed(0) : null;
  const d2 = t.d2Cm != null ? Number(t.d2Cm).toFixed(0) : null;
  const largo = t.largoM != null ? Number(t.largoM).toFixed(2) : null;
  if (!d1 && !d2 && !largo) return t.dimensiones ?? "—";
  return `${d1 ?? "—"} × ${d2 ?? "—"} cm · ${largo ?? "—"} m`;
}

/**
 * De dónde salió el dato de la troza.
 *
 * Es un DERIVADO y el rótulo lo dice: «SERFOR» cuando la guía que la trajo
 * tiene su N° de constancia del SNIFFS —la lista de trozas bajó del documento
 * oficial—, «a mano» cuando no. Ninguna troza guarda un campo que declare esto;
 * presentarlo como un sello sería fabricar una garantía que el sistema no tiene.
 */
function OrigenDelDato({ origen }: { origen?: "serfor" | "manual" }) {
  if (origen == null) return <span className="text-[var(--text-tertiary)]">—</span>;
  const deSerfor = origen === "serfor";
  return (
    <span
      title={deSerfor
        ? "La guía trae su N° de constancia del SNIFFS: la lista de trozas bajó del documento oficial de SERFOR."
        : "La guía no tiene N° de constancia del SNIFFS: estas trozas se cargaron a mano o se importaron de una planilla."}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-0.5 font-bold ${deSerfor
        ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"}`}
    >
      {deSerfor ? <FileCheck className="h-3 w-3 shrink-0" aria-hidden /> : <PenLine className="h-3 w-3 shrink-0" aria-hidden />}
      {deSerfor ? "SERFOR" : "a mano"}
    </span>
  );
}

export default function CtpTrozasIngresadas({
  filas,
  libres,
  totalPatio,
  filtrando,
  cargando,
  seleccion,
  onSeleccion,
  /** Sin lote elegido la tabla se mira pero no se elige. */
  seleccionable,
  acotadaA,
  titulo,
  vacio,
  loteId,
  onSacarDelLote,
  /** Subtotal arriba, detalle plegado — mismo patrón que Consumos (Brandon,
   *  2026-09-01). `"ninguna"` (default) deja la tabla plana como siempre. */
  agrupar = "ninguna",
  menuAgrupar,
  filtrosColumna,
}: {
  /** Las piezas a dibujar — ya filtradas por la vista. */
  filas: TrozaConsumible[];
  /** De `filas`, las que se pueden tildar. */
  libres: TrozaConsumible[];
  /** Cuántas tiene el patio sin filtrar: para decir qué quedó afuera. */
  totalPatio: number;
  filtrando: boolean;
  cargando?: boolean;
  seleccion: Set<string>;
  onSeleccion: (ids: Set<string>) => void;
  seleccionable: boolean;
  /**
   * El lote que se está cargando. Sus piezas apartadas **se ven y se eligen**:
   * llegan tildadas —van a la sierra— pero se pueden destildar para dejarlas
   * para otra corrida. Antes ni siquiera aparecían: el filtro «Sólo libres» las
   * borraba y la tabla salía vacía con el botón prometiendo seis.
   */
  loteId?: string;
  /**
   * Devolver una pieza del lote al patio (recuperación).
   *
   * Apartar una troza no es consumirla: mientras el lote no entre a la sierra,
   * la madera sigue siendo del patio y tiene que poder salir para armar otro
   * lote. Sin esto, equivocarse al armar el lote obligaba a consumirlo.
   */
  onSacarDelLote?: (trozaId: string) => void;
  /**
   * Qué acotó la lista desde afuera (la especie y el tipo del lote elegido).
   * Se DICE: una tabla que muestra menos sin explicar por qué se lee como que
   * falta madera (ADR-342).
   */
  acotadaA?: string;
  /**
   * Qué lista se está mirando. Por defecto es el patio; el panel de Producción
   * le pasa «Trozas del lote LA-…» porque ahí las filas son las del lote y un
   * título que diga «del patio» manda a buscar piezas que no están en la tabla.
   */
  titulo?: string;
  /** Qué decir cuando no hay ni una fila (el vacío del patio no sirve al lote). */
  vacio?: string;
  agrupar?: AgrupacionPatio;
  /** El botón "Opciones · agrupar" — lo arma el llamador (mismo `ActionMenu`
   *  que ya usa Consumos), esto sólo le hace lugar en el header. */
  menuAgrupar?: React.ReactNode;
  /** Autofiltros en la cabecera. Sin esto la tabla queda como siempre. */
  filtrosColumna?: FiltrosPatioColumna;
}) {
  const fc = filtrosColumna ?? {};
  const totalVisible = filas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0);
  const elegidas = filas.filter((t) => seleccion.has(t.id));
  /** Cuántas de las elegidas venían apartadas en el lote — contexto, no un total aparte. */
  const delLoteElegidas = loteId == null ? 0 : elegidas.filter((t) => t.loteAserrioId === loteId).length;
  const volumenElegido = elegidas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0);
  const todasElegidas = libres.length > 0 && libres.every((t) => seleccion.has(t.id));
  /* La página se pagina sobre lo YA filtrado, y el rango se acota solo cuando
     un filtro achica la lista (ADR-344). Agrupado no pagina — igual que
     Consumos: los grupos son pocos, la lista de piezas es la que era mucha. */
  const { visibles: enPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(filas);
  const grupos = useMemo(() => agruparTrozas(filas, agrupar), [filas, agrupar]);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());

  const alternar = (id: string) => {
    const next = new Set(seleccion);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSeleccion(next);
  };

  /** Una fila — la misma sea la tabla plana o el detalle de un grupo abierto. */
  const filaTroza = (t: TrozaConsumible) => {
    const bloqueo = motivoBloqueo(t);
    const enLote = Boolean(t.loteAserrioId);
    /** Apartada en el lote que se está cargando: ya cuenta. */
    const delLote = loteId != null && t.loteAserrioId === loteId;
    /* Las del lote SÍ se eligen: el operador decide cuáles entran hoy a la
       sierra. Las que deje sin tildar siguen apartadas. */
    const elegible = !bloqueo && (!enLote || delLote);
    return (
      <tr key={t.id} className={`${seleccion.has(t.id) ? "bg-primary/5" : ""} hover:bg-[var(--surface-sunken)]`}>
        {seleccionable && (
          <td className="px-3 py-2">
            <input
              type="checkbox"
              checked={seleccion.has(t.id)}
              disabled={!elegible}
              onChange={() => alternar(t.id)}
              aria-label={`Elegir la troza ${t.codigoPlanta ?? t.codificacion ?? ""}`}
              title={delLote ? "Apartada en este lote. Destildala para dejarla para otra corrida." : undefined}
              className="h-5 w-5 accent-[var(--accent)] disabled:opacity-40"
            />
          </td>
        )}
        <td className="px-3 py-2 font-mono text-xs font-bold text-[var(--text-primary)]">{t.gtfNumber ?? "—"}</td>
        <td className="px-3 py-2 font-mono text-xs text-[var(--text-tertiary)]">{t.permiso ?? "—"}</td>
        <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{t.codificacion ?? "—"}</td>
        <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{t.codigoPlanta ?? "—"}</td>
        <td className="px-3 py-2 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
        <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{medidas(t)}</td>
        <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
          {t.volumenM3 != null ? fmtM3(Number(t.volumenM3)) : "—"}
        </td>
        <td className="px-3 py-2 text-xs">
          {delLote ? (
            <span className="inline-flex items-center gap-1">
              <span className="rounded-lg bg-primary/15 px-1.5 py-0.5 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
                en este lote
              </span>
              {onSacarDelLote && (
                <button
                  type="button"
                  onClick={() => onSacarDelLote(t.id)}
                  title="Sacar del lote y devolverla al patio"
                  className="rounded-lg px-1 py-0.5 text-[var(--text-tertiary)] underline-offset-2 hover:text-[var(--data-error-700)] hover:underline dark:hover:text-[var(--data-error-500)]"
                >
                  sacar
                </button>
              )}
            </span>
          ) : enLote ? (
            <span className="rounded-lg bg-primary/10 px-1.5 py-0.5 font-mono font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
              {t.loteAserrioCode ?? "en un lote"}
            </span>
          ) : bloqueo ? (
            <span className="text-[var(--text-tertiary)]">{bloqueo.replace(/_/g, " ")}</span>
          ) : (
            <span className="text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">Libre</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">{fmtDia(t.fechaRecepcion)}</td>
        {/* Fecha del ASIENTO de la guía en el libro. No es la recepción física:
            el camión puede descargar el miércoles una guía asentada el lunes, y
            confundirlas mueve el saldo del patio de día. */}
        <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]" title="Fecha del asiento de la guía en el libro — distinta de la recepción física de la pieza">
          {fmtDia(t.fechaIngreso)}
        </td>
        <td className="px-3 py-2 text-xs"><OrigenDelDato origen={t.origenDato} /></td>
      </tr>
    );
  };

  return (
    <section className="space-y-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
          <PackageOpen className="h-4 w-4 text-[var(--accent)]" aria-hidden />
          {titulo ?? "Trozas ingresadas en el patio"}
          {acotadaA && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">
              sólo {acotadaA}
            </span>
          )}
        </p>
        {menuAgrupar}
        {/* Los totales de la tabla viven en su pie y en los KPI; acá arriba sólo
            lo que cambia mientras se elige, que es lo que se mira. */}
        {elegidas.length > 0 && (
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {elegidas.length} elegida{elegidas.length === 1 ? "" : "s"} · {fmtM3(volumenElegido)} m³ ·{" "}
            {pieTablarDe(volumenElegido).toLocaleString("es-PE")} pt
            {delLoteElegidas > 0 && (
              <span className="ml-2 font-sans font-normal text-[var(--text-tertiary)]">
                ({delLoteElegidas} ya apartada{delLoteElegidas === 1 ? "" : "s"} en el lote)
              </span>
            )}
          </span>
        )}
      </header>

      {/* Qué se está mirando y qué quedó afuera: una tabla filtrada sin decirlo
          se lee como que la madera no está (ADR-343). */}
      {filtrando && (
        <p className="text-sm text-[var(--text-tertiary)]">
          Mostrando <b className="text-[var(--text-secondary)]">{filas.length}</b> de {totalPatio} piezas
          {seleccionable && libres.length > 0 && (
            <>
              {" "}
              ·{" "}
              <button
                type="button"
                onClick={() => onSeleccion(new Set([...seleccion, ...libres.map((t) => t.id)]))}
                className="font-bold text-[var(--accent-ink)] underline dark:text-[var(--accent)]"
              >
                elegir las {libres.length} de este filtro
              </button>
            </>
          )}
        </p>
      )}

      <TablaCtp>
        <TheadCtp>
          <tr>
            {seleccionable && (
              <th className="px-3 py-2">
                <input
                  type="checkbox"
                  checked={todasElegidas}
                  onChange={(e) => {
                    const next = new Set(seleccion);
                    for (const t of libres) {
                      if (e.target.checked) next.add(t.id);
                      else next.delete(t.id);
                    }
                    onSeleccion(next);
                  }}
                  aria-label="Elegir todas las trozas libres del filtro"
                  className="h-5 w-5 accent-[var(--accent)]"
                />
              </th>
            )}
            {/* Orden pedido por Brandon (2026-09-02): se lee de lo que
                IDENTIFICA el papel (guía, permiso) hacia lo que identifica la
                pieza (codificación, código de planta), después lo que se mide
                y por último en qué estado está. La especie queda pegada a las
                medidas: es parte de qué es la pieza, no de qué documento la
                ampara. */}
            <th className="px-3 py-2 font-bold">
              <span className="block">Guía</span>
              {fc.guia && <FiltroColumnaMulti label="Guía" {...fc.guia} />}
            </th>
            <th className="px-3 py-2 font-bold">
              <span className="block">Permiso</span>
              {fc.permiso && <FiltroColumna label="Permiso" {...fc.permiso} placeholder="Todos" />}
            </th>
            <th className="px-3 py-2 font-bold">Codificación</th>
            <th className="px-3 py-2 font-bold">Cód. planta</th>
            <th className="px-3 py-2 font-bold">
              <span className="block">Especie</span>
              {fc.especie && <FiltroColumna label="Especie" {...fc.especie} placeholder="Todas" />}
            </th>
            <th className="px-3 py-2 font-bold">Medidas</th>
            <th className="px-3 py-2 text-right font-bold">Volumen</th>
            <th className="px-3 py-2 font-bold">Estado</th>
            <th className="px-3 py-2 font-bold">Recibida</th>
            {/* Cuándo se asentó la guía y de dónde salió el dato — dos cosas
                distintas de la recepción física de la pieza. */}
            <th className="px-3 py-2 font-bold">Ingreso</th>
            <th className="px-3 py-2 font-bold">Dato</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {filas.length === 0 && (
            <FilaVacia cols={seleccionable ? 13 : 12}>
              {cargando
                ? "Leyendo el patio…"
                : totalPatio === 0
                  ? (vacio ?? "No hay trozas de guías recepcionadas. Recepcioná una guía en Ingresos y sus piezas aparecen acá.")
                  : "Ninguna troza coincide con el filtro."}
            </FilaVacia>
          )}
          {agrupar === "ninguna"
            ? enPagina.map(filaTroza)
            : grupos.map((g) => {
                const abierto = abiertos.has(g.clave);
                return (
                  <Fragment key={g.clave}>
                    <tr className="bg-[var(--surface-sunken)]">
                      <td colSpan={seleccionable ? 13 : 12} className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setAbiertos((prev) => {
                              const s2 = new Set(prev);
                              if (s2.has(g.clave)) s2.delete(g.clave);
                              else s2.add(g.clave);
                              return s2;
                            })
                          }
                          aria-expanded={abierto}
                          className="flex w-full items-center gap-2 text-left text-sm font-bold text-[var(--text-primary)]"
                        >
                          <ChevronRight
                            className={`h-4 w-4 shrink-0 transition-transform ${abierto ? "rotate-90" : ""}`}
                            aria-hidden
                          />
                          {g.clave}
                          <span className="font-normal text-[var(--text-tertiary)]">{g.piezas} pza</span>
                          <span className="ml-auto font-mono tabular-nums text-[var(--text-primary)]">
                            {fmtM3(g.volumenM3)} m³
                          </span>
                        </button>
                      </td>
                    </tr>
                    {abierto && g.trozas.map(filaTroza)}
                  </Fragment>
                );
              })}
        </TbodyCtp>
      </TablaCtp>

      {agrupar === "ninguna" ? (
        <CtpPaginacion
          rango={rango}
          porPagina={porPagina}
          onPorPagina={setPorPagina}
          onIr={ir}
          sustantivo="troza"
          extra={
            <span className="font-mono tabular-nums">
              {fmtM3(totalVisible)} m³ · {pieTablarDe(totalVisible).toLocaleString("es-PE")} pt
            </span>
          }
        />
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">
          <span className="font-mono tabular-nums text-[var(--text-secondary)]">{grupos.length} grupo(s)</span> ·{" "}
          {filas.length} troza{filas.length === 1 ? "" : "s"} · {fmtM3(totalVisible)} m³
        </p>
      )}
    </section>
  );
}
