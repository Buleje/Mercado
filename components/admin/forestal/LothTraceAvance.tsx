"use client";

/**
 * LothTraceAvance — dónde va el permiso: Censo → Talados → Trozados → Salieron.
 *
 * Reemplaza al embudo «Del censo al despacho» (`LothTraceResumen`), que estaba
 * plegado por defecto: la pregunta que se hace primero —¿cuánto del permiso ya
 * se aprovechó?— quedaba detrás de un botón «Indicadores». Ahora los cuatro
 * pasos están siempre a la vista, cada uno con su m³, y cada paso es un BOTÓN
 * que filtra la lista a esa etapa (tocarlo otra vez quita el filtro).
 *
 * Los números son los mismos de antes (`resumirFilas`): cada paso es un
 * subconjunto del anterior. Las dos cuentas que los atan («Lo talado = trozado
 * + merma + sin trozar», «Lo trozado = salió + en patio») y la mediana tala →
 * salida no se borraron: viven en «Cuentas», plegable y RECORDADO en la misma
 * clave que el embudo viejo. Plegado sigue diciendo el dato en la barra.
 *
 * Los avisos (sin GPS, mermas, fuera de plazo, CITES…) van en una línea chica
 * debajo, sólo los que están en más de cero.
 */

import { useId, type ReactNode } from "react";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { CardTitle, Kicker } from "@buleje/design-system";
import { BarChart3, Calculator, ChevronDown } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { ResumenTrace } from "@/lib/forestal/loth-trace-tabla";
import { avisosDelAvance, pctTaladoDelCenso, type PasoAvance } from "@/lib/forestal/loth-trace-grupos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import type { CupoEspecie } from "@/lib/forestal/loth-cupo-especie";
import { fmtDias } from "./loth-trace-ui";
import LothTraceCupo from "./LothTraceCupo";

/* Tres decimales, como el libro: con dos, «32,20 = 19,89 + 11,12 + 1,20» suma
   32,21 y la cuenta que existe para demostrar que cierra parece no cerrar. */
const fm = fmtM3;
const AVISO = "font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const ERROR = "font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const PUNTO = { error: "bg-[var(--data-error-500)]", warn: "bg-[var(--data-warning-500)]", info: "bg-[var(--data-info-500)]" } as const;

