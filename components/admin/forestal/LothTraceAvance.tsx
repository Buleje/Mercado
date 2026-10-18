"use client";

/**
 * LothTraceAvance — dónde va el permiso: Censo → Talados → Trozados → Salieron.
 *
 * Los cuatro pasos son los «Indicadores» de la vista (`useKpisPlegables`, el
 * mismo botón que el resto del libro: dentro del libro va al riel con ícono y
 * cantidad, y recuerda si quedó abierto). Plegados, las cifras viajan en el
 * `title` del botón. Cada paso es un BOTÓN que filtra la lista a esa etapa
 * (tocarlo otra vez quita el filtro); con el panel cerrado, el filtro se dice
 * en la línea de avisos («Filtra: talados ✕»), para que la lista recortada no
 * se lea como el libro entero.
 *
 * Los números son los mismos de antes (`resumirFilas`): cada paso es un
 * subconjunto del anterior. Las dos cuentas que los atan («Lo talado = trozado
 * + merma + sin trozar», «Lo trozado = salió + en patio») y la mediana tala →
 * salida viven en «Cuentas» (al riel también), plegable y recordado.
 *
 * Los avisos (sin GPS, mermas, fuera de plazo, CITES…) van en una línea chica
 * debajo, sólo los que están en más de cero. Compactado el 17-10 («compactar
 * el Libro TH»): era una caja con su título y dos botones de 48 px en fila
 * propia (~130 px antes del primer árbol).
 */

import { useId, type ReactNode } from "react";
import { CardTitle, Kicker } from "@buleje/design-system";
import { Calculator, X } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { AccionesDeLaVista, TextoDeAccion, useEnElLibro } from "@/components/admin/shared/libro-acciones-vista";
import { cn } from "@/lib/utils";
import type { ResumenTrace } from "@/lib/forestal/loth-trace-tabla";
import { avisosDelAvance, pctTaladoDelCenso, type PasoAvance } from "@/lib/forestal/loth-trace-grupos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { formatNumber } from "@/lib/format";
import type { CupoEspecie } from "@/lib/forestal/loth-cupo-especie";
import { fmtDias } from "./loth-trace-ui";
import LothTraceCupo from "./LothTraceCupo";
import { useKpisPlegables } from "./kpis-plegables";
import { BTN_ACCION_RIEL } from "./ctp-cabecera-vista";
import { CLASE_ENCENDIDO_RIEL } from "./ctp-riel-piezas";

/* Tres decimales, como el libro: con dos, «32,20 = 19,89 + 11,12 + 1,20» suma
   32,21 y la cuenta que existe para demostrar que cierra parece no cerrar. */
const fm = fmtM3;
const AVISO = "font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";
const ERROR = "font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]";
const PUNTO = { error: "bg-[var(--data-error-500)]", warn: "bg-[var(--data-warning-500)]", info: "bg-[var(--data-info-500)]" } as const;

const AYUDA = {
  what: "Cada paso es parte del anterior: de lo censado se taló una parte, de lo talado se trozó una parte y de eso salió una parte.",
  affects: "Toca un paso para ver en la lista sólo esos árboles. Tócalo otra vez para ver todos.",
  example: "Talados 6 → la lista muestra sólo los 6 árboles tumbados.",
};

