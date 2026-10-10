"use client";

/**
 * Kárdex del permiso (pedido de Brandon, 2-10-2026: «llevar el control de
 * volumen, madera y kárdex completo de cada permiso»).
 *
 * Cada movimiento del libro en orden —tala, trozado, despacho, consumo— con lo
 * que queda después: por talar, en el monte (talado sin trozar) y en el patio.
 * La misma madera pasa por las tres etapas: nada se suma entre etapas, cada
 * movimiento la pasa de un casillero al siguiente. El cierre es la franja
 * «Volumen del permiso» y se dice si cuadra (`lib/forestal/loth-kardex.ts`).
 *
 * Orden (ley de la vista): título + especie + acciones en una fila → resumen y
 * cuadre → avisos → tabla.
 */

import { CardTitle } from "@buleje/design-system";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Printer,
  RefreshCw,
} from "@buleje/design-system/icons";
import { useMemo } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { filasDelKardex, resumirKardex } from "@/lib/forestal/loth-kardex";
import type { BandaPermiso } from "@/lib/forestal/loth-tablero-permiso";
import { Btn } from "./ctp-shared";
import type { LothTableroKardexEstado } from "./hooks/use-loth-tablero-kardex";
import LothTableroKardexTabla from "./LothTableroKardexTabla";
import { BarraFiltrosTabla, useFiltrosTabla } from "./filtros-tabla-forestal";
import { filtrosKardex } from "./loth-kardex-filtros";
import type { NavTablero } from "./LothTableroTabla";

const LINEA =
  "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border-2 px-3 py-2 text-sm font-semibold";
const AMBAR =
  "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-50)] text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]";
const ROJO =
  "border-[var(--data-error-500)]/50 bg-[var(--data-error-50)] text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]";

function Titulo({ base }: { base: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <CardTitle as="h3" className="text-sm font-bold text-[var(--text-primary)]">
        Kárdex del permiso
      </CardTitle>
      <InfoTip
        title="Kárdex del permiso"
        what="Cada movimiento del libro en orden, con lo que queda después: por talar, en el monte y en el patio."
        affects={`Entra = la tala; Sale = el despacho y el consumo; el trozado no entra ni sale: pasa del monte al patio. Por talar = ${base.toLowerCase()} − talado; En el monte = talado − trozado; En patio = trozado − despachado − consumido.`}
        example="Talas un árbol de 5 m³ (entra 5) y lo trozas en 4,9 m³: el monte queda con 0,1 m³ de merma y el patio con 4,9."
        ancho="w-96"
      />
    </span>
  );
}

