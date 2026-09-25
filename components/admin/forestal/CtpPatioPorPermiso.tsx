"use client";

/**
 * CtpPatioPorPermiso — «¿cuántas trozas me quedan por permiso?» (ADR-431).
 *
 * COMPARTIDO: lo monta Consumos (apartado Patio, el clic filtra la tabla de
 * abajo) y Saldos (en «Cómo está hoy», compacto, el clic filtra «Qué puede
 * salir»). Las dos puertas muestran el MISMO número porque las filas salen de
 * una sola función pura, `resumenPorPermiso` (lib/forestal/patio-resumen), que
 * reparte lo vivo del libro en tres cubetas:
 *   · en el patio = libres + en lote (la guía se recibió);
 *   · por recepcionar = anotado, pero la guía sigue en la bandeja.
 * Lo por recepcionar NUNCA muestra «días en el patio»: su única fecha es la del
 * asiento, y se rotula así.
 *
 * Son m³ del patio PIEZA POR PIEZA: no es el saldo que se declara ante SERFOR
 * (ése vive en Saldos › Lo que firma el libro). El ≈pt es un derivado al 56 %.
 *
 * A 400 px la tabla del panel se vuelve tarjetas sola (`useMobileTableCards`):
 * sin scroll horizontal en la página.
 */

import { useId } from "react";
import { FileDown, Inbox } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { FilaPermisoPatio, TotalesPermisoPatio } from "@/lib/forestal/patio-resumen";
import { SEVERIDAD_TRAMO_DIAS, TONO_TRAMO_DIAS, tramoDeDias } from "@/lib/forestal/patio-dias";
import { diaConNombre, fechaCorta } from "@/lib/forestal/plazo-de-apartado";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import { TablaCtp, TbodyCtp, TheadCtp } from "./ctp-tabla";

export interface CtpPatioPorPermisoProps {
  /** De `resumenPorPermiso(respuesta entera de /trozas/patio, ahora)`. */
  filas: FilaPermisoPatio[];
  totales: TotalesPermisoPatio;
  /** Los permisos que ya filtran la tabla de la vista: su fila va `aria-pressed`. */
  activos: readonly string[];
  /** Clic en una fila con madera en el patio: filtrar por ese permiso. */
  onElegir: (permiso: string) => void;
  /**
   * La fila que está TODA por recepcionar no filtra (daría una tabla vacía): su
   * acción es ir a recepcionar la guía. Sin esto, la fila sólo lo dice.
   */
  onRecepcionar?: (permiso: string) => void;
  /** «Descargar el patio por permiso (Excel)», en la cabecera del bloque. */
  onDescargar?: () => void;
  /** Saldos: menos columnas (sin ≈pt, guías ni especies) y relleno menor. */
  compacto?: boolean;
  cargando?: boolean;
  error?: string | null;
  /** Default «Por permiso». Saldos lo nombra «Patio por permiso: trozas que quedan». */
  titulo?: string;
  /**
   * Consumos (2026-09-24): la tabla va DENTRO de la tarjeta «Qué queda en el
   * patio», que ya pone el título, el Excel y el ⓘ con la nota de qué miden
   * las cifras.
   */
  sinCabecera?: boolean;
}

/** Qué miden estas cifras y qué hace el clic, dicho una sola vez. */
const NOTA =
  "m³ del patio pieza por pieza, no el saldo que se declara · ≈pt = derivado al 56 %. Clic en un permiso para ver solo sus trozas.";

const nf = (n: number) => formatNumber(n);
/**
 * ≈pt, guías y especies sólo en pantalla ancha: a 400 px cada fila es una
 * tarjeta y esas tres cifras la estiraban a 400 px (medido). `!` porque la
 * tarjeta móvil del panel pone `display:flex` a cada celda.
 */
const SOLO_ANCHO = "max-sm:hidden!";
const trozas = (n: number) => `${nf(n)} troza${n === 1 ? "" : "s"}`;

const TONO_PASTILLA = {
  ok: "bg-[var(--data-success-500)]/15",
  warn: "bg-[var(--data-warning-500)]/20",
  danger: "bg-[var(--data-error-500)]/15",
} as const;