export default function LothTraceAvance({
  r,
  salieron,
  paso,
  onPaso,
  cuentasAbiertas,
  onCuentas,
  alcance,
  cupoFilas,
}: {
  r: ResumenTrace;
  /** Trozas (piezas) que dejaron el patio. */
  salieron: { despachadas: number; consumidas: number };
  paso: PasoAvance | null;
  onPaso: (p: PasoAvance) => void;
  cuentasAbiertas: boolean;
  onCuentas: (v: boolean) => void;
  /** Qué recorte describe («Tornillo · desde 01/05»). null = el libro entero. */
  alcance: string | null;
  /** Cupo por especie ya calculado. Sin él (o vacío) el bloque no se dibuja. */
  cupoFilas?: readonly CupoEspecie[];
}) {
  const id = useId();
  /* Los cuatro pasos se pliegan y se recuerda (Brandon 05-10); cerrados dicen sus cifras en el botón. */
  const [pasosAbiertos, setPasosAbiertos] = useLocalStorage<boolean>("loth-trace:avance-pasos", false);
  const hayCenso = r.censados > 0;
  const m = r.m3;
  const pct = pctTaladoDelCenso(r);
  const avisos = avisosDelAvance(r);
  const piezas = [
    salieron.despachadas > 0 && `${formatNumber(salieron.despachadas)} ${salieron.despachadas === 1 ? "troza despachada" : "trozas despachadas"}`,
    salieron.consumidas > 0 && `${formatNumber(salieron.consumidas)} al aserrío`,
  ].filter(Boolean);

  return (
    <section aria-labelledby={`${id}-titulo`} className="rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)]" data-avance>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 pt-3">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2">
          <CardTitle id={`${id}-titulo`}>Avance del permiso</CardTitle>
          <InfoTip
            title="Avance del permiso"
            what="Cada paso es parte del anterior: de lo censado se taló una parte, de lo talado se trozó una parte y de eso salió una parte."
            affects="Toca un paso para ver en la lista sólo esos árboles. Tócalo otra vez para ver todos."
            example="Talados 6 → la lista muestra sólo los 6 árboles tumbados."
          />
          {alcance && <span className="text-sm text-[var(--text-tertiary)]">{alcance}</span>}
        </div>
        <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
        <button
          type="button"
          onClick={() => setPasosAbiertos(!pasosAbiertos)}
          aria-expanded={pasosAbiertos}
          aria-controls={`${id}-pasos`}
          title={pasosAbiertos ? "Ocultar los indicadores" : "Ver los indicadores"}
          className="inline-flex h-10 min-w-0 max-w-full shrink items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          <BarChart3 className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="shrink-0">Indicadores</span>
          {!pasosAbiertos && (
            <span className="min-w-0 truncate font-mono text-sm font-normal tabular-nums">
              {hayCenso ? `${formatNumber(r.censados)} censados · ` : ""}{formatNumber(r.talados)} talados · {formatNumber(r.trozados)} trozados · {formatNumber(r.conSalida)} salieron
            </span>
          )}
          {!pasosAbiertos && paso && (
            <span className="shrink-0 rounded-full bg-[var(--accent-muted)] px-2 py-0.5 text-xs font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]">filtra: {paso}</span>
          )}
          <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${pasosAbiertos ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => onCuentas(!cuentasAbiertas)}
          aria-expanded={cuentasAbiertas}
          aria-controls={`${id}-cuentas`}
          title={cuentasAbiertas ? "Oculta las cuentas. Se recuerda en este navegador." : "Cómo cierran los m³ entre un paso y el siguiente"}
          className="inline-flex h-10 shrink-0 items-center gap-2 rounded-xl border border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40"
        >
          <Calculator className="h-4 w-4" aria-hidden="true" />
          Cuentas
          <ChevronDown className={`h-4 w-4 transition-transform ${cuentasAbiertas ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
        </div>
      </div>

      <div className="space-y-3 px-4 pb-4 pt-3">
        <div id={`${id}-pasos`} hidden={!pasosAbiertos} className="space-y-3">
        <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4" aria-label="Pasos del permiso">
          <Paso n={1} label="Censo" valor={hayCenso ? r.censados : null} m3={hayCenso ? m.censo : null} activo={paso === "censo"} onClick={() => onPaso("censo")} disabled={!hayCenso}>
            {hayCenso ? `${formatNumber(r.enPie)} en pie` : "sin censo cargado"}
          </Paso>
          <Paso n={2} label="Talados" valor={r.talados} m3={m.talado} activo={paso === "talados"} onClick={() => onPaso("talados")}>
            {r.sinTrozar > 0 ? <span className={AVISO}>{formatNumber(r.sinTrozar)} sin trozar</span> : r.talados > 0 ? "todos trozados" : "ninguno todavía"}
          </Paso>
          <Paso n={3} label="Trozados" valor={r.trozados} m3={m.trozado} activo={paso === "trozados"} onClick={() => onPaso("trozados")}>
            {r.mermaPct != null ? `merma ${formatNumber(r.mermaPct, 1)} %` : "sin trozar todavía"}
          </Paso>
          <Paso n={4} label="Salieron" valor={r.conSalida} m3={m.movilizado} activo={paso === "salieron"} onClick={() => onPaso("salieron")}>
            {piezas.length > 0 ? piezas.join(" · ") : "nada salió todavía"}
            {m.patio > 0.0005 && <span className={AVISO}> · {fm(m.patio)} m³ en patio</span>}
          </Paso>
        </ol>

        {pct != null && (
          <div>
            <p className="text-sm text-[var(--text-secondary)]">
              <b className="tabular-nums text-[var(--text-primary)]">{formatNumber(pct, 1)} %</b> de lo censado ya talado
            </p>
            {/* La cifra está escrita arriba: la barra es sólo el dibujo. */}
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden="true">
              <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        )}
        </div>

        {avisos.length > 0 && (
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]" aria-label="Avisos" data-avisos>
            {avisos.map((a) => (
              <li key={a.key} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 shrink-0 rounded-full ${PUNTO[a.nivel]}`} aria-hidden="true" />
                <b className="tabular-nums text-[var(--text-primary)]">{formatNumber(a.n)}</b> {a.label}
              </li>
            ))}
          </ul>
        )}

        {cupoFilas && cupoFilas.length > 0 && <LothTraceCupo filas={cupoFilas} />}

        {/* Las dos cuentas que atan los pasos, escritas con sus sumandos. */}
        <dl
          id={`${id}-cuentas`}
          hidden={!cuentasAbiertas}
          className="grid gap-1 rounded-xl bg-[var(--surface-sunken)] px-3 py-2 text-sm tabular-nums text-[var(--text-secondary)]"
          data-embudo="cierre"
        >
          <Cuenta titulo="Lo talado">
            <b className="text-[var(--text-primary)]">{fm(m.talado)} m³</b> = {fm(m.trozado)} trozados + {fm(m.merma)} de merma + {fm(m.sinTrozar)} sin trozar
            {m.exceso > 0.0005 && <span className={ERROR}> − {fm(m.exceso)} de trozado que supera a su tala</span>}
          </Cuenta>
          <Cuenta titulo="Lo trozado">
            <b className="text-[var(--text-primary)]">{fm(m.trozado)} m³</b> = {fm(m.movilizado)} salieron + {fm(m.patio)} en patio
            {m.sinCodigo > 0.0005 && <span className={AVISO}> + {fm(m.sinCodigo)} en trozas sin código</span>}
          </Cuenta>
          <Cuenta titulo="Con guía">
            {formatNumber(r.completas)} {r.completas === 1 ? "árbol" : "árboles"} · tala → salida:{" "}
            {r.medianaTalaSalida == null
              ? "sin salidas todavía"
              : r.medianaTalaSalida === 0
                ? "salen el mismo día (mediana)"
                : `${fmtDias(r.medianaTalaSalida)} (mediana)`}
          </Cuenta>
        </dl>
      </div>
    </section>
  );
}

