"use client";

/**
 * LothTraceResumen — el embudo de la vista «Por árbol»: del censo al despacho.
 *
 * Reemplaza a las cuatro tarjetas sueltas de arriba («Árboles trazados»,
 * «Volumen talado», «Merma total», «Cadenas completas»), que contaban cosas de
 * universos distintos y no cerraban entre sí: decían «8/8 cadenas completas»
 * con cuatro árboles que nunca salieron del patio, sumaban como merma la madera
 * todavía sin trozar y publicaban una «mediana −58 días tala → salida».
 *
 * Ahora son cuatro etapas, cada una subconjunto de la anterior, y debajo las
 * dos cuentas que las atan escritas con sus sumandos (`resumirFilas`): si un
 * número no cierra, se ve en la misma pantalla.
 *
 * Se pliega y la preferencia se RECUERDA (mismo patrón que los indicadores de
 * Secciones). Plegado sigue diciendo las cifras en una línea: plegar no es
 * esconder el dato.
 */

import { useId, type ReactNode } from "react";
import { CardTitle, Kicker } from "@buleje/design-system";
import { BarChart3, ChevronDown, ChevronRight } from "@buleje/design-system/icons";
import type { ResumenTrace } from "@/lib/forestal/loth-trace-tabla";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { fmtDias } from "./loth-trace-ui";
import { formatNumber } from "@/lib/format";

/* Tres decimales, como el libro: con dos, «32,20 = 19,89 + 11,12 + 1,20» suma
   32,21 y la cuenta que existe para demostrar que cierra parece no cerrar. */
const fm = fmtM3;
const cuenta = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;
const AVISO = "font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const ERROR = "font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";