export default function LothTraceAvance({
  r,
  salieron,
  paso,
  onPaso,
  cuentasAbiertas,
  onCuentas,
  cupoFilas,
}: {
  r: ResumenTrace;
  /** Trozas (piezas) que dejaron el patio. */
  salieron: { despachadas: number; consumidas: number };
  paso: PasoAvance | null;
  onPaso: (p: PasoAvance) => void;
  cuentasAbiertas: boolean;
  onCuentas: (v: boolean) => void;
  /** Cupo por especie ya calculado. Sin él (o vacío) el bloque no se dibuja. */
  cupoFilas?: readonly CupoEspecie[];
}) {
  const id = useId();
  const enLibro = useEnElLibro();
  const hayCenso = r.censados > 0;
  const m = r.m3;
  const pct = pctTaladoDelCenso(r);
  const avisos = avisosDelAvance(r);
  const piezas = [
    salieron.despachadas > 0 && `${formatNumber(salieron.despachadas)} ${salieron.despachadas === 1 ? "troza despachada" : "trozas despachadas"}`,
    salieron.consumidas > 0 && `${formatNumber(salieron.consumidas)} al aserrío`,
  ].filter(Boolean);

  const kpis = useKpisPlegables({
    claveMemoria: "loth-trace-avance",
    resumen: `${hayCenso ? `${formatNumber(r.censados)} censados · ` : ""}${formatNumber(r.talados)} talados · ${formatNumber(r.trozados)} trozados · ${formatNumber(r.conSalida)} salieron`,
    filtrosActivos: paso ? 1 : 0,
    encabezado: (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-x-1.5 text-sm text-[var(--text-secondary)]">
          {pct != null ? (
            <>
              <b className="tabular-nums text-[var(--text-primary)]">{formatNumber(pct, 1)} %</b> de lo censado ya talado
            </>
          ) : (
            "Del censo al despacho"
          )}
          <InfoTip title="Avance del permiso" {...AYUDA} />
        </div>
        {/* La cifra está escrita arriba: la barra es sólo el dibujo. */}
        {pct != null && (
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]" aria-hidden="true">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, pct)}%` }} />
          </div>
        )}
      </div>
    ),
    tarjetas: [
      <Paso key="censo" n={1} label="Censo" valor={hayCenso ? r.censados : null} m3={hayCenso ? m.censo : null} activo={paso === "censo"} onClick={() => onPaso("censo")} disabled={!hayCenso}>
        {hayCenso ? `${formatNumber(r.enPie)} en pie` : "sin censo cargado"}
      </Paso>,
      <Paso key="talados" n={2} label="Talados" valor={r.talados} m3={m.talado} activo={paso === "talados"} onClick={() => onPaso("talados")}>
        {r.sinTrozar > 0 ? <span className={AVISO}>{formatNumber(r.sinTrozar)} sin trozar</span> : r.talados > 0 ? "todos trozados" : "ninguno todavía"}
      </Paso>,
      <Paso key="trozados" n={3} label="Trozados" valor={r.trozados} m3={m.trozado} activo={paso === "trozados"} onClick={() => onPaso("trozados")}>
        {r.mermaPct != null ? `merma ${formatNumber(r.mermaPct, 1)} %` : "sin trozar todavía"}
      </Paso>,
      <Paso key="salieron" n={4} label="Salieron" valor={r.conSalida} m3={m.movilizado} activo={paso === "salieron"} onClick={() => onPaso("salieron")}>
        {piezas.length > 0 ? piezas.join(" · ") : "nada salió todavía"}
        {m.patio > 0.0005 && <span className={AVISO}> · {fm(m.patio)} m³ en patio</span>}
      </Paso>,
    ],
  });

  const cuentas = (
    <button
      type="button"
      onClick={() => onCuentas(!cuentasAbiertas)}
      aria-expanded={cuentasAbiertas}
      aria-controls={`${id}-cuentas`}
      title={cuentasAbiertas ? "Oculta las cuentas. Se recuerda en este navegador." : "Cómo cierran los m³ entre un paso y el siguiente"}
      className={cn(BTN_ACCION_RIEL, cuentasAbiertas && CLASE_ENCENDIDO_RIEL)}
    >
      <Calculator className="h-4 w-4 shrink-0" aria-hidden="true" />
      <TextoDeAccion>Cuentas</TextoDeAccion>
    </button>
  );
  const filtraPaso = paso && !kpis.abierto;

  return (
    <section aria-label="Avance del permiso" className="space-y-2 empty:hidden" data-avance>
      {enLibro ? (
        <>
          {kpis.boton}
          <AccionesDeLaVista>{cuentas}</AccionesDeLaVista>
        </>
      ) : (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2">
            <CardTitle className="text-sm font-bold">Avance del permiso</CardTitle>
            <InfoTip title="Avance del permiso" {...AYUDA} />
          </div>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            {kpis.boton}
            {cuentas}
          </div>
        </div>
      )}

      {kpis.panel}

      {(avisos.length > 0 || filtraPaso) && (
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--text-secondary)]" aria-label="Avisos" data-avisos>
          {filtraPaso && (
            <li>
              <button
                type="button"
                onClick={() => onPaso(paso)}
                title="Quitar este filtro"
                className="inline-flex h-10 items-center gap-1 rounded-full bg-[var(--accent-muted)] px-3 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
              >
                Filtra: {paso}
                <X className="h-4 w-4" aria-hidden="true" />
                <span className="sr-only"> (quitar)</span>
              </button>
            </li>
          )}
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
    <div className="min-w-0">
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
    </div>
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