function Paso({
  n,
  label,
  valor,
  m3,
  activo,
  onClick,
  disabled,
  children,
}: {
  n: number;
  label: string;
  valor: number | null;
  m3: number | null;
  activo: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <li className="min-w-0">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        aria-pressed={activo}
        title={activo ? "Quitar este filtro" : `Ver en la lista sólo: ${label.toLowerCase()}`}
        className={`flex h-full w-full min-w-0 flex-col rounded-xl border-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40 disabled:cursor-default ${
          activo
            ? "border-[var(--accent)] bg-[var(--accent-soft)]"
            : "border-transparent bg-[var(--surface-sunken)] enabled:hover:border-[var(--rule-strong)]"
        }`}
        data-paso={label.toLowerCase()}
      >
        <Kicker className="text-[var(--text-secondary)]">
          {n} · {label}
        </Kicker>
        <span className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
          <span className="text-2xl font-bold leading-none tabular-nums text-[var(--text-primary)]" data-valor>
            {valor != null ? formatNumber(valor) : "—"}
          </span>
          {m3 != null && (
            <span className="text-sm tabular-nums text-[var(--text-secondary)]" data-m3>
              {fm(m3)} m³
            </span>
          )}
        </span>
        <span className="mt-1 text-xs text-[var(--text-secondary)]">{children}</span>
      </button>
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
