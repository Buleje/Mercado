"use client";

/**
 * La cabecera de Saldos: qué es la vista, de qué período, y dos botones.
 *
 * Tenía cuatro botones sueltos (PDF, CSV, Excel, Recargar); las descargas van
 * en un menú (ley de la vista #4) y «Recargar» refresca TODO lo de la
 * pantalla, no sólo el saldo. Dentro del libro (17-10) la cabecera no ocupa
 * fila: el riel ya dice «Saldos», así que el título se calla y el período, el
 * ⓘ, «Descargar ▾» y el ícono de recargar se van al riel (`VistaHeader`).
 */

import { AlertCircle, FileDown, FileSpreadsheet, FileText } from "@buleje/design-system/icons";
import CtpAvisoAlcancePermiso from "../CtpAvisoAlcancePermiso";
import { VistaHeader } from "../ctp-shared";
import { BotonRecargar, MenuDescargar } from "../ctp-riel-control";

const AVISO = {
  error: "border-[var(--data-error-500)] bg-[var(--data-error-50)] text-[var(--data-error-ink)]",
  warning:
    "border-[var(--data-warning-500)] bg-[var(--data-warning-50)] text-[var(--data-warning-ink)]",
} as const;

export default function SaldosCabecera({
  periodo,
  hayDatos,
  fuentesCargando,
  recargando,
  onRecargar,
  onPdf,
  onExcel,
  onCsv,
  errorReporte,
  errorCarga,
  alcance,
}: {
  periodo: string;
  hayDatos: boolean;
  /** Mientras el patio o los lotes no llegan, un reporte diría «0 piezas». */
  fuentesCargando: boolean;
  recargando: boolean;
  onRecargar: () => void;
  onPdf: () => void;
  onExcel: () => void;
  onCsv: () => void;
  errorReporte: string | null;
  errorCarga: string | null;
  /** Código del permiso de «Solo este permiso», o `null` = toda la planta. */
  alcance: string | null;
}) {
  const bloqueado = !hayDatos || fuentesCargando;
  const espera = fuentesCargando ? "Esperando el patio y los lotes…" : undefined;

  return (
    <div className="space-y-3 empty:hidden">
      <VistaHeader
        titulo="Saldos del libro"
        meta={periodo}
        hint="Lo que declaras ante SERFOR y lo que puede salir de la planta."
      >
        <MenuDescargar
          disabled={bloqueado}
          title={espera}
          acciones={[
            {
              id: "pdf",
              label: "Reporte PDF",
              hint: "El saldo que se declara ante SERFOR, para imprimir o fiscalizar",
              icon: FileDown,
              tone: "dark",
              disabled: bloqueado,
              onSelect: onPdf,
            },
            {
              id: "excel",
              label: "Excel (un archivo, varias hojas)",
              hint: "Materia prima, productos, lotes, capacidad y el patio por permiso",
              icon: FileSpreadsheet,
              disabled: bloqueado,
              onSelect: onExcel,
            },
            {
              id: "csv",
              label: "CSV",
              hint: "Las mismas tablas en texto plano",
              icon: FileText,
              disabled: bloqueado,
              onSelect: onCsv,
            },
          ]}
        />
        <BotonRecargar
          onClick={onRecargar}
          cargando={recargando}
          etiqueta="Recargar todos los saldos y los cuadros"
        />
      </VistaHeader>

      {/* El filtro por permiso es PARCIAL en Saldos: sin decirlo, la pestaña
          mostraría números de un permiso al lado de números de toda la planta
          como si fueran del mismo papel. */}
      {alcance && (
        <CtpAvisoAlcancePermiso
          codigo={alcance}
          acotado={["el patio", "la capacidad", "lo pendiente"]}
          sinAcotar={[
            "los saldos del libro",
            "la curva",
            "la conciliación",
            "la antigüedad por guía",
          ]}
        />
      )}

      {errorReporte && (
        <div
          role="alert"
          className={`flex items-start gap-3 rounded-xl border-2 p-4 text-sm ${AVISO.warning}`}
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <strong>No se pudo abrir el reporte:</strong> {errorReporte}
          </p>
        </div>
      )}

      {errorCarga && (
        <div
          role="alert"
          className={`flex items-start gap-3 rounded-xl border-2 p-4 text-sm ${AVISO.error}`}
        >
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
          <p>
            <strong>No se pudieron leer los saldos:</strong> {errorCarga}
          </p>
        </div>
      )}
    </div>
  );
}
