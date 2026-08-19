"use client";

/**
 * La tabla de la lista de trozas del ingreso (ADR-336).
 *
 * Vive aparte del contenedor porque son dos responsabilidades distintas: acá
 * está QUÉ SE VE de cada pieza (y cómo se ordena y se edita), allá QUÉ SE HACE
 * con la selección. Juntas pasaban las 400 líneas.
 *
 * Regla de la vista: el **orden del documento manda**. Ordenar por otra columna
 * es sólo una lente para trabajar —la lista se guarda siempre como la declara
 * la guía— y por eso el encabezado dice cuál está activa y se puede volver.
 */

import { AlertTriangle, ArrowDown, ArrowUp, ArrowUpDown } from "@buleje/design-system/icons";
import type { TrozaImportada } from "@/lib/forestal/trozas-import";
import type { CampoOrden, DireccionOrden } from "@/lib/forestal/trozas-recepcion";
import { normalizarCodigo } from "@/lib/forestal/trozas-recepcion";
import type { CodigoTomado } from "@/hooks/use-codigos-planta";

const TH = "px-2 py-2 text-left align-bottom text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]";
const TD = "px-2 py-1.5 align-middle";
const CELDA =
  "h-9 rounded-lg border-[1.5px] border-[var(--rule-base)] bg-[var(--surface-canvas)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-muted)] disabled:opacity-40";

/** Una fila de la vista: la troza y en qué posición está en la lista real. */
export interface FilaTroza {
  troza: TrozaImportada;
  idx: number;
}

interface Props {
  filas: FilaTroza[];
  seleccion: Set<number>;
  orden: { campo: CampoOrden; dir: DireccionOrden };
  /** Códigos repetidos DENTRO de esta lista (en mayúsculas). */
  repetidos: Set<string>;
  /** Códigos que ya existen en el libro (en mayúsculas). */
  enUso: Map<string, CodigoTomado>;
  onOrden: (campo: CampoOrden) => void;
  /** `rango` = shift+click: selecciona desde la última tocada hasta ésta. */
  onSeleccionar: (idx: number, opts: { rango: boolean }) => void;
  onLlego: (idx: number, llego: boolean) => void;
  onCodigo: (idx: number, valor: string) => void;
  onFecha: (idx: number, valor: string) => void;
}

/** Encabezado que ordena. El ícono dice si está activo y en qué dirección. */
function ThOrden({
  campo,
  label,
  orden,
  onOrden,
  alineado = "left",
  titulo,
}: {
  campo: CampoOrden;
  label: string;
  orden: Props["orden"];
  onOrden: Props["onOrden"];
  alineado?: "left" | "right";
  titulo?: string;
}) {
  const activo = orden.campo === campo;
  const Icono = !activo ? ArrowUpDown : orden.dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={`${TH} ${alineado === "right" ? "text-right" : ""}`} title={titulo}>
      <button
        type="button"
        onClick={() => onOrden(campo)}
        aria-label={`Ordenar por ${label}`}
        className={`inline-flex items-center gap-1 rounded transition-colors hover:text-[var(--text-primary)] ${
          activo ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : ""
        } ${alineado === "right" ? "flex-row-reverse" : ""}`}
      >
        {label}
        <Icono className={`h-3 w-3 shrink-0 ${activo ? "" : "opacity-40"}`} aria-hidden />
      </button>
    </th>
  );
}