/** Días con su severidad EN TEXTO: el tramo nunca va sólo en color (WCAG 1.4.1). */
function Dias({ dias }: { dias: number }) {
  const tramo = tramoDeDias(dias);
  if (!tramo) return null;
  const severidad = SEVERIDAD_TRAMO_DIAS[tramo];
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-0.5 text-sm font-semibold text-[var(--text-primary)] ${TONO_PASTILLA[TONO_TRAMO_DIAS[tramo]]}`}
    >
      {nf(dias)} días{severidad !== "fresca" ? ` · ${severidad}` : ""}
    </span>
  );
}

/**
 * Fecha y días en UN renglón (2026-09-24): en dos, cada fila de la tabla medía
 * ~52 px y «Por permiso» empujaba la tabla de trozas media pantalla abajo. El
 * día de la semana va en el `title` — la pastilla ya dice la edad.
 */
function MasVieja({ fila }: { fila: Pick<FilaPermisoPatio, "masVieja"> }) {
  if (!fila.masVieja) return <span className="text-[var(--text-secondary)]">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5" title={`Recibida el ${diaConNombre(fila.masVieja.fecha)}`}>
      <span className="whitespace-nowrap tabular-nums text-[var(--text-primary)]">{fechaCorta(fila.masVieja.fecha)}</span>
      <Dias dias={fila.masVieja.dias} />
    </span>
  );
}

function PorRecepcionar({ p }: { p: FilaPermisoPatio["porRecepcionar"] }) {
  if (p.trozas === 0) return <span className="text-[var(--text-secondary)]">—</span>;
  return (
    <span className="flex flex-col gap-0.5">
      <span className="whitespace-nowrap tabular-nums text-[var(--text-primary)]">
        {trozas(p.trozas)} · {fmtM3(p.m3)} m³
      </span>
      <span className="text-sm text-[var(--text-secondary)]">
        {p.guias === 1 ? "1 guía" : `${nf(p.guias)} guías`}
        {p.asientoMasViejo ? ` · asentada hace ${nf(p.asientoMasViejo.dias)} días (sin recepcionar)` : " sin recepcionar"}
      </span>
    </span>
  );
}

export default function CtpPatioPorPermiso({
  filas,
  totales,
  activos,
  onElegir,
  onRecepcionar,
  onDescargar,
  compacto = false,
  cargando = false,
  error = null,
  titulo = "Por permiso",
  sinCabecera = false,
}: CtpPatioPorPermisoProps) {
  const idTitulo = useId();
  const celda = compacto ? "px-2 py-1.5" : "px-3 py-2";
  const columnas = compacto ? 5 : 8;
  const sinDatos = !cargando && !error && filas.length === 0;

  return (
    <section
      aria-labelledby={sinCabecera ? undefined : idTitulo}
      aria-label={sinCabecera ? titulo : undefined}
      aria-busy={cargando || undefined}
      className="space-y-2"
    >
      {!sinCabecera && (
      <header className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <CardTitle as="h3" id={idTitulo} className="text-base font-bold text-[var(--text-primary)]">
              {titulo}
            </CardTitle>
            <InfoTip title={titulo} what={NOTA} />
          </div>
        </div>
        {onDescargar && (
          <button
            type="button"
            onClick={onDescargar}
            disabled={filas.length === 0}
            className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] disabled:opacity-50"
          >
            <FileDown className="h-4 w-4" aria-hidden />
            Descargar el patio por permiso (Excel)
          </button>
        )}
      </header>
      )}

      {error && (
        <p role="status" className="rounded-xl border-2 border-[var(--data-error-500)] px-3 py-2 text-sm font-bold text-[var(--text-primary)]">
          No se pudo leer el patio: {error}
        </p>
      )}

      <TablaCtp>
        <caption className="sr-only">{titulo}: trozas que quedan en el patio por permiso</caption>
        <TheadCtp>
          <tr>
            <th scope="col" className={celda}>Permiso</th>
            <th scope="col" className={`relative ${celda} text-right`}>
              Trozas<span className="sr-only"> en el patio</span>
            </th>
            <th scope="col" className={`relative ${celda} text-right`}>
              m³<span className="sr-only"> en el patio</span>
            </th>
            {!compacto && (
              <th scope="col" className={`relative ${celda} text-right`}>
                ≈pt<span className="sr-only"> aserrable, derivado al 56 %</span>
              </th>
            )}
            {!compacto && <th scope="col" className={`${celda} text-right`}>Guías</th>}
            {!compacto && <th scope="col" className={`${celda} text-right`}>Especies</th>}
            <th scope="col" className={celda}>La más vieja</th>
            <th scope="col" className={celda}>Por recepcionar</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {cargando && filas.length === 0 && (
            <tr>
              <td colSpan={columnas} className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
                Leyendo el patio…
              </td>
            </tr>
          )}
          {sinDatos && (
            <tr>
              <td colSpan={columnas} className="px-3 py-6 text-center text-sm text-[var(--text-secondary)]">
                No queda madera viva en el patio ni por recepcionar.
              </td>
            </tr>
          )}
          {filas.map((f) => {
            const activo = f.permiso != null && activos.includes(f.permiso);
            const todoPorRecepcionar = f.enPatio.trozas === 0 && f.porRecepcionar.trozas > 0;
            return (
              <tr key={f.permiso ?? "sin-permiso"} className={activo ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]"}>
                <td className={celda}>
                  {f.permiso == null ? (
                    <span className="flex flex-col">
                      <span className="font-bold text-[var(--text-primary)]">Sin permiso declarado</span>
                      <span className="text-sm text-[var(--text-secondary)]">No se puede filtrar: la troza no dice su título.</span>
                    </span>
                  ) : todoPorRecepcionar ? (
                    <span className="flex flex-col items-start gap-1">
                      <span className="font-bold text-[var(--text-primary)]">{f.permiso}</span>
                      <span className="text-sm text-[var(--text-secondary)]">0 en el patio · {nf(f.porRecepcionar.trozas)} por recepcionar</span>
                      {onRecepcionar && (
                        <button
                          type="button"
                          onClick={() => onRecepcionar(f.permiso as string)}
                          aria-label={`Recepcionar la guía de ${f.permiso}: ${trozas(f.porRecepcionar.trozas)} por recepcionar`}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border-2 border-[var(--accent)] px-2 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-primary/10"
                        >
                          <Inbox className="h-4 w-4" aria-hidden /> Recepcionar
                        </button>
                      )}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onElegir(f.permiso as string)}
                      aria-pressed={activo}
                      aria-label={`Filtrar el patio por ${f.permiso}: ${trozas(f.enPatio.trozas)}, ${fmtM3(f.enPatio.m3)} m³`}
                      className={`flex min-h-8 w-full flex-col items-start rounded-lg border-2 px-2 py-1 text-left transition-colors ${
                        activo ? "border-[var(--accent)]" : "border-transparent hover:border-[var(--accent)]"
                      }`}
                    >
                      <span className="font-bold text-[var(--text-primary)]">{f.permiso}</span>
                      {f.resolucion && !compacto && (
                        <span className="line-clamp-1 max-w-[22rem] break-all text-sm text-[var(--text-secondary)]">Res. {f.resolucion}</span>
                      )}
                    </button>
                  )}
                </td>
                <td className={`${celda} text-right font-bold tabular-nums text-[var(--text-primary)]`}>
                  {nf(f.enPatio.trozas)}
                  {f.enLote.trozas > 0 && (
                    <span className="block text-sm font-normal text-[var(--text-secondary)]">{nf(f.enLote.trozas)} en lote</span>
                  )}
                </td>
                <td className={`${celda} text-right tabular-nums text-[var(--text-primary)]`}>{fmtM3(f.enPatio.m3)}</td>
                {!compacto && (
                  <td className={`${celda} ${SOLO_ANCHO} text-right tabular-nums text-[var(--text-secondary)]`}>≈{nf(f.enPatio.ptAserrable)}</td>
                )}
                {!compacto && <td className={`${celda} ${SOLO_ANCHO} text-right tabular-nums text-[var(--text-secondary)]`}>{nf(f.guias)}</td>}
                {!compacto && <td className={`${celda} ${SOLO_ANCHO} text-right tabular-nums text-[var(--text-secondary)]`}>{nf(f.especies)}</td>}
                <td className={celda}><MasVieja fila={f} /></td>
                <td className={celda}><PorRecepcionar p={f.porRecepcionar} /></td>
              </tr>
            );
          })}
        </TbodyCtp>
        {filas.length > 1 && (
          <tfoot className="border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)]">
            <tr>
              <th scope="row" className={`${celda} text-left font-bold text-[var(--text-primary)]`}>
                Total · {totales.permisos === 1 ? "1 permiso" : `${nf(totales.permisos)} permisos`}
              </th>
              <td className={`${celda} text-right font-bold tabular-nums text-[var(--text-primary)]`}>{nf(totales.enPatio.trozas)}</td>
              <td className={`${celda} text-right font-bold tabular-nums text-[var(--text-primary)]`}>{fmtM3(totales.enPatio.m3)}</td>
              {!compacto && (
                <td className={`${celda} ${SOLO_ANCHO} text-right tabular-nums text-[var(--text-secondary)]`}>≈{nf(totales.enPatio.ptAserrable)}</td>
              )}
              {!compacto && <td className={`${celda} ${SOLO_ANCHO} text-right tabular-nums text-[var(--text-secondary)]`}>{nf(totales.guias)}</td>}
              {!compacto && <td className={`${celda} ${SOLO_ANCHO} text-right tabular-nums text-[var(--text-secondary)]`}>{nf(totales.especies)}</td>}
              <td className={celda}><MasVieja fila={totales} /></td>
              <td className={celda}><PorRecepcionar p={totales.porRecepcionar} /></td>
            </tr>
          </tfoot>
        )}
      </TablaCtp>
    </section>
  );
}