export default function LothTraceResumen({
  r,
  abierto,
  onAbierto,
  alcance,
}: {
  r: ResumenTrace;
  abierto: boolean;
  onAbierto: (v: boolean) => void;
  /** Qué recorte describe («Tornillo · desde 01/05»). null = el libro entero. */
  alcance: string | null;
}) {
  const id = useId();
  const hayCenso = r.censados > 0;
  const m = r.m3;

  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <CardTitle id={`${id}-titulo`}>Del censo al despacho</CardTitle>
          {alcance && <span className="text-sm text-[var(--text-tertiary)]">{alcance}</span>}
        </div>
        {!abierto && (
          <p className="flex flex-wrap items-center gap-x-2 text-sm tabular-nums text-[var(--text-secondary)]">
            <span>{cuenta(r.talados, "talado", "talados")}</span>
            <span aria-hidden="true">→</span>
            <span>{cuenta(r.trozados, "trozado", "trozados")}</span>
            <span aria-hidden="true">→</span>
            <span>{formatNumber(r.conSalida)} salieron del patio</span>
            <span aria-hidden="true">·</span>
            <span>{fm(m.talado)} m³ talados</span>
            <span aria-hidden="true">·</span>
            <span>merma {r.mermaPct != null ? `${formatNumber(r.mermaPct)} %` : "—"}</span>
          </p>
        )}
        <button
          type="button"
          onClick={() => onAbierto(!abierto)}
          aria-expanded={abierto}
          aria-controls={`${id}-panel`}
          title={abierto ? "Oculta el embudo. Se recuerda en este navegador." : "Muestra el embudo del censo al despacho"}
          className={`ml-auto inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 ${
            abierto
              ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
              : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          }`}
        >
          <BarChart3 className="h-4 w-4" aria-hidden="true" />
          Indicadores
          <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </div>

      <div id={`${id}-panel`} hidden={!abierto} className="space-y-3 border-t border-[var(--rule-soft)] px-4 py-4">
        <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" data-embudo="etapas">
          <PasoDelEmbudo n={1} label="En el censo" valor={hayCenso ? r.censados : null} m3={hayCenso ? m.censo : null} dato="censo">
            {hayCenso ? (
              <>
                {cuenta(r.taladosDelCenso, "talado", "talados")} · {formatNumber(r.enPie)} en pie
              </>
            ) : (
              "sin censo cargado: el plan de manejo no tiene árboles"
            )}
          </PasoDelEmbudo>
          <PasoDelEmbudo n={2} label="Talados" valor={r.talados} m3={m.talado} dato="talados">
            {r.taladosSinCenso > 0 ? (
              <span className={hayCenso ? ERROR : undefined}>{formatNumber(r.taladosSinCenso)} fuera del censo</span>
            ) : (
              "todos figuran en el censo"
            )}
            {r.taladosSinVolumen > 0 && <span className={AVISO}> · {cuenta(r.taladosSinVolumen, "sin volumen", "sin volumen")}</span>}
          </PasoDelEmbudo>
          <PasoDelEmbudo n={3} label="Trozados" valor={r.trozados} m3={m.trozado} dato="trozados">
            {r.sinTrozar > 0 ? (
              <span className={AVISO}>
                {formatNumber(r.sinTrozar)} sin trozar ({fm(m.sinTrozar)} m³)
              </span>
            ) : (
              "todos trozados"
            )}
            {" · "}merma {fm(m.merma)} m³{r.mermaPct != null && ` (${formatNumber(r.mermaPct)} %)`}
          </PasoDelEmbudo>
          <PasoDelEmbudo n={4} label="Salieron del patio" valor={r.conSalida} m3={m.movilizado} dato="salida" ultima>
            {cuenta(r.completas, "con guía", "con guía")}
            {m.patio > 0 && <span className={AVISO}> · {fm(m.patio)} m³ en patio</span>}
          </PasoDelEmbudo>
        </ol>

        {/* Las dos cuentas que atan las etapas, escritas con sus sumandos. */}
        <dl className="grid gap-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm tabular-nums text-[var(--text-secondary)]" data-embudo="cierre">
          <Cuenta titulo="Lo talado">
            <b className="text-[var(--text-primary)]">{fm(m.talado)} m³</b> = {fm(m.trozado)} trozados + {fm(m.merma)} de merma +{" "}
            {fm(m.sinTrozar)} sin trozar
            {m.exceso > 0.0005 && <span className={ERROR}> − {fm(m.exceso)} de trozado que supera a su tala</span>}
          </Cuenta>
          <Cuenta titulo="Lo trozado">
            <b className="text-[var(--text-primary)]">{fm(m.trozado)} m³</b> = {fm(m.movilizado)} salieron + {fm(m.patio)} en patio
            {m.sinCodigo > 0.0005 && <span className={AVISO}> + {fm(m.sinCodigo)} en trozas sin código</span>}
          </Cuenta>
        </dl>

        <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-[var(--text-tertiary)]">
          <span className={r.conGps === 0 && r.talados > 0 ? AVISO : undefined}>{formatNumber(r.conGps)} con GPS</span>
          <span className={r.mermaGrave > 0 ? ERROR : undefined}>{cuenta(r.mermaGrave, "merma grave", "mermas graves")}</span>
          <span className={r.mermaAviso > 0 ? AVISO : undefined}>{formatNumber(r.mermaAviso)} sobre el aviso</span>
          <span className={r.conTardias > 0 ? AVISO : undefined}>{formatNumber(r.conTardias)} con registro fuera de plazo</span>
          {r.cites > 0 && <span>{formatNumber(r.cites)} CITES</span>}
          <span>
            tala → salida:{" "}
            {r.medianaTalaSalida == null
              ? "sin salidas todavía"
              : r.medianaTalaSalida === 0
                ? "salen el mismo día (mediana)"
                : `${fmtDias(r.medianaTalaSalida)} (mediana)`}
          </span>
        </p>
      </div>
    </section>
  );
}

/* Se llamaba `Etapa`, igual que el `Etapa` EXPORTADO de
   `historia/EtapasDelLote` que usa CtpHistoriaLoteView. El gate de anidado
   cruza los componentes por NOMBRE, sin mirar de qué archivo vienen, y daba dos
   roturas falsas: culpaba al `<p>` de acá por el `<ul>` que el otro Etapa
   recibe. Dos componentes homónimos también confunden a quien lee (la misma
   trampa del SparklineKPICard clonado). */
function PasoDelEmbudo({
  n,
  label,
  valor,
  m3,
  dato,
  ultima,
  children,
}: {
  n: number;
  label: string;
  valor: number | null;
  m3: number | null;
  dato: string;
  ultima?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="relative flex min-w-0 flex-col rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5" data-etapa={dato}>
      <Kicker as="p" className="text-[var(--text-secondary)]">
        {n} · {label}
      </Kicker>
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-bold leading-none tabular-nums text-[var(--text-primary)]" data-valor>
          {valor != null ? formatNumber(valor) : "—"}
        </span>
        <span className="text-sm tabular-nums text-[var(--text-secondary)]" data-m3>
          {m3 != null ? `${fm(m3)} m³` : ""}
        </span>
      </p>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{children}</p>
      {!ultima && (
        <ChevronRight
          className="absolute -right-3 top-1/2 z-10 hidden h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)] lg:block"
          aria-hidden="true"
        />
      )}
    </li>
  );
}

function Cuenta({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2">
      <dt className="font-semibold text-[var(--text-tertiary)]">{titulo}:</dt>
      <dd>{children}</dd>
    </div>
  );
}
