"use client";

/**
 * Un grupo de «Vincular en tanda» (ADR-447): las corridas de UNA especie y UN
 * permiso, que reparten la misma madera sin que una troza vaya a dos. Se abre
 * como las guías de «Guías sin registrar»: cabecera con lo que suma y su
 * estado, adentro cada corrida con sus trozas, las que no entran y el botón
 * que vincula ESTE grupo.
 */
import { ChevronRight, Loader2 } from "@buleje/design-system/icons";
import type { GrupoDeLaTanda } from "@/lib/forestal/origen-en-tanda";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { BOTON_PRIMARIO, PASTILLA, Segundos } from "./CtpGuiaSinRegistrar";
import CtpOrigenEnTandaCorrida, { LINK_CHICO } from "./CtpOrigenEnTandaCorrida";
import { de, ptDe } from "./ctp-sin-origen-comun";
import {
  estadoDelGrupo,
  pedidoDelGrupo,
  type EleccionesDeTanda,
  type ResultadosDeTanda,
} from "./origen-en-tanda-pantalla";

export default function CtpOrigenEnTandaGrupo({
  g,
  abierto,
  onAlternar,
  elecciones,
  resultados,
  ocupado,
  vinculandoDesde,
  firma,
  onAlternarTroza,
  onMarcarTodas,
  onSinOrigen,
  onVincular,
  onElegirAMano,
}: {
  g: GrupoDeLaTanda;
  abierto: boolean;
  onAlternar: () => void;
  elecciones: EleccionesDeTanda;
  resultados: ResultadosDeTanda;
  /** Se está vinculando o releyendo algo: los actos esperan. */
  ocupado: boolean;
  /** Si ESTE grupo se está vinculando, desde cuándo. */
  vinculandoDesde: number | null;
  /** Vincula el dueño o un administrador. */
  firma: boolean;
  onAlternarTroza: (trozaId: string) => void;
  onMarcarTodas: (trozaIds: readonly string[], marcar: boolean) => void;
  onSinOrigen: (corridaId: string, sinOrigen: boolean) => void;
  onVincular: () => void;
  onElegirAMano?: (corridaId: string) => void;
}) {
  const estado = estadoDelGrupo(g, elecciones, resultados);
  const van = pedidoDelGrupo(g, elecciones, resultados).length;
  const id = `tanda-grupo-${g.clave.replace(/[^a-z0-9]/gi, "-")}`;
  const trozas = g.corridas.reduce((a, c) => a + c.trozas.length, 0);

  return (
    <li className={`rounded-xl border-2 ${abierto ? "border-[var(--accent)]/60" : "border-[var(--rule-base)]"} bg-[var(--surface-raised)]`}>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierto}
        aria-controls={id}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--surface-sunken)]"
      >
        <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold text-[var(--text-primary)]">{g.especie}</span>
            <span className="min-w-0 break-all text-xs text-[var(--text-secondary)]">{g.permiso ?? "sin permiso"}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{fmtPt(ptDe(g.m3Producido))} pt</span>
            <span>{fmtM3(g.m3Producido)} m³</span>
            <span>{de(g.corridas.length, "corrida", "corridas")}</span>
            <span>
              {de(trozas, "troza", "trozas")} · {fmtM3(g.m3Trozas)} m³
            </span>
            {g.fuera.length > 0 && <span>{g.fuera.length} no entran</span>}
          </span>
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${PASTILLA[estado.tono]}`}>{estado.texto}</span>
      </button>

      {abierto && (
        <div id={id} className="border-t border-[var(--rule-soft)] px-3 pb-3">
          <ul className="divide-y divide-[var(--rule-soft)]">
            {g.corridas.map((c) => (
              <CtpOrigenEnTandaCorrida
                key={c.corridaId}
                c={c}
                elecciones={elecciones}
                resultado={resultados[c.corridaId]}
                bloqueado={ocupado || !firma}
                onAlternar={onAlternarTroza}
                onMarcarTodas={onMarcarTodas}
                onSinOrigen={(sin) => onSinOrigen(c.corridaId, sin)}
                onElegirAMano={onElegirAMano ? () => onElegirAMano(c.corridaId) : undefined}
              />
            ))}
          </ul>

          {g.fuera.length > 0 && (
            <div className="mt-1 rounded-lg bg-[var(--surface-sunken)] px-2.5 py-2">
              <p className="text-xs font-semibold text-[var(--text-primary)]">No entran en esta tanda</p>
              <ul className="mt-0.5 space-y-0.5">
                {g.fuera.map((f) => (
                  <li key={f.corridaId} className="flex flex-wrap items-center gap-x-2 text-xs tabular-nums text-[var(--text-secondary)]">
                    <span className="font-semibold text-[var(--text-primary)]">N.º {f.lineNo ?? "—"}</span>
                    <span>{etiquetaLarga(f.fecha)}</span>
                    <span>{fmtM3(f.m3Producido)} m³</span>
                    <span className="min-w-0 flex-1 basis-[12rem]">{f.detalle}</span>
                    {onElegirAMano && (
                      <button type="button" disabled={ocupado} onClick={() => onElegirAMano(f.corridaId)} className={LINK_CHICO}>
                        Elegir a mano
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
            {!firma && <span className="mr-auto text-xs text-[var(--text-tertiary)]">Las vincula el dueño o un administrador.</span>}
            <button
              type="button"
              onClick={onVincular}
              disabled={ocupado || !firma || van === 0}
              aria-busy={vinculandoDesde != null}
              title={van === 0 ? "No queda ninguna corrida de este grupo por vincular" : "Vincula estas corridas con las trozas marcadas; si una falla, las demás siguen"}
              className={BOTON_PRIMARIO}
            >
              {vinculandoDesde != null ? (
                <>
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Vinculando… <Segundos desde={vinculandoDesde} />
                </>
              ) : (
                `Vincular este grupo${van > 0 ? ` (${van})` : ""}`
              )}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
