"use client";

/**
 * Una guía de «Guías sin registrar» (ADR-446): la fila que se abre y, adentro,
 * sus grupos con el origen propuesto, por qué no se registra si está bloqueada,
 * y los dos actos — revisar la propuesta y registrar ESTA guía.
 */
import { useEffect, useState } from "react";
import { AlertTriangle, Calculator, Check, ChevronRight, Loader2, RefreshCw } from "@buleje/design-system/icons";
import type { EleccionDeOrigen, GrupoPropuesto, PropuestaDeGuia } from "@/lib/forestal/anexo-a-despacho";
import type { ResultadoGuia } from "@/lib/db/forest-ctp-guia-desde-anexo.db";
import { fmtM3, fmtPt } from "@/lib/forestal/cubicacion-formato";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import CtpGuiaGrupoOrigen, { SIN_ORIGEN_SUAVE } from "./CtpGuiaGrupoOrigen";
import {
  esperaLegible,
  estadoDeGuia,
  fallo,
  fechaDeGuia,
  fmtEntero,
  haySinOrigen,
  piezasDeGuia,
  ptDeGuia,
  resultadoTerminal,
  resumenDeBloqueo,
  textoDeResultado,
  type TonoEstado,
} from "./guias-sin-registrar-pantalla";

export const PASTILLA: Record<TonoEstado, string> = {
  ok: "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 text-[var(--data-success-ink)]",
  error: "border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 text-[var(--data-error-ink)]",
  aviso: "border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-ink)]",
  neutro: "border-[var(--rule-base)] bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

export const BOTON_SECUNDARIO =
  "inline-flex h-10 items-center gap-1.5 whitespace-nowrap rounded-xl border border-[var(--rule-strong)] bg-[var(--surface-raised)] px-3 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:cursor-not-allowed disabled:opacity-50";
/** Sin la opacidad de deshabilitado: el botón que está registrando se ve entero, con su reloj. */
const PRIMARIO_BASE =
  "inline-flex h-10 items-center gap-2 whitespace-nowrap rounded-xl bg-[var(--accent-dark)] px-3.5 text-sm font-semibold text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed";
export const BOTON_PRIMARIO = `${PRIMARIO_BASE} disabled:opacity-50`;

/** Segundos desde que arrancó el registro: una guía larga tarda y la pantalla lo dice. */
export function Segundos({ desde }: { desde: number }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="tabular-nums">{Math.max(0, Math.round((ahora - desde) / 1000))} s</span>;
}

/** Cuenta regresiva «2 min 40 s» hasta que la fila vuelve a intentar. */
export function Faltan({ hasta }: { hasta: number }) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return <span className="tabular-nums">{esperaLegible((hasta - ahora) / 1000)}</span>;
}

