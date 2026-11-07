"use client";

/**
 * Los tres CUADROS RESUMEN del formato oficial del LO-CTP, en pantalla.
 *
 * Estaban sólo dentro del Excel oficial, así que para saber si el período cierra
 * había que descargarlo y abrirlo. Son los cuadros que un fiscalizador lee
 * primero, y el operador tiene que poder verlos ANTES de cerrar el mes.
 *
 * El cálculo NO vive acá: es el mismo `cuadrosResumen()` puro que usa el export
 * (`lib/forestal/loctp-resumenes.ts`, leído por `useCuadrosResumen`). Si la
 * pantalla y el Excel mostraran números distintos del mismo período, ninguno de
 * los dos serviría.
 *
 * Dos formas (compactación del libro, 17-10):
 *  · suelta (`?vista=resumenes`): su ⓘ y el «Recalcular» van al riel;
 *  · `embebido` en Saldos › «Lo que firma el libro»: sin cabecera propia, con
 *    la especie de los indicadores (`especie`), el Kardex (`onKardex`) y el
 *    cruce del Cuadro 1 contra el saldo del servidor (`concil`). El «Recargar»
 *    del riel de Saldos sube `version` y los recalcula.
 */

import { useMemo } from "react";
import { AlertTriangle, RefreshCw } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { Concil } from "@/hooks/use-ctp-saldos";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { cn } from "@/lib/utils";
import CtpApartadosSerfor from "./CtpApartadosSerfor";
import CtpCuadroResumen1 from "./CtpCuadroResumen1";
import CtpCuadrosResumen23 from "./CtpCuadrosResumen23";
import { VistaHeader } from "./ctp-shared";
import { BotonRecargar } from "./ctp-riel-control";
import { useCuadrosResumen } from "./hooks/use-cuadros-resumen";

const QUE_SON = "Los tres cuadros que exige la RDE D000025-2023, con su numeración.";
const GUION = "Un casillero en «—» es un dato que el libro no registra: se completa a mano en el formato.";

const AVISO_ERROR =
  "flex items-start gap-2 rounded-xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-3 py-2.5 text-sm font-medium text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/10 dark:text-[var(--data-error-500)]";

export default function CtpResumenesSerfor({
  period,
  embebido = false,
  especie,
  version = 0,
  concil,
  onKardex,
  despues,
}: {
  period: CtpPeriod;
  /** Dentro de Saldos: sin cabecera propia (el riel ya es de Saldos). */
  embebido?: boolean;
  /** La especie de los indicadores de Saldos (ADR-400): los tres cuadros se acotan a ella. */
  especie?: string;
  /** Sube con el «Recargar» de la vista que lo contiene. */
  version?: number;
  concil?: Concil | null;
  onKardex?: (especie: string) => void;
  /** Lo que va entre los cuadros y los apartados (el stock de productos, en Saldos). */
  despues?: React.ReactNode;
}) {
  const { cargando, error, incompleto, datos, recargar } = useCuadrosResumen(period, version);

  const vista = useMemo(() => {
    if (!datos || !especie) return datos;
    return {
      resumen1: datos.resumen1.filter((f) => f.especie === especie),
      resumen2: datos.resumen2.filter((f) => f.especie === especie),
      resumen3: datos.resumen3.filter((f) => f.especie === especie),
    };
  }, [datos, especie]);

  /** Un saldo negativo en cualquier cuadro es lo que impide cerrar el mes. */
  const negativos = vista
    ? vista.resumen1.filter((f) => f.saldo.volumen < 0).length +
      vista.resumen2.filter((f) => f.saldo < 0).length +
      vista.resumen3.filter((f) => f.stock < 0).length
    : 0;

  /* Dentro de Saldos el «Recalcular» queda pegado al Cuadro 1, sin fila propia:
     el de la esquina es el «Recargar» de toda la vista. */
  const recalcular = embebido ? (
    <span className="flex items-center gap-1.5">
      <InfoTip title="Cuadros resumen" what={QUE_SON} affects={GUION} />
      <button
        type="button"
        onClick={() => void recargar()}
        disabled={cargando}
        title="Recalcular los cuadros"
        aria-label="Recalcular los cuadros"
        aria-busy={cargando || undefined}
        className="grid h-9 w-9 place-items-center rounded-xl border border-[var(--rule-base)] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] disabled:opacity-50"
      >
        <RefreshCw className={cn("h-4 w-4", cargando && "animate-spin")} aria-hidden />
      </button>
    </span>
  ) : undefined;

  return (
    <div className="space-y-4">
      {!embebido && (
        <VistaHeader titulo="Cuadros resumen del formato oficial" meta={period.label} hint={`${QUE_SON} ${GUION}`}>
          <BotonRecargar onClick={() => void recargar()} cargando={cargando} etiqueta="Recalcular los cuadros" />
        </VistaHeader>
      )}

      {error && (
        <p className={AVISO_ERROR}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> No pude armar los cuadros. {error}
        </p>
      )}

      {/* Los cuadros SÍ se armaron, pero con un casillero sin fuente. Un
          documento regulatorio incompleto tiene que decirlo: callarlo es peor
          que no mostrarlo. Va en LISTA: cada motivo trae su propia oración
          (ADR-357: los cuadros salen igual de ingresos, corridas y despachos). */}
      {incompleto.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-3 py-2.5 text-sm font-medium text-[var(--data-warning-700)] dark:bg-transparent dark:text-[var(--data-warning-500)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0">
            <p className="flex items-center gap-1">
              {incompleto.length === 1 ? "Una columna de apoyo quedó" : `${incompleto.length} columnas de apoyo quedaron`}{" "}
              sin llenar:
              <InfoTip
                icono="ayuda"
                title="Columnas sin llenar"
                what="Los tres cuadros se arman igual con los ingresos, las corridas y los despachos, que son los datos obligatorios."
                affects="Los volúmenes, los saldos y el rendimiento no cambian."
              />
            </p>
            <ul className="ml-4 mt-1 list-disc space-y-0.5">
              {incompleto.map((motivo) => (
                <li key={motivo}>{motivo}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {negativos > 0 && (
        <p className={AVISO_ERROR}>
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {negativos} fila(s) con saldo negativo. Un saldo negativo dice que salió o se consumió más
            de lo que entró: revisa las atribuciones antes de presentar el libro.
          </span>
        </p>
      )}

      {cargando && !vista ? (
        <p className="rounded-2xl border border-dashed border-[var(--rule-base)] px-4 py-10 text-center text-sm text-[var(--text-secondary)]">
          Armando los cuadros del período…
        </p>
      ) : vista ? (
        <>
          <CtpCuadroResumen1 filas={vista.resumen1} concil={concil} onKardex={onKardex} accion={recalcular} />
          <CtpCuadrosResumen23 resumen2={vista.resumen2} resumen3={vista.resumen3} />
        </>
      ) : null}

      {despues}

      {/* Los apartados van DEBAJO de los cuadros: el formato los pide al final y
          el operador los lee después de ver si el período cierra. La `key`
          los vuelve a pedir con el «Recargar» de la vista que los contiene. */}
      <CtpApartadosSerfor key={version} period={period} />
    </div>
  );
}