export default function CtpPiezasTabla({
  filas,
  seleccion,
  orden,
  repetidos,
  enUso,
  onOrden,
  onSeleccionar,
  onLlego,
  onCodigo,
  onFecha,
}: Props) {
  return (
    <div className="max-h-[26rem] overflow-auto rounded-lg border border-[var(--rule-soft)] bg-[var(--surface-raised)]">
      <table className="w-full min-w-[860px] text-sm">
        <caption className="sr-only">
          Piezas declaradas por la guía, con su recepción, código de planta y fecha de llegada
        </caption>
        <thead className="sticky top-0 z-10 bg-[var(--surface-sunken)]">
          <tr>
            <th scope="col" className={`${TH} w-9`} title="Elegir para las acciones en lote">
              <span className="sr-only">Elegir</span>
            </th>
            <ThOrden campo="recepcion" label="Llegó" orden={orden} onOrden={onOrden} titulo="Tildada = bajó del camión" />
            <ThOrden campo="codificacion" label="Cód. de la guía" orden={orden} onOrden={onOrden} />
            <ThOrden
              campo="codigoPlanta"
              label="Cód. de planta"
              orden={orden}
              onOrden={onOrden}
              titulo="El número que este centro le marca a la pieza. Único: no se repite en ninguna otra troza"
            />
            <ThOrden campo="fechaRecepcion" label="Recepción" orden={orden} onOrden={onOrden} titulo="Cuándo bajó del camión" />
            <ThOrden campo="especieComun" label="Especie" orden={orden} onOrden={onOrden} />
            <ThOrden campo="d1Cm" label="D1" orden={orden} onOrden={onOrden} alineado="right" />
            <ThOrden campo="d2Cm" label="D2" orden={orden} onOrden={onOrden} alineado="right" />
            <ThOrden campo="largoM" label="Largo" orden={orden} onOrden={onOrden} alineado="right" />
            <ThOrden campo="volumenM3" label="m³" orden={orden} onOrden={onOrden} alineado="right" />
          </tr>
        </thead>
        <tbody>
          {filas.map(({ troza: t, idx }) => {
            const codigo = normalizarCodigo(t.codigoPlanta);
            const clave = codigo?.toUpperCase() ?? "";
            const repetido = Boolean(clave && repetidos.has(clave));
            const tomado = clave ? enUso.get(clave) : undefined;
            const choca = repetido || Boolean(tomado);
            const elegida = seleccion.has(idx);
            return (
              <tr
                key={`${t.orden}-${t.codificacion ?? idx}`}
                className={`border-t border-[var(--rule-soft)] transition-colors ${
                  t.noRecepcionada
                    ? "bg-[var(--data-warning-50)] dark:bg-[var(--data-warning-500)]/10"
                    : elegida
                      ? "bg-[var(--accent-muted)]/40"
                      : ""
                }`}
              >
                <td className={TD}>
                  <input
                    type="checkbox"
                    checked={elegida}
                    onChange={(e) =>
                      onSeleccionar(idx, {
                        rango: (e.nativeEvent as MouseEvent | undefined)?.shiftKey ?? false,
                      })
                    }
                    onClick={(e) => {
                      if (e.shiftKey) onSeleccionar(idx, { rango: true });
                    }}
                    aria-label={`Elegir la troza ${t.codificacion ?? idx + 1}`}
                    className="h-4 w-4 accent-[var(--accent)]"
                  />
                </td>
                <td className={TD}>
                  <input
                    type="checkbox"
                    checked={!t.noRecepcionada}
                    onChange={(e) => onLlego(idx, e.target.checked)}
                    aria-label={`La troza ${t.codificacion ?? idx + 1} llegó al patio`}
                    className="h-4 w-4 accent-[var(--data-success-600)]"
                  />
                </td>
                <td className={`${TD} font-mono font-bold text-[var(--text-primary)]`}>{t.codificacion ?? "—"}</td>
                <td className={TD}>
                  <input
                    value={t.codigoPlanta ?? ""}
                    onChange={(e) => onCodigo(idx, e.target.value)}
                    disabled={t.noRecepcionada}
                    placeholder="—"
                    aria-label={`Código de planta de la troza ${t.codificacion ?? idx + 1}`}
                    aria-invalid={choca}
                    className={`${CELDA} w-28 font-mono ${
                      choca ? "border-[var(--data-error-500)] bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/10" : ""
                    }`}
                  />
                  {choca && (
                    <span className="mt-0.5 flex items-start gap-1 text-[length:var(--ts-2xs)] font-bold leading-tight text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                      {repetido
                        ? "repetido en esta lista"
                        : `ya usado · GTF ${tomado?.gtfNumber}${tomado?.codificacion ? ` (${tomado.codificacion})` : ""}`}
                    </span>
                  )}
                </td>
                <td className={TD}>
                  <input
                    type="date"
                    value={t.fechaRecepcion ?? ""}
                    onChange={(e) => onFecha(idx, e.target.value)}
                    disabled={t.noRecepcionada}
                    aria-label={`Fecha en que llegó la troza ${t.codificacion ?? idx + 1}`}
                    className={`${CELDA} w-[8.5rem]`}
                  />
                </td>
                <td className={`${TD} text-[var(--text-secondary)]`}>{t.especieComun ?? "—"}</td>
                <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-tertiary)]`}>{t.d1Cm ?? "—"}</td>
                <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-tertiary)]`}>{t.d2Cm ?? "—"}</td>
                <td className={`${TD} text-right font-mono tabular-nums text-[var(--text-tertiary)]`}>{t.largoM ?? "—"}</td>
                <td className={`${TD} text-right font-mono font-bold tabular-nums text-[var(--text-primary)]`}>
                  {t.volumenM3 != null ? t.volumenM3.toFixed(4) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
