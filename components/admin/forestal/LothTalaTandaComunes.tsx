"use client";

/**
 * «Para todos» de «Talar varios árboles»: lo que vale para la jornada entera
 * —fecha, motosierrista, hora, qué se hace con la troza y cómo se anota el
 * Ø—. Cada fila puede tener su fecha, su motosierrista y su hora; si no los
 * cambia, se asienta con éstos.
 */

import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { FormaMedicion } from "@/lib/forestal/loth-forma-medicion";
import { diaDelLibro } from "@/lib/forestal/loth-censo-uso";
import { obligatoriedadTala, MODOS_UI } from "@/lib/forestal/loth-tala";
import type { ComunesTala } from "@/lib/forestal/loth-tala-tanda";
import LothAvisoPlazo from "./LothAvisoPlazo";
import { colaboradorPorNombre } from "./LothTalaDatosInternos";
import { SelectorFormaMedicion } from "./LothMedicionPartes";
import type { Motosierrista } from "./hooks/use-tala-en-tanda";

const INPUT =
  "h-10 w-full rounded-lg border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] disabled:opacity-70";
const ROTULO = "mb-1 flex min-h-6 items-center gap-1.5 text-sm font-medium text-[var(--text-primary)]";

export default function LothTalaTandaComunes({
  comunes,
  onComunes,
  forma,
  onForma,
  motosierristas,
  idLista,
  bloqueada,
}: {
  comunes: ComunesTala;
  onComunes: (c: ComunesTala) => void;
  forma: FormaMedicion;
  onForma: (f: FormaMedicion) => void;
  motosierristas: readonly Motosierrista[];
  idLista: string;
  bloqueada: boolean;
}) {
  const oblig = obligatoriedadTala(comunes.modo);
  const dia = diaDelLibro(comunes.fecha);
  return (
    <section aria-label="Para todos los árboles" className="space-y-3 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-canvas)] p-3">
      <div className="flex items-center gap-1">
        <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
          Para todos
        </CardTitle>
        <InfoTip
          title="Para todos"
          what="La fecha, el motosierrista y la hora se asientan en cada árbol."
          affects="Una fila puede tener los suyos: cambia su fecha en la planilla, o su motosierrista y hora en «Más datos» (la flecha de la fila)."
          example="Jornada del lunes 28/09 con Juan Pérez: lo pones una vez acá y las 8 talas salen con eso."
        />
      </div>
      <div className="grid grid-cols-6 gap-3 [&>*]:min-w-0">
        {/* El aviso de plazo, FUERA del <label>: trae su ⓘ. Es la fecha de
            la jornada; una fila con su propia fecha se asienta con la suya. */}
        <div className="col-span-6 sm:col-span-2">
          <label className="block">
            <span className={ROTULO}>
              Fecha de tala
              {dia && <span className="font-mono text-xs font-semibold text-[var(--text-secondary)]">{dia}</span>}
            </span>
            <input
              type="date"
              value={comunes.fecha}
              disabled={bloqueada}
              onChange={(e) => e.target.value && onComunes({ ...comunes, fecha: e.target.value })}
              className={`${INPUT} font-mono tabular-nums`}
            />
          </label>
          <LothAvisoPlazo fecha={comunes.fecha} />
        </div>
        <label className="col-span-6 block sm:col-span-3">
          <span className={ROTULO}>Motosierrista</span>
          <input
            type="text"
            list={motosierristas.length > 0 ? idLista : undefined}
            value={comunes.motosierrista}
            disabled={bloqueada}
            maxLength={120}
            onChange={(e) => onComunes({ ...comunes, motosierrista: e.target.value, motosierristaId: colaboradorPorNombre(motosierristas, e.target.value)?.id ?? null })}
            placeholder={motosierristas.length > 0 ? "Elige de tu personal o escribe el nombre" : "Nombre de quien tumbó"}
            className={INPUT}
          />
        </label>
        <label className="col-span-6 block sm:col-span-1">
          <span className={ROTULO}>Hora</span>
          <input
            type="time"
            value={comunes.hora}
            disabled={bloqueada}
            onChange={(e) => onComunes({ ...comunes, hora: e.target.value })}
            className={`${INPUT} font-mono tabular-nums`}
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          <div role="group" aria-label="Qué haces con la troza" className="flex gap-1.5">
            {MODOS_UI.map((m) => {
              const activo = comunes.modo === m.key;
              return (
                <button
                  key={m.key}
                  type="button"
                  aria-pressed={activo}
                  title={m.ayuda}
                  disabled={bloqueada}
                  onClick={() => onComunes({ ...comunes, modo: activo ? null : m.key })}
                  className={`min-h-9 rounded-lg border px-3 text-xs font-bold transition-colors ${
                    activo
                      ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                      : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--rule-strong)]"
                  }`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          <InfoTip icono="ayuda" title="Qué haces con la troza" what={oblig.razon} affects="La longitud aprovechable se pide siempre." />
        </div>
        <SelectorFormaMedicion forma={forma} onForma={onForma} />
      </div>
    </section>
  );
}
