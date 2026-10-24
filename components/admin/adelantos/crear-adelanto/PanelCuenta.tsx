"use client";

/**
 * «La cuenta de X» — la columna fija a la derecha del alta (ADR-448).
 *
 * Las dos direcciones en cifras separadas —«Te debe» y «Le debes»— porque son
 * dos deudas opuestas y sumarlas esconde las dos; el neto aparece sólo si hay
 * de las dos. Abajo, cómo queda la cifra que este alta mueve y qué le pasa a
 * la caja: son las dos preguntas que se hacen justo antes de apretar el botón.
 */

import { AlertTriangle, ArrowRight, Phone } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { formatCurrency } from "@/lib/currency";
import { requiereAtencion } from "@/lib/adelantos/limite-credito";
import { hayDeuda } from "@/lib/adelantos/modos-alta";
import type { AltaAdelanto } from "../hooks/use-alta-adelanto";
import { MontosEnLineas, fmtMon } from "../shared";
import { ORIGENES_CAJA } from "./campos-monto";
import { HistorialPersona } from "./ficha-persona";
import { ChipCaja } from "./piezas";

const NOMBRE_METODO: Record<string, string> = Object.fromEntries(ORIGENES_CAJA.map((o) => [o.id, o.label]));

export default function PanelCuenta({ alta }: { alta: AltaAdelanto }) {
  const { persona, cuenta, proyeccion, caja, credito, modo, moneda, montoNum } = alta;
  const te = hayDeuda(cuenta.teDebe);
  const le = hayDeuda(cuenta.leDebes);
  const neto = te && le ? Math.round(((cuenta.teDebe.PEN ?? 0) - (cuenta.leDebes.PEN ?? 0)) * 100) / 100 : null;
  const rotulo = proyeccion.cifra === "te-debe" ? "Te debe" : "Le debes";

  return (
    <section aria-labelledby="alta-cuenta-titulo" className="overflow-hidden rounded-2xl border border-[var(--rule-soft)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center gap-2 border-b border-[var(--rule-soft)] px-5 py-3.5">
        <CardTitle as="h3" id="alta-cuenta-titulo" className="min-w-0 flex-1 text-[length:var(--ts-xl)] font-bold">
          {persona ? `La cuenta de ${persona.nombre}` : "La cuenta"}
        </CardTitle>
        <InfoTip
          title="La cuenta"
          side="left"
          what="Lo que esta persona te debe y lo que tú le debes, por separado."
          affects="«Así queda» muestra la cifra que cambia al guardar, y la caja dice si entra o sale plata."
          example="WASACO: te debe S/ 3 217 de un adelanto y le debes S/ 3 031 de aserríos que te pagó antes."
        />
      </div>

      {!persona ? (
        <p className="px-5 py-6 text-base font-semibold text-[var(--text-tertiary)]">Elige a la persona para ver su cuenta.</p>
      ) : (
        <div className="space-y-4 px-5 py-4">
          <dl className="grid grid-cols-2 gap-3">
            <Cifra label="Te debe" map={cuenta.teDebe} tono={te ? "text-[var(--data-warning-ink)]" : "text-[var(--text-primary)]"} />
            <Cifra label="Le debes" map={cuenta.leDebes} tono={le ? "text-[var(--data-info-ink)]" : "text-[var(--text-primary)]"} />
          </dl>
          {neto != null && (
            <p className="text-sm font-semibold text-[var(--text-secondary)]">
              Neto en soles: {neto >= 0 ? `te debe ${formatCurrency(neto)}` : `le debes ${formatCurrency(-neto)}`}
            </p>
          )}

          {/* El tope sólo gobierna lo que DAS: recibir no le quita margen a nadie. */}
          {modo === "dar" && (
            <div className="rounded-xl bg-[var(--surface-sunken)] px-3.5 py-2.5 text-sm">
              {credito.estado === "sin-limite" ? (
                <span className="font-semibold text-[var(--text-secondary)]">Sin tope de crédito</span>
              ) : (
                <>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="font-semibold text-[var(--text-secondary)]">Le queda de tope</span>
                    <strong className="tabular-nums text-[var(--text-primary)]">
                      {formatCurrency(Math.max(0, credito.disponible))} de {formatCurrency(credito.limite)}
                    </strong>
                  </span>
                  {requiereAtencion(credito) && (
                    <span className="mt-1.5 flex items-start gap-1.5 font-semibold text-[var(--data-error-ink)]">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> {credito.aviso}
                    </span>
                  )}
                </>
              )}
            </div>
          )}

          <div className="rounded-xl border-2 border-primary/30 bg-primary/5 px-3.5 py-3" aria-live="polite">
            <p className="text-sm font-bold text-[var(--text-secondary)]">Así queda · {rotulo.toLowerCase()}</p>
            {montoNum > 0 ? (
              <p className="mt-1 flex flex-wrap items-center gap-2 text-lg font-extrabold tabular-nums text-[var(--text-primary)]">
                <span className="text-[var(--text-tertiary)]">{fmtMon(proyeccion.antes, moneda)}</span>
                <ArrowRight className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <span>{fmtMon(Math.max(0, proyeccion.despues), moneda)}</span>
              </p>
            ) : (
              <p className="mt-1 text-sm font-medium text-[var(--text-tertiary)]">Pon el monto para verlo.</p>
            )}
            {proyeccion.cruza && (
              <p className="mt-1 text-sm font-semibold text-[var(--data-info-ink)]">
                Paga de más: {fmtMon(proyeccion.excedente, moneda)} quedan a favor suyo (le debes).
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <ChipCaja tipo={caja.tipo} />
            {caja.tipo !== "nada" && (
              <span className="text-sm font-semibold tabular-nums text-[var(--text-primary)]">
                {caja.monto > 0 && `${fmtMon(caja.monto, moneda)} · `}
                <span className="font-medium text-[var(--text-secondary)]">{caja.metodo ? (NOMBRE_METODO[caja.metodo] ?? caja.metodo) : ""}</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]">
            {/* `adelantosAbiertos` cuenta sólo lo dado: «0 abiertos» al lado de
                «Le debes S/ 1 731» se leía como que no había nada. */}
            <span>
              {persona.adelantosAbiertos} abierto{persona.adelantosAbiertos === 1 ? "" : "s"}
              {(persona.recibidosAbiertos ?? 0) > 0 &&
                ` · ${persona.recibidosAbiertos} recibido${persona.recibidosAbiertos === 1 ? "" : "s"} por devolver`}
            </span>
            {persona.telefono && (
              <a href={`tel:${persona.telefono.replace(/\D/g, "")}`} className="inline-flex items-center gap-1 tabular-nums hover:text-[var(--accent-ink)] hover:underline">
                <Phone className="h-3.5 w-3.5" aria-hidden /> {persona.telefono}
              </a>
            )}
          </div>

          <HistorialPersona historial={alta.historial} />
        </div>
      )}
    </section>
  );
}

/** Una cifra por renglón y moneda: «S/ 573.00» partido en «S/» y «573.00» no se lee como plata. */
function Cifra({ label, map, tono }: { label: string; map: Record<string, number>; tono: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-[var(--surface-sunken)] px-3 py-2.5 sm:px-3.5">
      <dt className="text-sm font-semibold text-[var(--text-secondary)]">{label}</dt>
      <dd className={`mt-0.5 text-lg font-extrabold tabular-nums sm:text-xl ${tono}`}>
        <MontosEnLineas map={map} />
      </dd>
    </div>
  );
}