export default function CtpGuiaSinRegistrar({
  p,
  abierta,
  onAlternar,
  resultado,
  esSiguiente,
  siguienteGtf,
  elecciones,
  ocupado,
  registrandoDesde,
  onElegir,
  onRevisar,
  onRegistrar,
  onAnotarProduccion,
}: {
  p: PropuestaDeGuia;
  abierta: boolean;
  onAlternar: () => void;
  resultado: ResultadoGuia | undefined;
  /** Es la guía que se puede registrar ahora (la más vieja lista). */
  esSiguiente: boolean;
  siguienteGtf: string | null;
  elecciones: Readonly<Record<string, EleccionDeOrigen>> | undefined;
  /** Se está registrando o releyendo algo: los actos esperan. */
  ocupado: boolean;
  /** Si ESTA guía se está registrando, desde cuándo. */
  registrandoDesde: number | null;
  onElegir: (grupo: GrupoPropuesto, corridas: string[] | null) => void;
  onRevisar: () => void;
  onRegistrar: () => void;
  onAnotarProduccion?: (especie: string) => void;
}) {
  const estado = estadoDeGuia(p, resultado);
  const idDetalle = `guia-${p.anexoId}`;
  const manual = p.totalManualM3 != null && Math.abs(p.totalManualM3 - p.totalM3) >= 0.001 ? p.totalManualM3 : null;
  const reintento = fallo(resultado);
  const motivoNoRegistrar = !p.registrable
    ? "Esta guía está bloqueada: resuelve lo de arriba primero."
    : resultadoTerminal(resultado)
      ? "Esta guía ya está en Despacho."
      : !esSiguiente && !reintento
        ? `Registra antes la guía ${siguienteGtf ?? "más vieja"}: esta propuesta cuenta con que ésa ya salió.`
        : undefined;

  return (
    <li className={`rounded-xl border-2 ${abierta ? "border-[var(--accent)]/60" : "border-[var(--rule-base)]"} bg-[var(--surface-raised)]`}>
      <button
        type="button"
        onClick={onAlternar}
        aria-expanded={abierta}
        aria-controls={idDetalle}
        className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-[var(--surface-sunken)]"
      >
        <ChevronRight aria-hidden className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierta ? "rotate-90" : ""}`} />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">{p.gtf}</span>
            <span className="text-xs text-[var(--text-secondary)]">{fechaDeGuia(p.fecha)}</span>
            <span className="hidden text-xs text-[var(--text-tertiary)] sm:inline">Anexo {p.numero || "s/n"}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs tabular-nums text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">{fmtPt(ptDeGuia(p))} pt</span>
            <span>{fmtM3(p.totalM3)} m³</span>
            <span>{fmtEntero(piezasDeGuia(p))} pzas</span>
            <span>{fmtM3(p.atribuidoM3)} con origen</span>
            {haySinOrigen(p.sinAtribuirM3) && <span className={SIN_ORIGEN_SUAVE}>{fmtM3(p.sinAtribuirM3)} sin origen</span>}
          </span>
        </span>
        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-xs font-bold ${PASTILLA[estado.tono]}`}>{estado.texto}</span>
      </button>

      {abierta && (
        <div id={idDetalle} className="space-y-2 border-t border-[var(--rule-soft)] px-3 pb-3 pt-2">
          {p.bloqueos.map((b, i) => {
            const { texto, accion } = resumenDeBloqueo(b);
            const grupo = accion?.tipo === "propuesta" ? p.grupos.find((g) => g.especie === accion.especie && g.tipo === accion.tipoPieza) : undefined;
            return (
              <div key={`${b.codigo}-${i}`} className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--data-error-500)]/10 px-2.5 py-2 text-sm text-[var(--data-error-ink)]">
                <AlertTriangle aria-hidden className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 font-medium">{texto}</span>
                <InfoTip
                  title="Por qué no se registra"
                  what={b.mensaje}
                  affects={accion?.tipo === "anotar" && !onAnotarProduccion ? "Se anota en Libro CTP → Producción → «Producir sin lote». Después vuelve acá y regístrala." : undefined}
                />
                {accion?.tipo === "anotar" && onAnotarProduccion && (
                  <button
                    type="button"
                    onClick={() => onAnotarProduccion(accion.especie)}
                    disabled={ocupado}
                    title={`Abre «Producir sin lote» para anotar la producción de ${accion.especie}${accion.fechaTope ? ` con fecha hasta el ${accion.fechaTope}` : ""}; al terminar vuelves acá`}
                    className={BOTON_SECUNDARIO}
                  >
                    <Calculator aria-hidden className="h-4 w-4" /> Anotar la producción
                  </button>
                )}
                {grupo && (
                  <button type="button" onClick={() => onElegir(grupo, null)} disabled={ocupado} className={BOTON_SECUNDARIO}>
                    Volver a la propuesta
                  </button>
                )}
              </div>
            );
          })}

          {manual != null && (
            <p className="text-xs text-[var(--data-warning-ink)]">
              El papel declara {fmtM3(manual)} m³ a mano; las piezas suman {fmtM3(p.totalM3)} m³ y es lo que entra al libro.
            </p>
          )}

          <ul className="divide-y divide-[var(--rule-soft)]">
            {p.grupos.map((g) => (
              <CtpGuiaGrupoOrigen
                key={g.clave}
                grupo={g}
                lineas={p.lineas.filter((l) => l.grupo === g.clave)}
                fechaGuia={p.fecha}
                elegida={elecciones?.[g.clave]}
                bloqueado={ocupado}
                onElegir={(corridas) => onElegir(g, corridas)}
              />
            ))}
          </ul>

          {resultado && (
            <p role="status" className={`flex items-start gap-1.5 text-sm ${resultado.estado === "registrada" || resultado.estado === "ya_registrada" ? "text-[var(--data-success-ink)]" : "text-[var(--data-error-ink)]"}`}>
              {resultado.estado === "registrada" && <Check aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{textoDeResultado(resultado)}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            {motivoNoRegistrar && p.registrable && (
              <span className="mr-auto text-xs text-[var(--text-tertiary)]">{motivoNoRegistrar}</span>
            )}
            <button type="button" onClick={onRevisar} disabled={ocupado} title="Vuelve a armar la propuesta con el libro de ahora y lo que elegiste" className={BOTON_SECUNDARIO}>
              <RefreshCw aria-hidden className="h-4 w-4" /> Revisar
            </button>
            <button
              type="button"
              onClick={onRegistrar}
              disabled={ocupado || motivoNoRegistrar != null}
              aria-busy={registrandoDesde != null}
              title={motivoNoRegistrar}
              className={registrandoDesde != null ? PRIMARIO_BASE : BOTON_PRIMARIO}
            >
              {registrandoDesde != null ? (
                <>
                  <Loader2 aria-hidden className="h-4 w-4 animate-spin" /> Registrando… <Segundos desde={registrandoDesde} />
                </>
              ) : reintento ? (
                "Reintentar"
              ) : (
                "Registrar esta guía"
              )}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
