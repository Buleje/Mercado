"use client";

/**
 * Las dos preguntas de tiempo de la banda «Aprovechamiento»:
 *
 *   · PATIO: cuántos m³ y trozas esperan despacho y cuántos días lleva la más
 *     vieja; pasado el tope (30 días por defecto, se elige y se recuerda en
 *     este navegador) se avisa en ámbar.
 *   · TÉRMINO: a qué ritmo (m³ por semana) se avanza y en qué fecha se acaba
 *     la base a ese ritmo, contra el cierre de la vigencia.
 *
 * Las cuentas vienen hechas (`analizarAprovechamiento` → `patio` y `termino`);
 * acá sólo se elige el tope y se pinta.
 */

import { AlertTriangle, CalendarClock, Warehouse } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { formatNumber } from "@/lib/format";
import type { Aprovechamiento } from "@/lib/forestal/loth-aprovechamiento";
import { TOPE_PATIO_DIAS, TOPES_PATIO_DIAS, patioPasado } from "@/lib/forestal/loth-aprovechamiento-cadena";

const ROTULO = "text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]";
const AMBAR = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const VERDE = "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]";
const CAJA = "min-w-0 rounded-xl border px-3 py-2";
/** El tope elegido, por navegador (como los indicadores plegados). */
export const CLAVE_TOPE_PATIO = "loth:aprovechamiento:tope-patio-dias";

export default function LothAprovechamientoPlazo({ a }: { a: Aprovechamiento }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <Patio a={a} />
      <Termino a={a} />
    </div>
  );
}

function Patio({ a }: { a: Aprovechamiento }) {
  const [guardado, setTope] = useLocalStorage<number>(CLAVE_TOPE_PATIO, TOPE_PATIO_DIAS);
  const tope = (TOPES_PATIO_DIAS as readonly number[]).includes(Number(guardado)) ? Number(guardado) : TOPE_PATIO_DIAS;
  const p = a.patio;
  const pasado = patioPasado(p, tope);
  const vacio = p.m3 <= 0;
  return (
    <div data-aprovechamiento-patio className={`${CAJA} ${pasado ? "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/8" : "border-[var(--rule-base)]"}`}>
      <div className="flex items-center gap-1.5">
        <Warehouse className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className={ROTULO}>Patio</span>
        <InfoTip
          title="Trozas en patio"
          what="Trozas trozadas que todavía no salieron con guía ni se consumieron en el TH, y los días que lleva la más vieja desde su trozado."
          affects={`Pasado el tope que elijas (${TOPE_PATIO_DIAS} días si no eliges otro) se avisa en ámbar: una troza que espera mucho se raja y pierde valor.`}
          example="3 trozas, 2,1 m³; la más vieja lleva 45 días: pasa el tope de 30 y se avisa."
          side="bottom"
        />
        <label className="ml-auto flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
          <span>Avisar a los</span>
          <select
            value={tope}
            onChange={(e) => setTope(Number(e.target.value))}
            aria-label="Días en patio para avisar"
            className="h-7 rounded-md border border-[var(--rule-base)] bg-[var(--surface-raised)] px-1 text-xs font-bold text-[var(--text-primary)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
          >
            {TOPES_PATIO_DIAS.map((d) => <option key={d} value={d}>{d} días</option>)}
          </select>
        </label>
      </div>
      <p className="mt-1 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
        {formatNumber(p.m3, 3)} m³
        {p.trozas != null && !vacio && (
          <span className="font-sans font-normal text-[var(--text-secondary)]"> · {p.trozas} {p.trozas === 1 ? "troza" : "trozas"}</span>
        )}
      </p>
      <p data-patio-dias className={`flex items-center gap-1 text-xs ${pasado ? `font-semibold ${AMBAR}` : "text-[var(--text-tertiary)]"}`}>
        {pasado && <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
        <span className="min-w-0">
          {vacio
            ? "Sin trozas en patio"
            : a.estadoHechos === "cargando"
              ? "Leyendo los días en patio…"
              : p.diasMasVieja == null
                ? "Sin fecha de la troza más vieja"
                : `La más vieja lleva ${p.diasMasVieja} ${p.diasMasVieja === 1 ? "día" : "días"}${pasado ? ` (tope ${tope})` : ""}`}
        </span>
      </p>
    </div>
  );
}

function Termino({ a }: { a: Aprovechamiento }) {
  const t = a.termino;
  const leyendo = a.estadoHechos !== "ok";
  const tono = leyendo || t.llega == null
    ? "border-[var(--rule-base)]"
    : t.llega
      ? "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/8"
      : "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/8";
  const color = leyendo || t.llega == null ? "text-[var(--text-primary)]" : t.llega ? VERDE : AMBAR;
  return (
    <div data-aprovechamiento-termino data-llega={t.llega == null ? "" : String(t.llega)} className={`${CAJA} ${tono}`}>
      <div className="flex items-center gap-1.5">
        <CalendarClock className="h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
        <span className={ROTULO}>Ritmo y término</span>
        <InfoTip
          title="Ritmo y fecha de término"
          what={`El ritmo es lo ${a.rotuloAvance} dividido entre las semanas desde la del primer avance hasta hoy. La fecha de término es hoy más lo que queda dividido entre ese ritmo.`}
          affects="Se compara con el cierre de la vigencia: si no llegas, dice cuántos m³ por semana te harían falta. Hacen falta dos semanas desde el primer avance para medir un ritmo."
          example="Llevas 40 m³ en 10 semanas: 4 m³/semana. Te quedan 60 m³: terminas en 15 semanas. Si la vigencia cierra en 10, te hacen falta 6 m³/semana."
          side="bottom"
        />
      </div>
      {leyendo ? (
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          {a.estadoHechos === "error" ? "No se pudo leer el ritmo: recarga para reintentar." : "Leyendo el ritmo…"}
        </p>
      ) : (
        <>
          <p className={`mt-1 text-sm font-bold ${color}`}>{t.titular}</p>
          <p className="text-xs text-[var(--text-tertiary)]">{t.detalle}</p>
        </>
      )}
    </div>
  );
}
