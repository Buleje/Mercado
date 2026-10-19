"use client";

/**
 * «Para quién» de Mandar mensaje: un solo selector para los dos modos
 * (`GRUPOS_MENSAJE`). En «Uno por uno» cuenta el navegador con las reglas de
 * Mis clientes y se puede buscar dentro del grupo; en «Automático» cuenta el
 * servidor (el mismo número que guarda el envío) y los grupos que el servidor
 * no arma se ven apagados.
 */
import { useId } from "react";
import { Search, Users } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { GRUPOS_MENSAJE, type AudienciaServidor, type GrupoMensaje } from "@/lib/admin/grupos-mensaje";
import type { ModoMandarMensaje } from "./use-modos-mandar-mensaje";

const CAMPO = "h-12 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none";

export function ParaQuien({
  modo,
  grupo,
  onGrupo,
  cuentaUno,
  conteosAuto,
  busqueda,
  onBusqueda,
  alcanceUno,
}: {
  modo: ModoMandarMensaje;
  grupo: GrupoMensaje;
  onGrupo: (id: string) => void;
  /** Cuántos hay en cada grupo según Mis clientes (navegador). */
  cuentaUno: (g: GrupoMensaje) => number;
  conteosAuto: Partial<Record<AudienciaServidor, number | null>>;
  busqueda: string;
  onBusqueda: (q: string) => void;
  alcanceUno: { conNumero: number; total: number; sinNumero: number };
}) {
  const idSelect = useId();
  const auto = modo === "automatico";
  const conteoAuto = (g: GrupoMensaje) => (g.auto ? conteosAuto[g.auto] : undefined);
  const rotulo = (g: GrupoMensaje) => {
    if (!auto) return `${g.rotulo} (${cuentaUno(g)})`;
    if (!g.auto) return `${g.rotulo} · sólo uno por uno`;
    const n = conteoAuto(g);
    return `${g.rotulo} (${typeof n === "number" ? n : "…"})`;
  };
  const regla = auto && grupo.reglaAuto ? `${grupo.regla} ${grupo.reglaAuto}` : grupo.regla;
  const nAuto = conteoAuto(grupo);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor={idSelect} className="text-sm font-semibold text-[var(--text-secondary)]">Para quién</label>
      <div className="flex min-w-0 flex-[1_1_16rem] items-center gap-1 sm:max-w-sm">
        <select id={idSelect} value={grupo.id} onChange={(e) => onGrupo(e.target.value)} className={`${CAMPO} min-w-0 flex-1`}>
          {GRUPOS_MENSAJE.map((g) => (
            <option key={g.id} value={g.id} disabled={auto && !g.auto}>{rotulo(g)}</option>
          ))}
        </select>
        <InfoTip
          title={grupo.rotulo}
          what={regla}
          affects={[
            grupo.yaRecibe,
            auto ? "Sólo les llega a quienes aceptaron promociones (Ley 29733)." : "Lo mandas tú desde tu WhatsApp: cada «Abrir» deja el mensaje escrito.",
          ].filter(Boolean).join(" ")}
          example="«No compran hace más de 30 días» + la plantilla «Te extrañamos»."
        />
      </div>
      {!auto && (
        <div className="relative min-w-0 flex-[1_1_12rem] sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" aria-hidden />
          <input
            value={busqueda}
            onChange={(e) => onBusqueda(e.target.value)}
            placeholder="Buscar en el grupo…"
            aria-label="Buscar en el grupo"
            className={`${CAMPO} w-full pl-9 placeholder:text-[var(--text-tertiary)]`}
          />
        </div>
      )}
      <p role="status" className="flex h-12 items-center gap-2 rounded-xl bg-[var(--accent-soft)] px-3 text-sm text-[var(--text-primary)]">
        <Users className="h-4 w-4 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
        {auto ? (
          <span>
            {!grupo.auto ? "No se arma en automático" : typeof nAuto === "number" ? <>Les llega a <strong>{nAuto}</strong></> : "Calculando…"}
          </span>
        ) : (
          <span>
            Les llega a <strong>{alcanceUno.conNumero}</strong> de {alcanceUno.total}
            {alcanceUno.sinNumero > 0 && <span className="text-[var(--data-warning-ink)]"> · {alcanceUno.sinNumero} sin número</span>}
          </span>
        )}
      </p>
    </div>
  );
}
