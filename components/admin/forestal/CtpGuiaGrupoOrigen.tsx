"use client";

/**
 * Un grupo de la guía (especie × tipo) en «Guías sin registrar» (ADR-446): lo
 * que salió, de qué corrida lo propone el servidor, el selector para cambiarlo
 * y, debajo, cada línea que va a entrar a Despacho con su origen.
 */
import type { EleccionDeOrigen, GrupoPropuesto, LineaPropuesta } from "@/lib/forestal/anexo-a-despacho";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import {
  PROPUESTA,
  SIN_ORIGEN,
  etiquetaCandidata,
  etiquetaPropuesta,
  fmtEntero,
  haySinOrigen,
  textoDeLinea,
  valorDelSelector,
} from "./guias-sin-registrar-pantalla";

export const SIN_ORIGEN_SUAVE =
  "rounded-md bg-[var(--data-error-500)]/10 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-[var(--data-error-ink)]";

export default function CtpGuiaGrupoOrigen({
  grupo,
  lineas,
  fechaGuia,
  elegida,
  bloqueado,
  onElegir,
}: {
  grupo: GrupoPropuesto;
  lineas: readonly LineaPropuesta[];
  fechaGuia: string;
  elegida: EleccionDeOrigen | undefined;
  /** Registrando o releyendo: el selector no cambia hasta que vuelva. */
  bloqueado: boolean;
  /** `null` = la propuesta; `[]` = sin origen; `[id]` = esa corrida. */
  onElegir: (corridas: string[] | null) => void;
}) {
  const valor = valorDelSelector(elegida);
  /* La corrida elegida puede haber dejado de ser candidata (otra guía se la
     llevó): igual tiene que verse elegida, no saltar a otra opción. */
  const elegidaFuera = valor !== PROPUESTA && valor !== SIN_ORIGEN && !grupo.candidatas.some((c) => c.corridaId === valor);
  const sinProducto = grupo.producto == null;

  return (
    <li className="py-2.5">
      <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_17rem] sm:items-center">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
            {grupo.especie} · {grupo.tipo}
          </p>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-[var(--text-secondary)]">
            <span>{fmtPt(grupo.pt)} pt</span>
            <span>{fmtM3(grupo.m3)} m³</span>
            <span>{fmtEntero(grupo.piezas)} pzas</span>
            {haySinOrigen(grupo.sinAtribuirM3) && <span className={SIN_ORIGEN_SUAVE}>{fmtM3(grupo.sinAtribuirM3)} m³ sin origen</span>}
          </p>
        </div>
        <select
          value={valor}
          disabled={bloqueado || sinProducto}
          onChange={(e) => {
            const v = e.target.value;
            onElegir(v === PROPUESTA ? null : v === SIN_ORIGEN ? [] : [v]);
          }}
          aria-label={`De qué corrida sale ${grupo.especie} ${grupo.tipo.toLowerCase()}`}
          title={sinProducto ? "Este tipo de pieza no tiene producto en el libro" : "Elige de qué corrida sale este grupo"}
          className="h-10 w-full rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {/* Con una elección hecha, `grupo.corridas` ya son las elegidas: la
              opción de volver no puede nombrarlas como si fueran la propuesta. */}
          <option value={PROPUESTA}>{elegida ? "Volver a la propuesta del sistema" : etiquetaPropuesta(grupo)}</option>
          {grupo.candidatas.map((c) => (
            <option key={c.corridaId} value={c.corridaId}>
              {etiquetaCandidata(c, fechaGuia)}
            </option>
          ))}
          {elegidaFuera && <option value={valor}>La corrida que elegiste (ya no alcanza)</option>}
          <option value={SIN_ORIGEN}>Sin origen</option>
        </select>
      </div>
      {lineas.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 border-l-2 border-[var(--rule-soft)] pl-2.5">
          {lineas.map((l, i) => (
            <li
              key={`${l.origen?.corridaId ?? "sin"}-${l.origen?.paqueteId ?? i}`}
              className={`text-xs tabular-nums ${l.origen ? "text-[var(--text-secondary)]" : "font-semibold text-[var(--data-error-ink)]"}`}
            >
              {textoDeLinea(l, fechaGuia)}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}
