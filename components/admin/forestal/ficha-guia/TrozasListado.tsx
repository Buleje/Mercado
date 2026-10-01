"use client";

/**
 * La lista de trozas de la ficha de la guía, en sus dos formas: tabla (ancha)
 * y lista (angosta). Sale de `BloqueTrozas` para que el bloque siga siendo
 * sólo filtros + paginación (≤300 líneas).
 *
 * Dos juegos de medidas (Brandon, 2026-09-26): las de la GUÍA —D1 y D2 en cm,
 * largo en m, cada una en su columna— y las de la cubicación OXAPAMPA propia
 * —D1″, D2″, L′ y su PT congelado—. «—» por cada dato que falta: una sola
 * celda «Medidas» escondía el largo cuando faltaba un diámetro (77 de 84
 * trozas del patio de Blas no traen D1/D2).
 */

import { Info, QrCode } from "@buleje/design-system/icons";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { ptDeTroza } from "@/lib/forestal/cubicacion-oxapampa";
import {
  ROTULO_ESTADO_TROZA,
  estadoDeTroza,
  type EstadoTrozaFicha,
} from "@/lib/forestal/ficha-guia-resumen";
import { medidasDeFicha } from "@/lib/forestal/ficha-texto-troza";
import { formatNumber } from "@/lib/format";
import { formatDate } from "../ctp-shared";
import { FilaVacia, TablaCtp, TbodyCtp, TheadCtp } from "../ctp-tabla";
import type { TrozaDeFicha } from "../CtpGuiaFichaModal";
import { diaCorto } from "../costo-guia/comun";
import { Pastilla, type Tono } from "./comun";

const TONO_ESTADO: Record<EstadoTrozaFicha, Tono> = {
  en_patio: "exito",
  sin_recibir: "neutro",
  aserrada: "info",
  despachada: "marca",
  retrozada: "info",
  no_llego: "aviso",
  descarte: "neutro",
};

const m3 = (v: unknown) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? fmtM3(n) : "—";
};
/** Una medida o «—»: cada dato faltante se ve como tal, no esconde a los otros. */
const med = (v: number | null | undefined, max: number) =>
  v == null ? "—" : formatNumber(v, { max });
const sumaM3 = (ts: readonly TrozaDeFicha[]) =>
  ts.reduce((s, t) => s + (Number(t.volumenM3) || 0), 0);

/** Con alguna medida Oxapampa y sin pt: le falta una punta o el largo (media medida = sin cubicar). */
const aMedias = (t: TrozaDeFicha) =>
  ptDeTroza(t) == null && (t.oxD1Pulg != null || t.oxD2Pulg != null || t.oxLargoPies != null);

const TD = "px-2.5 py-2";
const TD_NUM = `${TD} whitespace-nowrap text-right font-mono tabular-nums`;

/** ⓘ de «D1/D2 medidos en planta»: la guía no los traía. */
function EnPlanta() {
  return (
    <span
      title="Medido en planta: la guía no lo traía"
      className="ml-0.5 inline-flex align-middle text-[var(--text-tertiary)]"
    >
      <Info className="h-3.5 w-3.5" aria-hidden />
      <span className="sr-only">(medido en planta)</span>
    </span>
  );
}

function EstadoCelda({ t }: { t: TrozaDeFicha }) {
  const e = estadoDeTroza(t);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Pastilla tono={TONO_ESTADO[e]} tam="sm">
        {ROTULO_ESTADO_TROZA[e]}
      </Pastilla>
      {t.etiquetadaEn && (
        <span
          title={`Etiqueta impresa el ${formatDate(t.etiquetadaEn)}`}
          className="text-[var(--accent-ink)]"
        >
          <QrCode className="h-4 w-4" aria-hidden />
          <span className="sr-only">etiquetada</span>
        </span>
      )}
    </span>
  );
}

export interface PropsListado {
  /** Lo que se ve en esta página (o todas, con «ver las N de una»). */
  filas: TrozaDeFicha[];
  numero: (i: number) => number;
  /** Todas las que pasan el filtro: el pie suma éstas. */
  filtradas: TrozaDeFicha[];
  filtrando: boolean;
  /** Oxapampa de las filtradas. */
  ox: { pt: number; cubicadas: number };
  enOtraFila: Map<string, string>;
}

