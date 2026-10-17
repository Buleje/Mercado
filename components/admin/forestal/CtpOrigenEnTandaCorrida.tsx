"use client";

/**
 * Una corrida de «Vincular en tanda» (ADR-447): lo que produjo, las trozas que
 * se le proponen (cada una se desmarca), cómo rinde con las marcadas y si va o
 * se queda sin origen. El rendimiento es vista previa: el servidor lo vuelve a
 * calcular bajo lock al vincular.
 */
import { Check } from "@buleje/design-system/icons";
import type { CorridaEnLaTanda } from "@/lib/forestal/origen-en-tanda";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { formatNumber } from "@/lib/format";
import { ListaDeTrozas } from "./CtpDeQueTrozasSalio";
import { de, ptDe } from "./ctp-sin-origen-comun";
import {
  textoDeResultado,
  tonoDeResultado,
  vistaDeCorrida,
  yaTieneOrigen,
  type EleccionesDeTanda,
  type ResultadoEnPantalla,
  type TonoEstado,
} from "./origen-en-tanda-pantalla";

const TEXTO_TONO: Record<TonoEstado, string> = {
  ok: "text-[var(--data-success-ink)]",
  error: "text-[var(--data-error-ink)]",
  aviso: "text-[var(--data-warning-ink)]",
  neutro: "text-[var(--text-secondary)]",
};

export const LINK_CHICO =
  "inline-flex min-h-9 items-center rounded-lg px-1.5 text-xs font-bold text-[var(--accent-ink)] underline underline-offset-2 hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50 dark:text-[var(--accent)]";

export default function CtpOrigenEnTandaCorrida({
  c,
  elecciones,
  resultado,
  bloqueado,
  onAlternar,
  onMarcarTodas,
  onSinOrigen,
  onElegirAMano,
}: {
  c: CorridaEnLaTanda;
  elecciones: EleccionesDeTanda;
  resultado: ResultadoEnPantalla | undefined;
  /** Vinculando o releyendo: no se cambia nada hasta que vuelva. */
  bloqueado: boolean;
  onAlternar: (trozaId: string) => void;
  onMarcarTodas: (trozaIds: readonly string[], marcar: boolean) => void;
  onSinOrigen: (sinOrigen: boolean) => void;
  /** El vinculador de siempre, para elegir otras trozas a mano. */
  onElegirAMano?: () => void;
}) {
  const v = vistaDeCorrida(c, elecciones, resultado);
  const hecha = yaTieneOrigen(resultado);
  const sinOrigen = elecciones.sinOrigen.has(c.corridaId);
  const todas = v.marcadas.length === c.trozas.length;
  const nombre = `N.º ${c.lineNo ?? "—"}`;

  return (
    <li className="py-2.5">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_15rem] sm:items-center">
        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-bold tabular-nums text-[var(--text-primary)]">{nombre}</span>
            <span className="text-[var(--text-secondary)]">{etiquetaLarga(c.fecha)}</span>
            {hecha && <Check aria-label="Ya tiene origen" className="h-4 w-4 self-center text-[var(--data-success-ink)]" />}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{fmtPt(ptDe(c.m3Producido))} pt</span>
            <span>{fmtM3(c.m3Producido)} m³</span>
            {!sinOrigen && (
              <span>
                de {de(v.marcadas.length, "troza", "trozas")} · {fmtM3(v.m3Trozas)} m³
              </span>
            )}
            {!sinOrigen && v.rendimientoPct != null && (
              <span
                className={v.sobreElTope ? "rounded-md bg-[var(--data-warning-500)]/10 px-1.5 font-semibold text-[var(--data-warning-ink)]" : ""}
                title={v.sobreElTope ? "Pasa el 56 % de la plaza: se avisa y se vincula igual" : undefined}
              >
                rinde {formatNumber(v.rendimientoPct, 1)} %{v.sobreElTope ? ", pasa el 56 %" : ""}
              </span>
            )}
          </p>
        </div>
        <select
          value={sinOrigen ? "no" : "si"}
          disabled={bloqueado || hecha}
          onChange={(e) => onSinOrigen(e.target.value === "no")}
          aria-label={`Qué hacer con la ${nombre}`}
          className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          <option value="si">Vincular con las marcadas</option>
          <option value="no">Dejarla sin origen</option>
        </select>
      </div>

      {!sinOrigen && !hecha && c.trozas.length > 0 && (
        <div className="mt-1.5 border-l-2 border-[var(--rule-soft)] pl-2">
          <ListaDeTrozas
            trozas={c.trozas}
            estaMarcada={(id) => !elecciones.desmarcadas.has(id)}
            onAlternar={(id) => {
              if (!bloqueado) onAlternar(id);
            }}
            etiqueta={`Trozas propuestas para la ${nombre}`}
          />
        </div>
      )}

      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
        {resultado ? (
          <p role="status" className={`min-w-0 flex-1 text-xs ${TEXTO_TONO[tonoDeResultado(resultado)]}`}>
            {textoDeResultado(resultado)}
          </p>
        ) : v.porQueNo ? (
          <p className="min-w-0 flex-1 text-xs text-[var(--text-tertiary)]">{v.porQueNo}</p>
        ) : (
          <span className="flex-1" />
        )}
        {!hecha && !sinOrigen && c.trozas.length > 1 && (
          <button type="button" disabled={bloqueado} onClick={() => onMarcarTodas(c.trozas.map((t) => t.trozaId), !todas)} className={LINK_CHICO}>
            {todas ? "Desmarcar todas" : "Marcar todas"}
          </button>
        )}
        {!hecha && onElegirAMano && (
          <button type="button" disabled={bloqueado} onClick={onElegirAMano} className={LINK_CHICO}>
            Elegir otras a mano
          </button>
        )}
      </div>
    </li>
  );
}
