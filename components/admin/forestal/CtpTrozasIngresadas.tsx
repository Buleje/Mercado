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

import { PackageOpen } from "@buleje/design-system/icons";
import { motivoBloqueo, type TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { pieTablarDe } from "@/lib/forestal/lotes-aserrio";
import { CtpPaginacion, FilaVacia, TablaCtp, TbodyCtp, TheadCtp, usePaginacion } from "./ctp-tabla";

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
}) {
  const totalVisible = filas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0);
  const elegidas = filas.filter((t) => seleccion.has(t.id));
  /** Cuántas de las elegidas venían apartadas en el lote — contexto, no un total aparte. */
  const delLoteElegidas = loteId == null ? 0 : elegidas.filter((t) => t.loteAserrioId === loteId).length;
  const volumenElegido = elegidas.reduce((a, t) => a + Number(t.volumenM3 ?? 0), 0);
  const todasElegidas = libres.length > 0 && libres.every((t) => seleccion.has(t.id));
  /* La página se pagina sobre lo YA filtrado, y el rango se acota solo cuando
     un filtro achica la lista (ADR-344). */
  const { visibles: enPagina, rango, porPagina, setPorPagina, ir } = usePaginacion(filas);

  const alternar = (id: string) => {
    const next = new Set(seleccion);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSeleccion(next);
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
        {/* Los totales de la tabla viven en su pie y en los KPI; acá arriba sólo
            lo que cambia mientras se elige, que es lo que se mira. */}
        {elegidas.length > 0 && (
          <span className="font-mono text-sm font-bold tabular-nums text-[var(--accent-ink)] dark:text-[var(--accent)]">
            {elegidas.length} elegida{elegidas.length === 1 ? "" : "s"} · {volumenElegido.toFixed(4)} m³ ·{" "}
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
            <th className="px-3 py-2 font-bold">Cód. planta</th>
            <th className="px-3 py-2 font-bold">Codificación</th>
            <th className="px-3 py-2 font-bold">Especie</th>
            <th className="px-3 py-2 font-bold">Guía</th>
            <th className="px-3 py-2 font-bold">Medidas</th>
            <th className="px-3 py-2 font-bold">Recibida</th>
            <th className="px-3 py-2 text-right font-bold">Volumen</th>
            <th className="px-3 py-2 font-bold">Estado</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {enPagina.length === 0 && (
            <FilaVacia cols={seleccionable ? 9 : 8}>
              {cargando
                ? "Leyendo el patio…"
                : totalPatio === 0
                  ? (vacio ?? "No hay trozas de guías recepcionadas. Recepcioná una guía en Ingresos y sus piezas aparecen acá.")
                  : "Ninguna troza coincide con el filtro."}
            </FilaVacia>
          )}
          {enPagina.map((t) => {
            const bloqueo = motivoBloqueo(t);
            const enLote = Boolean(t.loteAserrioId);
            /** Apartada en el lote que se está cargando: ya cuenta. */
            const delLote = loteId != null && t.loteAserrioId === loteId;
            /* Las del lote SÍ se eligen: el operador decide cuáles entran hoy
               a la sierra. Las que deje sin tildar siguen apartadas. */
            const elegible = !bloqueo && (!enLote || delLote);
            return (
              <tr
                key={t.id}
                className={`${seleccion.has(t.id) ? "bg-primary/5" : ""} hover:bg-[var(--surface-sunken)]`}
              >
                {seleccionable && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={seleccion.has(t.id)}
                      disabled={!elegible}
                      onChange={() => alternar(t.id)}
                      aria-label={`Elegir la troza ${t.codigoPlanta ?? t.codificacion ?? ""}`}
                      title={
                        delLote
                          ? "Apartada en este lote. Destildala para dejarla para otra corrida."
                          : undefined
                      }
                      className="h-5 w-5 accent-[var(--accent)] disabled:opacity-40"
                    />
                  </td>
                )}
                <td className="px-3 py-2 font-mono font-bold text-[var(--text-primary)]">{t.codigoPlanta ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-[var(--text-secondary)]">{t.codificacion ?? "—"}</td>
                <td className="px-3 py-2 text-[var(--text-secondary)]">{t.especieComun ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-[var(--text-tertiary)]">{t.gtfNumber ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">{medidas(t)}</td>
                <td className="px-3 py-2 text-xs text-[var(--text-tertiary)]">{fmtDia(t.fechaRecepcion)}</td>
                <td className="px-3 py-2 text-right font-mono font-bold tabular-nums text-[var(--text-primary)]">
                  {t.volumenM3 != null ? Number(t.volumenM3).toFixed(4) : "—"}
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
              </tr>
            );
          })}
        </TbodyCtp>
      </TablaCtp>

      <CtpPaginacion
        rango={rango}
        porPagina={porPagina}
        onPorPagina={setPorPagina}
        onIr={ir}
        sustantivo="troza"
        extra={
          <span className="font-mono tabular-nums">
            {totalVisible.toFixed(4)} m³ · {pieTablarDe(totalVisible).toLocaleString("es-PE")} pt
          </span>
        }
      />
    </section>
  );
}