export function TablaTrozas({ filas, numero, filtradas, filtrando, ox, enOtraFila }: PropsListado) {
  return (
    <div className="hidden @min-[34rem]/trozas:block">
      <TablaCtp altoMax="max-h-[26rem]">
        <TheadCtp>
          <tr>
            <th colSpan={2} />
            <th
              colSpan={4}
              className="border-b border-[var(--rule-base)] px-2.5 pt-2 text-center font-bold"
            >
              La guía
            </th>
            <th
              colSpan={4}
              className="border-b border-[var(--rule-base)] px-2.5 pt-2 text-center font-bold"
            >
              Oxapampa
            </th>
            <th />
          </tr>
          <tr>
            <th className="whitespace-nowrap px-2.5 py-2 font-bold">N°</th>
            <th className="whitespace-nowrap px-2.5 py-2 font-bold">Troza</th>
            <th className="whitespace-nowrap px-2.5 py-2 text-right font-bold">D1 cm</th>
            <th className="whitespace-nowrap px-2.5 py-2 text-right font-bold">D2 cm</th>
            <th className="whitespace-nowrap px-2.5 py-2 text-right font-bold">Largo m</th>
            <th className="whitespace-nowrap px-2.5 py-2 text-right font-bold">m³</th>
            <th className="whitespace-nowrap px-2.5 py-2 text-right font-bold">D1″</th>
            <th className="whitespace-nowrap px-2.5 py-2 text-right font-bold">D2″</th>
            <th className="whitespace-nowrap px-2.5 py-2 text-right font-bold">L′</th>
            <th className="whitespace-nowrap px-2.5 py-2 text-right font-bold">PT</th>
            <th className="whitespace-nowrap px-2.5 py-2 font-bold">Estado · llegada</th>
          </tr>
        </TheadCtp>
        <TbodyCtp>
          {filas.length === 0 && <FilaVacia cols={11}>Ninguna troza con ese filtro.</FilaVacia>}
          {filas.map((t, i) => {
            const pt = ptDeTroza(t);
            return (
              <tr key={t.id} className="hover:bg-[var(--surface-sunken)]">
                <td className={`${TD} font-mono tabular-nums text-[var(--text-tertiary)]`}>
                  {numero(i)}
                </td>
                <td className={TD}>
                  <span className="font-mono font-bold text-[var(--text-primary)]">
                    {t.codificacion ?? "—"}
                  </span>
                  <span className="block text-xs text-[var(--text-secondary)]">
                    {t.especieComun ?? "—"}
                    {/* La marca de planta sólo si dice otra cosa que la del bosque. */}
                    {t.codigoPlanta && t.codigoPlanta !== t.codificacion && (
                      <span className="whitespace-nowrap font-mono text-[var(--text-tertiary)]">
                        {" "}
                        · planta {t.codigoPlanta}
                      </span>
                    )}
                  </span>
                  {enOtraFila.has(t.id) && (
                    <span className="rounded-full bg-[var(--data-warning-500)]/15 px-1.5 text-xs font-bold text-[var(--data-warning-ink)]">
                      en fila {enOtraFila.get(t.id)}
                    </span>
                  )}
                </td>
                <td className={`${TD_NUM} text-[var(--text-secondary)]`}>
                  {med(t.d1Cm, 1)}
                  {t.d1d2MedidoEnPlanta && t.d1Cm != null && <EnPlanta />}
                </td>
                <td className={`${TD_NUM} text-[var(--text-secondary)]`}>
                  {med(t.d2Cm, 1)}
                  {t.d1d2MedidoEnPlanta && t.d2Cm != null && <EnPlanta />}
                </td>
                <td className={`${TD_NUM} text-[var(--text-secondary)]`}>{med(t.largoM, 2)}</td>
                <td className={`${TD_NUM} text-[var(--text-primary)]`}>{m3(t.volumenM3)}</td>
                <td className={`${TD_NUM} text-[var(--text-secondary)]`}>{med(t.oxD1Pulg, 2)}</td>
                <td className={`${TD_NUM} text-[var(--text-secondary)]`}>{med(t.oxD2Pulg, 2)}</td>
                <td className={`${TD_NUM} text-[var(--text-secondary)]`}>
                  {med(t.oxLargoPies, 2)}
                </td>
                <td
                  className={`${TD_NUM} font-bold ${pt == null ? "text-[var(--text-tertiary)]" : "text-[var(--text-primary)]"}`}
                >
                  {pt != null ? (
                    fmtPt(pt)
                  ) : aMedias(t) ? (
                    <span className="font-sans text-xs text-[var(--data-warning-ink)]">
                      a medias
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className={TD}>
                  <EstadoCelda t={t} />
                  <span className="block whitespace-nowrap text-xs tabular-nums text-[var(--text-tertiary)]">
                    {t.noRecepcionada
                      ? "—"
                      : t.fechaRecepcion
                        ? diaCorto(t.fechaRecepcion)
                        : "sin fechar"}
                  </span>
                </td>
              </tr>
            );
          })}
        </TbodyCtp>
        <tfoot className="sticky bottom-0 border-t-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] text-sm font-bold text-[var(--text-primary)]">
          <tr>
            <td colSpan={5} className={`${TD} text-right`}>
              {filtrando ? `Total de lo filtrado (${filtradas.length})` : "Total"}
            </td>
            <td className={TD_NUM}>{fmtM3(sumaM3(filtradas))}</td>
            <td
              colSpan={3}
              className={`${TD} text-right text-xs font-semibold text-[var(--text-secondary)]`}
            >
              {ox.cubicadas} de {filtradas.length} cubicadas
            </td>
            <td className={TD_NUM}>{fmtPt(ox.pt)}</td>
            <td className={`${TD} text-xs font-semibold text-[var(--text-tertiary)]`}>
              PT Oxapampa
            </td>
          </tr>
        </tfoot>
      </TablaCtp>
    </div>
  );
}

export function ListaTrozas({
  filas,
  numero,
  filtradas,
  filtrando,
  ox,
}: Omit<PropsListado, "enOtraFila">) {
  return (
    <ul className="divide-y divide-[var(--rule-soft)] rounded-xl border border-[var(--rule-base)] @min-[34rem]/trozas:hidden">
      {filas.length === 0 && (
        <li className="px-3 py-3 text-sm text-[var(--text-tertiary)]">
          Ninguna troza con ese filtro.
        </li>
      )}
      {filas.map((t, i) => {
        const pt = ptDeTroza(t);
        return (
          <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
            <span className="w-6 shrink-0 pt-0.5 font-mono text-xs tabular-nums text-[var(--text-tertiary)]">
              {numero(i)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-mono font-bold text-[var(--text-primary)]">
                  {t.codificacion ?? "—"}
                </span>
                <span className="shrink-0 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                  {m3(t.volumenM3)} m³
                </span>
              </div>
              <p className="truncate text-sm text-[var(--text-secondary)]">
                {t.especieComun ?? "—"}
              </p>
              <p className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                {medidasDeFicha(t)}
                {t.d1d2MedidoEnPlanta && <EnPlanta />}
              </p>
              {(pt != null || aMedias(t)) && (
                <p className="font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                  Oxapampa {med(t.oxD1Pulg, 2)}″ · {med(t.oxD2Pulg, 2)}″ · {med(t.oxLargoPies, 2)}′{" "}
                  {pt != null ? (
                    <>
                      = <b className="text-sm text-[var(--text-primary)]">{fmtPt(pt)} PT</b>
                    </>
                  ) : (
                    <span className="font-sans font-bold text-[var(--data-warning-ink)]">
                      a medias
                    </span>
                  )}
                </p>
              )}
              <div className="mt-1">
                <EstadoCelda t={t} />
              </div>
            </div>
          </li>
        );
      })}
      <li className="flex flex-wrap items-baseline justify-between gap-x-3 bg-[var(--surface-sunken)] px-3 py-2 text-sm font-bold tabular-nums text-[var(--text-primary)]">
        <span>{filtrando ? `Filtradas (${filtradas.length})` : "Total"}</span>
        <span className="font-mono">
          {fmtM3(sumaM3(filtradas))} m³ · {fmtPt(ox.pt)} PT
          <span className="ml-1 font-sans text-xs font-semibold text-[var(--text-secondary)]">
            ({ox.cubicadas} de {filtradas.length} cubicadas)
          </span>
        </span>
      </li>
    </ul>
  );
}