export default function LothTableroKardex({
  k,
  banda,
  hoyKey,
  nav,
  cargandoFranja,
}: {
  k: LothTableroKardexEstado;
  /** El permiso elegido; `null` = «Todos» o «Sin plan». */
  banda: BandaPermiso | null;
  hoyKey: string;
  nav?: NavTablero;
  /** La franja «Volumen del permiso» todavía no llegó: el cuadre espera. */
  cargandoFranja: boolean;
}) {
  const { kardex, clave } = k;
  const filas = useMemo(() => (kardex ? filasDelKardex(kardex, clave) : []), [kardex, clave]);
  const resumen = useMemo(() => resumirKardex(filas, clave), [filas, clave]);
  /* Las anuladas se ven tachadas; con muchas (pruebas de QA) se pueden esconder. Se recuerda. */
  const [verAnuladas, setVerAnuladas] = useLocalStorage<boolean>("loth-kardex:anuladas", true);
  const visibles = useMemo(
    () => (verAnuladas ? filas : filas.filter((f) => !f.anulada)),
    [filas, verAnuladas],
  );
  /* El autofiltro de cada columna (Brandon 07-10). Esconde renglones; los saldos
     de cada uno no cambian (ver `loth-kardex-filtros`). */
  const sinBase = kardex?.sinBase ?? false;
  const columnasFiltro = useMemo(() => filtrosKardex(clave, sinBase), [clave, sinBase]);
  const filtros = useFiltrosTabla(visibles, columnasFiltro);

  if (!banda) {
    return (
      <section className="space-y-2" data-kardex-permiso>
        <Titulo base="Autorizado" />
        <p className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] px-4 py-3 text-sm text-[var(--text-secondary)]">
          Elige un permiso arriba: el kárdex lleva el saldo de UN permiso, contra lo que tiene
          autorizado o registrado.
        </p>
      </section>
    );
  }
  if (k.error) {
    return (
      <section className="space-y-2" data-kardex-permiso>
        <Titulo base={banda.baseLabel} />
        <div role="alert" className={`${LINEA} ${ROJO}`}>
          {k.error}
          <Btn size="sm" variant="secondary" onClick={k.reintentar}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Reintentar
          </Btn>
        </div>
      </section>
    );
  }
  if (k.cargando || !kardex) {
    return (
      <section className="space-y-2" aria-busy="true" data-kardex-permiso>
        <Titulo base={banda.baseLabel} />
        <div className="h-40 animate-pulse rounded-2xl bg-[var(--surface-sunken)]" />
      </section>
    );
  }

  const fuera = kardex.fueraDelRegistro.filter(
    (e) => e.taladoM3 + e.trozadoM3 + e.despachadoM3 + e.consumidoM3 > 0,
  );
  const enArea = resumen.entraM3 - resumen.saleM3;

  return (
    <section className="min-w-0 space-y-2" data-kardex-permiso>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Titulo base={banda.baseLabel} />
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <label htmlFor="kardex-especie" className="sr-only">
            Especie del kárdex
          </label>
          <select
            id="kardex-especie"
            value={clave ?? ""}
            onChange={(e) => k.elegirEspecie(e.target.value || null)}
            className="h-10 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2 text-sm font-medium text-[var(--text-primary)] outline-none focus:border-[var(--accent)] max-sm:basis-full"
          >
            <option value="">Todas las especies</option>
            {kardex.especies.map((e) => (
              <option key={e.clave} value={e.clave}>
                {e.nombre}
                {e.delRegistro ? "" : " (no está en el registro)"}
              </option>
            ))}
          </select>
          <Btn
            size="sm"
            variant="secondary"
            onClick={() => void k.exportarExcel()}
            disabled={filas.length === 0}
          >
            <FileSpreadsheet className="h-4 w-4" aria-hidden="true" /> Excel
          </Btn>
          <Btn size="sm" variant="secondary" onClick={k.imprimir}>
            <Printer className="h-4 w-4" aria-hidden="true" /> Imprimir
          </Btn>
        </div>
      </div>

      <div
        className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm tabular-nums text-[var(--text-secondary)]"
        aria-live="polite"
      >
        <span>
          <b className="text-[var(--text-primary)]">{resumen.movimientos}</b>{" "}
          {resumen.movimientos === 1 ? "movimiento" : "movimientos"}
          {resumen.anulados > 0 && (
            <>
              {" "}
              · {resumen.anulados} {resumen.anulados === 1 ? "anulado" : "anulados"}
              {verAnuladas ? "" : resumen.anulados === 1 ? " oculto" : " ocultos"} ·{" "}
              <button
                type="button"
                aria-pressed={verAnuladas}
                onClick={() => setVerAnuladas((v) => !v)}
                className="font-semibold text-[var(--accent-dark)] underline-offset-2 hover:underline dark:text-[var(--accent)]"
              >
                {verAnuladas ? "ocultarlos" : "verlos"}
              </button>
            </>
          )}
        </span>
        <span>
          entró <b className="font-mono text-[var(--text-primary)]">{fmtM3(resumen.entraM3)}</b> ·
          salió <b className="font-mono text-[var(--text-primary)]">{fmtM3(resumen.saleM3)}</b> · en
          el monte y el patio{" "}
          <b className="font-mono text-[var(--text-primary)]">{fmtM3(enArea)}</b> m³
        </span>
        <Cuadre k={k} cargandoFranja={cargandoFranja} />
      </div>

      {kardex.sinBase && (
        <p className={`${LINEA} ${AMBAR}`}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          Este permiso no tiene especies {banda.esPlantacion ? "registradas" : "autorizadas"}: el
          kárdex lleva el monte y el patio, sin saldo por talar.
          {nav?.onIrAlPlan && (
            <button type="button" onClick={nav.onIrAlPlan} className="underline underline-offset-2">
              Cargarlas en el Plan de manejo
            </button>
          )}
        </p>
      )}
      {fuera.length > 0 && clave == null && (
        <p className={`${LINEA} ${AMBAR}`}>
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {fuera.map((e) => e.especie).join(", ")}: el libro {fuera.length === 1 ? "la" : "las"}{" "}
          movió y el registro no {fuera.length === 1 ? "la tiene" : "las tiene"}. Se ven en su fila
          pero no suman al saldo del permiso.
          <InfoTip
            title="Especies fuera del registro"
            what="El saldo del permiso se lleva contra sus especies; lo que el libro registró de otra especie no tiene contra qué descontarse."
            affects="Agrégala en el Plan de manejo, o corrige la especie de la línea si se escribió mal."
            example={`${fuera[0].especie}: talado ${fmtM3(fuera[0].taladoM3)} m³.`}
          />
        </p>
      )}

      <BarraFiltrosTabla f={filtros} />

      <LothTableroKardexTabla
        k={kardex}
        filas={visibles}
        filtros={filtros}
        clave={clave}
        banda={banda}
        resumen={resumen}
        hoyKey={hoyKey}
        nav={nav}
      />
    </section>
  );
}

function Cuadre({ k, cargandoFranja }: { k: LothTableroKardexEstado; cargandoFranja: boolean }) {
  if (!k.kardex || k.kardex.sinBase) return null;
  if (!k.cuadre)
    return cargandoFranja ? (
      <span className="text-[var(--text-tertiary)]">comprobando el cuadre…</span>
    ) : null;
  if (k.cuadre.cuadra) {
    return (
      <span
        className="inline-flex items-center gap-1 font-semibold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
        data-kardex-cuadra="si"
      >
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Cuadra con «Volumen del permiso»
      </span>
    );
  }
  const d = k.cuadre.diferencias;
  return (
    <span
      className="inline-flex items-center gap-1 font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
      data-kardex-cuadra="no"
    >
      <AlertTriangle className="h-4 w-4" aria-hidden="true" /> No cuadra con «Volumen del permiso»
      <InfoTip
        title="Por qué no cuadra"
        what="El kárdex se arma con el libro que tienes cargado; la franja la calcula el servidor. Si alguien registró algo recién, recarga."
        body={
          <span className="mt-1 block space-y-0.5 text-xs">
            {d.slice(0, 8).map((x) => (
              <span key={`${x.especie}-${x.campo}`} className="block">
                {x.especie} · {x.campo}: kárdex {fmtM3(x.kardexM3)} · franja {fmtM3(x.franjaM3)}
              </span>
            ))}
          </span>
        }
      />
    </span>
  );
}
